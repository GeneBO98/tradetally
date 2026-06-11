const finnhubClient = require('./finnhubClient');
const fmpClient = require('./fmpClient');

function getConfiguredProviderName() {
  const requested = String(process.env.MARKET_DATA_PROVIDER || 'finnhub').trim().toLowerCase();
  if (requested === 'fmp') return 'fmp';
  return 'finnhub';
}

const providerName = getConfiguredProviderName();
const selectedProvider = providerName === 'fmp' ? fmpClient : finnhubClient;

selectedProvider.providerName = providerName;
selectedProvider.displayName = providerName === 'fmp' ? 'Financial Modeling Prep' : 'Finnhub';
selectedProvider.isFmp = providerName === 'fmp';
selectedProvider.isFinnhub = providerName === 'finnhub';
selectedProvider.requestedProviderName = String(process.env.MARKET_DATA_PROVIDER || 'finnhub').trim().toLowerCase();

console.log(`[MARKET-DATA] Using ${selectedProvider.displayName} market data provider`);

module.exports = selectedProvider;
