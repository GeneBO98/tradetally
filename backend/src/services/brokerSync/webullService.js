const axios = require('axios');
const OAuthBrokerBase = require('./oauthBrokerBase');
const { create_signed_headers } = require('./webullSignature');

// Webull Connect API (https://developer.webull.com/apis/docs/connect-api/about-connect-api/)
// OAuth login uses Webull Passport; data endpoints live under /oauth-openapi.
const PROD_BASE = 'https://us-oauth-open-api.webull.com';
const UAT_BASE = 'https://oauth-open-api.sandbox.webull.com';

// Order history supports a maximum look-back of 2 years.
const MAX_LOOKBACK_DAYS = 730;
const ORDER_PAGE_SIZE = 100;
const MAX_ORDER_PAGES = 200;
// Order history / account endpoints are limited to 2 requests per 2 seconds.
const REQUEST_SPACING_MS = Number(process.env.WEBULL_REQUEST_SPACING_MS ?? 1100);

function getBaseUrl() {
  return (process.env.WEBULL_ENVIRONMENT || '').toLowerCase() === 'uat' ? UAT_BASE : PROD_BASE;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toDateParam(value, fallback) {
  if (!value) return fallback;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString().slice(0, 10);
}

function clampToLookback(dateStr) {
  const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const floorStr = floor.toISOString().slice(0, 10);
  return !dateStr || dateStr < floorStr ? floorStr : dateStr;
}

class WebullService extends OAuthBrokerBase {
  constructor() {
    const baseUrl = getBaseUrl();
    super({
      brokerType: 'webull',
      displayName: 'Webull',
      logPrefix: 'WEBULL',
      clientId: process.env.WEBULL_CLIENT_ID,
      clientSecret: process.env.WEBULL_CLIENT_SECRET,
      redirectUri: process.env.WEBULL_REDIRECT_URI,
      authorizationUrl: baseUrl === UAT_BASE
        ? 'https://passport.webull.com/oauth2/sandbox/authenticate/login'
        : 'https://passport.webull.com/oauth2/authenticate/login',
      tokenUrl: `${baseUrl}/oauth2/tokens/create`,
      // Scope is issued per app during Webull's manual registration; override
      // via env if your app was granted a different scope string.
      scope: process.env.WEBULL_SCOPE || 'user:trade:wr',
      apiBase: `${baseUrl}/oauth-openapi`
    });
    this.app_key = process.env.WEBULL_APP_KEY;
    this.app_secret = process.env.WEBULL_APP_SECRET;
  }

  isConfigured() {
    return super.isConfigured() && Boolean(this.app_key && this.app_secret);
  }

  signed_headers(url, params = {}, body = '') {
    return create_signed_headers({ url, params, body, app_key: this.app_key, app_secret: this.app_secret });
  }

  async request_token(body_params, fallback_refresh_token = null) {
    const body = new URLSearchParams(body_params).toString();
    try {
      const response = await axios.post(this.config.tokenUrl, body, {
        headers: {
          ...this.signed_headers(this.config.tokenUrl, {}, body),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        timeout: 15000
      });
      return this.normalizeTokenResponse(response.data, fallback_refresh_token);
    } catch (error) {
      const error_code = error.response?.data?.error_code;
      if (typeof error_code === 'string' && /^[A-Z0-9_]+$/.test(error_code)) {
        error.message = `Webull token request rejected: ${error_code}`;
      }
      throw error;
    }
  }

  async exchangeCodeForTokens(code) {
    return this.request_token({
      grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId, client_secret: this.config.clientSecret
    });
  }

  async refreshAccessToken(refresh_token) {
    return this.request_token({
      grant_type: 'refresh_token', refresh_token,
      client_id: this.config.clientId, client_secret: this.config.clientSecret
    }, refresh_token);
  }

  // Webull returns rt_expires_in (refresh token TTL in seconds, as a string)
  // instead of refresh_token_expires_in, and rotates the refresh token on
  // every refresh. Access tokens last 30 minutes; refresh tokens 15 days.
  normalizeTokenResponse(data, fallbackRefreshToken = null) {
    const normalized = super.normalizeTokenResponse(data, fallbackRefreshToken);
    const rtExpiresIn = Number(data.rt_expires_in || 0);
    if (rtExpiresIn) {
      normalized.refreshTokenExpiresAt = new Date(Date.now() + rtExpiresIn * 1000);
    }
    return normalized;
  }

  async fetchConnectionProfile(accessToken) {
    const accounts = await this.getAccounts(accessToken);
    const firstAccount = accounts[0] || {};
    const accountNumber = firstAccount.account_number || firstAccount.account_id;
    return {
      externalAccountId: firstAccount.account_id ? String(firstAccount.account_id) : null,
      externalUserId: firstAccount.user_id ? String(firstAccount.user_id) : null,
      accountLabel: accountNumber ? `Webull ${String(accountNumber).slice(-4)}` : 'Webull',
      metadata: {
        accounts: accounts.map(account => ({
          account_id: account.account_id,
          account_number: account.account_number,
          account_type: account.account_type,
          account_label: account.account_label,
          account_class: account.account_class
        }))
      }
    };
  }

  async getAccounts(accessToken) {
    const url = `${this.config.apiBase}/account/list`;
    const response = await axios.get(url, {
      headers: { ...this.signed_headers(url), Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    });
    const data = response.data;
    if (Array.isArray(data)) return data;
    return data?.accounts || data?.data || [];
  }

  async fetchExecutions(accessToken, connection, { startDate, endDate } = {}) {
    const accounts = await this.getAccounts(accessToken);
    const start = clampToLookback(toDateParam(startDate, null));
    const end = toDateParam(endDate, null);

    const executions = [];
    for (const account of accounts) {
      const accountId = account.account_id;
      if (!accountId) continue;

      let cursor = null;
      for (let page = 0; page < MAX_ORDER_PAGES; page++) {
        await sleep(REQUEST_SPACING_MS);
        const params = {
          account_id: accountId,
          start_date: start,
          page_size: ORDER_PAGE_SIZE
        };
        if (end) params.end_date = end;
        if (cursor) params.last_client_order_id = cursor;

        const url = `${this.config.apiBase}/trade/order/history`;
        const response = await axios.get(url, {
          headers: { ...this.signed_headers(url, params), Authorization: `Bearer ${accessToken}` },
          params,
          timeout: 15000
        });

        const wrappers = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
        if (!wrappers.length) break;

        for (const wrapper of wrappers) {
          const orders = wrapper.orders || [wrapper];
          for (const order of orders) {
            executions.push({
              ...order,
              _accountId: String(accountId),
              _accountNumber: account.account_number ? String(account.account_number) : String(accountId)
            });
          }
        }

        const nextCursor = wrappers[wrappers.length - 1]?.client_order_id || null;
        if (!nextCursor || nextCursor === cursor || wrappers.length < ORDER_PAGE_SIZE) break;
        cursor = nextCursor;
      }
    }
    return executions;
  }

  mapExecutionToFill(execution) {
    const status = String(execution.status || '').toUpperCase();
    if (status !== 'FILLED' && status !== 'PARTIAL_FILLED') return null;

    // Futures and event contracts don't fit the share/contract P&L model yet.
    const rawInstrument = String(execution.instrument_type || '').toUpperCase();
    if (rawInstrument === 'FUTURES' || rawInstrument === 'EVENT') return null;

    const symbol = execution.symbol;
    const quantity = Math.abs(Number(execution.filled_quantity || 0));
    const price = Number(execution.filled_price || 0);
    const time = execution.filled_time_at
      || (execution.filled_time ? new Date(Number(execution.filled_time)).toISOString() : null)
      || execution.place_time_at;

    if (!symbol || !quantity || !price || !time) return null;

    // side is BUY | SELL | SHORT; SHORT opens a short position via a sell.
    const side = String(execution.side || '').toUpperCase();
    const action = side === 'BUY' ? 'buy' : 'sell';
    const orderId = execution.order_id || execution.client_order_id;

    return {
      symbol,
      action,
      quantity,
      price,
      time,
      // Order history has no commission/fee data; per-order detail calls are
      // rate-limited to 2/2s, so fees are left at 0 rather than fetched.
      commission: 0,
      fees: 0,
      instrumentType: rawInstrument === 'OPTION' ? 'option' : 'stock',
      accountIdentifier: execution._accountNumber ? `****${execution._accountNumber.slice(-4)}` : null,
      orderId: orderId ? String(orderId) : null
    };
  }
}

module.exports = new WebullService();
