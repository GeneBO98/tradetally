jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  hasFeatureAccess: jest.fn()
}));

jest.mock('../../src/services/behavioralAnalysisPositionService', () => ({
  getCompletedPositions: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const BehavioralAnalysisPositionService = require('../../src/services/behavioralAnalysisPositionService');
const BehavioralAnalyticsServiceV2 = require('../../src/services/behavioralAnalyticsServiceV2');

describe('BehavioralAnalyticsServiceV2 position-level revenge detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.hasFeatureAccess.mockResolvedValue(true);
    db.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('SELECT * FROM behavioral_settings')) {
        return { rows: [] };
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
});
