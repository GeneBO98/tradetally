jest.mock('../../src/utils/cache', () => ({ get: jest.fn(() => null), set: jest.fn() }));

const cache = require('../../src/utils/cache');
const alpacaMarketData = require('../../src/utils/alpacaMarketData');

// Positions are split by the currency their stored values are in, so the same
// option contract held in two currencies is two positions sharing one OCC
// symbol. Both must receive the quote.
function positionsSharingOneContract() {
  const base = {
    symbol: 'MRVL',
    underlying_symbol: 'MRVL',
    expiration_date: '2026-02-20',
    option_type: 'put',
    strike_price: 65,
    instrumentType: 'option'
  };
  return [
    { ...base, _positionKey: 'MRVL_65_2026-02-20_put|USD' },
    { ...base, _positionKey: 'MRVL_65_2026-02-20_put|EUR' }
  ];
}

describe('option snapshots for currency-split positions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Snapshots are skipped entirely unless credentials are present.
    alpacaMarketData.apiKeyId = 'test-key';
    alpacaMarketData.apiSecretKey = 'test-secret';
  });

  test('a cached quote reaches every position sharing the contract', async () => {
    cache.get.mockReturnValue({ price: 2.5, bid: 2.4, ask: 2.6 });

    const results = await alpacaMarketData.getOptionSnapshots(positionsSharingOneContract());

    // Keying the OCC to a single position would leave one of them unpriced.
    expect(results['MRVL_65_2026-02-20_put|USD']).toMatchObject({ price: 2.5 });
    expect(results['MRVL_65_2026-02-20_put|EUR']).toMatchObject({ price: 2.5 });
  });
});
