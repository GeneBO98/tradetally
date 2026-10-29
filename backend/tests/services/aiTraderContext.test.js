jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const AITraderContext = require('../../src/services/aiTraderContext');
const AICurrency = require('../../src/services/aiCurrency');

const usd = () => new AICurrency('USD', { USD: 1 });

const fullDossier = () => ({
  generated_at: '2026-10-29T12:00:00.000Z',
  profile: {
    trading_strategies: ['Breakouts', 'Swing Trading'],
    trading_styles: ['Day Trading'],
    risk_tolerance: 'moderate',
    experience_level: 'advanced',
    average_position_size: 'medium',
    primary_markets: ['Stocks'],
    trading_goals: ['Consistency'],
    preferred_sectors: ['Technology'],
    about_trading: 'I trade opening range breakouts and am working on not adding to losers.',
    ai_memory_notes: ['I overtrade after green days'],
    default_stop: { type: 'percent', percent: 2, dollars: null, points: null }
  },
  observed: {
    window_days: 180, trades: 64, trading_days: 19, trades_per_week: 3.1,
    avg_hold_minutes: 4000, median_hold_minutes: 2, median_notional_usd: 810,
    stop_usage_pct: 100, avg_r: 0.89, r_trades: 64, long_pct: 52,
    dominant_instrument: 'stock', active_hours: [{ hour: 8, n: 15 }, { hour: 13, n: 7 }],
    grade_counts: { A: 2, B: 21, C: 10, D: 29, F: 1 }, timezone: 'America/New_York'
  },
  behavior: {
    window_days: 90,
    patterns: [{ type: 'same_symbol_revenge', occurrences: 3, high_severity: 1, last_detected: '2026-10-20' }],
    revenge: { events: 3, avg_trigger_loss_usd: -480, total_additional_loss_usd: -620, avg_size_increase_pct: 55, avg_window_minutes: 40, last_event: '2026-10-20' },
    overconfidence: null,
    active_streak: { type: 'loss', length: 4, total_pnl_usd: -900, last_trade_date: '2026-10-28' }
  },
  personality: {
    primary: 'momentum', confidence: 72, avg_hold_minutes: 35, trades_per_day: 2.5,
    observed_risk_tolerance: 'aggressive', sizing_consistency: 61, stop_discipline: 80,
    strategy_adherence: 70, trades_analyzed: 120, as_of: '2026-10-01',
    drift: { date: '2026-10-25', from: 'momentum', to: 'scalper', severity: 'high', hold_time_pct: -40, frequency_pct: 65, performance_impact: -2.5 }
  },
  edge: {
    period_start: '2026-10-19', period_end: '2026-10-25',
    week: { total_trades: 12, total_pnl: 340, win_rate: 58.3, profit_factor: 1.6 },
    edge: { name: 'AMD', type: 'symbol', trades: 4, total_pnl: 500, win_rate: 75 },
    leak: { description: 'Afternoon trades lost $300 on 5 trades.' },
    action_item: 'Stop trading after 1pm this week.'
  },
  playbooks: {
    playbooks: [{ name: 'ORB', description: 'Opening range breakout', market: 'stocks', timeframe: '5m', side: 'long', required_strategy: 'breakout', required_setup: null, required_tags: [], require_stop_loss: true, minimum_target_r: 2, checklist_items: 5, reviews: 20, avg_adherence: 72 }],
    recent: { window_days: 90, reviews: 20, avg_adherence: 72, followed_plan_pct: 55 }
  },
  risk: [{ label: 'Apex 50k', account_size: 50000, max_daily_loss: 1000, max_drawdown: 2500, drawdown_mode: 'trailing', profit_target: 3000 }],
  watchlist: [{ name: 'Core', symbols: ['AAPL', 'MSFT'] }],
  holdings: [{ symbol: 'VTI', shares: 100, avg_cost: 210, value: 25000, unrealized_pct: 19.0, target_pct: 40, sector: 'ETF' }]
});

describe('AITraderContext.format', () => {
  test('renders every section with the trader\'s own words and memory notes', () => {
    const text = AITraderContext.format(fullDossier(), { currency: usd() });

    expect(text.startsWith('TRADER DOSSIER:')).toBe(true);
    expect(text).toContain('DECLARED PROFILE');
    expect(text).toContain('Strategies: Breakouts, Swing Trading');
    expect(text).toContain('preferred sectors: Technology');
    expect(text).toContain('Default stop loss: 2%');
    expect(text).toContain('In their own words: "I trade opening range breakouts');
    expect(text).toContain('- I overtrade after green days');
    expect(text).toContain('OBSERVED FROM THEIR TRADES (last 180 days, 64 closed trades');
    expect(text).toContain('median hold 2 min');
    expect(text).toContain('Most active entry hours (America/New_York): 8am (15), 1pm (7)');
    expect(text).toContain('Setup quality grades: A: 2, B: 21, C: 10, D: 29, F: 1');
    expect(text).toContain('KNOWN TENDENCIES');
    expect(text).toContain('Revenge trading: 3 revenge-trading episodes, typically after a loss around $480.00');
    expect(text).toContain('Current streak: 4 losses in a row');
    expect(text).toContain('TRADING PERSONALITY');
    expect(text).toContain('Drift (2026-10-25): high severity, shifted from momentum to scalper');
    expect(text).toContain('LATEST EDGE REPORT (week 2026-10-19 to 2026-10-25)');
    expect(text).toContain('Leak: Afternoon trades lost $300 on 5 trades.');
    expect(text).toContain('Action item they were given: Stop trading after 1pm this week.');
    expect(text).toContain('PLAYBOOKS');
    expect(text).toContain('ORB - Opening range breakout [strategy breakout, market stocks, timeframe 5m, side long, stop required, min target 2R, 5-item checklist]; 20 reviewed trades, avg adherence 72%');
    expect(text).toContain('followed plan on 55%');
    expect(text).toContain('ACCOUNT RISK LIMITS');
    expect(text).toContain('Apex 50k: size $50000.00, max daily loss $1000.00');
    expect(text).toContain('WATCHLISTS:\n- Core: AAPL, MSFT');
    expect(text).toContain('INVESTMENT HOLDINGS');
    expect(text).toContain('VTI: 100 shares, avg cost $210.00, value $25000.00, +19.0% unrealized, target 40%, ETF');
  });

  test('honours the sections filter and omits empty sections', () => {
    const dossier = fullDossier();
    dossier.behavior = null;
    dossier.holdings = null;
    const text = AITraderContext.format(dossier, { currency: usd(), sections: ['profile', 'behavior', 'holdings', 'watchlist'] });

    expect(text).toContain('DECLARED PROFILE');
    expect(text).toContain('WATCHLISTS');
    expect(text).not.toContain('KNOWN TENDENCIES');
    expect(text).not.toContain('INVESTMENT HOLDINGS');
    expect(text).not.toContain('OBSERVED FROM THEIR TRADES');
  });

  test('returns an empty string when nothing is present', () => {
    expect(AITraderContext.format({ generated_at: 'x' })).toBe('');
    expect(AITraderContext.format(null)).toBe('');
  });

  test('skips a default stop line whose value is not set', () => {
    const dossier = fullDossier();
    dossier.profile.default_stop = { type: 'percent', percent: null, dollars: null, points: null };
    expect(AITraderContext.format(dossier, { currency: usd() })).not.toContain('Default stop loss');
  });

  test('focusGuidelines states the coaching priorities', () => {
    const text = AITraderContext.focusGuidelines();
    expect(text).toMatch(/Risk before returns/);
    expect(text).toMatch(/Process over outcome/);
    expect(text).toMatch(/asked you to remember/);
  });
});

describe('AITraderContext.build', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    AITraderContext.invalidate();
  });

  test('loads sections independently, tolerating failures, and caches the result', async () => {
    // Order of loaders: profile, observed, behavior(4 queries), personality(2), edge, playbooks(2), risk, watchlist, holdings
    db.query.mockImplementation(async (sql) => {
      if (/FROM user_settings/.test(sql)) {
        return { rows: [{ trading_strategies: ['Breakouts'], trading_styles: [], risk_tolerance: 'moderate', experience_level: 'advanced', average_position_size: 'medium', primary_markets: [], trading_goals: ['Consistency'], preferred_sectors: [], about_trading: ' lots   of  spaces ', ai_memory_notes: ['keep size flat', 42, ''], default_stop_loss_type: null }] };
      }
      if (/WITH recent AS/.test(sql)) throw new Error('observed query broke');
      if (/FROM behavioral_patterns/.test(sql)) return { rows: [] };
      if (/FROM revenge_trading_events/.test(sql)) return { rows: [{ events: 0 }] };
      if (/FROM overconfidence_events/.test(sql)) return { rows: [{ events: 0 }] };
      if (/FROM win_loss_streaks/.test(sql)) return { rows: [] };
      if (/FROM trading_personality_profiles/.test(sql)) return { rows: [] };
      if (/FROM personality_drift_tracking/.test(sql)) return { rows: [] };
      if (/FROM edge_reports/.test(sql)) return { rows: [{ period_start: '2026-10-19', period_end: '2026-10-25', report: JSON.stringify({ week: { total_trades: 3 }, edge: null, leak: null, action_item: 'Rest' }) }] };
      if (/FROM playbooks p/.test(sql)) return { rows: [] };
      if (/FROM trade_playbook_reviews/.test(sql)) return { rows: [{ reviews: 0 }] };
      if (/FROM account_rule_profiles/.test(sql)) return { rows: [] };
      if (/FROM watchlist_items/.test(sql)) return { rows: [{ name: 'Core', symbol: 'AAPL' }, { name: 'Core', symbol: 'AAPL' }, { name: 'Core', symbol: 'MSFT' }] };
      if (/FROM investment_holdings/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 40)}`);
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const dossier = await AITraderContext.build('user-1');

    expect(dossier.profile.about_trading).toBe('lots of spaces');
    expect(dossier.profile.ai_memory_notes).toEqual(['keep size flat']);
    expect(dossier.observed).toBeNull(); // failed loader -> omitted
    expect(dossier.behavior).toBeNull(); // nothing detected -> omitted
    expect(dossier.edge.action_item).toBe('Rest');
    expect(dossier.watchlist).toEqual([{ name: 'Core', symbols: ['AAPL', 'MSFT'] }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not load observed'));

    const callsAfterFirst = db.query.mock.calls.length;
    const again = await AITraderContext.build('user-1', { sections: ['profile'] });
    expect(db.query.mock.calls.length).toBe(callsAfterFirst); // served from cache
    expect(again.profile.about_trading).toBe('lots of spaces');
    expect(again.edge).toBeNull(); // filtered out by sections

    AITraderContext.invalidate('user-1');
    await AITraderContext.build('user-1');
    expect(db.query.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    warn.mockRestore();
  });

  test('render never throws', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(AITraderContext.render('user-2')).resolves.toBe('');
    warn.mockRestore();
  });
});
