jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/notificationService', () => ({}));

const AchievementService = require('../../src/services/achievementService');

const DAY = 86400;

const trade = (o = {}) => ({
  pnl: 10,
  is_closed: true,
  entry_has_time: true,
  exit_has_time: true,
  instrument_type: 'stock',
  quantity: 100,
  has_stop_loss: false,
  has_take_profit: false,
  r_value: null,
  has_news: false,
  notes_mention_news: false,
  notes_mention_trend: false,
  ...o
});

const snap = (trades, extra = {}) => ({
  trades,
  closedTrades: trades.filter(t => t.is_closed),
  reviews: [],
  misc: {},
  todayStr: '2026-10-05',
  ...extra
});

describe('time-based criteria skip trades with no recorded time', () => {
  it('Early Bird ignores date-only trades at midnight', () => {
    expect(AchievementService.evaluateEarlyTrade(snap([trade({ entry_has_time: false, entry_hour: 0 })]), 9)).toBe(false);
    expect(AchievementService.evaluateEarlyTrade(snap([trade({ entry_hour: 7 })]), 9)).toMatchObject({ earned: true });
  });

  it('Quick Flip needs both times and a hold longer than zero', () => {
    expect(AchievementService.evaluateQuickFlip(snap([trade({ entry_has_time: false, exit_has_time: false, duration_minutes: 0 })]), 5)).toBe(false);
    expect(AchievementService.evaluateQuickFlip(snap([trade({ duration_minutes: 0 })]), 5)).toBe(false);
    expect(AchievementService.evaluateQuickFlip(snap([trade({ duration_minutes: 3 })]), 5)).toMatchObject({ earned: true });
  });

  it('Early Bird (market open) uses minutes after midnight Eastern', () => {
    expect(AchievementService.evaluateEarlyMarketTrade(snap([trade({ entry_et_minutes: 9 * 60 + 35 })]), 10)).toMatchObject({ earned: true });
    expect(AchievementService.evaluateEarlyMarketTrade(snap([trade({ entry_et_minutes: 9 * 60 + 45 })]), 10)).toBe(false);
    expect(AchievementService.evaluateEarlyMarketTrade(snap([trade({ entry_et_minutes: 9 * 60 + 25 })]), 10)).toBe(false);
  });
});

describe('day and week P&L criteria look at any period, by exit date', () => {
  it('Green Day finds any positive day', () => {
    const trades = [
      trade({ exit_date: '2026-09-01', pnl: -50 }),
      trade({ exit_date: '2026-09-02', pnl: 30 }),
      trade({ exit_date: '2026-09-02', pnl: -10 })
    ];
    expect(AchievementService.evaluateGreenDay(snap(trades))).toMatchObject({ earned: true, metadata: { trade_date: '2026-09-02', daily_pnl: 20 } });
    expect(AchievementService.evaluateGreenDay(snap([trade({ exit_date: '2026-09-01', pnl: -5 })]))).toBe(false);
  });

  it('Green Week needs 5 closed trades and a positive total in one Monday-start week', () => {
    // Mon 2026-09-14 .. Fri 2026-09-18
    const week = ['14', '15', '16', '17', '18'].map(d => trade({ exit_date: `2026-09-${d}`, pnl: 10 }));
    expect(AchievementService.evaluateWeeklyPnL(snap(week), true)).toMatchObject({ earned: true, metadata: { week_start: '2026-09-14', trade_count: 5 } });
    // Same five trades split across two weeks (Fri + Mon) don't count
    const split = ['17', '18', '21', '22', '23'].map(d => trade({ exit_date: `2026-09-${d}`, pnl: 10 }));
    expect(AchievementService.evaluateWeeklyPnL(snap(split), true)).toBe(false);
  });

  it('Streak Master counts the longest run of profitable trading days', () => {
    const days = [
      ['01', 10], ['02', 10], ['03', -5], ['08', 10], ['09', 10], ['10', 10], ['14', 10], ['15', 10]
    ].map(([d, pnl]) => trade({ exit_date: `2026-09-${d}`, pnl }));
    expect(AchievementService.evaluateProfitableStreak(snap(days), 5)).toMatchObject({ earned: true, metadata: { streak_length: 5 } });
    expect(AchievementService.evaluateProfitableStreak(snap(days), 6)).toBe(false);
  });

  it('Streak Master no longer returns 0 when there is no losing day', () => {
    const days = ['01', '02', '03', '04', '05'].map(d => trade({ exit_date: `2026-09-${d}`, pnl: 5 }));
    expect(AchievementService.evaluateProfitableStreak(snap(days), 5)).toMatchObject({ earned: true });
  });
});

describe('risk/reward criteria use the stored R-multiple', () => {
  it('Risk Taker needs a 3R trade, not a 3% move', () => {
    expect(AchievementService.evaluateRiskRewardRatio(snap([trade({ r_value: 2.9 })]), 3)).toBe(false);
    expect(AchievementService.evaluateRiskRewardRatio(snap([trade({ r_value: 3.2 })]), 3)).toMatchObject({ earned: true });
    expect(AchievementService.evaluateRiskRewardRatio(snap([trade({ r_value: null, price_move_fraction: 0.5 })]), 3)).toBe(false);
  });

  it('Risk Reward Master counts 2R trades across history', () => {
    const trades = Array.from({ length: 20 }, () => trade({ r_value: 2.1 }));
    trades.splice(5, 0, trade({ r_value: -1 }));
    expect(AchievementService.evaluateRiskReward(snap(trades), 2, 20)).toMatchObject({ earned: true });
    expect(AchievementService.evaluateRiskReward(snap(trades.slice(1)), 2, 20)).toBe(false);
  });
});

describe('other corrected criteria', () => {
  it('stop loss / take profit badges check the trade fields, not note text', () => {
    expect(AchievementService.evaluateFirstStopLoss(snap([trade({ has_stop_loss: true, pnl: 50 })]))).toMatchObject({ earned: true });
    expect(AchievementService.evaluateFirstStopLoss(snap([trade({ notes_mention_stop: true, pnl: -5 })]))).toBe(false);
    expect(AchievementService.evaluateFirstTakeProfit(snap([trade({ has_take_profit: true, is_closed: false, pnl: null })]))).toMatchObject({ earned: true });
  });

  it('Volume King counts stock shares only', () => {
    const trades = [
      trade({ entry_date: '2026-09-01', instrument_type: 'crypto', quantity: 5000000 }),
      trade({ entry_date: '2026-09-01', instrument_type: 'option', quantity: 2000 }),
      trade({ entry_date: '2026-09-01', instrument_type: 'stock', quantity: 600 })
    ];
    expect(AchievementService.evaluateDailyVolume(snap(trades), 1000)).toBe(false);
    trades.push(trade({ entry_date: '2026-09-01', instrument_type: 'stock', quantity: -400 }));
    expect(AchievementService.evaluateDailyVolume(snap(trades), 1000)).toMatchObject({ earned: true, metadata: { daily_volume: 1000 } });
  });

  it('Diversified Trader counts options by underlying', () => {
    const trades = [
      trade({ symbol_key: 'AAPL' }), trade({ symbol_key: 'AAPL' }), trade({ symbol_key: 'MSFT' })
    ];
    expect(AchievementService.evaluateDifferentSymbols(snap(trades), 3)).toBe(false);
  });

  it('Diversifier uses real sectors on any single day', () => {
    const sectors = ['Tech', 'Energy', 'Health Care', 'Financials', 'Utilities'];
    const trades = sectors.map(sector => trade({ entry_date: '2026-09-01', sector }));
    expect(AchievementService.evaluateDailySectorDiversity(snap(trades), 5)).toMatchObject({ earned: true, metadata: { trade_date: '2026-09-01' } });
    trades[4] = trade({ entry_date: '2026-09-02', sector: 'Utilities' });
    expect(AchievementService.evaluateDailySectorDiversity(snap(trades), 5)).toBe(false);
  });

  it('News Trader accepts news enrichment or catalyst notes on a winner', () => {
    expect(AchievementService.evaluateNewsBasedProfit(snap([trade({ has_news: true })]))).toMatchObject({ earned: true });
    expect(AchievementService.evaluateNewsBasedProfit(snap([trade({ has_news: true, pnl: -5 })]))).toBe(false);
  });

  it('Cooldown Respected measures the gap to the next trade of any kind', () => {
    const now = 1_800_000_000;
    const trades = [];
    for (let i = 0; i < 10; i++) {
      const exit = now - (i + 1) * DAY;
      trades.push(trade({ pnl: -10, exit_epoch: exit, entry_epoch: exit - 600, exit_age_seconds: (i + 1) * DAY }));
      // A winning trade 5 minutes after each loss breaks the cooldown
      trades.push(trade({ pnl: 10, entry_epoch: exit + (i < 3 ? 300 : 3600), exit_epoch: exit + 4000, exit_age_seconds: (i + 1) * DAY - 4000 }));
    }
    // 7 of 10 losses cooled = 70%
    expect(AchievementService.evaluateCoolingPeriodUsage(snap(trades), 80)).toBe(false);
    expect(AchievementService.evaluateCoolingPeriodUsage(snap(trades), 70)).toMatchObject({ earned: true, metadata: { losses_with_cooling: 7, total_losses: 10 } });
  });

  it('Review Habit finds 8 reviews in any 14 day window', () => {
    const reviews = [40, 41, 42, 43, 44, 45, 46, 50].map(d => ({ reviewed_age_seconds: d * DAY }));
    expect(AchievementService.evaluateReviewHabit(snap([], { reviews }), 8, 14)).toMatchObject({ earned: true });
    const spread = [1, 20, 40, 60, 80, 100, 120, 140].map(d => ({ reviewed_age_seconds: d * DAY }));
    expect(AchievementService.evaluateReviewHabit(snap([], { reviews: spread }), 8, 14)).toBe(false);
  });
});

describe('redefined discipline, risk, and portfolio criteria', () => {
  const closed = (i, o = {}) => trade({ exit_epoch: 1_800_000_000 + i * 3600, has_stop_loss: true, r_value: 0.5, ...o });

  it('within risk means a stop and no loss past 1R (10% fee allowance)', () => {
    expect(AchievementService.isWithinRisk(trade({ has_stop_loss: false, r_value: 2 }))).toBe(false);
    expect(AchievementService.isWithinRisk(trade({ has_stop_loss: true, r_value: -1.05 }))).toBe(true);
    expect(AchievementService.isWithinRisk(trade({ has_stop_loss: true, r_value: -1.5 }))).toBe(false);
    expect(AchievementService.isWithinRisk(trade({ has_stop_loss: true, r_value: null, pnl: 20 }))).toBe(true);
    expect(AchievementService.isWithinRisk(trade({ has_stop_loss: true, r_value: null, pnl: -20 }))).toBe(false);
  });

  it('Discipline Master needs 90% within plan over a 30 day window of 20+ trades', () => {
    const trades = Array.from({ length: 20 }, (_, i) => closed(i));
    trades[3] = closed(3, { r_value: -2 });
    expect(AchievementService.evaluateDisciplineScore(snap(trades), 90, 30)).toMatchObject({ earned: true, metadata: { discipline_score: 95 } });
    trades[4] = closed(4, { has_stop_loss: false });
    trades[5] = closed(5, { r_value: -3 });
    expect(AchievementService.evaluateDisciplineScore(snap(trades), 90, 30)).toBe(false);
    expect(AchievementService.evaluateDisciplineScore(snap(trades.slice(0, 19).map((t, i) => closed(i))), 90, 30)).toBe(false);
  });

  it('Risk Manager needs N within-plan trades in a row', () => {
    const trades = Array.from({ length: 105 }, (_, i) => closed(i));
    trades[50] = closed(50, { r_value: -1.8 });
    expect(AchievementService.evaluateRiskAdherence(snap(trades), 100)).toBe(false);
    trades[50] = closed(50);
    expect(AchievementService.evaluateRiskAdherence(snap(trades), 100)).toMatchObject({ earned: true, metadata: { trades_in_a_row: 105 } });
  });

  it('Portfolio Booster measures week P&L against real account equity', () => {
    const accounts = [{ id: 'a1', account_identifier: 'U123', initial_balance: 20000, initial_balance_date: '2026-09-01' }];
    const transactions = [{ account_id: 'a1', transaction_type: 'deposit', amount: 5000, transaction_date: '2026-09-03' }];
    const trades = [
      trade({ account_identifier: 'U123', exit_date: '2026-09-02', pnl: 1000 }),
      // Week of Mon 2026-09-14: equity at start = 20000 + 5000 + 1000 = 26000
      trade({ account_identifier: 'U123', exit_date: '2026-09-15', pnl: 1300 }),
      // Trades in other accounts don't count
      trade({ account_identifier: 'OTHER', exit_date: '2026-09-16', pnl: 50000 })
    ];
    expect(AchievementService.evaluateWeeklyPortfolioGain(snap(trades), 5, accounts, transactions))
      .toMatchObject({ earned: true, metadata: { week_start: '2026-09-14', weekly_pnl: 1300, weekly_gain_percentage: 5 } });
    trades[1].pnl = 1200;
    expect(AchievementService.evaluateWeeklyPortfolioGain(snap(trades), 5, accounts, transactions)).toBe(false);
  });

  it('Portfolio Booster needs an account with a starting balance', () => {
    expect(AchievementService.evaluateWeeklyPortfolioGain(snap([trade({ exit_date: '2026-09-15', pnl: 99999 })]), 5, [], [])).toBe(false);
  });
});
