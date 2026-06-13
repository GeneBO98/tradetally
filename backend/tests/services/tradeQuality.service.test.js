jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/finnhub', () => ({
  isConfigured: jest.fn(() => true),
  displayName: 'Finnhub',
  getCompanyProfile: jest.fn(),
  getStockCandles: jest.fn(),
  getBasicFinancials: jest.fn(),
  getCompanyNews: jest.fn()
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
      // getUserQualityWeights('user-1', 'option') -> option defaults
      .mockResolvedValueOnce({ rows: [{ quality_weight_profiles: null }] })
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
    const updateCall = db.query.mock.calls[3];
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
      // option weights
      .mockResolvedValueOnce({ rows: [optionProfileRow] })
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
    const updateCall = db.query.mock.calls[3];
    expect(updateCall[1][0]).toEqual(['opt-1']);
    // (1.0*0.20 + 0.6*0.10 + 0.4*0.10 + 1.0*0.40 + 1.0*0.20) * 5 = 4.5 -> grade A
    expect(updateCall[1][2]).toEqual([4.5]);
    expect(updateCall[1][1]).toEqual(['A']);
  });

  it('skips the update when no trades have stored metrics', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // stock weights -> defaults
      .mockResolvedValueOnce({ rows: [] }) // option weights -> defaults
      .mockResolvedValueOnce({ rows: [] }); // no trades

    const count = await tradeQualityService.reapplyUserWeights('user-1');

    expect(count).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(3);
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
