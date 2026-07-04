jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  hasFeatureAccess: jest.fn()
}));

jest.mock('../../src/services/behavioralAnalysisPositionService', () => ({
  getCompletedPositions: jest.fn()
}));

jest.mock('../../src/utils/symbolCategories', () => ({
  categorizeNewSymbols: jest.fn(() => Promise.resolve({ processed: 0 }))
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const BehavioralAnalysisPositionService = require('../../src/services/behavioralAnalysisPositionService');
const BehavioralAnalyticsServiceV2 = require('../../src/services/behavioralAnalyticsServiceV2');

function position(overrides = {}) {
  return {
    id: overrides.id || '00000000-0000-4000-8000-000000000101',
    trade_ids: [overrides.id || '00000000-0000-4000-8000-000000000101'],
    symbol: overrides.symbol || 'NAB',
    underlying_symbol: overrides.underlying_symbol || overrides.symbol || 'NAB',
    entry_time: overrides.entry_time || '2026-06-01T14:30:00.000Z',
    exit_time: overrides.exit_time || '2026-06-01T15:00:00.000Z',
    pnl: overrides.pnl ?? -600,
    position_size: overrides.position_size ?? 1000,
    position_grouped: false,
    leg_count: 1,
    trade_ids: [overrides.id || '00000000-0000-4000-8000-000000000101'],
    ...overrides
  };
}

describe('BehavioralAnalyticsServiceV2 position-level revenge detection', () => {
  let industries;

  beforeEach(() => {
    jest.clearAllMocks();
    industries = new Map();
    TierService.hasFeatureAccess.mockResolvedValue(true);
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM behavioral_settings')) {
        return { rows: [] };
      }
      if (text.includes('SELECT symbol, finnhub_industry FROM symbol_categories')) {
        return {
          rows: [...industries.entries()].map(([symbol, finnhub_industry]) => ({
            symbol,
            finnhub_industry
          }))
        };
      }
      return { rows: [] };
    });
  });

  test('creates one revenge event for a grouped option follow-up position', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000101',
        trade_ids: [
          '00000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000102'
        ],
        symbol: 'SNOW',
        entry_time: '2026-06-01T14:30:00.000Z',
        exit_time: '2026-06-01T15:00:00.000Z',
        pnl: -600,
        position_size: 1000,
        position_grouped: true,
        leg_count: 2,
        group_detected_strategy: 'bull_put_spread'
      },
      {
        id: '00000000-0000-4000-8000-000000000201',
        trade_ids: [
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000202'
        ],
        symbol: 'SNOW',
        entry_time: '2026-06-01T15:20:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 100,
        position_size: 1200,
        position_grouped: true,
        leg_count: 2,
        group_detected_strategy: 'bull_put_spread'
      }
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');

    const eventInsert = db.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO revenge_trading_events')
    );

    expect(result.tradesAnalyzed).toBe(2);
    expect(result.revengeEventsCreated).toBe(1);
    expect(eventInsert).toBeTruthy();
    expect(eventInsert[1][3]).toBe(1);
    expect(eventInsert[1][11]).toEqual(['00000000-0000-4000-8000-000000000201']);
  });

  test('does not create a NAB to A2M cross-symbol event without escalation or same sector', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000301', symbol: 'NAB', pnl: -600, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000302',
        symbol: 'A2M',
        entry_time: '2026-06-01T15:20:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 50,
        position_size: 1100
      })
    ]);
    industries = new Map([
      ['NAB', 'Banks'],
      ['A2M', 'Food Products']
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');

    expect(result.revengeEventsCreated).toBe(0);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO revenge_trading_events'))).toBe(false);
  });

  test('admits cross-symbol candidate within 60 minutes with 1.3x size escalation', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000401', symbol: 'NAB', pnl: -600, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000402',
        symbol: 'A2M',
        entry_time: '2026-06-01T15:45:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 50,
        position_size: 1300
      })
    ]);
    industries = new Map([
      ['NAB', 'Banks'],
      ['A2M', 'Food Products']
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');
    const patternInsert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO behavioral_patterns'));
    const context = JSON.parse(patternInsert[1][5]);

    expect(result.revengeEventsCreated).toBe(1);
    expect(context.crossSymbolQualifier).toBe('position_escalation');
    expect(context.windowMinutes).toBe(60);
  });

  test('admits cross-symbol candidate within 60 minutes when industries match', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000501', symbol: 'JPM', pnl: -600, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000502',
        symbol: 'BAC',
        entry_time: '2026-06-01T15:45:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 50,
        position_size: 1250
      })
    ]);
    industries = new Map([
      ['JPM', 'Banks'],
      ['BAC', 'Banks']
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');
    const patternInsert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO behavioral_patterns'));
    const context = JSON.parse(patternInsert[1][5]);

    expect(result.revengeEventsCreated).toBe(1);
    expect(context.crossSymbolQualifier).toBe('same_sector');
    expect(context.triggerIndustry).toBe('Banks');
    expect(context.revengeIndustry).toBe('Banks');
  });

  test('rejects cross-symbol candidate with null industries and no escalation', async () => {
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000601', symbol: 'AAA', pnl: -600, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000602',
        symbol: 'BBB',
        entry_time: '2026-06-01T15:45:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 50,
        position_size: 1200
      })
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');

    expect(result.revengeEventsCreated).toBe(0);
  });

  test('creates same-symbol event for a $250 loss within the same-symbol window', async () => {
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM behavioral_settings')) {
        return { rows: [{ revenge_trading_sensitivity: 'high' }] };
      }
      if (text.includes('SELECT symbol, finnhub_industry FROM symbol_categories')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000701', symbol: 'NAB', pnl: -250, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000702',
        symbol: 'NAB',
        entry_time: '2026-06-01T16:50:00.000Z',
        exit_time: '2026-06-01T17:00:00.000Z',
        pnl: 50,
        position_size: 1000
      })
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');

    expect(result.revengeEventsCreated).toBe(1);
  });

  test('low sensitivity shrinks cross-symbol window to 30 minutes', async () => {
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM behavioral_settings')) {
        return { rows: [{ revenge_trading_sensitivity: 'low' }] };
      }
      if (text.includes('SELECT symbol, finnhub_industry FROM symbol_categories')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    BehavioralAnalysisPositionService.getCompletedPositions.mockResolvedValue([
      position({ id: '00000000-0000-4000-8000-000000000801', symbol: 'NAB', pnl: -1200, position_size: 1000 }),
      position({
        id: '00000000-0000-4000-8000-000000000802',
        symbol: 'A2M',
        entry_time: '2026-06-01T15:45:00.000Z',
        exit_time: '2026-06-01T16:00:00.000Z',
        pnl: 50,
        position_size: 1400
      })
    ]);

    const result = await BehavioralAnalyticsServiceV2.analyzeHistoricalTradesV2('user-1');

    expect(result.revengeEventsCreated).toBe(0);
  });

  test('clearHistoricalData scopes behavioral pattern deletion to revenge pattern types', async () => {
    await BehavioralAnalyticsServiceV2.clearHistoricalData('user-1');

    const patternDelete = db.query.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM behavioral_patterns'));

    expect(String(patternDelete[0])).toContain("pattern_type IN ('same_symbol_revenge', 'emotional_reactive_trading', 'revenge_trading')");
  });
});
