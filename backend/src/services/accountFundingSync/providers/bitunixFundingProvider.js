const BrokerConnection = require('../../../models/BrokerConnection');
const bitunixService = require('../../brokerSync/bitunixService');

class BitunixFundingProvider {
  get providerKey() {
    return 'bitunix';
  }

  supportsAccount(account) {
    const broker = String(account?.resolved_broker || account?.broker || '').trim().toLowerCase();
    const identifier = String(account?.account_identifier || '').trim().toLowerCase();

    return broker === 'bitunix' || identifier === 'bitunix-usdt';
  }

  async sync({ userId, accountId, account }) {
    const connection = await BrokerConnection.findByUserAndBroker(userId, 'bitunix', true);

    if (!connection?.bitunixApiKey || !connection?.bitunixApiSecret) {
      throw new Error('Active Bitunix connection with API credentials not found');
    }

    return bitunixService.syncFundingHistoryForAccount({
      userId,
      accountId,
      connection,
      account
    });
  }
}

module.exports = BitunixFundingProvider;
