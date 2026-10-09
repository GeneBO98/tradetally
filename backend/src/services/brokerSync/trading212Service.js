const axios = require('axios');
const OAuthBrokerBase = require('./oauthBrokerBase');
const BrokerConnection = require('../../models/BrokerConnection');

const PAGE_SIZE = 50;
const MAX_PAGES = 1000;
const MAX_RATE_LIMIT_WAIT_MS = 65 * 1000;

function getApiBase(environment = 'live') {
  return environment === 'demo'
    ? 'https://demo.trading212.com/api/v0'
    : 'https://live.trading212.com/api/v0';
}

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeTicker(ticker) {
  return String(ticker || '')
    .trim()
    .replace(/_[A-Z]{2}_EQ$/i, '')
    .toUpperCase();
}

function numericTaxAmount(tax) {
  if (!tax || typeof tax !== 'object') return 0;
  const value = tax.amount ?? tax.value ?? tax.cost ?? tax.charge;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

class Trading212Service extends OAuthBrokerBase {
  constructor() {
    super({
      brokerType: 'trading212',
      displayName: 'Trading 212',
      logPrefix: 'TRADING212'
    });
  }

  async validateCredentials(apiKey, apiSecret, environment = 'live') {
    if (!apiKey || !apiSecret) {
      return { valid: false, message: 'Trading 212 API key and secret are required' };
    }

    try {
      const response = await axios.get(`${getApiBase(environment)}/equity/account/summary`, {
        auth: { username: apiKey, password: apiSecret },
        timeout: 15000
      });
      const summary = response.data || {};
      return {
        valid: true,
        message: 'Trading 212 connection is valid',
        accountId: summary.id != null ? String(summary.id) : null,
        currency: summary.currency || null
      };
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return { valid: false, message: 'Trading 212 rejected the API key or secret' };
      }
      if (status === 429) {
        return { valid: false, message: 'Trading 212 rate limit reached. Please wait and try again.' };
      }
      return {
        valid: false,
        message: `Unable to validate Trading 212 credentials: ${error.message}`
      };
    }
  }

  async syncTrades(connection, options = {}) {
    const { startDate, endDate, syncLogId } = options;
    if (!connection.trading212ApiKey || !connection.trading212ApiSecret) {
      throw new Error('Trading 212 credentials are missing. Reconnect the broker account.');
    }

    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'fetching');
    const rawExecutions = await this.fetchExecutions(connection, { startDate, endDate });
    if (syncLogId) {
      await BrokerConnection.updateSyncLog(syncLogId, 'parsing', { tradesFetched: rawExecutions.length });
    }

    const trades = this.mapExecutionsToTrades(rawExecutions, connection);
    if (syncLogId) await BrokerConnection.updateSyncLog(syncLogId, 'importing');
    return this.importTrades(connection.userId, connection.id, trades);
  }

  async fetchExecutions(connection, { startDate, endDate } = {}) {
    const baseUrl = getApiBase(connection.brokerEnvironment || 'live');
    const baseOrigin = new URL(baseUrl).origin;
    const auth = {
      username: connection.trading212ApiKey,
      password: connection.trading212ApiSecret
    };
    const executions = [];
    const seenPaths = new Set();
    let requestUrl = `${baseUrl}/equity/history/orders?limit=${PAGE_SIZE}`;

    for (let page = 0; requestUrl && page < MAX_PAGES; page++) {
      if (seenPaths.has(requestUrl)) {
        throw new Error('Trading 212 returned a repeated pagination cursor');
      }
      seenPaths.add(requestUrl);

      const response = await this.requestPage(requestUrl, auth);
      const items = Array.isArray(response.data?.items) ? response.data.items : [];

      for (const item of items) {
        const filledAt = item?.fill?.filledAt;
        const fillDate = toDateOnly(filledAt);
        if (!fillDate) continue;
        if (startDate && fillDate < String(startDate).slice(0, 10)) continue;
        if (endDate && fillDate > String(endDate).slice(0, 10)) continue;
        const accountId = connection.externalAccountId;
        executions.push({
          ...item,
          _accountIdentifier: accountId ? `****${String(accountId).slice(-4)}` : null
        });
      }

      const nextPagePath = response.data?.nextPagePath;
      if (!nextPagePath) {
        requestUrl = null;
        break;
      }

      const nextUrl = new URL(nextPagePath, `${baseUrl}/`);
      if (nextUrl.origin !== baseOrigin || !nextUrl.pathname.startsWith('/api/v0/equity/history/orders')) {
        throw new Error('Trading 212 returned an invalid pagination URL');
      }
      requestUrl = nextUrl.toString();

      const remaining = Number(response.headers?.['x-ratelimit-remaining']);
      if (Number.isFinite(remaining) && remaining <= 0) {
        await this.waitForRateLimitReset(response.headers);
      }
    }

    if (requestUrl) {
      throw new Error('Trading 212 history exceeded the maximum supported page count');
    }

    return executions;
  }

  async requestPage(url, auth, retries = 2) {
    try {
      return await axios.get(url, { auth, timeout: 30000 });
    } catch (error) {
      const status = error.response?.status;
      if (status === 429 && retries > 0) {
        await this.waitForRateLimitReset(error.response?.headers || {});
        return this.requestPage(url, auth, retries - 1);
      }

      if (status === 408 || status === 429 || status >= 500 || !error.response) {
        error.transient = true;
      }
      if (status === 401 || status === 403) {
        throw new Error('Trading 212 authentication failed. Check the API key, secret, and selected environment.');
      }
      throw error;
    }
  }

  async waitForRateLimitReset(headers = {}) {
    const resetSeconds = Number(headers['x-ratelimit-reset']);
    const resetMs = Number.isFinite(resetSeconds) ? (resetSeconds * 1000) - Date.now() : 10000;
    const waitMs = Math.max(250, Math.min(resetMs + 250, MAX_RATE_LIMIT_WAIT_MS));
    await this.sleep(waitMs);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  mapExecutionToFill(item) {
    const fill = item?.fill || {};
    const order = item?.order || {};
    if (fill.type && fill.type !== 'TRADE') return null;

    const symbol = normalizeTicker(order.instrument?.ticker || order.ticker);
    const quantity = Math.abs(Number(fill.quantity || 0));
    const price = Number(fill.price || 0);
    const time = fill.filledAt;
    const action = String(order.side || '').toLowerCase();
    if (!symbol || !quantity || !price || !time || !['buy', 'sell'].includes(action)) return null;

    const taxes = Array.isArray(fill.walletImpact?.taxes) ? fill.walletImpact.taxes : [];
    let commission = 0;
    let fees = 0;
    for (const tax of taxes) {
      const amount = numericTaxAmount(tax);
      if (String(tax?.name || '').toUpperCase() === 'COMMISSION_TURNOVER') {
        commission += amount;
      } else {
        fees += amount;
      }
    }

    return {
      symbol,
      action,
      quantity,
      price,
      time,
      commission,
      fees,
      instrumentType: 'stock',
      accountIdentifier: item._accountIdentifier || null,
      orderId: fill.id != null ? String(fill.id) : (order.id != null ? String(order.id) : null),
      currency: fill.walletImpact?.currency || order.currency || order.instrument?.currency || null,
      fxRate: fill.walletImpact?.fxRate ?? null
    };
  }

  toExecutionData(fill, type) {
    return {
      action: fill.action,
      type,
      quantity: fill.quantity,
      price: fill.price,
      datetime: fill.time,
      commission: fill.commission || 0,
      fees: fill.fees || 0,
      order_id: fill.orderId || null,
      currency: fill.currency || null,
      fx_rate: fill.fxRate ?? null
    };
  }
}

module.exports = new Trading212Service();
module.exports.getApiBase = getApiBase;
module.exports.normalizeTicker = normalizeTicker;
