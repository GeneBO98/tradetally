const CRYPTO_ASSETS = Object.freeze([
  { symbol: 'BTC', name: 'Bitcoin', coin_gecko_id: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', coin_gecko_id: 'ethereum' },
  { symbol: 'XRP', name: 'XRP', coin_gecko_id: 'ripple' },
  { symbol: 'LTC', name: 'Litecoin', coin_gecko_id: 'litecoin' },
  { symbol: 'BCH', name: 'Bitcoin Cash', coin_gecko_id: 'bitcoin-cash' },
  { symbol: 'ADA', name: 'Cardano', coin_gecko_id: 'cardano' },
  { symbol: 'DOT', name: 'Polkadot', coin_gecko_id: 'polkadot' },
  { symbol: 'LINK', name: 'Chainlink', coin_gecko_id: 'chainlink' },
  { symbol: 'XLM', name: 'Stellar', coin_gecko_id: 'stellar' },
  { symbol: 'DOGE', name: 'Dogecoin', coin_gecko_id: 'dogecoin' },
  { symbol: 'UNI', name: 'Uniswap', coin_gecko_id: 'uniswap' },
  { symbol: 'USDT', name: 'Tether', coin_gecko_id: 'tether' },
  { symbol: 'USDC', name: 'USD Coin', coin_gecko_id: 'usd-coin' },
  { symbol: 'BNB', name: 'BNB', coin_gecko_id: 'binancecoin' },
  { symbol: 'SOL', name: 'Solana', coin_gecko_id: 'solana' },
  { symbol: 'AVAX', name: 'Avalanche', coin_gecko_id: 'avalanche-2' },
  { symbol: 'MATIC', name: 'Polygon', coin_gecko_id: 'matic-network' },
  { symbol: 'ATOM', name: 'Cosmos Hub', coin_gecko_id: 'cosmos' },
  { symbol: 'FIL', name: 'Filecoin', coin_gecko_id: 'filecoin' },
  { symbol: 'TRX', name: 'TRON', coin_gecko_id: 'tron' },
  { symbol: 'ETC', name: 'Ethereum Classic', coin_gecko_id: 'ethereum-classic' },
  { symbol: 'XMR', name: 'Monero', coin_gecko_id: 'monero' },
  { symbol: 'ALGO', name: 'Algorand', coin_gecko_id: 'algorand' },
  { symbol: 'VET', name: 'VeChain', coin_gecko_id: 'vechain' },
  { symbol: 'THETA', name: 'Theta Network', coin_gecko_id: 'theta-token' },
  { symbol: 'FTT', name: 'FTX Token', coin_gecko_id: 'ftx-token' },
  { symbol: 'AAVE', name: 'Aave', coin_gecko_id: 'aave' },
  { symbol: 'EOS', name: 'EOS', coin_gecko_id: 'eos' },
  { symbol: 'MKR', name: 'Maker', coin_gecko_id: 'maker' },
  { symbol: 'COMP', name: 'Compound', coin_gecko_id: 'compound-governance-token' },
  { symbol: 'SHIB', name: 'Shiba Inu', coin_gecko_id: 'shiba-inu' },
  { symbol: 'CRO', name: 'Cronos', coin_gecko_id: 'crypto-com-chain' },
  { symbol: 'DAI', name: 'Dai', coin_gecko_id: 'dai' },
  { symbol: 'LEO', name: 'UNUS SED LEO', coin_gecko_id: 'leo-token' },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', coin_gecko_id: 'wrapped-bitcoin' },
  { symbol: 'OKB', name: 'OKB', coin_gecko_id: 'okb' },
  { symbol: 'LDO', name: 'Lido DAO', coin_gecko_id: 'lido-dao' },
  { symbol: 'APT', name: 'Aptos', coin_gecko_id: 'aptos' },
  { symbol: 'ARB', name: 'Arbitrum', coin_gecko_id: 'arbitrum' },
  { symbol: 'OP', name: 'Optimism', coin_gecko_id: 'optimism' },
  { symbol: 'NEAR', name: 'NEAR Protocol', coin_gecko_id: 'near' },
  { symbol: 'ICP', name: 'Internet Computer', coin_gecko_id: 'internet-computer' },
  { symbol: 'APE', name: 'ApeCoin', coin_gecko_id: 'apecoin' },
  { symbol: 'GRT', name: 'The Graph', coin_gecko_id: 'the-graph' },
  { symbol: 'FTM', name: 'Fantom', coin_gecko_id: 'fantom' },
  { symbol: 'SAND', name: 'The Sandbox', coin_gecko_id: 'the-sandbox' },
  { symbol: 'MANA', name: 'Decentraland', coin_gecko_id: 'decentraland' },
  { symbol: 'AXS', name: 'Axie Infinity', coin_gecko_id: 'axie-infinity' },
  { symbol: 'EGLD', name: 'MultiversX', coin_gecko_id: 'elrond-erd-2' },
  { symbol: 'QNT', name: 'Quant', coin_gecko_id: 'quant-network' },
  { symbol: 'HBAR', name: 'Hedera', coin_gecko_id: 'hedera-hashgraph' },
  { symbol: 'CHZ', name: 'Chiliz', coin_gecko_id: 'chiliz' },
  { symbol: 'FLOW', name: 'Flow', coin_gecko_id: 'flow' },
  { symbol: 'XTZ', name: 'Tezos', coin_gecko_id: 'tezos' },
  { symbol: 'KAVA', name: 'Kava', coin_gecko_id: 'kava' },
  { symbol: 'NEO', name: 'NEO', coin_gecko_id: 'neo' },
  { symbol: 'RPL', name: 'Rocket Pool', coin_gecko_id: 'rocket-pool' },
  { symbol: 'GMX', name: 'GMX', coin_gecko_id: 'gmx' },
  { symbol: 'PEPE', name: 'Pepe', coin_gecko_id: 'pepe' },
  { symbol: 'SUI', name: 'Sui', coin_gecko_id: 'sui' }
]);

const CRYPTO_ASSETS_BY_SYMBOL = new Map(
  CRYPTO_ASSETS.map(asset => [asset.symbol, asset])
);

const CRYPTO_SYMBOLS = Object.freeze(CRYPTO_ASSETS.map(asset => asset.symbol));

const CRYPTO_TO_COINGECKO = Object.freeze(Object.fromEntries(
  CRYPTO_ASSETS.map(asset => [asset.symbol, asset.coin_gecko_id])
));

function getCryptoAsset(symbol) {
  return CRYPTO_ASSETS_BY_SYMBOL.get(String(symbol || '').trim().toUpperCase()) || null;
}

function searchCryptoAssets(query, limit = 15) {
  const normalized_query = String(query || '').trim().toUpperCase();
  if (!normalized_query) return [];

  return CRYPTO_ASSETS
    .filter(asset => {
      const normalized_name = asset.name.toUpperCase();
      return asset.symbol === normalized_query || (
        normalized_query.length >= 3 && (
          asset.symbol.startsWith(normalized_query) ||
          normalized_name.includes(normalized_query)
        )
      );
    })
    .sort((left, right) => {
      const rank = asset => {
        if (asset.symbol === normalized_query) return 0;
        if (asset.name.toUpperCase() === normalized_query) return 1;
        if (asset.symbol.startsWith(normalized_query)) return 2;
        return 3;
      };
      return rank(left) - rank(right) || left.symbol.localeCompare(right.symbol);
    })
    .slice(0, limit);
}

module.exports = {
  CRYPTO_ASSETS,
  CRYPTO_SYMBOLS,
  CRYPTO_TO_COINGECKO,
  getCryptoAsset,
  searchCryptoAssets
};
