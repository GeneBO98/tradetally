const axios = require('axios');
const https = require('https');
const { createHash } = require('crypto');
const db = require('../../config/database');
const Trade = require('../../models/Trade');
const BrokerConnection = require('../../models/BrokerConnection');
const AnalyticsCache = require('../analyticsCache');
const currency_converter = require('../../utils/currencyConverter');
const { computeTradePnl, dateInTimezone } = require('../pnlEngine');
const { getUserTimezone } = require('../../utils/timezone');

const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const MAX_PAGES = 1000;
const round = value => Math.round(value * 1e8) / 1e8;
const date_only = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function number(value, label) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    throw new Error(`OANDA returned an invalid ${label}`);
  }
  return Number(value);
}

function api_base(environment) {
  if (!['practice', 'live'].includes(environment)) throw new Error('Select an OANDA practice or live environment');
  return environment === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
}

function account_path(account_id) {
  if (!/^[0-9-]{1,32}$/.test(String(account_id || ''))) throw new Error('Invalid OANDA account ID');
  return `/v3/accounts/${account_id}`;
}

function snapshot_hash(trade) {
  return createHash('sha256').update(JSON.stringify([
    trade.id, trade.instrument, trade.state, trade.price, trade.openTime, trade.closeTime,
    trade.initialUnits, trade.currentUnits, trade.realizedPL, trade.financing,
    trade.dividendAdjustment, trade.closingTransactionIDs
  ])).digest('hex');
}

// The Trade model still accepts these existing legacy names. Keep all OANDA
// data and execution fields snake_case and adapt only at that model boundary.
function model_data(trade) {
  return {
    symbol: trade.symbol, side: trade.side, quantity: trade.quantity, broker: 'oanda',
    commission: trade.commission, fees: trade.fees,
    entryPrice: trade.entry_price, exitPrice: trade.exit_price,
    entryTime: trade.entry_time, exitTime: trade.exit_time, tradeDate: trade.trade_date,
    instrumentType: trade.instrument_type, executions: trade.executions,
    account_identifier: trade.account_identifier, broker_trade_id: trade.broker_trade_id,
    brokerConnectionId: trade.broker_connection_id,
    originalCurrency: trade.original_currency, exchangeRate: trade.exchange_rate,
    originalEntryPriceCurrency: trade.original_entry_price_currency,
    originalExitPriceCurrency: trade.original_exit_price_currency,
    originalPnlCurrency: trade.original_pnl_currency,
    originalCommissionCurrency: trade.original_commission_currency,
    originalFeesCurrency: trade.original_fees_currency
  };
}

class OandaService {
  async request(api_token, environment, path, retries = 2) {
    const base = api_base(environment);
    const url = new URL(path, base);
    // Never forward a bearer token to an arbitrary pagination URL or redirect.
    if (url.origin !== base || !url.pathname.startsWith('/v3/accounts') || url.username || url.password || url.hash) {
      throw new Error('OANDA returned an invalid API URL');
    }
    if (!api_token) throw new Error('OANDA token is missing. Reconnect the account.');
    try {
      return await axios.get(url.toString(), {
        headers: { Authorization: `Bearer ${api_token}`, 'Accept-Datetime-Format': 'RFC3339' },
        timeout: 30000, maxRedirects: 0, httpsAgent: agent
      });
    } catch (error) {
      const status = error.response?.status;
      const transient = !status || status === 408 || status === 429 || status >= 500;
      if (transient && retries > 0) {
        const retry_after = Number(error.response?.headers?.['retry-after']);
        await sleep(Math.min(30000, Math.max(1000, (retry_after || 3 - retries) * 1000)));
        return this.request(api_token, environment, path, retries - 1);
      }
      // Axios errors retain request headers, including the token. Expose only
      // a new sanitized error to controller/scheduler logging.
      const message = status === 401 || status === 403
        ? 'OANDA rejected access. Check the token, account, and selected environment.'
        : status === 404 ? 'OANDA account or trade history was not found.'
          : 'OANDA could not complete the request. Please try syncing again.';
      const safe_error = new Error(message);
      safe_error.status = [401, 403, 404].includes(status) ? 400 : 502;
      safe_error.transient = transient;
      throw safe_error;
    }
  }

  async list_accounts(api_token, environment) {
    const response = await this.request(api_token, environment, '/v3/accounts');
    if (!Array.isArray(response.data?.accounts)) throw new Error('OANDA returned an invalid account list');
    return response.data.accounts.filter(account => /^[0-9-]{1,32}$/.test(String(account.id || '')))
      .map(account => ({ account_id: String(account.id) }));
  }

  async get_account(api_token, environment, account_id) {
    const response = await this.request(api_token, environment, `${account_path(account_id)}/summary`);
    const account = response.data?.account;
    if (!account || String(account.id) !== String(account_id) || !/^[A-Z]{3}$/.test(account.currency || '')) {
      throw new Error('OANDA returned an invalid account summary');
    }
    return { account_id: String(account.id), currency: account.currency, alias: account.alias || '' };
  }

  async validate_connection(connection) {
    try {
      await this.get_account(connection.oanda_api_token, connection.brokerEnvironment, connection.externalAccountId);
      return { valid: true, message: 'OANDA connection is valid' };
    } catch (error) { return { valid: false, message: error.message }; }
  }

  async fetch_trades(connection) {
    const path = account_path(connection.externalAccountId);
    let next = `${path}/trades?state=ALL&count=500`;
    const seen = new Set();
    const trades = new Map();
    while (next) {
      if (seen.has(next) || seen.size >= MAX_PAGES) throw new Error('OANDA trade pagination did not complete');
      seen.add(next);
      const url = new URL(next, api_base(connection.brokerEnvironment));
      if (url.pathname !== `${path}/trades`) throw new Error('OANDA returned an invalid trade pagination URL');
      const response = await this.request(connection.oanda_api_token, connection.brokerEnvironment, next);
      if (!Array.isArray(response.data?.trades)) throw new Error('OANDA returned invalid trade history');
      for (const trade of response.data.trades) trades.set(String(trade.id), trade);
      const link = response.headers?.link || '';
      const match = link.match(/<([^>]+)>;\s*rel="?next"?/);
      next = match ? match[1] : null;
    }
    return [...trades.values()];
  }

  async map_trade(snapshot, connection, instruments, transaction, rate, timezone) {
    const instrument = instruments.get(snapshot.instrument);
    if (!instrument || !['CURRENCY', 'METAL', 'CFD'].includes(instrument.type)) {
      throw new Error(`OANDA instrument metadata is unavailable for ${snapshot.instrument}`);
    }
    const signed_units = number(snapshot.initialUnits, 'initial units');
    const quantity = Math.abs(signed_units);
    const remaining = Math.abs(number(snapshot.currentUnits, 'current units'));
    if (!quantity || remaining > quantity) throw new Error('OANDA returned inconsistent trade units');
    if (snapshot.state === 'CLOSED' && remaining !== 0) throw new Error('OANDA closed trade still has open units');
    if (!Number.isFinite(Date.parse(snapshot.openTime))) throw new Error('OANDA returned an invalid opening time');
    const side = signed_units < 0 ? 'short' : 'long';
    const native_entry = number(snapshot.price, 'entry price');
    const quote_currency = String(snapshot.instrument).split('_').at(-1);
    if (!/^[A-Z]{3}$/.test(quote_currency)) throw new Error('OANDA instrument has an unsupported quote currency');
    const quote_usd = await rate(quote_currency, date_only(snapshot.openTime));
    const entry_price = round(native_entry * quote_usd);
    const home_currency = connection.brokerMetadata.currency;
    const opening = await transaction(snapshot.id);
    if (String(opening.tradeOpened?.tradeID) !== String(snapshot.id)) throw new Error('OANDA opening fill does not match the trade');
    const allocation = (fill, units) => {
      const legs = [fill.tradeOpened, fill.tradeReduced, ...(fill.tradesClosed || [])].filter(Boolean);
      const total = legs.reduce((sum, leg) => sum + Math.abs(number(leg.units, 'fill units')), 0);
      if (!total) throw new Error('OANDA returned a fill without units');
      return units / total;
    };
    const opening_commission = number(opening.commission ?? 0, 'opening commission') * allocation(opening, quantity);
    const opening_fee = number(opening.guaranteedExecutionFee ?? 0, 'opening fee') * allocation(opening, quantity);
    const financing = number(snapshot.financing ?? 0, 'financing');
    const dividend = number(snapshot.dividendAdjustment ?? 0, 'dividend adjustment');
    const opening_home_usd = await rate(home_currency, date_only(snapshot.openTime));
    const executions = [];
    let closed_units = 0;
    let reported_total = 0;
    for (const id of snapshot.closingTransactionIDs || []) {
      const fill = await transaction(id);
      const reduction = [fill.tradeReduced, ...(fill.tradesClosed || [])].filter(Boolean)
        .find(leg => String(leg.tradeID) === String(snapshot.id));
      if (!reduction) throw new Error('OANDA closing fill does not match the trade');
      if (!Number.isFinite(Date.parse(fill.time)) || new Date(fill.time) < new Date(snapshot.openTime)) {
        throw new Error('OANDA returned an invalid closing time');
      }
      const units = Math.abs(number(reduction.units, 'closed units'));
      reported_total += number(reduction.realizedPL, 'realized P&L');
      const exit_price = round(number(reduction.price ?? fill.price ?? fill.fullVWAP, 'exit price') * quote_usd);
      const home_usd = await rate(home_currency, date_only(fill.time));
      const gross_pnl = number(reduction.realizedPL, 'realized P&L') * home_usd;
      const commission = opening_commission * units / quantity * opening_home_usd
        + number(fill.commission ?? 0, 'closing commission') * allocation(fill, units) * home_usd;
      const execution_fee = number(reduction.guaranteedExecutionFee
        ?? number(fill.guaranteedExecutionFee ?? 0, 'execution fee') * allocation(fill, units), 'execution fee');
      // Financing/dividend totals are lifetime account-currency amounts. Assign
      // them proportionally to closed/open units; credits remain negative fees.
      const fees = opening_fee * units / quantity * opening_home_usd
        + (execution_fee - (financing + dividend) * units / quantity) * home_usd;
      const leg = {
        entry_price, exit_price, quantity: units, side,
        entry_time: snapshot.openTime, exit_time: fill.time,
        commission: round(commission), fees: round(fees),
        execution_id: `${snapshot.id}:${id}`, oanda_trade_id: String(snapshot.id),
        account_currency: home_currency, account_realized_pnl: Number(reduction.realizedPL),
        account_to_usd_rate: home_usd, quote_currency,
        broker_pnl: { source: 'oanda', entry_price, exit_price, quantity: units, side, gross_pnl: round(gross_pnl) }
      };
      executions.push(leg);
      closed_units += units;
    }
    if (Math.abs(closed_units + remaining - quantity) > 1e-7) throw new Error('OANDA closing history is incomplete');
    if (Math.abs(reported_total - number(snapshot.realizedPL, 'trade realized P&L')) > 0.00001) {
      throw new Error('OANDA closing P&L does not reconcile with the trade total');
    }
    if (remaining > 0) {
      const home_usd = await rate(home_currency, date_only(snapshot.openTime));
      executions.push({
        entry_price, exit_price: null, quantity: remaining, side,
        entry_time: snapshot.openTime, exit_time: null,
        commission: round(opening_commission * remaining / quantity * opening_home_usd),
        fees: round((opening_fee * opening_home_usd - (financing + dividend) * home_usd) * remaining / quantity),
        execution_id: `${snapshot.id}:open`, oanda_trade_id: String(snapshot.id), quote_currency,
        account_currency: home_currency
      });
    }
    if (!executions.length) throw new Error('OANDA trade has no executions');
    const result = computeTradePnl({ side, instrumentType: instrument.type === 'CURRENCY' ? 'forex' : 'cfd', executions, timezone });
    result.annotatedExecutions[0].oanda_snapshot = snapshot_hash(snapshot);
    const totals = result.aggregate;
    return {
      ...totals, symbol: snapshot.instrument, side,
      instrument_type: instrument.type === 'CURRENCY' ? 'forex' : 'cfd',
      broker_trade_id: String(snapshot.id), broker_connection_id: connection.id,
      account_identifier: `oanda:${connection.brokerEnvironment}:${connection.externalAccountId}`,
      executions: result.annotatedExecutions,
      original_currency: quote_currency, exchange_rate: quote_usd,
      original_entry_price_currency: native_entry,
      original_exit_price_currency: totals.exit_price == null ? null : round(totals.exit_price / quote_usd),
      original_pnl_currency: totals.pnl == null ? null : round(totals.pnl / quote_usd),
      original_commission_currency: round(totals.commission / quote_usd),
      original_fees_currency: round(totals.fees / quote_usd)
    };
  }

  async syncTrades(connection, { startDate, endDate, syncLogId } = {}) {
    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    const account = await this.get_account(connection.oanda_api_token, connection.brokerEnvironment, connection.externalAccountId);
    connection = { ...connection, brokerMetadata: { ...connection.brokerMetadata, currency: account.currency } };
    const instrument_response = await this.request(connection.oanda_api_token, connection.brokerEnvironment,
      `${account_path(connection.externalAccountId)}/instruments`);
    if (!Array.isArray(instrument_response.data?.instruments)) throw new Error('OANDA returned invalid instrument metadata');
    const instruments = new Map(instrument_response.data.instruments.map(item => [item.name, item]));
    const snapshots = await this.fetch_trades(connection);
    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'parsing', { tradesFetched: snapshots.length });
    const account_identifier = `oanda:${connection.brokerEnvironment}:${connection.externalAccountId}`;
    const stored = await db.query(`SELECT id, broker_trade_id, executions FROM trades
      WHERE user_id = $1 AND broker = 'oanda' AND account_identifier = $2`, [connection.userId, account_identifier]);
    const existing = new Map(stored.rows.map(row => [String(row.broker_trade_id), row]));
    const transactions = new Map();
    const rates = new Map();
    const transaction = async id => {
      if (!/^\d+$/.test(String(id))) throw new Error('OANDA returned an invalid transaction ID');
      if (!transactions.has(String(id))) {
        const response = await this.request(connection.oanda_api_token, connection.brokerEnvironment,
          `${account_path(connection.externalAccountId)}/transactions/${id}`);
        if (!response.data?.transaction || String(response.data.transaction.id) !== String(id)) throw new Error('OANDA returned an invalid transaction');
        transactions.set(String(id), response.data.transaction);
      }
      return transactions.get(String(id));
    };
    const rate = async (currency, date) => {
      const key = `${currency}:${date}`;
      if (!rates.has(key)) {
        const value = currency === 'USD' ? 1 : Number(await currency_converter.getForexRate(currency, 'USD', date));
        if (!Number.isFinite(value) || value <= 0) throw new Error(`No valid USD conversion rate for ${currency}`);
        rates.set(key, value);
      }
      return rates.get(key);
    };
    const timezone = await getUserTimezone(connection.userId);
    const result = { imported: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0, warnings: [] };
    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    try {
      for (const snapshot of snapshots) {
        const trade_date = dateInTimezone(snapshot.closeTime || snapshot.openTime, timezone);
        if ((snapshot.state === 'CLOSED' && startDate && trade_date < date_only(startDate))
          || (endDate && trade_date > date_only(endDate))) { result.skipped++; continue; }
        const prior = existing.get(String(snapshot.id));
        if (prior?.executions?.[0]?.oanda_snapshot === snapshot_hash(snapshot)) { result.duplicates++; continue; }
        try {
          const trade = await this.map_trade(snapshot, connection, instruments, transaction, rate, timezone);
          if (endDate && trade.executions.some(leg => leg.exit_time && dateInTimezone(leg.exit_time, timezone) > date_only(endDate))) {
            result.skipped++;
            result.warnings.push(`Trade ${snapshot.id} has exits after the selected end date; use a current end date to import its complete history.`);
            continue;
          }
          const data = model_data(trade);
          const options = { skipApiCalls: true, skipAchievements: true, skipOptionGrouping: true };
          if (prior) {
            await Trade.update(prior.id, connection.userId, data, options);
            result.imported++;
            // Edits to partial-close windows invalidate candle/quality metrics.
            await db.query(`UPDATE trades SET mae = NULL, mfe = NULL, post_exit_mae = NULL, post_exit_mfe = NULL,
              quality_grade = NULL, quality_score = NULL, quality_metrics = NULL WHERE id = $1 AND user_id = $2`, [prior.id, connection.userId]);
            result.updated++;
          } else {
            await Trade.create(connection.userId, data, options);
            result.imported++;
          }
        } catch (error) {
          if (error.transient || error.status) throw error;
          result.failed++;
          result.warnings.push(`Trade ${snapshot.id} was not imported: ${error.message}`);
        }
      }
    } finally {
      if (result.imported > 0) {
        await AnalyticsCache.invalidate(connection.userId);
        // Null metrics are the worker's recalculation marker. Queue once per
        // user after the batch, including when a later API request failed.
        await db.query(`INSERT INTO job_queue (type, data, priority, user_id, status)
          SELECT kind, jsonb_build_object('userId', $1::text), 4, $1::uuid, 'pending'
          FROM unnest(ARRAY['mae_recalc', 'quality_backfill']) AS kind
          WHERE NOT EXISTS (SELECT 1 FROM job_queue WHERE type = kind AND user_id = $1::uuid AND status = 'pending')`, [connection.userId]);
      }
    }
    if (result.failed) result.outcome = 'warning';
    return result;
  }
}

module.exports = new OandaService();
module.exports.api_base = api_base;
module.exports.snapshot_hash = snapshot_hash;
