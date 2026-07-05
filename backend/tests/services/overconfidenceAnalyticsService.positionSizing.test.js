jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  hasFeatureAccess: jest.fn()
}));

jest.mock('../../src/services/behavioralAnalysisPositionService', () => ({
  getCompletedPositions: jest.fn(),
  getCompletedPositionsByTradeIds: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  delete: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  generateKey: jest.fn(() => 'cache-key')
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const BehavioralAnalysisPositionService = require('../../src/services/behavioralAnalysisPositionService');
const AnalyticsCache = require('../../src/services/analyticsCache');
const OverconfidenceAnalyticsService = require('../../src/services/overconfidenceAnalyticsService');

function completedPosition(overrides = {}) {
  return {
    id: overrides.id || '00000000-0000-4000-8000-000000000101',
    trade_ids: overrides.trade_ids || [overrides.id || '00000000-0000-4000-8000-000000000101'],
    symbol: overrides.symbol || 'AAPL',
    entry_time: overrides.entry_time || '2026-06-01T14:30:00.000Z',
    exit_time: overrides.exit_time || '2026-06-01T15:00:00.000Z',
    entry_price: overrides.entry_price ?? 10,
    exit_price: overrides.exit_price ?? 11,
    quantity: overrides.quantity ?? 100,
    pnl: overrides.pnl ?? 100,
    position_size: overrides.position_size,
    instrument_type: overrides.instrument_type || 'stock',
    contract_size: overrides.contract_size,
    point_value: overrides.point_value,
    ...overrides
  };
}

describe('OverconfidenceAnalyticsService position sizing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.hasFeatureAccess.mockResolvedValue(true);
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM overconfidence_settings')) {
        return { rows: [{ min_streak_length: 4, position_increase_threshold: 40 }] };
      }
      if (text.includes('INSERT INTO overconfidence_events')) {
        return { rows: [{ id: 'event-1' }] };
      }
      return { rows: [] };
    });
  });

  test('uses explicit position_size and option multipliers for monetary size', () => {
    expect(OverconfidenceAnalyticsService.calculateMonetaryPositionSize({
      position_size: 2500,
      quantity: 1,
      entry_price: 2,
      instrument_type: 'option'
    })).toBe(2500);

    expect(OverconfidenceAnalyticsService.calculateMonetaryPositionSize({
      quantity: 2,
      entry_price: 3,
      instrument_type: 'option',
      contract_size: 100
    })).toBe(600);
  });

  test('does not create bogus overconfidence event for flat multiplier-aware option streak', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      completedPosition({ id: '00000000-0000-4000-8000-000000000201', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: 50 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000202', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: 60 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000203', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: 70 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000204', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: 80 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000205', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: 90 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000206', quantity: 1, entry_price: 10, instrument_type: 'option', contract_size: 100, pnl: -20 })
    ]);

    const result = await OverconfidenceAnalyticsService.analyzeHistoricalTrades('user-1');

    expect(result.overconfidenceEventsCreated).toBe(0);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO overconfidence_events'))).toBe(false);
  });

  test('creates sane overconfidence percent for escalating multiplier-aware sizes', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      completedPosition({ id: '00000000-0000-4000-8000-000000000308', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000309', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000310', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000301', position_size: 1000, pnl: 50 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000302', position_size: 1000, pnl: 60 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000303', position_size: 1000, pnl: 70 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000304', position_size: 1000, pnl: 80 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000305', position_size: 1000, pnl: 90 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000306', position_size: 1600, pnl: 100 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000307', position_size: 1000, pnl: -20 })
    ]);

    const result = await OverconfidenceAnalyticsService.analyzeHistoricalTrades('user-1');
    const eventInsert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO overconfidence_events'));

    expect(result.overconfidenceEventsCreated).toBe(1);
    expect(eventInsert[1][6]).toBe(60);
  });

  test('uses position_risk amount before notional position size for escalation percent', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      completedPosition({ id: '00000000-0000-4000-8000-000000000501', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000502', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000503', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000504', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: 50 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000505', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: 60 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000506', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: 70 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000507', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: 80 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000508', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: 90 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000509', position_size: 50000, position_risk: { amount: 200, basis: 'max_loss' }, pnl: 100 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000510', position_size: 5000, position_risk: { amount: 100, basis: 'max_loss' }, pnl: -20 })
    ]);

    const result = await OverconfidenceAnalyticsService.analyzeHistoricalTrades('user-1');
    const eventInsert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO overconfidence_events'));
    const riskBasis = JSON.parse(eventInsert[1][17]);

    expect(result.overconfidenceEventsCreated).toBe(1);
    expect(eventInsert[1][6]).toBe(100);
    expect(riskBasis.peak.basis).toBe('max_loss');
  });

  test('flattens grouped trade ids when storing streak trade details', async () => {
    const event = await OverconfidenceAnalyticsService.analyzeWinStreak('user-1', [
      completedPosition({ id: 'group-1', trade_ids: ['leg-1', 'leg-2'], position_size: 1000 }),
      completedPosition({ id: 'group-2', trade_ids: ['leg-3', 'leg-4'], position_size: 1200 }),
      completedPosition({ id: 'group-3', trade_ids: ['leg-5'], position_size: 1500 })
    ], 1000, 10);

    expect(event.streakTrades).toEqual(['leg-1', 'leg-2', 'leg-3', 'leg-4', 'leg-5']);
  });

  test('net-winning grouped position keeps win streak despite losing leg', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      completedPosition({ id: '00000000-0000-4000-8000-000000000408', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000409', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000410', position_size: 1000, pnl: -10 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000401', trade_ids: ['leg-1', 'leg-2'], position_size: 1000, pnl: 50, legs: [{ pnl: 90 }, { pnl: -40 }] }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000402', position_size: 1000, pnl: 60 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000403', position_size: 1000, pnl: 70 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000404', position_size: 1000, pnl: 80 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000405', position_size: 1000, pnl: 90 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000406', position_size: 1600, pnl: 100 }),
      completedPosition({ id: '00000000-0000-4000-8000-000000000407', position_size: 1000, pnl: -20 })
    ]);

    const result = await OverconfidenceAnalyticsService.analyzeHistoricalTrades('user-1');
    const eventInsert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO overconfidence_events'));

    expect(result.overconfidenceEventsCreated).toBe(1);
    expect(eventInsert[1][8]).toContain('leg-1');
    expect(eventInsert[1][8]).toContain('leg-2');
  });

  test('streak trade details use completed position rows instead of raw legs', async () => {
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT COUNT(*) as total_count')) {
        return { rows: [{ total_count: 1 }] };
      }
      if (text.includes('FROM overconfidence_events oe')) {
        return {
          rows: [{
            id: 'event-1',
            win_streak_length: 4,
            created_at: '2026-06-01T15:00:00.000Z',
            win_streak_start_date: '2026-06-01T14:00:00.000Z',
            win_streak_end_date: '2026-06-01T15:00:00.000Z',
            baseline_position_size: 1000,
            peak_position_size: 1600,
            position_size_increase_percent: 60,
            total_streak_profit: 200,
            severity: 'medium',
            confidence_score: 0.8,
            outcome_after_streak: 'ongoing',
            outcome_trade_id: null,
            outcome_amount: null,
            outcome_analysis: null,
            streak_trades: ['leg-1'],
            risk_basis: {
              streak: []
            },
            outcome_status: 'info'
          }]
        };
      }
      if (text.includes('COUNT(*) as total_events')) {
        return { rows: [{ total_events: 1 }] };
      }
      if (text.includes('MAX(win_streak_length)')) {
        return { rows: [{}] };
      }
      return { rows: [] };
    });
    AnalyticsCache.get.mockResolvedValue(null);
    jest.spyOn(OverconfidenceAnalyticsService, 'generateAIRecommendations').mockResolvedValue(null);
    BehavioralAnalysisPositionService.getCompletedPositionsByTradeIds.mockResolvedValue([
      completedPosition({
        id: 'position-1',
        trade_ids: ['leg-1', 'leg-2'],
        symbol: 'LITE',
        pnl: 250,
        position_size: 7172,
        position_risk: {
          amount: 508.4,
          basis: 'max_loss',
          confidence: 'high',
          is_approximate: false
        },
        position_grouped: true,
        leg_count: 2,
        group_detected_strategy: 'bear_call_spread'
      })
    ]);

    const result = await OverconfidenceAnalyticsService.getOverconfidenceAnalysis('user-1', {}, {});

    expect(BehavioralAnalysisPositionService.getCompletedPositionsByTradeIds).toHaveBeenCalledWith('user-1', ['leg-1']);
    expect(result.events[0].streakTradeDetails).toHaveLength(1);
    expect(result.events[0].streakTradeDetails[0]).toMatchObject({
      id: 'position-1',
      trade_ids: ['leg-1', 'leg-2'],
      pnl: 250,
      position_size: 508.4,
      position_risk_basis: 'max_loss',
      position_grouped: true,
      leg_count: 2
    });
  });
});
