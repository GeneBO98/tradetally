const axios = require('axios');
const OAuthBrokerBase = require('./oauthBrokerBase');
const BrokerConnection = require('../../models/BrokerConnection');
const ibkrService = require('./ibkrService');
const { parseTradovateTransactions } = require('../../utils/csv/parsers/tradovate');

const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const ITEMS_BATCH_SIZE = 100;

function getApiBase(environment) {
  if (process.env.TRADOVATE_API_BASE) return process.env.TRADOVATE_API_BASE.replace(/\/$/, '');
  return environment === 'demo'
    ? 'https://demo.tradovateapi.com/v1'
    : 'https://live.tradovateapi.com/v1';
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sumFillFee(fee = {}) {
  return [
    fee.commission,
    fee.clearingFee,
    fee.exchangeFee,
    fee.nfaFee,
    fee.brokerageFee,
    fee.ipFee,
    fee.orderRoutingFee
  ].reduce((total, value) => total + (Number(value) || 0), 0);
}

function markTransient(error) {
  const status = error.response?.status;
  if (!status || status === 408 || status === 429 || status >= 500) {
    error.transient = true;
  }
  return error;
}

/**
 * Tradovate broker sync over the partner OAuth API.
 *
 * Fills are aggregated per order into the same record shape as Tradovate's
 * Orders CSV export and run through parseTradovateTransactions, so API syncs
 * and CSV imports share round-trip building, open-position merging and
 * orderId de-duplication. Imports reuse the IBKR importer, which already
 * handles updates to open positions, exclusions and R-values.
 */
class TradovateService extends OAuthBrokerBase {
  constructor() {
    const environment = process.env.TRADOVATE_ENV === 'demo' ? 'demo' : 'live';
    super({
      brokerType: 'tradovate',
      displayName: 'Tradovate',
      logPrefix: 'TRADOVATE',
      clientId: process.env.TRADOVATE_CLIENT_ID,
      clientSecret: process.env.TRADOVATE_CLIENT_SECRET,
      redirectUri: process.env.TRADOVATE_REDIRECT_URI,
      authorizationUrl: process.env.TRADOVATE_AUTH_URL || 'https://trader.tradovate.com/oauth',
      tokenUrl: process.env.TRADOVATE_TOKEN_URL || 'https://live.tradovateapi.com/auth/oauthtoken',
      scope: null,
      environment,
      apiBase: getApiBase(environment)
    });
  }

  getApiBase(connection) {
    return connection?.brokerEnvironment ? getApiBase(connection.brokerEnvironment) : this.config.apiBase;
  }

  async request(accessToken, path, params = {}, connection = null) {
    try {
      const response = await axios.get(`${this.getApiBase(connection)}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        params,
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        const authError = new Error('Tradovate authentication expired. Please reconnect.');
        authError.needsReauth = true;
        throw authError;
      }
      throw markTransient(error);
    }
  }

  async fetchItems(accessToken, path, ids, connection) {
    const uniqueIds = [...new Set(ids.filter(id => id !== null && id !== undefined))];
    const items = [];
    for (const batch of chunk(uniqueIds, ITEMS_BATCH_SIZE)) {
      const data = await this.request(accessToken, path, { ids: batch.join(',') }, connection);
      if (Array.isArray(data)) items.push(...data);
    }
    return new Map(items.filter(item => item && item.id !== undefined).map(item => [item.id, item]));
  }

  /**
   * Tradovate may not issue refresh tokens to every partner app. Without one,
   * a still-valid access token can be renewed in place; an expired one needs
   * the user to reconnect.
   */
  async ensureValidToken(connection) {
    const expiresAt = connection.oauthTokenExpiresAt ? new Date(connection.oauthTokenExpiresAt) : null;
    const expiresInMs = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.getTime() - Date.now() : -1;

    if (expiresInMs > TOKEN_REFRESH_BUFFER_MS) {
      return { accessToken: connection.oauthAccessToken, needsReauth: false };
    }

    if (connection.oauthRefreshToken) {
      return super.ensureValidToken({ ...connection, oauthTokenExpiresAt: null });
    }

    if (expiresInMs > 0 && connection.oauthAccessToken) {
      try {
        const renewed = await this.request(connection.oauthAccessToken, '/auth/renewaccesstoken', {}, connection);
        if (renewed?.accessToken && !renewed.errorText) {
          const renewedExpiry = renewed.expirationTime
            ? new Date(renewed.expirationTime)
            : new Date(Date.now() + 90 * 60 * 1000);
          await BrokerConnection.updateOAuthTokens(connection.id, renewed.accessToken, null, renewedExpiry, null);
          return { accessToken: renewed.accessToken, needsReauth: false };
        }
      } catch (error) {
        console.warn(`[TRADOVATE] Access token renewal failed for connection ${connection.id}: ${error.message}`);
      }
    }

    await BrokerConnection.updateStatus(connection.id, 'expired', 'Tradovate authentication expired. Please reconnect.');
    return { accessToken: null, needsReauth: true };
  }

  async fetchConnectionProfile(accessToken, options = {}) {
    const connection = { brokerEnvironment: options.environment || this.config.environment };
    const [me, accounts] = await Promise.all([
      this.request(accessToken, '/auth/me', {}, connection).catch(() => null),
      this.getAccounts(accessToken, connection)
    ]);
    const primary = accounts[0] || {};
    const userLabel = me?.fullName || me?.name || primary.name;

    return {
      externalUserId: me?.userId ? String(me.userId) : (primary.userId ? String(primary.userId) : null),
      externalAccountId: primary.id ? String(primary.id) : null,
      environment: connection.brokerEnvironment,
      accountLabel: userLabel ? `Tradovate · ${userLabel}` : 'Tradovate',
      metadata: {
        accounts: accounts.map(account => ({
          id: account.id,
          name: account.name,
          accountType: account.accountType,
          evaluationSize: account.evaluationSize ?? null
        }))
      }
    };
  }

  async getAccounts(accessToken, connection) {
    const accounts = await this.request(accessToken, '/account/list', {}, connection);
    return Array.isArray(accounts) ? accounts.filter(account => !account.closed) : [];
  }

  /**
   * Fetch fills in the window, resolve their account (via orders), contract,
   * product point value and fees, and aggregate them per order.
   */
  async fetchOrderRecords(accessToken, connection, { startDate, endDate } = {}) {
    const fills = await this.request(accessToken, '/fill/list', {}, connection);
    const startMs = startDate ? new Date(startDate).getTime() : null;
    const endMs = endDate ? new Date(`${String(endDate).slice(0, 10)}T23:59:59.999Z`).getTime() : null;
    const inWindow = (Array.isArray(fills) ? fills : []).filter(fill => {
      if (!fill || fill.active === false || !(Number(fill.qty) > 0)) return false;
      const time = new Date(fill.timestamp).getTime();
      if (Number.isNaN(time)) return false;
      return (startMs === null || time >= startMs) && (endMs === null || time <= endMs);
    });

    if (inWindow.length === 0) {
      return { records: [], pointValueByProduct: {}, tickSizeByProduct: {}, fillCount: 0 };
    }

    const [accounts, orders, contracts, fees] = await Promise.all([
      this.getAccounts(accessToken, connection),
      this.fetchItems(accessToken, '/order/items', inWindow.map(fill => fill.orderId), connection),
      this.fetchItems(accessToken, '/contract/items', inWindow.map(fill => fill.contractId), connection),
      this.fetchItems(accessToken, '/fillFee/items', inWindow.map(fill => fill.id), connection)
        .catch(error => {
          console.warn(`[TRADOVATE] Could not load fill fees: ${error.message}`);
          return new Map();
        })
    ]);

    const maturities = await this.fetchItems(
      accessToken,
      '/contractMaturity/items',
      [...contracts.values()].map(contract => contract.contractMaturityId),
      connection
    );

    const products = new Map();
    for (const productId of new Set([...maturities.values()].map(maturity => maturity.productId).filter(Boolean))) {
      const product = await this.request(accessToken, '/product/item', { id: productId }, connection);
      if (product?.id !== undefined) products.set(product.id, product);
    }

    const accountNames = new Map(accounts.map(account => [account.id, account.name]));
    const pointValueByProduct = {};
    const tickSizeByProduct = {};
    const recordsByOrder = new Map();

    for (const fill of inWindow) {
      const contract = contracts.get(fill.contractId);
      if (!contract?.name) continue;
      const maturity = maturities.get(contract.contractMaturityId);
      const product = maturity ? products.get(maturity.productId) : null;
      const productName = product?.name || contract.name.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '');
      if (product?.valuePerPoint) pointValueByProduct[productName] = product.valuePerPoint;
      if (product?.tickSize) tickSizeByProduct[productName] = product.tickSize;

      const order = orders.get(fill.orderId);
      const accountId = order?.accountId;
      const key = String(fill.orderId);
      const existing = recordsByOrder.get(key);
      const qty = Number(fill.qty);
      const fee = sumFillFee(fees.get(fill.id));

      if (existing) {
        existing._notional += qty * Number(fill.price);
        existing.filledQty += qty;
        existing.Commission += fee;
        if (new Date(fill.timestamp) < new Date(existing['Fill Time'])) existing['Fill Time'] = fill.timestamp;
        continue;
      }

      recordsByOrder.set(key, {
        orderId: key,
        Contract: contract.name,
        Product: productName,
        'Product Description': product?.description || '',
        'B/S': fill.action === 'Sell' ? 'Sell' : 'Buy',
        filledQty: qty,
        _notional: qty * Number(fill.price),
        'Fill Time': fill.timestamp,
        Status: 'Filled',
        Commission: fee,
        Text: '',
        Account: accountNames.get(accountId) || (accountId ? String(accountId) : ''),
        _accountId: accountId ?? null
      });
    }

    const records = [...recordsByOrder.values()].map(record => {
      const { _notional, ...rest } = record;
      return { ...rest, avgPrice: _notional / record.filledQty };
    });

    return { records, pointValueByProduct, tickSizeByProduct, fillCount: inWindow.length };
  }

  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;
    const { accessToken, needsReauth } = await this.ensureValidToken(connection);
    if (needsReauth) {
      throw new Error('Tradovate authentication expired. Please reconnect.');
    }

    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    let fetched;
    try {
      fetched = await this.fetchOrderRecords(accessToken, connection, { startDate, endDate });
    } catch (error) {
      if (error.needsReauth) {
        await BrokerConnection.updateStatus(connection.id, 'expired', error.message);
      }
      throw error;
    }

    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing', { tradesFetched: fetched.fillCount });
    }

    const existingContext = await ibkrService.getExistingContext(connection.userId);
    const trades = await this.buildTrades(fetched, existingContext, connection);

    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    return ibkrService.importTrades(connection.userId, trades, existingContext);
  }

  /**
   * Parse each Tradovate account separately: the parser tracks one position per
   * contract, and prop-firm users often trade the same contract in several
   * evaluation accounts at once.
   */
  async buildTrades({ records, pointValueByProduct, tickSizeByProduct }, existingContext, connection) {
    const recordsByAccount = new Map();
    for (const record of records) {
      const account = record.Account || '';
      if (!recordsByAccount.has(account)) recordsByAccount.set(account, []);
      recordsByAccount.get(account).push(record);
    }

    const singleAccount = recordsByAccount.size <= 1;
    const openPositions = existingContext.existingOpenPositions || [];
    const trades = [];

    for (const [account, accountRecords] of recordsByAccount) {
      const existingPositions = {};
      for (const position of openPositions) {
        if (position.instrumentType && position.instrumentType !== 'future') continue;
        const positionAccount = position.accountIdentifier || '';
        if (positionAccount === account || (singleAccount && !positionAccount)) {
          existingPositions[position.symbol] = position;
        }
      }

      const parsed = await parseTradovateTransactions(accountRecords, existingPositions, {
        existingExecutions: existingContext.existingExecutions,
        accountColumnName: 'Account',
        pointValueByProduct,
        tickSizeByProduct
      });

      for (const trade of parsed) {
        trades.push({
          ...trade,
          broker: 'tradovate',
          brokerConnectionId: connection.id,
          accountIdentifier: trade.accountIdentifier || account || null
        });
      }
    }

    return trades;
  }
}

module.exports = new TradovateService();
