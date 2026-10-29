jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/aiTraderContext', () => ({
  build: jest.fn(),
  render: jest.fn(() => Promise.resolve('')),
  focusGuidelines: jest.fn(() => 'FOCUS')
}));

const AITraderContext = require('../../src/services/aiTraderContext');
const analyticsController = require('../../src/controllers/analytics.controller');

const baseDossier = (overrides = {}) => ({
  observed: { window_days: 180, trades: 60, stop_usage_pct: 100, avg_r: 1.1, grade_counts: { A: 20, B: 30, C: 10 } },
  behavior: null,
  personality: null,
  playbooks: null,
  ...overrides
});

describe('analyticsController.buildDossierInsights', () => {
  test('returns nothing for a clean dossier', () => {
    expect(analyticsController.buildDossierInsights(baseDossier())).toEqual([]);
    expect(analyticsController.buildDossierInsights(null)).toEqual([]);
  });

  test('flags an active losing streak first, then revenge trading', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      behavior: {
        window_days: 90,
        patterns: [],
        revenge: { events: 2, avg_trigger_loss_usd: -400, total_additional_loss_usd: -250, avg_size_increase_pct: 60, avg_window_minutes: 35, last_event: '2026-10-20' },
        overconfidence: null,
        active_streak: { type: 'loss', length: 4, total_pnl_usd: -900, last_trade_date: '2026-10-28' }
      }
    }));

    expect(insights.map(i => i.type)).toEqual(['streak', 'behavior']);
    expect(insights[0]).toMatchObject({ priority: 50, headline: '4 losses in a row', action_url: '/trades' });
    expect(insights[0].body).toContain('lost $900 combined, and revenge trading has followed losses like this before');
    expect(insights[1]).toMatchObject({ priority: 45, headline: 'Revenge trading showed up 2 times', action_url: '/metrics/behavioral' });
    expect(insights[1].body).toContain('sizing up 60%');
    expect(insights[1].body).toContain('costing another $250');
    expect(insights[1].body).toContain('cooldown after any loss over $200');
  });

  test('warns about size after a win streak when overconfidence is a known tendency', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      behavior: {
        window_days: 90, patterns: [], revenge: null,
        overconfidence: { events: 3, avg_streak_length: 4, avg_size_increase_pct: 45, ended_in_loss: 2, last_event: '2026-10-10' },
        active_streak: { type: 'win', length: 5, total_pnl_usd: 1200, last_trade_date: '2026-10-28' }
      }
    }));

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ type: 'streak', priority: 42, headline: '5 wins in a row, watch your size' });
    expect(insights[0].body).toContain('sized up about 45%');
    expect(insights[0].body).toContain('2 of 3 ended in a loss');
  });

  test('reports high-severity drift', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      personality: { drift: { severity: 'high', from: 'momentum', to: 'scalper', hold_time_pct: -40, frequency_pct: 65 } }
    }));
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ type: 'behavior', priority: 38, headline: 'Your trading style has drifted' });
    expect(insights[0].body).toContain('from momentum to scalper (hold time -40%, frequency +65%)');
  });

  test('picks only the strongest discipline gap', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      observed: { window_days: 180, trades: 40, stop_usage_pct: 50, avg_r: 0.4, grade_counts: { A: 2, B: 8, D: 20, F: 10 } },
      playbooks: { recent: { window_days: 90, reviews: 12, avg_adherence: 48, followed_plan_pct: 40 } }
    }));

    // D/F share 75% > plan-not-followed 60% > missing stops 50%
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ type: 'discipline', headline: '75% of your setups graded D or F' });
  });

  test('ignores discipline signals below the sample thresholds', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      observed: { window_days: 180, trades: 5, stop_usage_pct: 0, avg_r: null, grade_counts: { D: 3 } },
      playbooks: { recent: { window_days: 90, reviews: 2, avg_adherence: 10, followed_plan_pct: 0 } }
    }));
    expect(insights).toEqual([]);
  });

  test('caps the list at three insights', () => {
    const insights = analyticsController.buildDossierInsights(baseDossier({
      observed: { window_days: 180, trades: 40, stop_usage_pct: 20, avg_r: null, grade_counts: {} },
      behavior: {
        window_days: 90, patterns: [],
        revenge: { events: 1, avg_trigger_loss_usd: -100, total_additional_loss_usd: null, avg_size_increase_pct: null, avg_window_minutes: 10, last_event: null },
        overconfidence: null,
        active_streak: { type: 'loss', length: 3, total_pnl_usd: null, last_trade_date: null }
      },
      personality: { drift: { severity: 'severe', from: 'a', to: 'b', hold_time_pct: null, frequency_pct: null } }
    }));
    expect(insights).toHaveLength(3);
    expect(insights.map(i => i.type)).toEqual(['streak', 'behavior', 'behavior']);
  });

  test('computeDossierInsights builds only the sections it needs', async () => {
    AITraderContext.build.mockResolvedValueOnce(baseDossier());
    await analyticsController.computeDossierInsights('user-1');
    expect(AITraderContext.build).toHaveBeenCalledWith('user-1', { sections: ['observed', 'behavior', 'personality', 'playbooks'] });
  });
});

describe('analyticsController.buildRecommendationPrompt', () => {
  const metrics = { total_trades: 10, win_rate: 50, total_pnl: 100, avg_pnl: 10, avg_win: 30, avg_loss: -20, best_trade: 90, worst_trade: -40, profit_factor: 1.5 };

  test('embeds the dossier and focus guidelines when provided', () => {
    const prompt = analyticsController.buildRecommendationPrompt(metrics, [], null, null, 'TRADER DOSSIER:\n- x');
    expect(prompt).toContain('TRADER DOSSIER:\n- x');
    expect(prompt).toContain('FOCUS');
  });

  test('falls back to the full settings profile including sectors and goals', () => {
    const profile = { experienceLevel: 'advanced', riskTolerance: 'moderate', tradingStyles: ['Day Trading'], tradingStrategies: ['Breakouts'], averagePositionSize: 'medium', primaryMarkets: ['Stocks'], tradingGoals: ['Consistency'], preferredSectors: ['Technology'] };
    const prompt = analyticsController.buildRecommendationPrompt(metrics, [], profile, null, '');
    expect(prompt).toContain('Preferred Sectors: Technology');
    expect(prompt).toContain('Goals: Consistency');
    expect(prompt).not.toContain('FOCUS');
  });
});
