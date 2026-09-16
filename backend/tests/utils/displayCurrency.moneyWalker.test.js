const { scaleMoneyInPayload, isTradeMoneyKey } = require('../../src/utils/displayCurrency');

describe('trades-domain money walker', () => {
  test('scales numeric and numeric-string money fields, keeps string shape', () => {
    const payload = {
      trades: [{
        entry_price: '13.850000',
        pnl: 100,
        quantity: '2.0000',
        contract_size: 100,
        r_multiple: 2.5,
        hold_time_minutes: 90,
        symbol: 'CBT'
      }],
      count: 1,
      display_currency: 'USD'
    };
    scaleMoneyInPayload(payload, 0.5);

    expect(payload.trades[0].entry_price).toBe('6.925000');
    expect(payload.trades[0].pnl).toBe(50);
    expect(payload.trades[0].quantity).toBe('2.0000');
    expect(payload.trades[0].contract_size).toBe(100);
    expect(payload.trades[0].r_multiple).toBe(2.5);
    expect(payload.trades[0].hold_time_minutes).toBe(90);
    expect(payload.count).toBe(1);
  });

  test('pnl parent context scales amounts but preserves counts', () => {
    const payload = {
      monthly: [{
        trades: { total: 12, wins: 7, losses: 5 },
        pnl: { total: 1000, avgWin: 200, avgLoss: -100 },
        metrics: { winRate: 58.3, avgRValue: 0.6 }
      }]
    };
    scaleMoneyInPayload(payload, 0.8);

    expect(payload.monthly[0].trades.total).toBe(12);
    expect(payload.monthly[0].pnl.total).toBeCloseTo(800);
    expect(payload.monthly[0].pnl.avgWin).toBeCloseTo(160);
    expect(payload.monthly[0].metrics.winRate).toBe(58.3);
    expect(payload.monthly[0].metrics.avgRValue).toBe(0.6);
  });

  test('analytics summary naming conventions all scale', () => {
    const summary = {
      totalPnL: 100, totalNetPnL: 90, totalGrossPnL: 110, avgPnL: 1,
      avgWin: 2, avgLoss: -3, bestTrade: 4, worstTrade: -5, totalCosts: 6,
      maxDrawdown: -7, maxDailyGain: 8, maxDailyLoss: -9, winRate: 55,
      profitFactor: 1.5, sharpeRatio: 0.2, avgRValue: 0.5, totalRValue: 50,
      tradingDays: 60, symbolsTraded: 20
    };
    scaleMoneyInPayload({ summary }, 0.5);
    expect(summary.totalPnL).toBe(50);
    expect(summary.totalNetPnL).toBe(45);
    expect(summary.totalGrossPnL).toBe(55);
    expect(summary.avgPnL).toBe(0.5);
    expect(summary.avgWin).toBe(1);
    expect(summary.avgLoss).toBe(-1.5);
    expect(summary.bestTrade).toBe(2);
    expect(summary.worstTrade).toBe(-2.5);
    expect(summary.totalCosts).toBe(3);
    expect(summary.maxDrawdown).toBe(-3.5);
    expect(summary.maxDailyGain).toBe(4);
    expect(summary.maxDailyLoss).toBe(-4.5);
    expect(summary.winRate).toBe(55);
    expect(summary.profitFactor).toBe(1.5);
    expect(summary.avgRValue).toBe(0.5);
    expect(summary.totalRValue).toBe(50);
    expect(summary.tradingDays).toBe(60);
    expect(summary.symbolsTraded).toBe(20);
  });

  test('daily and symbol breakdowns scale money, not volumes or counts', () => {
    const payload = {
      dailyPnL: [{ trade_date: '2025-01-02', daily_pnl: 100, cumulative_pnl: 100, r_value: 0.5, trade_count: 4 }],
      performanceBySymbol: [{ symbol: 'AMD', trades: 3, total_pnl: 90, avg_pnl: 30, total_volume: 400, wins: 2 }]
    };
    scaleMoneyInPayload(payload, 0.5);
    expect(payload.dailyPnL[0].daily_pnl).toBe(50);
    expect(payload.dailyPnL[0].cumulative_pnl).toBe(50);
    expect(payload.dailyPnL[0].r_value).toBe(0.5);
    expect(payload.dailyPnL[0].trade_count).toBe(4);
    expect(payload.performanceBySymbol[0].total_pnl).toBe(45);
    expect(payload.performanceBySymbol[0].total_volume).toBe(400);
    expect(payload.performanceBySymbol[0].wins).toBe(2);
  });

  test('chart payloads scale candles and markers together', () => {
    const chart = {
      candles: [{ time: 1700000000, open: 10, high: 11, low: 9.5, close: 10.5, volume: 1200 }],
      trade: { entryPrice: 10, exitPrice: 12, pnl: 200 }
    };
    scaleMoneyInPayload(chart, 0.5);
    expect(chart.candles[0].open).toBe(5);
    expect(chart.candles[0].close).toBe(5.25);
    expect(chart.candles[0].volume).toBe(1200);
    expect(chart.candles[0].time).toBe(1700000000);
    expect(chart.trade.entryPrice).toBe(5);
    expect(chart.trade.pnl).toBe(100);
  });

  test('isTradeMoneyKey spot checks', () => {
    expect(isTradeMoneyKey('net_sales_proceeds', '')).toBe(true);
    expect(isTradeMoneyKey('avg_post_exit_mae', '')).toBe(true);
    expect(isTradeMoneyKey('mae_r', '')).toBe(false);
    expect(isTradeMoneyKey('pnl_percent', '')).toBe(false);
    expect(isTradeMoneyKey('total_r_value', '')).toBe(false);
    expect(isTradeMoneyKey('stop_loss', '')).toBe(true);
    expect(isTradeMoneyKey('take_profit', '')).toBe(true);
    expect(isTradeMoneyKey('max_consecutive_losses', '')).toBe(false);
    expect(isTradeMoneyKey('today_pnl', '')).toBe(true);
  });
});

describe('money-shaped bucket labels', () => {
  const { scaleMoneyLabel, currencySymbolFor } = require('../../src/utils/displayCurrency');

  test('converts every bound in a label, including the one without a symbol', () => {
    expect(scaleMoneyLabel('$2-4.99', 0.5, '€')).toBe('€1-2.5');
    expect(scaleMoneyLabel('< $2', 0.5, '€')).toBe('< €1');
    expect(scaleMoneyLabel('$200+', 0.5, '€')).toBe('€100+');
  });

  test('re-picks the magnitude so a K bound does not round away', () => {
    // $1K at 0.5 is 500, not "€1K"
    expect(scaleMoneyLabel('$1K-$1.5K', 0.5, '€')).toBe('€500-€750');
  });

  test('leaves count and duration buckets alone', () => {
    expect(scaleMoneyLabel('10-19', 0.5, '€')).toBe('10-19');
    expect(scaleMoneyLabel('1-4 weeks', 0.5, '€')).toBe('1-4 weeks');
  });

  test('is a no-op at rate 1 so a USD reader sees the original labels', () => {
    expect(scaleMoneyLabel('$2-4.99', 1, '$')).toBe('$2-4.99');
  });

  test('walks labels only under the keys an endpoint opts in', () => {
    const payload = {
      labels: { price: ['< $2', '$200+'], volume: ['10-19'] },
      performanceByPrice: [100, -50]
    };
    scaleMoneyInPayload(payload, 0.5, {
      moneyArrayKeys: new Set(['performanceByPrice']),
      moneyLabelKeys: new Set(['price']),
      labelSymbol: '€'
    });

    expect(payload.labels.price).toEqual(['< €1', '€100+']);
    expect(payload.labels.volume).toEqual(['10-19']);
    expect(payload.performanceByPrice).toEqual([50, -25]);
  });

  test('falls back to the code when a currency has no symbol', () => {
    expect(currencySymbolFor('USD')).toBe('$');
    expect(currencySymbolFor('ZZZ')).toBe('ZZZ');
  });
});
