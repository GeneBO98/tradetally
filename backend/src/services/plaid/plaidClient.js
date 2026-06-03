const axios = require('axios');

const PLAID_BASE_URLS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
};

function compactOptionalFields(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== null && value !== undefined)
  );
}

function buildPlaidError(error) {
  const plaidError = error.response?.data;
  if (!plaidError || typeof plaidError !== 'object') {
    return error;
  }

  const parts = [
    plaidError.error_code,
    plaidError.error_message || plaidError.display_message
  ].filter(Boolean);

  const message = parts.length > 0
    ? `Plaid request failed: ${parts.join(' - ')}`
    : error.message;

  const wrapped = new Error(message);
  wrapped.status = error.response?.status;
  wrapped.plaid = {
    errorType: plaidError.error_type,
    errorCode: plaidError.error_code,
    requestId: plaidError.request_id
  };
  wrapped.cause = error;
  return wrapped;
}

class PlaidClient {
  constructor() {
    this.clientId = process.env.PLAID_CLIENT_ID;
    this.secret = process.env.PLAID_SECRET;
    this.env = process.env.PLAID_ENV || 'sandbox';
  }

  isConfigured() {
    return Boolean(this.clientId && this.secret && PLAID_BASE_URLS[this.env]);
  }

  getBaseUrl() {
    const baseUrl = PLAID_BASE_URLS[this.env];
    if (!baseUrl) {
      throw new Error(`Unsupported PLAID_ENV "${this.env}"`);
    }
    return baseUrl;
  }

  buildRequestBody(body = {}) {
    return {
      client_id: this.clientId,
      secret: this.secret,
      ...body
    };
  }

  async post(path, body = {}) {
    if (!this.isConfigured()) {
      throw new Error('Plaid is not configured on this server');
    }

    try {
      const response = await axios.post(
        `${this.getBaseUrl()}${path}`,
        this.buildRequestBody(compactOptionalFields(body)),
        {
          headers: {
            'Content-Type': 'application/json',
            'Plaid-Version': '2020-09-14'
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error) {
      throw buildPlaidError(error);
    }
  }

  async createLinkToken({ userId, email, targetType = 'bank' }) {
    const countryCodes = (process.env.PLAID_COUNTRY_CODES || 'US')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(value => /^[A-Z]{2}$/.test(value));

    if (countryCodes.length === 0) {
      countryCodes.push('US');
    }

    const products = targetType === 'investment' ? ['investments'] : ['transactions'];
    const body = {
      user: {
        client_user_id: String(userId)
      },
      client_name: 'TradeTally',
      language: 'en',
      country_codes: countryCodes,
      products
    };

    if (email) {
      body.user.email_address = email;
    }

    if (process.env.PLAID_REDIRECT_URI) {
      body.redirect_uri = process.env.PLAID_REDIRECT_URI;
    }

    if (process.env.PLAID_WEBHOOK_URL && targetType === 'bank') {
      body.webhook = process.env.PLAID_WEBHOOK_URL;
    }

    if (targetType === 'bank') {
      body.transactions = {
        days_requested: 730
      };
    }

    return this.post('/link/token/create', body);
  }

  async exchangePublicToken(publicToken) {
    return this.post('/item/public_token/exchange', {
      public_token: publicToken
    });
  }

  async getAccounts(accessToken) {
    return this.post('/accounts/get', {
      access_token: accessToken
    });
  }

  async syncTransactions(accessToken, cursor = null) {
    const body = {
      access_token: accessToken,
      count: 100
    };

    if (cursor) {
      body.cursor = cursor;
    }

    return this.post('/transactions/sync', body);
  }

  async getInvestmentTransactions(accessToken, startDate, endDate, offset = 0, count = 100) {
    return this.post('/investments/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        offset,
        count
      }
    });
  }
}

module.exports = new PlaidClient();
