const { buildExcursionMetrics } = require('../../src/utils/excursionMetrics');

describe('excursionMetrics', () => {
  test('calculates issue 310 ES missed-after-exit dollars, points, R, and efficiency', () => {
    const trade = {
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 7483.75,
      exit_price: 7496.75,
      stop_loss: 7477.75,
      quantity: 1,
      point_value: 50,
      tick_size: 0.25,
      pnl: 646.50,
      commission: 3.50,
      fees: 0,
      mae: 50,
      mfe: 650,
      post_exit_mfe: 2012.50,
      executions: []
    };

    const metrics = buildExcursionMetrics(trade, 300);

    expect(metrics.captured_move).toBe(650);
    expect(metrics.best_mfe).toBe(2012.50);
    expect(metrics.missed_after_exit).toBe(1362.50);
    expect(metrics.missed_after_exit_points).toBe(27.25);
    expect(metrics.missed_after_exit_r).toBeCloseTo(4.54, 2);
    expect(metrics.exit_efficiency).toBeCloseTo(32.30, 2);
    expect(metrics.is_winner).toBe(true);
    expect(metrics.outcome).toBe('winner');
  });

  test('normalizes legacy futures excursion rows stored as points in dollar columns', () => {
    const trade = {
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 7578.25,
      exit_price: 7591.25,
      stop_loss: 7572.25,
      quantity: 1,
      point_value: 50,
      tick_size: 0.25,
      pnl: 646.50,
      commission: 3.50,
      fees: 0,
      mae: 4.25,
      mfe: 13,
      post_exit_mae: 15.50,
      post_exit_mfe: 19,
      executions: []
    };

    const metrics = buildExcursionMetrics(trade, 300);

    expect(metrics.legacy_point_units).toBe(true);
    expect(metrics.mae).toBe(212.50);
    expect(metrics.mfe).toBe(650);
    expect(metrics.post_exit_mae).toBe(775);
    expect(metrics.post_exit_mfe).toBe(950);
    expect(metrics.mfe_points).toBe(13);
    expect(metrics.post_exit_mfe_points).toBe(19);
    expect(metrics.missed_after_exit).toBe(300);
    expect(metrics.missed_after_exit_points).toBe(6);
    expect(metrics.exit_efficiency).toBeCloseTo(68.42, 2);
  });

  test('scales futures points by quantity and point value', () => {
    const trade = {
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 100,
      exit_price: 102,
      quantity: 3,
      point_value: 50,
      tick_size: 0.25,
      pnl: 300,
      commission: 0,
      fees: 0,
      mfe: 300,
      post_exit_mfe: 750,
      executions: []
    };

    const metrics = buildExcursionMetrics(trade, 300);

    expect(metrics.captured_move).toBe(300);
    expect(metrics.post_exit_mfe_points).toBe(5);
    expect(metrics.missed_after_exit).toBe(450);
    expect(metrics.missed_after_exit_points).toBe(3);
  });

  test('classifies scratch trades using configured breakeven tick tolerance', () => {
    const trade = {
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 7483.75,
      exit_price: 7483.75,
      quantity: 1,
      point_value: 50,
      tick_size: 0.25,
      pnl: -3.50,
      commission: 3.50,
      fees: 0,
      mfe: 500,
      executions: []
    };

    const metrics = buildExcursionMetrics(trade, 300, { default: 0, byUnderlying: { ES: 1 } });

    expect(metrics.gross_pnl).toBe(0);
    expect(metrics.outcome).toBe('scratch');
    expect(metrics.is_winner).toBe(false);
  });
});
