const axios = require('axios');
const OAuthBrokerBase = require('./oauthBrokerBase');

function normalizeAction(side) {
  const value = String(side || '').toLowerCase();
  return value.includes('sell') || value.includes('short') ? 'sell' : 'buy';
}

class TradeStationService extends OAuthBrokerBase {
  constructor() {
    super({
      brokerType: 'tradestation',
      displayName: 'TradeStation',
      logPrefix: 'TRADESTATION',
      clientId: process.env.TRADESTATION_CLIENT_ID,
      clientSecret: process.env.TRADESTATION_CLIENT_SECRET,
      redirectUri: process.env.TRADESTATION_REDIRECT_URI,
      authorizationUrl: 'https://signin.tradestation.com/authorize',
      tokenUrl: 'https://signin.tradestation.com/oauth/token',
      scope: 'openid offline_access ReadAccount',
      apiBase: process.env.TRADESTATION_API_BASE || 'https://api.tradestation.com/v3'
    });
  }

  async fetchConnectionProfile(accessToken) {
    const accounts = await this.getAccounts(accessToken);
    const firstAccount = accounts[0] || {};
    const accountId = firstAccount.AccountID || firstAccount.accountId || firstAccount.account_id;
    return {
      externalAccountId: accountId ? String(accountId) : null,
      accountLabel: accountId ? `TradeStation ${String(accountId).slice(-4)}` : 'TradeStation',
      metadata: { accounts }
    };
  }

  async getAccounts(accessToken) {
    const response = await axios.get(`${this.config.apiBase}/brokerage/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data?.Accounts || response.data?.accounts || response.data || [];
  }

  async fetchExecutions(accessToken, connection, { startDate, endDate } = {}) {
    const accounts = await this.getAccounts(accessToken);
    const accountIds = accounts
      .map(account => account.AccountID || account.accountId || account.account_id)
      .filter(Boolean);

    const executions = [];
    for (const accountId of accountIds) {
      const url = `${this.config.apiBase}/brokerage/accounts/${accountId}/orders`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          since: startDate,
          until: endDate
        }
      });
      const orders = response.data?.Orders || response.data?.orders || response.data || [];
      for (const order of orders) {
        const legs = order.Legs || order.legs || [];
        for (const leg of legs.length ? legs : [order]) {
          executions.push({ ...leg, _order: order, _accountId: String(accountId) });
        }
      }
    }
    return executions;
  }

  mapExecutionToFill(execution) {
    const order = execution._order || {};
    const symbol = execution.Symbol || execution.symbol || order.Symbol || order.symbol;
    const quantity = Math.abs(Number(execution.Quantity || execution.quantity || execution.FilledQuantity || execution.filledQuantity || 0));
    const price = Number(execution.ExecutionPrice || execution.executionPrice || execution.AveragePrice || execution.averagePrice || order.AveragePrice || 0);
    const time = execution.ExecutionTime || execution.executionTime || order.ClosedDateTime || order.OpenedDateTime || order.TimeStamp || order.timestamp;

    if (!symbol || !quantity || !price || !time) return null;

    const action = normalizeAction(execution.BuyOrSell || execution.buyOrSell || execution.OrderAction || execution.orderAction || order.OrderAction);
    const orderId = order.OrderID || order.orderId || execution.OrderID || execution.orderId;

    return {
      symbol,
      action,
      quantity,
      price,
      time,
      commission: Number(execution.Commission || execution.commission || 0),
      fees: Number(execution.Fees || execution.fees || 0),
      instrumentType: 'stock',
      accountIdentifier: execution._accountId ? `****${String(execution._accountId).slice(-4)}` : null,
      orderId: orderId ? String(orderId) : null
    };
  }
}

module.exports = new TradeStationService();
