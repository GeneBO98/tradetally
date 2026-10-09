const {
  CRYPTO_ASSETS,
  CRYPTO_SYMBOLS,
  CRYPTO_TO_COINGECKO,
  getCryptoAsset,
  searchCryptoAssets
} = require('../../src/utils/cryptoAssets');

describe('crypto assets catalog', () => {
  test('keeps detection and CoinGecko mappings in sync', () => {
    expect(CRYPTO_SYMBOLS).toHaveLength(CRYPTO_ASSETS.length);

    for (const symbol of CRYPTO_SYMBOLS) {
      expect(CRYPTO_TO_COINGECKO[symbol]).toBeTruthy();
      expect(getCryptoAsset(symbol)?.coin_gecko_id).toBe(CRYPTO_TO_COINGECKO[symbol]);
    }
  });

  test('finds Bitcoin by ticker or name', () => {
    expect(searchCryptoAssets('btc')[0]).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' });
    expect(searchCryptoAssets('bitcoin')).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'BTC', name: 'Bitcoin' })
    ]));
  });
});
