const BitunixFundingProvider = require('./providers/bitunixFundingProvider');

class AccountFundingSyncService {
  constructor() {
    this.providers = [
      new BitunixFundingProvider()
    ];
  }

  getProviderForAccount(account) {
    return this.providers.find(provider => provider.supportsAccount(account)) || null;
  }

  getAccountCapabilities(account) {
    const provider = this.getProviderForAccount(account);

    return {
      fundingSyncSupported: !!provider,
      fundingSyncProvider: provider?.providerKey || null
    };
  }

  async syncAccountFunding({ userId, accountId, account }) {
    const provider = this.getProviderForAccount(account);

    if (!provider) {
      throw new Error('Funding sync is not implemented for this account');
    }

    const result = await provider.sync({ userId, accountId, account });

    return {
      provider: provider.providerKey,
      ...result
    };
  }
}

module.exports = new AccountFundingSyncService();
