jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isConfigured: jest.fn(() => true),
  displayName: 'Finnhub',
  getCompanyProfile: jest.fn(),
  getStockCandles: jest.fn(),
  getBasicFinancials: jest.fn(),
  getCompanyNews: jest.fn(),
  getQuote: jest.fn()
}));

const db = require('../../src/config/database');
const tradeQualityService = require('../../src/services/tradeQuality.service');

const DEFAULT_WEIGHTS = {
  newsSentiment: 0.30,
  gap: 0.20,
  relativeVolume: 0.20,
  float: 0.15,
  priceRange: 0.15
};

const OPTION_WEIGHTS = {
  newsSentiment: 0.25,
  gap: 0.15,
  relativeVolume: 0.15,
  dte: 0.25,
  moneyness: 0.20
};

describe('calculateWeightedScore', () => {
  it('weights all metrics when every metric has data', () => {
    const metrics = {
      newsSentiment: 0.8,
      gap: 0.6,
      relativeVolume: 0.4,
      float: 0.7,
      priceRange: 1.0
    };

    const { score, coverage } = tradeQualityService.calculateWeightedScore(metrics, DEFAULT_WEIGHTS);

    // (0.8*0.30 + 0.6*0.20 + 0.4*0.20 + 0.7*0.15 + 1.0*0.15) * 5 = 3.475
    expect(coverage).toBe(1);
    expect(score).toBeCloseTo(3.475, 5);
  });

  it('excludes null metrics and renormalizes the remaining weights', () => {
    const metrics = {
      newsSentiment: 0.8,
      gap: null,
      relativeVolume: null,
      float: 0.7,
      priceRange: 1.0
    };

    const { score, coverage } = tradeQualityService.calculateWeightedScore(metrics, DEFAULT_WEIGHTS);

    // Available weight: 0.30 + 0.15 + 0.15 = 0.60
    // (0.8*0.30 + 0.7*0.15 + 1.0*0.15) / 0.60 * 5 = 4.125
    expect(coverage).toBeCloseTo(0.6, 5);
    expect(score).toBeCloseTo(4.125, 5);
  });

  it('does not grade when available weight is below the minimum coverage', () => {
    const metrics = {
      newsSentiment: null,
      gap: null,
      relativeVolume: null,
      float: null,
      priceRange: 1.0
    };

    const { score, coverage } = tradeQualityService.calculateWeightedScore(metrics, DEFAULT_WEIGHTS);

    expect(coverage).toBeCloseTo(0.15, 5);
    expect(score).toBeNull();
  });

  it('keeps the default 40% coverage floor for option metrics', () => {
    const metrics = {
      newsSentiment: null,
      gap: null,
      relativeVolume: null,
      dte: 1.0,
      moneyness: 1.0
    };

    const { score, coverage } = tradeQualityService.calculateWeightedScore(metrics, OPTION_WEIGHTS);

    expect(coverage).toBeCloseTo(0.45, 5);
    expect(score).toBeCloseTo(5, 5);
  });

  it('blocks 35% coverage at the default threshold but grades when lowered to 30%', () => {
    const customOptionWeights = {
      newsSentiment: 0.35,
      gap: 0.10,
      relativeVolume: 0.30,
      dte: 0.25,
      moneyness: 0.10
    };
    const metrics = {
      newsSentiment: null,
      gap: null,
      relativeVolume: null,
      dte: 0.8,
      moneyness: 1.0
    };

    const defaultThreshold = tradeQualityService.calculateWeightedScore(metrics, customOptionWeights);
    const loweredThreshold = tradeQualityService.calculateWeightedScore(metrics, customOptionWeights, 0.30);

    expect(defaultThreshold.coverage).toBeCloseTo(0.35, 5);
    expect(defaultThreshold.score).toBeNull();
    expect(loweredThreshold.coverage).toBeCloseTo(0.35, 5);
    expect(loweredThreshold.score).toBeCloseTo(((0.8 * 0.25) + (1.0 * 0.10)) / 0.35 * 5, 5);
  });

  it('respects custom weights when excluding missing metrics', () => {
    const customWeights = {
      newsSentiment: 0.50,
      gap: 0.10,
      relativeVolume: 0.10,
      float: 0.10,
      priceRange: 0.20
    };
    const metrics = {
      newsSentiment: 0.5,
      gap: null,
      relativeVolume: null,
      float: null,
      priceRange: 1.0
    };

    const { score, coverage } = tradeQualityService.calculateWeightedScore(metrics, customWeights);

    // Available weight: 0.50 + 0.20 = 0.70
    // (0.5*0.50 + 1.0*0.20) / 0.70 * 5 = 3.214...
    expect(coverage).toBeCloseTo(0.7, 5);
    expect(score).toBeCloseTo((0.45 / 0.7) * 5, 5);
  });
});

describe('recalculateFromStoredMetrics', () => {
  it('recomputes grade and score from stored metric scores', () => {
    const stored = {
      newsSentiment: 0.7,
      newsSentimentScore: 1.0,
      gap: 5.2,
      gapScore: 0.8,
      relativeVolume: 3.4,
      relativeVolumeScore: 0.8,
      float: 4.2,
      floatScore: 0.7,
      price: 12.5,
      priceScore: 1.0
    };

    const result = tradeQualityService.recalculateFromStoredMetrics(stored, DEFAULT_WEIGHTS);

    // (1.0*0.30 + 0.8*0.20 + 0.8*0.20 + 0.7*0.15 + 1.0*0.15) * 5 = 4.375 -> 4.4
    expect(result.score).toBeCloseTo(4.4, 5);
    expect(result.grade).toBe('B');
    expect(result.coverage).toBe(1);
  });

  it('treats legacy neutral defaults (score recorded, raw value null) as missing data', () => {
    // Legacy rows stored 0.5 default scores alongside null raw values
    const stored = {
      newsSentiment: null,
      newsSentimentScore: 0.5,
      gap: null,
      gapScore: 0.5,
      relativeVolume: 2.1,
      relativeVolumeScore: 0.6,
      float: null,
      floatScore: 0,
      price: 15,
      priceScore: 1.0
    };

    const result = tradeQualityService.recalculateFromStoredMetrics(stored, DEFAULT_WEIGHTS);

    // Available: relativeVolume (0.20) + priceRange (0.15) = 0.35 < MIN_COVERAGE
    expect(result.grade).toBeNull();
    expect(result.score).toBeNull();
    expect(result.coverage).toBeCloseTo(0.35, 5);
  });

  it('applies new weights to stored scores', () => {
    const stored = {
      newsSentiment: 0.7,
      newsSentimentScore: 1.0,
      gap: -2.0,
      gapScore: 0.2,
      relativeVolume: 1.2,
      relativeVolumeScore: 0.4,
      float: 500,
      floatScore: 0.1,
      price: 100,
      priceScore: 0.2
    };

    const newsHeavy = { newsSentiment: 0.80, gap: 0.05, relativeVolume: 0.05, float: 0.05, priceRange: 0.05 };
    const gapHeavy = { newsSentiment: 0.05, gap: 0.80, relativeVolume: 0.05, float: 0.05, priceRange: 0.05 };

    const newsResult = tradeQualityService.recalculateFromStoredMetrics(stored, newsHeavy);
    const gapResult = tradeQualityService.recalculateFromStoredMetrics(stored, gapHeavy);

    expect(newsResult.score).toBeGreaterThan(gapResult.score);
    expect(newsResult.grade).toBe('B');
    expect(gapResult.grade).toBe('F');
  });

  it('returns null for unusable metrics payloads', () => {
    expect(tradeQualityService.recalculateFromStoredMetrics(null, DEFAULT_WEIGHTS)).toBeNull();
    expect(tradeQualityService.recalculateFromStoredMetrics('bad', DEFAULT_WEIGHTS)).toBeNull();
  });
});

describe('reapplyUserWeights', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  it('re-grades trades with stored metrics using the new weights', async () => {
    // Custom stock weights via the legacy flat columns (no stored JSONB profile)
    const customStockRow = {
      quality_weight_profiles: null,
      quality_weight_news: 50,
      quality_weight_gap: 10,
      quality_weight_relative_volume: 10,
      quality_weight_float: 10,
      quality_weight_price_range: 20
    };

    db.query
      // getUserQualityWeights('user-1', 'stock')
      .mockResolvedValueOnce({ rows: [customStockRow] })
      // getUserMinimumCoverage('user-1', 'stock')
      .mockResolvedValueOnce({ rows: [{ quality_minimum_coverage_profiles: null }] })
      // getUserQualityWeights('user-1', 'option') -> option defaults
      .mockResolvedValueOnce({ rows: [{ quality_weight_profiles: null }] })
      // getUserMinimumCoverage('user-1', 'option')
      .mockResolvedValueOnce({ rows: [{ quality_minimum_coverage_profiles: null }] })
      // trade select (legacy row, no profile -> stock)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'trade-1',
            quality_metrics: {
              newsSentiment: 0.7, newsSentimentScore: 1.0,
              gap: 3.0, gapScore: 0.6,
              relativeVolume: 2.0, relativeVolumeScore: 0.6,
              float: 8, floatScore: 0.4,
              price: 10, priceScore: 1.0
            }
          }
        ]
      })
      // bulk update
      .mockResolvedValueOnce({ rows: [] });

    const count = await tradeQualityService.reapplyUserWeights('user-1');

    expect(count).toBe(1);
    const updateCall = db.query.mock.calls[5];
    expect(updateCall[1][0]).toEqual(['trade-1']);
    // (1.0*0.50 + 0.6*0.10 + 0.6*0.10 + 0.4*0.10 + 1.0*0.20) * 5 = 4.3 -> grade B
    expect(updateCall[1][2]).toEqual([4.3]);
    expect(updateCall[1][1]).toEqual(['B']);
  });

  it('grades an option trade with the option profile weights', async () => {
    // Stored option weight profile in JSONB
    const optionProfileRow = {
      quality_weight_profiles: {
        option: { news: 20, gap: 10, relativeVolume: 10, dte: 40, moneyness: 20 }
      }
    };

    db.query
      // stock weights (unused by the option trade) -> defaults
      .mockResolvedValueOnce({ rows: [{ quality_weight_profiles: null }] })
      // stock minimum coverage -> default
      .mockResolvedValueOnce({ rows: [{ quality_minimum_coverage_profiles: null }] })
      // option weights
      .mockResolvedValueOnce({ rows: [optionProfileRow] })
      // option minimum coverage -> default
      .mockResolvedValueOnce({ rows: [{ quality_minimum_coverage_profiles: null }] })
      // trade select - one option trade
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'opt-1',
            quality_metrics: {
              profile: 'option',
              newsSentiment: 0.7, newsSentimentScore: 1.0,
              gap: 2.0, gapScore: 0.6,
              relativeVolume: 1.5, relativeVolumeScore: 0.4,
              dte: 30, dteScore: 1.0,
              moneyness: 0, moneynessScore: 1.0
            }
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });

    const count = await tradeQualityService.reapplyUserWeights('user-1');

    expect(count).toBe(1);
    const updateCall = db.query.mock.calls[5];
    expect(updateCall[1][0]).toEqual(['opt-1']);
    // (1.0*0.20 + 0.6*0.10 + 0.4*0.10 + 1.0*0.40 + 1.0*0.20) * 5 = 4.5 -> grade A
    expect(updateCall[1][2]).toEqual([4.5]);
    expect(updateCall[1][1]).toEqual(['A']);
  });

  it('skips the update when no trades have stored metrics', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // stock weights -> defaults
      .mockResolvedValueOnce({ rows: [] }) // stock minimum coverage -> default
      .mockResolvedValueOnce({ rows: [] }) // option weights -> defaults
      .mockResolvedValueOnce({ rows: [] }) // option minimum coverage -> default
      .mockResolvedValueOnce({ rows: [] }); // no trades

    const count = await tradeQualityService.reapplyUserWeights('user-1');

    expect(count).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(5);
  });
});

describe('metric scoring with missing data', () => {
  it('returns null instead of neutral defaults when data is unavailable', () => {
    expect(tradeQualityService.scoreFloat(null)).toBeNull();
    expect(tradeQualityService.scoreRelativeVolume(null, null)).toBeNull();
    expect(tradeQualityService.scoreGap(null)).toBeNull();
    expect(tradeQualityService.scoreNewsSentiment(null)).toBeNull();
    expect(tradeQualityService.scorePriceRange(null)).toBeNull();
  });

  it('still scores metrics that have data', () => {
    expect(tradeQualityService.scoreFloat(0.5)).toBe(1.0);
    expect(tradeQualityService.scoreGap(12)).toBe(1.0);
    expect(tradeQualityService.scorePriceRange(10)).toBe(1.0);
    expect(tradeQualityService.scoreNewsSentiment({ sentiment: 0 })).toBe(0.5);
  });

  it('returns null for the option metrics when data is unavailable', () => {
    expect(tradeQualityService.scoreDte(null)).toBeNull();
    expect(tradeQualityService.scoreMoneyness(null)).toBeNull();
  });
});

describe('option metrics', () => {
  it('computes whole days to expiration ignoring intraday time', () => {
    const dte = tradeQualityService.computeDaysToExpiration('2026-06-01T15:30:00Z', '2026-06-19');
    expect(dte).toBe(18);
  });

  it('reads same-day expiry as 0 DTE', () => {
    expect(tradeQualityService.computeDaysToExpiration('2026-06-19T13:00:00Z', '2026-06-19')).toBe(0);
  });

  it('returns null for an expiry before entry or missing data', () => {
    expect(tradeQualityService.computeDaysToExpiration('2026-06-20', '2026-06-19')).toBeNull();
    expect(tradeQualityService.computeDaysToExpiration(null, '2026-06-19')).toBeNull();
    expect(tradeQualityService.computeDaysToExpiration('2026-06-01', null)).toBeNull();
  });

  it('scores DTE on a swing-friendly curve', () => {
    expect(tradeQualityService.scoreDte(0)).toBe(0.2);    // 0DTE
    expect(tradeQualityService.scoreDte(30)).toBe(1.0);   // swing sweet spot
    expect(tradeQualityService.scoreDte(365)).toBe(0.3);  // LEAPS
  });

  it('computes signed moneyness for calls and puts', () => {
    // Call: spot 105, strike 100 -> 4.76% ITM
    expect(tradeQualityService.computeMoneyness(105, 100, 'call')).toBeCloseTo(4.7619, 3);
    // Put: spot 95, strike 100 -> ITM (positive)
    expect(tradeQualityService.computeMoneyness(95, 100, 'put')).toBeCloseTo(5.2631, 3);
    // Call OTM is negative
    expect(tradeQualityService.computeMoneyness(95, 100, 'call')).toBeCloseTo(-5.2631, 3);
    // Unknown type -> null
    expect(tradeQualityService.computeMoneyness(100, 100, undefined)).toBeNull();
  });

  it('scores near-the-money strikes highest', () => {
    expect(tradeQualityService.scoreMoneyness(0)).toBe(1.0);    // ATM
    expect(tradeQualityService.scoreMoneyness(15)).toBe(0.5);   // deep ITM
    expect(tradeQualityService.scoreMoneyness(-30)).toBe(0.2);  // far OTM lotto
  });
});

describe('getQualityProfilesMeta', () => {
  it('exposes weight keys and integer-percentage defaults that sum to 100', () => {
    const meta = tradeQualityService.getQualityProfilesMeta();

    expect(meta.stock.weightKeys).toEqual(['news', 'gap', 'relativeVolume', 'float', 'priceRange']);
    expect(meta.option.weightKeys).toEqual(['news', 'gap', 'relativeVolume', 'dte', 'moneyness']);

    for (const profileType of Object.keys(meta)) {
      const total = meta[profileType].weightKeys.reduce(
        (sum, key) => sum + meta[profileType].defaults[key], 0
      );
      expect(total).toBe(100);
      expect(meta[profileType].defaultMinimumCoverage).toBe(40);
    }
  });
});

describe('getProfileType', () => {
  it('maps instrument types to grading profiles', () => {
    expect(tradeQualityService.getProfileType('stock')).toBe('stock');
    expect(tradeQualityService.getProfileType('option')).toBe('option');
    expect(tradeQualityService.getProfileType(undefined)).toBe('stock');
    expect(tradeQualityService.getProfileType('future')).toBeNull();
  });
});

describe('calculateQuality structured failures', () => {
  const finnhub = require('../../src/utils/finnhub');

  beforeEach(() => {
    db.query.mockReset();
    finnhub.isConfigured.mockReturnValue(true);
    finnhub.getCompanyProfile.mockResolvedValue(null);
    finnhub.getStockCandles.mockResolvedValue([]);
    finnhub.getBasicFinancials.mockResolvedValue(null);
    finnhub.getQuote.mockReset();
  });

  it('reports when the market data provider is not configured', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    const result = await tradeQualityService.calculateQuality('AAPL', '2026-01-01', 10, 'long', null);
    expect(result.grade).toBeNull();
    expect(result.reason).toBe('not_configured');
  });

  it('reports that futures are not gradeable', async () => {
    const result = await tradeQualityService.calculateQuality('ES', '2026-01-01', 5000, 'long', null, null, {
      instrumentType: 'future'
    });
    expect(result.grade).toBeNull();
    expect(result.reason).toBe('not_gradeable');
  });

  it('reports insufficient data with the missing metric names', async () => {
    // Old entry date so the recent-quote fallback does not kick in; all market
    // data unavailable -> coverage 0
    const result = await tradeQualityService.calculateQuality('AAPL', '2020-01-02', 10, 'long', null);
    expect(result.grade).toBeNull();
    expect(result.reason).toBe('insufficient_data');
    // Price range is always available from the entry price; the rest are missing
    expect(result.missingMetrics).toEqual(
      expect.arrayContaining(['news sentiment', 'gap', 'relative volume', 'float'])
    );
    expect(result.missingMetrics).not.toContain('price range');
  });

  it('leaves an open option ungraded when only DTE is available at the default threshold', async () => {
    const entryTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const result = await tradeQualityService.calculateQuality(
      'LITE  260101C00100000', entryTime, 2.50, 'long', null, null,
      { instrumentType: 'option', underlyingSymbol: 'LITE', strikePrice: 100, optionType: 'call', expirationDate: expiration }
    );

    expect(result.grade).toBeNull();
    expect(result.reason).toBe('insufficient_data');
    expect(result.coverage).toBeCloseTo(0.25, 5);
    expect(result.metrics.profile).toBe('option');
    expect(result.metrics.dte).toBeGreaterThan(0);
    expect(result.metrics.moneyness).toBeNull();
  });

  it('grades an open option at 35% coverage when the user lowers the option threshold to 30%', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          quality_weight_profiles: {
            option: { news: 35, gap: 0, relativeVolume: 30, dte: 25, moneyness: 10 }
          }
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          quality_minimum_coverage_profiles: { option: 30 }
        }]
      });
    finnhub.getQuote.mockResolvedValue({ c: 105, o: 105, h: 106, l: 104, pc: 100 });

    const entryTime = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const expiration = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

    const result = await tradeQualityService.calculateQuality(
      'LITE  260101C00100000', entryTime, 2.50, 'long', 'user-1', null,
      { instrumentType: 'option', underlyingSymbol: 'LITE', strikePrice: 100, optionType: 'call', expirationDate: expiration }
    );

    expect(result.grade).toBeTruthy();
    expect(result.metrics.coverage).toBeCloseTo(0.35, 5);
    expect(result.metrics.minimumCoverage).toBeCloseTo(0.30, 5);
    expect(result.metrics.moneynessScore).toBeGreaterThan(0);
  });

  it('falls back to a live quote for a recently-entered open option trade', async () => {
    finnhub.getQuote.mockResolvedValue({ c: 105, o: 105, h: 106, l: 104, pc: 100 });

    const entryTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();   // yesterday
    const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // ~30 DTE

    const result = await tradeQualityService.calculateQuality(
      'AAPL  260101C00100000', entryTime, 2.50, 'long', null, null,
      { instrumentType: 'option', underlyingSymbol: 'AAPL', strikePrice: 100, optionType: 'call', expirationDate: expiration }
    );

    // gap (15%) + dte (25%) + moneyness (20%) = 60% coverage -> grades
    expect(finnhub.getQuote).toHaveBeenCalledWith('AAPL');
    expect(result.grade).toBeTruthy();
    expect(result.metrics.profile).toBe('option');
    expect(result.metrics.gap).toBeCloseTo(5, 5);          // (105-100)/100
    expect(result.metrics.moneynessScore).toBeGreaterThan(0);
    expect(result.metrics.spotSource).toBe('live');
  });

  it('uses the live-quote fallback when the candle request times out (throws)', async () => {
    finnhub.getStockCandles.mockRejectedValue(new Error('Finnhub request timed out after 10001ms in scheduler'));
    finnhub.getQuote.mockResolvedValue({ c: 105, o: 105, h: 106, l: 104, pc: 100 });

    const entryTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const result = await tradeQualityService.calculateQuality(
      'ADBE  260101C00500000', entryTime, 2.50, 'long', null, null,
      { instrumentType: 'option', underlyingSymbol: 'ADBE', strikePrice: 100, optionType: 'call', expirationDate: expiration }
    );

    // Candle threw, but the live quote still lets dte + moneyness (+ gap) score
    expect(finnhub.getQuote).toHaveBeenCalledWith('ADBE');
    expect(result.grade).toBeTruthy();
    expect(result.metrics.spotSource).toBe('live');
  });

  it('grades an older open option on dte + moneyness and omits the stale gap', async () => {
    finnhub.getStockCandles.mockResolvedValue([]); // no candle for the entry day
    finnhub.getQuote.mockResolvedValue({ c: 105, o: 105, h: 106, l: 104, pc: 100 });

    const entryTime = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();  // 20 days ago
    const expiration = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

    const result = await tradeQualityService.calculateQuality(
      'ADBE  260101C00500000', entryTime, 2.50, 'long', null, null,
      { instrumentType: 'option', underlyingSymbol: 'ADBE', strikePrice: 100, optionType: 'call', expirationDate: expiration }
    );

    // dte (25%) + moneyness (20%) = 45% coverage -> grades; gap omitted as stale
    expect(result.grade).toBeTruthy();
    expect(result.metrics.gap).toBeNull();
    expect(result.metrics.moneynessScore).toBeGreaterThan(0);
    expect(result.metrics.dteScore).toBeGreaterThan(0);
  });
});
