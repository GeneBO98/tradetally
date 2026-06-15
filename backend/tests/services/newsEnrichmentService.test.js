jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({
  isConfigured: jest.fn(() => true),
  getCompanyNews: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn(() => false),
  getUserTier: jest.fn()
}));

jest.mock('../../src/services/globalEnrichmentCacheService', () => ({
  getEnrichmentWithFallback: jest.fn()
}));

const db = require('../../src/config/database');
const newsEnrichmentService = require('../../src/services/newsEnrichmentService');

describe('newsEnrichmentService option symbol resolution', () => {
  beforeEach(() => {
    db.query.mockReset();
    newsEnrichmentService.isProcessing = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    newsEnrichmentService.isProcessing = false;
  });

  it('uses underlying_symbol for option news lookup', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          symbol: 'ADBE  260101C00500000',
          underlying_symbol: 'ADBE',
          instrument_type: 'option',
          trade_date: '2026-01-02',
          has_news: false
        }]
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    const getNewsSpy = jest.spyOn(newsEnrichmentService, 'getNewsForSymbolAndDate')
      .mockResolvedValue({
        hasNews: true,
        newsEvents: [{ headline: 'ADBE headline' }],
        sentiment: 'positive'
      });

    await newsEnrichmentService.enrichTradeWithNews('trade-1', 'user-1');

    expect(getNewsSpy).toHaveBeenCalledWith('ADBE', '2026-01-02', 'user-1');
    expect(db.query.mock.calls[1][1]).toEqual([
      true,
      JSON.stringify([{ headline: 'ADBE headline' }]),
      'positive',
      'trade-1'
    ]);
  });

  it('falls back to parsing the underlying from an option contract symbol', () => {
    expect(newsEnrichmentService.resolveNewsLookupSymbol({
      symbol: 'LITE  260101P00100000',
      instrument_type: 'option'
    })).toBe('LITE');
  });

  it('groups multi-leg option backfill by underlying and date', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            symbol: 'MRVL  260101P00070000',
            underlying_symbol: 'MRVL',
            instrument_type: 'option',
            trade_date: '2026-01-02',
            user_id: 'user-1'
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            symbol: 'MRVL  260101P00065000',
            underlying_symbol: 'MRVL',
            instrument_type: 'option',
            trade_date: '2026-01-02',
            user_id: 'user-1'
          }
        ]
      })
      .mockResolvedValueOnce({ rowCount: 2 });

    jest.spyOn(newsEnrichmentService, 'isNewsEnrichmentEnabled').mockResolvedValue(true);
    const getNewsSpy = jest.spyOn(newsEnrichmentService, 'getNewsForSymbolAndDate')
      .mockResolvedValue({
        hasNews: true,
        newsEvents: [{ headline: 'MRVL headline' }],
        sentiment: 'positive',
        fromCache: false
      });

    await newsEnrichmentService.backfillTradeNews({ userId: 'user-1' });

    expect(getNewsSpy).toHaveBeenCalledTimes(1);
    expect(getNewsSpy).toHaveBeenCalledWith('MRVL', '2026-01-02', 'user-1');
    expect(db.query.mock.calls[0][0]).toContain('has_news = FALSE');
    expect(db.query.mock.calls[1][1]).toEqual([
      true,
      JSON.stringify([{ headline: 'MRVL headline' }]),
      'positive',
      'MRVL',
      '2026-01-02',
      'user-1',
      [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
      ]
    ]);
  });
});
