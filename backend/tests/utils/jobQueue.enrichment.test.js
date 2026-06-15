jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  logImport: jest.fn(),
  logError: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({}));

jest.mock('../../src/services/tradeQuality.service', () => ({
  getStaleQualityCondition: jest.fn(() => '(quality_grade IS NULL OR quality_metrics IS NULL OR stale_quality_version)'),
  calculateQuality: jest.fn()
}));

jest.mock('../../src/services/newsEnrichmentService', () => ({
  resolveNewsLookupSymbol: jest.fn(() => 'ADBE'),
  getNewsForSymbolAndDate: jest.fn()
}));

const db = require('../../src/config/database');
const tradeQualityService = require('../../src/services/tradeQuality.service');
const newsEnrichmentService = require('../../src/services/newsEnrichmentService');
const jobQueue = require('../../src/utils/jobQueue');

describe('jobQueue enrichment selectors', () => {
  beforeEach(() => {
    db.query.mockReset();
    tradeQualityService.getStaleQualityCondition.mockClear();
    tradeQualityService.calculateQuality.mockReset();
    newsEnrichmentService.resolveNewsLookupSymbol.mockClear();
    newsEnrichmentService.getNewsForSymbolAndDate.mockReset();
  });

  it('selects stale quality metrics for quality backfill', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await jobQueue.processQualityBackfill({ userId: 'user-1' });

    expect(tradeQualityService.getStaleQualityCondition).toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).toContain('quality_metrics IS NULL');
    expect(db.query.mock.calls[0][0]).toContain('stale_quality_version');
  });

  it('uses the news lookup symbol for import-time option news enrichment', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'trade-1',
          symbol: 'ADBE  260101C00500000',
          underlying_symbol: 'ADBE',
          instrument_type: 'option',
          trade_date: '2026-01-02',
          entry_time: '2026-01-02T14:30:00Z'
        }]
      })
      .mockResolvedValueOnce({ rowCount: 1 });
    newsEnrichmentService.getNewsForSymbolAndDate.mockResolvedValue({
      hasNews: true,
      newsEvents: [{ headline: 'ADBE headline' }],
      sentiment: 'positive'
    });

    await jobQueue.processNewsEnrichment({
      userId: 'user-1',
      importId: 'import-1',
      tradeCount: 1
    });

    expect(db.query.mock.calls[0][0]).toContain('has_news = FALSE');
    expect(newsEnrichmentService.resolveNewsLookupSymbol).toHaveBeenCalledWith(
      expect.objectContaining({ underlying_symbol: 'ADBE' })
    );
    expect(newsEnrichmentService.getNewsForSymbolAndDate).toHaveBeenCalledWith(
      'ADBE',
      new Date('2026-01-02'),
      'user-1'
    );
  });
});
