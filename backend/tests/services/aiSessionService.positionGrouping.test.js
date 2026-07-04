jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tradeQueries', () => ({
  getAnalytics: jest.fn(),
  findByUser: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  findById: jest.fn()
}));

jest.mock('../../src/models/Playbook', () => ({
  getTradeReviewsByTradeId: jest.fn()
}));

jest.mock('../../src/utils/positionGrouping', () => ({
  isPositionGroupingEnabled: jest.fn()
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const Trade = require('../../src/models/Trade');
const Playbook = require('../../src/models/Playbook');
const { isPositionGroupingEnabled } = require('../../src/utils/positionGrouping');
const AISessionService = require('../../src/services/aiSessionService');

const USER_ID = 'user-1';

function leg(overrides = {}) {
  return {
    id: overrides.id || 'leg-1',
    user_id: USER_ID,
    symbol: 'SNOW250620P00100000',
    underlying_symbol: 'SNOW',
    account_identifier: 'ACC1',
    instrument_type: 'option',
    option_type: 'put',
    side: 'short',
    quantity: 1,
    entry_price: 2.5,
    exit_price: 1.2,
    entry_time: '2026-06-01T14:30:00Z',
    exit_time: '2026-06-05T18:00:00Z',
    trade_date: '2026-06-01',
    pnl: 130,
    commission: 1,
    fees: 0.5,
    broker: 'schwab',
    strategy: null,
    position_group_id: null,
    group_detected_strategy: null,
    group_leg_count: null,
    ...overrides
  };
}

describe('AISessionService.collapsePositionGroups', () => {
  test('collapses legs sharing a persisted position_group_id into one position', () => {
    const trades = [
      leg({ id: 'leg-1', position_group_id: 'grp-1', group_detected_strategy: 'bull_put_spread', group_leg_count: 2, pnl: 130 }),
      leg({ id: 'leg-2', position_group_id: 'grp-1', group_detected_strategy: 'bull_put_spread', group_leg_count: 2, pnl: -60, side: 'long', entry_time: '2026-06-01T14:32:00Z' })
    ];

    const collapsed = AISessionService.collapsePositionGroups(trades);

    expect(collapsed).toHaveLength(1);
    const position = collapsed[0];
    expect(position.is_position_group).toBe(true);
    expect(position.leg_count).toBe(2);
    expect(position.pnl).toBe(70);
    expect(position.symbol).toBe('SNOW');
    expect(position.strategy).toBe('bull put spread');
    expect(position.side).toBe('bull put spread');
    expect(position.entry_time).toBe('2026-06-01T14:30:00Z');
    expect(position.position_status).toBe('closed');
  });

  test('uses fallback key (account + underlying + entry_time) for ungrouped legacy rows', () => {
    const trades = [
      leg({ id: 'leg-1', pnl: 100 }),
      leg({ id: 'leg-2', pnl: -40 })
    ];

    const collapsed = AISessionService.collapsePositionGroups(trades);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].pnl).toBe(60);
    expect(collapsed[0].strategy).toBe('multi-leg option');
  });

  test('leaves single-leg trades untouched and separates different groups', () => {
    const trades = [
      leg({ id: 'leg-1', position_group_id: 'grp-1', pnl: 100 }),
      leg({ id: 'leg-2', position_group_id: 'grp-2', pnl: -40 }),
      leg({ id: 'stock-1', symbol: 'AAPL', underlying_symbol: null, instrument_type: 'stock', entry_time: '2026-06-02T15:00:00Z', pnl: 25 })
    ];

    const collapsed = AISessionService.collapsePositionGroups(trades);

    expect(collapsed).toHaveLength(3);
    expect(collapsed.find(t => t.id === 'stock-1').is_position_group).toBeUndefined();
    expect(collapsed.find(t => t.id === 'stock-1').entry_price).toBe(2.5);
  });

  test('marks positions with any open leg as open', () => {
    const trades = [
      leg({ id: 'leg-1', position_group_id: 'grp-1', exit_price: null, pnl: null }),
      leg({ id: 'leg-2', position_group_id: 'grp-1', pnl: 50 })
    ];

    const collapsed = AISessionService.collapsePositionGroups(trades);

    expect(collapsed[0].position_status).toBe('open');
    expect(collapsed[0].exit_price).toBeNull();
  });
});

describe('AISessionService.buildTradeSummary with position grouping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TradeQueries.getAnalytics.mockResolvedValue({
      summary: { totalPnL: 70, winRate: 100, profitFactor: 0, avgPnL: 70, totalTrades: 1, bestTrade: 70, worstTrade: 70 }
    });
    TradeQueries.findByUser.mockResolvedValue([
      leg({ id: 'leg-1', position_group_id: 'grp-1', group_detected_strategy: 'bull_put_spread', pnl: 130 }),
      leg({ id: 'leg-2', position_group_id: 'grp-1', group_detected_strategy: 'bull_put_spread', pnl: -60 })
    ]);
  });

  test('collapses sample trades and flags grouping when the setting is on', async () => {
    isPositionGroupingEnabled.mockResolvedValue(true);

    const summary = await AISessionService.buildTradeSummary(USER_ID, {});

    expect(summary.position_grouping.enabled).toBe(true);
    expect(summary.sample_trades.recent).toHaveLength(1);
    expect(summary.sample_trades.recent[0].pnl).toBe('70.00');
    expect(summary.sample_trades.recent[0].legs).toBe(2);
    expect(summary.sample_trades.recent[0].exit_price).toBe('CLOSED');
    expect(summary.patterns.symbols_traded).toEqual(['SNOW']);
    expect(summary.patterns.strategies_used).toEqual(['bull put spread']);
  });

  test('keeps per-leg samples when the setting is off', async () => {
    isPositionGroupingEnabled.mockResolvedValue(false);

    const summary = await AISessionService.buildTradeSummary(USER_ID, {});

    expect(summary.position_grouping.enabled).toBe(false);
    expect(summary.sample_trades.recent).toHaveLength(2);
    expect(summary.sample_trades.recent[0].legs).toBeUndefined();
  });
});

describe('AISessionService.buildAnalysisPrompt position grouping note', () => {
  function summaryFixture(enabled) {
    return {
      metrics: { total_pnl: '70.00', win_rate: '100.00', profit_factor: '0.00', avg_pnl: '70.00', trade_count: 1, best_trade: '70.00', worst_trade: '70.00' },
      patterns: { symbols_traded: ['SNOW'], strategies_used: ['bull put spread'], brokers_used: ['schwab'] },
      time_analysis: { hourly_pnl: [], daily_pnl: [], best_hours: [], worst_hours: [] },
      sample_trades: {
        recent: [{ symbol: 'SNOW', side: 'bull put spread', entry_price: null, exit_price: 'CLOSED', pnl: '70.00', legs: 2, status: 'closed' }],
        best: [{ symbol: 'SNOW', side: 'bull put spread', pnl: '70.00', date: '2026-06-01T14:30:00Z', legs: 2 }],
        worst: []
      },
      position_grouping: { enabled }
    };
  }

  test('includes the grouping note and leg-aware sample lines when enabled', () => {
    const prompt = AISessionService.buildAnalysisPrompt(summaryFixture(true));

    expect(prompt).toContain('NOTE ON POSITION GROUPING');
    expect(prompt).toContain('SNOW: bull put spread (2 legs, closed), net P&L: $70.00');
    expect(prompt).toContain('SNOW: bull put spread (2 legs), net P&L: $70.00');
  });

  test('omits the grouping note when disabled', () => {
    const prompt = AISessionService.buildAnalysisPrompt(summaryFixture(false));

    expect(prompt).not.toContain('NOTE ON POSITION GROUPING');
  });
});

describe('AISessionService.buildSingleTradeSummary with a grouped trade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Playbook.getTradeReviewsByTradeId.mockResolvedValue([]);
  });

  test('attaches position group with all legs and marks the analyzed leg', async () => {
    Trade.findById.mockResolvedValue({
      id: 'leg-1',
      user_id: USER_ID,
      symbol: 'SNOW250620P00100000',
      position_group_id: 'grp-1',
      executions: []
    });

    db.query.mockImplementation((query) => {
      if (query.includes('FROM trade_position_groups')) {
        return Promise.resolve({
          rows: [{
            id: 'grp-1',
            detected_strategy: 'bull_put_spread',
            strategy_confidence: 90,
            leg_count: 2,
            underlying_symbol: 'SNOW',
            expiration_date: '2026-06-20',
            is_completed: true
          }]
        });
      }
      if (query.includes('WHERE position_group_id = $1')) {
        return Promise.resolve({
          rows: [
            { id: 'leg-1', symbol: 'SNOW250620P00100000', option_type: 'put', strike_price: 100, side: 'short', quantity: 1, entry_price: 2.5, exit_price: 1.2, pnl: 130, commission: 1, fees: 0.5 },
            { id: 'leg-2', symbol: 'SNOW250620P00095000', option_type: 'put', strike_price: 95, side: 'long', quantity: 1, entry_price: 1.1, exit_price: 0.5, pnl: -60, commission: 1, fees: 0.5 }
          ]
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const summary = await AISessionService.buildSingleTradeSummary(USER_ID, 'leg-1');

    expect(summary.position_group).not.toBeNull();
    expect(summary.position_group.strategy_label).toBe('bull put spread');
    expect(summary.position_group.combined_pnl).toBe(70);
    expect(summary.position_group.combined_costs).toBe(3);
    expect(summary.position_group.legs).toHaveLength(2);
    expect(summary.position_group.legs[0].is_analyzed_leg).toBe(true);
    expect(summary.position_group.legs[1].is_analyzed_leg).toBeUndefined();
  });

  test('leaves position_group null for ungrouped trades without querying groups', async () => {
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: USER_ID,
      symbol: 'AAPL',
      position_group_id: null,
      executions: []
    });

    const summary = await AISessionService.buildSingleTradeSummary(USER_ID, 'trade-1');

    expect(summary.position_group).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  test('does not fail the analysis when the group lookup errors', async () => {
    Trade.findById.mockResolvedValue({
      id: 'leg-1',
      user_id: USER_ID,
      symbol: 'SNOW250620P00100000',
      position_group_id: 'grp-1',
      executions: []
    });
    db.query.mockRejectedValue(new Error('db down'));

    const summary = await AISessionService.buildSingleTradeSummary(USER_ID, 'leg-1');

    expect(summary.position_group).toBeNull();
  });

  test('attaches labeled quality context from setup quality and trade reviews', async () => {
    Trade.findById.mockResolvedValue({
      id: 'trade-1',
      user_id: USER_ID,
      symbol: 'ADBE',
      position_group_id: null,
      executions: [],
      quality_grade: 'B',
      quality_score: 3.8,
      quality_metrics: { calculationVersion: 2, coverage: 75 }
    });
    Playbook.getTradeReviewsByTradeId.mockResolvedValue([
      {
        review_type: 'adherence',
        playbook_name: 'Opening Range Break',
        playbook_review_mode: 'checklist',
        adherence_score: 80,
        checklist_score: 85,
        followed_plan: true,
        checklist_responses: [{ label: 'Waited for confirmation', checked: true }],
        rule_results: [],
        violation_summary: [],
        review_notes: 'Good plan fit',
        reviewed_at: '2026-06-15T15:00:00Z'
      },
      {
        review_type: 'manual_grading',
        playbook_name: 'Options Credit Spread Grade',
        playbook_review_mode: 'score',
        adherence_score: 92,
        checklist_score: 92,
        followed_plan: null,
        checklist_responses: [{ label: 'Defined risk', score: 5, weight: 2 }],
        rule_results: [],
        violation_summary: [],
        review_notes: 'Clean structure',
        reviewed_at: '2026-06-15T16:00:00Z'
      }
    ]);

    const summary = await AISessionService.buildSingleTradeSummary(USER_ID, 'trade-1');

    expect(summary.quality_context).toEqual({
      automated_setup_quality: {
        grade: 'B',
        score: 3.8,
        metrics: { calculationVersion: 2, coverage: 75 }
      },
      playbook_assessment: expect.objectContaining({
        profile_name: 'Opening Range Break',
        score: 80,
        review_mode: 'checklist',
        followed_plan: true,
        review_notes: 'Good plan fit'
      }),
      manual_grading_profile: expect.objectContaining({
        profile_name: 'Options Credit Spread Grade',
        score: 92,
        grade: 'A',
        review_mode: 'score',
        review_notes: 'Clean structure'
      })
    });
  });
});

describe('AISessionService.buildSingleTradePrompt with a position group', () => {
  function singleTradeSummaryFixture(positionGroup) {
    return {
      analysis_type: 'single_trade',
      trade_id: 'leg-1',
      trade: { symbol: 'SNOW250620P00100000', side: 'short', status: 'closed' },
      executions: [],
      position_group: positionGroup,
      enrichment: { news_events: [] },
      visual_context: { charts: [], images: [] }
    };
  }

  test('leads with the strategy snapshot and demotes the leg to a component', () => {
    const prompt = AISessionService.buildSingleTradePrompt(singleTradeSummaryFixture({
      group_id: 'grp-1',
      detected_strategy: 'bull_put_spread',
      strategy_label: 'bull put spread',
      leg_count: 2,
      underlying_symbol: 'SNOW',
      expiration_date: '2026-06-20',
      is_completed: true,
      combined_pnl: 70,
      combined_costs: 3,
      legs: [
        { symbol: 'SNOW250620P00100000', option_type: 'put', strike_price: 100, side: 'short', quantity: 1, entry_price: 2.5, exit_price: 1.2, pnl: 130, is_analyzed_leg: true },
        { symbol: 'SNOW250620P00095000', option_type: 'put', strike_price: 95, side: 'long', quantity: 1, entry_price: 1.1, exit_price: 0.5, pnl: -60 }
      ]
    }));

    expect(prompt).toContain('STRATEGY SNAPSHOT (PRIMARY SUBJECT)');
    expect(prompt).toContain('bull put spread (2 legs) on SNOW');
    expect(prompt).toContain('Combined net P&L (all legs): $70.00');
    expect(prompt).toContain('[THIS LEG]');
    expect(prompt).toContain('evaluate the whole structure');

    // The combined strategy is the primary subject: its snapshot must come
    // before the analyzed leg's record, and the leg record must be demoted.
    expect(prompt).toContain('ANALYZED LEG DETAIL');
    expect(prompt.indexOf('STRATEGY SNAPSHOT')).toBeLessThan(prompt.indexOf('ANALYZED LEG DETAIL'));
    expect(prompt).not.toContain('TRADE SNAPSHOT:');

    // The response template asks for strategy-level analysis.
    expect(prompt).toContain('Structure Analysis');
    expect(prompt).toContain('judged at the strategy level, not per leg');
  });

  test('keeps the original per-trade prompt for ungrouped trades', () => {
    const prompt = AISessionService.buildSingleTradePrompt(singleTradeSummaryFixture(null));

    expect(prompt).not.toContain('STRATEGY SNAPSHOT');
    expect(prompt).not.toContain('ANALYZED LEG DETAIL');
    expect(prompt).toContain('TRADE SNAPSHOT:');
    expect(prompt).toContain('Analyze one specific trade');
    expect(prompt).toContain('**Technical Analysis**');
  });

  test('labels automated and manual quality context in the prompt', () => {
    const prompt = AISessionService.buildSingleTradePrompt({
      ...singleTradeSummaryFixture(null),
      trade: {
        symbol: 'ADBE',
        side: 'long',
        status: 'closed',
        quality_grade: 'B',
        quality_score: 3.8,
        quality_metrics: { coverage: 75 }
      },
      quality_context: {
        automated_setup_quality: { grade: 'B', score: 3.8, metrics: { coverage: 75 } },
        playbook_assessment: { profile_name: 'Opening Range Break', score: 80, followed_plan: true },
        manual_grading_profile: { profile_name: 'Options Credit Spread Grade', score: 92, grade: 'A', criterion_responses: [{ label: 'Defined risk', score: 5 }] }
      }
    });

    expect(prompt).toContain('QUALITY CONTEXT INCLUDED');
    expect(prompt).toContain('Automated Setup Quality: B (3.8/5)');
    expect(prompt).toContain('Playbook Assessment: Opening Range Break (80%)');
    expect(prompt).toContain('Manual Grading Profile: Options Credit Spread Grade grade A (92%)');
    expect(prompt).toContain('reference them separately');
  });
});

describe('AISessionService trade analysis deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deletes one owned single-trade analysis scoped to the trade', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'analysis-1' }] });

    const deletedCount = await AISessionService.deleteTradeAnalysis(USER_ID, 'trade-1', 'analysis-1');

    expect(deletedCount).toBe(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("filters_applied->>'analysisType' = 'single_trade'"),
      ['analysis-1', USER_ID, 'trade-1']
    );
  });

  test('throws when a single analysis is not owned or not tied to the trade', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(AISessionService.deleteTradeAnalysis(USER_ID, 'trade-1', 'analysis-2'))
      .rejects.toThrow('Analysis not found or access denied');
  });

  test('clears all owned single-trade analyses for the trade', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'analysis-1' }, { id: 'analysis-2' }] });

    const deletedCount = await AISessionService.deleteTradeAnalyses(USER_ID, 'trade-1');

    expect(deletedCount).toBe(2);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("filters_applied->>'tradeId' = $2"),
      [USER_ID, 'trade-1']
    );
  });
});

describe('AISessionService.summarizePositionGroupForClient', () => {
  test('trims the group to the fields the UI needs', () => {
    const summary = AISessionService.summarizePositionGroupForClient({
      group_id: 'grp-1',
      detected_strategy: 'bull_put_spread',
      strategy_label: 'bull put spread',
      strategy_confidence: 90,
      leg_count: 2,
      underlying_symbol: 'SNOW',
      expiration_date: '2026-06-20',
      is_completed: true,
      combined_pnl: 70,
      combined_costs: 3,
      legs: [{ symbol: 'SNOW250620P00100000' }]
    });

    expect(summary).toEqual({
      strategy_label: 'bull put spread',
      detected_strategy: 'bull_put_spread',
      leg_count: 2,
      underlying_symbol: 'SNOW',
      combined_pnl: 70,
      is_completed: true
    });
  });

  test('returns null when there is no group', () => {
    expect(AISessionService.summarizePositionGroupForClient(null)).toBeNull();
  });
});
