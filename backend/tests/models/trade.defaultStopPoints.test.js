jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
const Trade = require('../../src/models/Trade');
const fixtures = require('../../../tests/fixtures/trading-calculation-contracts.json');

const settings = {
  default_stop_loss_type: 'points',
  default_stop_loss_points: 2,
  default_stop_loss_points_by_underlying: { ES: 1.5, NQ: 10 }
};

describe('default stop distances in points', () => {
  test.each(fixtures.point_stop_cases)('$symbol $side resolves its instrument default', trade => {
    expect(Trade.calculateDefaultStopLossFromSettings(trade, settings)).toBe(trade.expected_stop);
  });

  test('supports instrument-only defaults and leaves unmatched instruments unset', () => {
    const overrides_only = { ...settings, default_stop_loss_points: null };
    expect(Trade.calculateDefaultStopLossFromSettings(fixtures.point_stop_cases[0], overrides_only)).toBe(5998.5);
    expect(Trade.calculateDefaultStopLossFromSettings(fixtures.point_stop_cases[2], overrides_only)).toBeNull();
  });

  test.each([0, -1, NaN, Infinity])('rejects invalid point distances (%s)', points => {
    expect(Trade.calculateDefaultStopLossFromSettings(fixtures.point_stop_cases[0], {
      ...settings, default_stop_loss_points_by_underlying: { ES: points }
    })).toBeNull();
  });

  test('rejects a point distance that would put the stop at or below zero', () => {
    expect(Trade.calculateDefaultStopLossFromSettings({ entry_price: 1, side: 'long' }, settings)).toBeNull();
  });
});
