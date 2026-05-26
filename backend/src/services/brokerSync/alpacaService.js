const axios = require('axios');
const OAuthBrokerBase = require('./oauthBrokerBase');

function getApiBase(environment) {
  return environment === 'paper'
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
}

class AlpacaService extends OAuthBrokerBase {
  constructor() {
    super({
      brokerType: 'alpaca',
      displayName: 'Alpaca',
      logPrefix: 'ALPACA',
      clientId: process.env.ALPACA_CLIENT_ID,
      clientSecret: process.env.ALPACA_CLIENT_SECRET,
      redirectUri: process.env.ALPACA_REDIRECT_URI,
      authorizationUrl: 'https://app.alpaca.markets/oauth/authorize',
      tokenUrl: 'https://api.alpaca.markets/oauth/token'
    });
  }

  applyAuthorizationParams(url, options = {}) {
    if (options.environment === 'paper') {
      url.searchParams.set('environment', 'paper');
    }
  }

  async fetchConnectionProfile(accessToken, options = {}) {
    const environment = options.environment || 'live';
    const account = await this.getAccount(accessToken, environment);
    return {
      externalAccountId: account.id || account.account_number || null,
      accountLabel: `Alpaca ${environment}`,
      environment,
      metadata: {
        accountNumber: account.account_number || null,
        status: account.status || null
      }
    };
  }

  async getAccount(accessToken, environment = 'live') {
    const response = await axios.get(`${getApiBase(environment)}/v2/account`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data || {};
  }

  async fetchExecutions(accessToken, connection, { startDate, endDate } = {}) {
    const environment = connection.brokerEnvironment || 'live';
    const response = await axios.get(`${getApiBase(environment)}/v2/orders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        status: 'all',
        limit: 500,
        after: startDate,
        until: endDate,
        direction: 'asc',
        nested: true
      }
    });

    const orders = Array.isArray(response.data) ? response.data : [];
    return orders.flatMap(order => {
      const fills = order.fills || order.legs || [];
      return fills.length ? fills.map(fill => ({ ...fill, _order: order })) : [order];
    });
  }

  mapExecutionToFill(execution) {
    const order = execution._order || execution;
    const symbol = execution.symbol || order.symbol;
    const quantity = Math.abs(Number(execution.qty || execution.filled_qty || order.filled_qty || 0));
    const price = Number(execution.price || execution.filled_avg_price || order.filled_avg_price || 0);
    const time = execution.transaction_time || execution.filled_at || order.filled_at || order.submitted_at;

    if (!symbol || !quantity || !price || !time) return null;

    const action = String(execution.side || order.side || '').toLowerCase() === 'sell' ? 'sell' : 'buy';
    const orderId = execution.order_id || order.id;

    return {
      symbol,
      action,
      quantity,
      price,
      time,
      commission: 0,
      fees: 0,
      instrumentType: 'stock',
      accountIdentifier: order.account_id ? `****${String(order.account_id).slice(-4)}` : null,
      orderId: orderId ? String(orderId) : null
    };
  }
}

module.exports = new AlpacaService();
