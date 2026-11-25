jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York')
}));

const db = require('../../src/config/database');
const ImportInsightService = require('../../src/services/importInsightService');

describe('ImportInsightService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getImportInsight', () => {
    it('returns ready: false when fewer than 3 closed real trades exist', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ trade_count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ losing_hits: 0, total_hits: 0, net_pnl: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ImportInsightService.getImportInsight('user-1');
      expect(result).toEqual({ ready: false, scope: 'account', trade_count: 2, insight: null });
    });

    it('surfaces the highest net dollar leak scoped to import and converts hour query to user timezone', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: 12 }] }) // import scope count
        .mockResolvedValueOnce({
          rows: [{
            trade_count: 12,
            wins: 6,
            losses: 6,
            avg_win: '150',
            avg_loss: '180',
            total_losses: '1080',
            avg_winner_hold: '30',
            avg_loser_hold: '40'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ losing_hits: 3, total_hits: 4, net_pnl: '-920' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'TSLA', trades: 4, wins: 1, total_pnl: '-410' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ImportInsightService.getImportInsight('user-1', { importId: 'imp-1' });
      expect(result.ready).toBe(true);
      expect(result.scope).toBe('import');
      expect(result.insight.kind).toBe('revenge_proxy');
      expect(result.insight.headline).toContain('$920');
      expect(result.insight.cta_route).toBe('/metrics/behavioral');

      const hourSql = db.query.mock.calls[4][0];
      expect(hourSql).toContain('AT TIME ZONE');
      expect(db.query.mock.calls[4][1]).toContain('America/New_York');
    });

    it('falls back to strongest positive edge with accurate account scope label when there are no net leaks', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{
            trade_count: 8,
            wins: 7,
            losses: 1,
            avg_win: '200',
            avg_loss: '80',
            total_losses: '80',
            avg_winner_hold: '45',
            avg_loser_hold: '20'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ total_hits: 0, net_pnl: '0' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'AAPL', trades: 5, wins: 5, total_pnl: '1120' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await ImportInsightService.getImportInsight('user-1');
      expect(result.ready).toBe(true);
      expect(result.scope).toBe('account');
      expect(result.insight.kind).toBe('top_edge');
      expect(result.insight.tone).toBe('success');
      expect(result.insight.headline).toContain('AAPL');
      expect(result.insight.headline).toContain('+$1,120');
      expect(result.insight.detail).toContain('your account history');
    });
  });
});
