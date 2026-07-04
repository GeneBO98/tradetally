jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  classifyTradeStrategy: jest.fn(() => 'swing'),
  classifyTradeStrategyWithAnalysis: jest.fn(() => 'swing')
}));

const TierService = require('../../src/services/tierService');
const Trade = require('../../src/models/Trade');
const TradingPersonalityService = require('../../src/services/tradingPersonalityService');

describe('TradingPersonalityService option strategy classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.getUserTier.mockResolvedValue('free');
  });

  test('scores grouped option spreads under option_strategy instead of swing hold-time fallback', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'spread-1',
          symbol: 'SNOW',
          instrument_type: 'option',
          position_grouped: true,
          group_detected_strategy: 'bull_put_spread',
          hold_time_minutes: 7200,
          pnl: 70
        }
      ]
    }, {});

    expect(scores).toEqual({
      scalper: 0,
      momentum: 0,
      mean_reversion: 0,
      swing: 0,
      option_strategy: 100
    });
  });

  test('uses stored manual strategy before fallback classification', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'manual-1',
          symbol: 'AAPL',
          instrument_type: 'stock',
          strategy: 'mean_reversion',
          manual_override: true,
          hold_time_minutes: 7200,
          pnl: 10
        }
      ]
    }, {});

    expect(scores.mean_reversion).toBe(100);
    expect(scores.swing).toBe(0);
  });

  test('scores single-leg ungrouped options under option_strategy without time fallback', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'option-1',
          symbol: 'AAPL260116C00200000',
          instrument_type: 'option',
          option_type: 'call',
          hold_time_minutes: 7200,
          pnl: 50
        }
      ]
    }, {});

    expect(scores.option_strategy).toBe(100);
    expect(scores.swing).toBe(0);
    expect(Trade.classifyTradeStrategy).not.toHaveBeenCalled();
  });

  test('respects manual time-based labels on option trades', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'manual-option-1',
          symbol: 'AAPL260116C00200000',
          instrument_type: 'option',
          strategy: 'swing',
          manual_override: true,
          hold_time_minutes: 7200,
          pnl: 50
        }
      ]
    }, {});

    expect(scores.swing).toBe(100);
    expect(scores.option_strategy).toBe(0);
  });

  test('ignores non-manual stored swing labels on option trades', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'auto-option-1',
          symbol: 'AAPL260116C00200000',
          instrument_type: 'option',
          strategy: 'swing',
          manual_override: false,
          hold_time_minutes: 7200,
          pnl: 50
        }
      ]
    }, {});

    expect(scores.option_strategy).toBe(100);
    expect(scores.swing).toBe(0);
  });

  test('uses has_option_leg to classify mixed grouped positions as option_strategy', async () => {
    const scores = await TradingPersonalityService.calculatePersonalityScores('user-1', {
      trades: [
        {
          id: 'mixed-group-1',
          symbol: 'AAPL',
          instrument_type: 'stock',
          has_option_leg: true,
          hold_time_minutes: 7200,
          pnl: 50
        }
      ]
    }, {});

    expect(scores.option_strategy).toBe(100);
    expect(scores.swing).toBe(0);
  });
});
