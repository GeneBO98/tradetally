jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ hasFeatureAccess: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({ getUserTimezone: jest.fn() }));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const { getUserTimezone } = require('../../src/utils/timezone');
const SessionTimelineService = require('../../src/services/sessionTimelineService');

describe('SessionTimelineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.hasFeatureAccess.mockResolvedValue(true);
    getUserTimezone.mockResolvedValue('America/New_York');
  });

  test('returns a personal baseline and marks entries after a loss', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ session_date: '2026-01-05', trade_count: 2 }] })
      .mockResolvedValueOnce({ rows: [
        { id: 'entry-1', symbol: 'SPY', entry_time: '2026-01-05T14:00:00.000Z', exit_time: null, pnl: null, side: 'long', account_identifier: 'main' },
        { id: 'entry-2', symbol: 'QQQ', entry_time: '2026-01-05T14:10:00.000Z', exit_time: null, pnl: null, side: 'long', account_identifier: 'main' }
      ] })
      .mockResolvedValueOnce({ rows: [
        { id: 'loss-1', symbol: 'AAPL', exit_time: '2026-01-05T14:05:00.000Z', pnl: '-10', account_identifier: 'main' }
      ] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 10 }, (_, index) => ({
        id: `baseline-${index}`,
        entry_time: `2025-${String(12 - Math.floor(index / 3)).padStart(2, '0')}-${String(20 - index).padStart(2, '0')}T14:00:00.000Z`,
        local_date: `2025-12-${String(20 - index).padStart(2, '0')}`
      })) })
      .mockResolvedValueOnce({ rows: [
        { id: 'entry-1', entry_time: '2026-01-05T14:00:00.000Z', local_date: '2026-01-05' },
        { id: 'entry-2', entry_time: '2026-01-05T14:10:00.000Z', local_date: '2026-01-05' }
      ] })
      .mockResolvedValueOnce({ rows: [{ id: 'loss-1', exit_time: '2026-01-05T14:05:00.000Z' }] });

    const result = await SessionTimelineService.getSessionTimeline('user-1', {
      session_date: '2026-01-05',
      start_date: '2026-01-01',
      end_date: '2026-01-10',
      accounts: ['main']
    });

    expect(result.session_date).toBe('2026-01-05');
    expect(result.available_session_dates[0].anomalous).toBe(true);
    expect(result.baseline.available).toBe(true);
    expect(result.losses[0].visible).toBe(true);
    expect(result.trades.find((trade) => trade.id === 'entry-1').post_loss).toBe(false);
    expect(result.trades.find((trade) => trade.id === 'entry-2').post_loss).toBe(true);
    expect(result.blocks[36].trade_count).toBe(2);
    expect(result.blocks[36].post_loss_count).toBe(1);
  });

  test('returns an empty review when the selected range has no entries', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await SessionTimelineService.getSessionTimeline('user-1', { start_date: '2026-01-01', end_date: '2026-01-02' });
    expect(result.session_date).toBeNull();
    expect(result.blocks).toEqual([]);
    expect(result.warnings[0]).toMatch(/No trade entries/);
  });
});
