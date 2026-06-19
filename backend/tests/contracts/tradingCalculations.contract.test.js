jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('UTC'),
  getUserLocalDate: jest.fn()
}));

jest.mock('../../src/services/achievementService', () => ({}));

jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn().mockResolvedValue({
    statistics_calculation: 'average',
    breakeven_tolerance_ticks: 0,
    breakeven_tolerance_ticks_by_underlying: {},
    analytics_position_grouping: false
  })
}));

const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');
const db = require('../../src/config/database');
const { computeTradePnl } = require('../../src/services/pnlEngine');
const { applyBrokerFeeSettingsToTrades } = require('../../src/services/brokerFeeApplicationService');
const TradeQueries = require('../../src/services/tradeQueries');
const Trade = require('../../src/models/Trade');
const TargetHitAnalysisService = require('../../src/services/targetHitAnalysisService');

function expectClose(actual, expected, precision = 8) {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  if (typeof expected === 'boolean') {
    expect(actual).toBe(expected);
    return;
  }
  expect(Number(actual)).toBeCloseTo(expected, precision);
}

function emptyDbRows() {
  return { rows: [] };
}

describe('trading calculation contract fixtures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(contracts.pnl_engine_cases)('$id', ({ input, expected }) => {
    const result = computeTradePnl(input);

    for (const [field, expectedValue] of Object.entries(expected.aggregate)) {
      expectClose(result.aggregate[field], expectedValue);
    }

    expected.realized_pnl.forEach((expectedValue, index) => {
      expectClose(result.annotatedExecutions[index].realized_pnl, expectedValue);
    });
  });

  test.each(contracts.broker_fee_application.cases)('$id', ({ trade, expected }) => {
    const [result] = applyBrokerFeeSettingsToTrades({
      trades: [{ ...trade }],
      broker: contracts.broker_fee_application.broker,
      feeRows: contracts.broker_fee_application.fee_rows
    });

    expectClose(result.commission, expected.commission);
    expectClose(result.fees, expected.fees);
    expectClose(result.pnl, expected.pnl);
  });

  test('analytics summary maps net, gross, cost, and breakeven contract totals', async () => {
    const expected = contracts.analytics_summary.expected;
    db.query
      .mockResolvedValueOnce({ rows: [{ execution_count: expected.total_trades }] })
      .mockResolvedValueOnce({
        rows: [{
          total_trades: expected.total_trades,
          winning_trades: expected.winning_trades,
          losing_trades: expected.losing_trades,
          breakeven_trades: expected.breakeven_trades,
          total_pnl: expected.total_pnl,
          total_costs: expected.total_costs,
          avg_pnl: expected.total_pnl / expected.total_trades,
          avg_win: expected.total_pnl / expected.winning_trades,
          avg_loss: 0,
          best_trade: 197.75,
          worst_trade: -2,
          symbols_traded: 3,
          trading_days: 1,
          avg_return_pct: 0,
          avg_r_value: 0,
          total_r_value: 0,
          pnl_stddev: 0,
          max_daily_gain: expected.total_pnl,
          max_daily_loss: expected.total_pnl,
          max_drawdown: 0,
          profit_factor: 999.99,
          win_rate: expected.win_rate,
          win_rate_excluding_breakeven: expected.win_rate_excluding_breakeven,
          sharpe_ratio: 0
        }]
      })
      .mockResolvedValueOnce(emptyDbRows())
      .mockResolvedValueOnce(emptyDbRows())
      .mockResolvedValueOnce(emptyDbRows())
      .mockResolvedValueOnce(emptyDbRows())
      .mockResolvedValueOnce(emptyDbRows())
      .mockResolvedValueOnce(emptyDbRows());

    const analytics = await TradeQueries.getAnalytics('user-1', {});
    const analyticsSql = db.query.mock.calls[1][0];

    expect(analyticsSql).toContain('SUM(trade_costs) as total_costs');
    expect(expected.total_costs).toBeCloseTo(expected.total_commissions + expected.total_fees, 8);
    expect(analytics.summary.totalTrades).toBe(expected.total_trades);
    expect(analytics.summary.winningTrades).toBe(expected.winning_trades);
    expect(analytics.summary.losingTrades).toBe(expected.losing_trades);
    expect(analytics.summary.breakevenTrades).toBe(expected.breakeven_trades);
    expectClose(analytics.summary.totalNetPnL, expected.total_pnl);
    expectClose(analytics.summary.totalCosts, expected.total_costs);
    expectClose(analytics.summary.totalGrossPnL, expected.total_gross_pnl);
    expectClose(analytics.summary.winRate, expected.win_rate);
    expectClose(analytics.summary.winRateExcludingBreakeven, expected.win_rate_excluding_breakeven);
  });

  test('documented R-value weighted target fixture stays stable', () => {
    const fixture = contracts.r_value.documented_weighted_target_example;
    const weightedTargetR = TargetHitAnalysisService.calculateWeightedTargetR(
      fixture.trade,
      fixture.risk
    );

    expectClose(weightedTargetR, fixture.expected_weighted_target_r);
  });

  test('legacy stock-typed futures still use futures risk multipliers', () => {
    const fixture = contracts.r_value.legacy_stock_typed_future_example;
    const trade = fixture.trade;

    const riskAmount = Trade.calculateRiskAmount(
      trade.entry_price,
      trade.stop_loss,
      trade.quantity,
      trade.side,
      trade.instrument_type,
      null,
      null,
      trade.symbol
    );
    const rValue = Trade.calculateRValue(
      trade.entry_price,
      trade.stop_loss,
      trade.exit_price,
      trade.side,
      {
        quantity: trade.quantity,
        instrumentType: trade.instrument_type,
        symbol: trade.symbol
      }
    );

    expectClose(riskAmount, fixture.expected_risk_amount);
    expectClose(rValue, fixture.expected_r_value);
  });
});
