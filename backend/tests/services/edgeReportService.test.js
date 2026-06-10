jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/tradeQueries', () => ({
  getAnalytics: jest.fn()
}));
jest.mock('../../src/utils/aiService', () => ({
  getUserSettings: jest.fn(),
  isProviderConfigured: jest.fn(),
  generateResponse: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(),
  sendEdgeReportEmail: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  getSettings: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../../src/models/Playbook', () => ({
  getAnalytics: jest.fn()
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const AIService = require('../../src/utils/aiService');
const EmailService = require('../../src/services/emailService');
const User = require('../../src/models/User');
const Playbook = require('../../src/models/Playbook');
const EdgeReportService = require('../../src/services/edgeReportService');

const PERIOD = { periodStart: '2026-06-01', periodEnd: '2026-06-07' };

function mockAnalytics(summaryOverrides = {}, extras = {}) {
  return {
    summary: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      ...summaryOverrides
    },
    dailyPnL: [],
    recentTradePnls: [],
    ...extras
  };
}

function mockDimensionQueries({ strategyRows = [], symbolRows = [], hourRows = [], insertedRow = null } = {}) {
  db.query.mockImplementation((sql) => {
    if (sql.includes('TRIM(t.strategy)')) {
      return Promise.resolve({ rows: strategyRows });
    }
    if (sql.includes('t.symbol AS name')) {
      return Promise.resolve({ rows: symbolRows });
    }
    if (sql.includes('EXTRACT(HOUR')) {
      return Promise.resolve({ rows: hourRows });
    }
    if (sql.includes('INSERT INTO edge_reports')) {
      return Promise.resolve({ rows: [insertedRow || { id: 'report-row-1' }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('EdgeReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Playbook.getAnalytics.mockResolvedValue({ overview: { playbook_count: 0 } });
    AIService.getUserSettings.mockResolvedValue({ provider: '' });
    AIService.isProviderConfigured.mockReturnValue(false);
  });

  describe('zero-trade weeks', () => {
    it('buildReport returns null when the week has no completed trades', async () => {
      TradeQueries.getAnalytics.mockResolvedValue(mockAnalytics({ totalTrades: 0 }));

      const report = await EdgeReportService.buildReport('user-1', PERIOD);

      expect(report).toBeNull();
      // Only the current-period analytics call should have happened
      expect(TradeQueries.getAnalytics).toHaveBeenCalledTimes(1);
    });

    it('generateForUser returns null, persists nothing and sends nothing', async () => {
      TradeQueries.getAnalytics.mockResolvedValue(mockAnalytics({ totalTrades: 0 }));
      db.query.mockResolvedValue({ rows: [] });

      const result = await EdgeReportService.generateForUser('user-1', { ...PERIOD, force: true });

      expect(result).toBeNull();
      expect(EmailService.sendEdgeReportEmail).not.toHaveBeenCalled();
      const insertCalls = db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO edge_reports'));
      expect(insertCalls).toHaveLength(0);
    });
  });

  describe('report structure for a normal week', () => {
    beforeEach(() => {
      TradeQueries.getAnalytics
        .mockResolvedValueOnce(mockAnalytics({
          totalTrades: 10,
          winningTrades: 6,
          losingTrades: 4,
          winRate: 60,
          totalPnL: 450.5,
          profitFactor: 1.8,
          avgWin: 200,
          avgLoss: -120
        }, {
          dailyPnL: [
            { trade_date: '2026-06-01', daily_pnl: '300' },
            { trade_date: '2026-06-03', daily_pnl: '-150' },
            { trade_date: '2026-06-05', daily_pnl: '300.5' }
          ],
          recentTradePnls: [
            { pnl: '100' }, { pnl: '-50' }, { pnl: '200' }, { pnl: '-30' },
            { pnl: '150' }, { pnl: '-40' }, { pnl: '120' }
          ]
        }))
        .mockResolvedValueOnce(mockAnalytics({
          totalTrades: 8,
          winningTrades: 4,
          losingTrades: 4,
          winRate: 50,
          totalPnL: 100,
          profitFactor: 1.2,
          avgWin: 150,
          avgLoss: -110
        }));

      mockDimensionQueries({
        strategyRows: [
          { name: 'breakout', trades: '5', total_pnl: '600', wins: '4' },
          { name: 'reversal', trades: '5', total_pnl: '-149.5', wins: '2' }
        ],
        symbolRows: [
          { name: 'AAPL', trades: '4', total_pnl: '500', wins: '3' },
          { name: 'TSLA', trades: '6', total_pnl: '-49.5', wins: '3' }
        ],
        hourRows: []
      });

      Playbook.getAnalytics.mockResolvedValue({
        overview: {
          playbook_count: 2,
          active_playbook_count: 2,
          reviewed_trade_count: 5,
          followed_trade_count: 4,
          broken_trade_count: 1,
          adherence_average: '7.40'
        }
      });
    });

    it('returns a snake_case report with week summary, comparison, edge, leak and action item', async () => {
      const report = await EdgeReportService.buildReport('user-1', PERIOD);

      expect(report.period_start).toBe('2026-06-01');
      expect(report.period_end).toBe('2026-06-07');

      expect(report.week).toMatchObject({
        total_trades: 10,
        winning_trades: 6,
        losing_trades: 4,
        win_rate: 60,
        total_pnl: 450.5,
        profit_factor: 1.8,
        avg_win: 200,
        avg_loss: -120
      });
      expect(report.week.best_day).toEqual({ date: '2026-06-05', pnl: 300.5 });
      expect(report.week.worst_day).toEqual({ date: '2026-06-03', pnl: -150 });

      expect(report.previous_week).toMatchObject({
        total_trades: 8,
        win_rate: 50,
        total_pnl: 100
      });
      expect(report.deltas).toEqual({
        total_trades: 2,
        win_rate: 10,
        total_pnl: 350.5,
        profit_factor: 0.6
      });

      // Edge: breakout strategy (+600) beats AAPL (+500)
      expect(report.edge).toEqual({
        type: 'strategy',
        name: 'breakout',
        trades: 5,
        win_rate: 80,
        total_pnl: 600
      });

      // Leak: reversal strategy (-149.50) is the biggest dollar drag
      expect(report.leak).toMatchObject({
        type: 'strategy',
        name: 'reversal',
        total_pnl: -149.5
      });

      expect(report.playbook).toEqual({
        playbook_count: 2,
        reviewed_trade_count: 5,
        followed_trade_count: 4,
        broken_trade_count: 1,
        adherence_average: 7.4
      });

      expect(typeof report.action_item).toBe('string');
      expect(report.action_item).toContain('reversal');
    });

    it('uses the comparison period (prior 7 days) for the second analytics call', async () => {
      await EdgeReportService.buildReport('user-1', PERIOD);

      expect(TradeQueries.getAnalytics).toHaveBeenNthCalledWith(1, 'user-1', {
        startDate: '2026-06-01',
        endDate: '2026-06-07'
      });
      expect(TradeQueries.getAnalytics).toHaveBeenNthCalledWith(2, 'user-1', {
        startDate: '2026-05-25',
        endDate: '2026-05-31'
      });
    });

    it('generateForUser upserts the report and emails opted-in users', async () => {
      User.getSettings.mockResolvedValue({ edge_report_enabled: true });
      User.findById.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', username: 'trader' });
      EmailService.isConfigured.mockReturnValue(true);
      EmailService.sendEdgeReportEmail.mockResolvedValue();

      const row = await EdgeReportService.generateForUser('user-1', { ...PERIOD, force: true });

      expect(row).toEqual({ id: 'report-row-1' });
      const insertCall = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO edge_reports'));
      expect(insertCall).toBeDefined();
      expect(insertCall[0]).toContain('ON CONFLICT (user_id, period_start)');
      expect(insertCall[1][0]).toBe('user-1');
      expect(insertCall[1][1]).toBe('2026-06-01');
      expect(insertCall[1][2]).toBe('2026-06-07');

      expect(EmailService.sendEdgeReportEmail).toHaveBeenCalledTimes(1);
      const [userArg, reportArg, narrativeArg] = EmailService.sendEdgeReportEmail.mock.calls[0];
      expect(userArg.email).toBe('trader@example.com');
      expect(reportArg.week.total_trades).toBe(10);
      expect(typeof narrativeArg).toBe('string');
    });

    it('does not email users who have not opted in', async () => {
      User.getSettings.mockResolvedValue({ edge_report_enabled: false });
      EmailService.isConfigured.mockReturnValue(true);

      const row = await EdgeReportService.generateForUser('user-1', { ...PERIOD, force: true });

      expect(row).toEqual({ id: 'report-row-1' });
      expect(EmailService.sendEdgeReportEmail).not.toHaveBeenCalled();
    });
  });

  describe('narrative generation', () => {
    const report = {
      period_start: '2026-06-01',
      period_end: '2026-06-07',
      week: {
        total_trades: 5,
        winning_trades: 3,
        losing_trades: 2,
        win_rate: 60,
        total_pnl: 100,
        profit_factor: 2,
        avg_win: 50,
        avg_loss: -30
      },
      previous_week: null,
      deltas: null,
      edge: { type: 'symbol', name: 'AAPL', trades: 3, win_rate: 66.67, total_pnl: 150 },
      leak: { type: 'symbol', name: 'TSLA', trades: 2, total_pnl: -50, description: 'TSLA cost -$50.00 across 2 trades this week.' },
      playbook: null,
      action_item: 'Cut size in TSLA or sit it out next week.'
    };

    it('falls back to the deterministic narrative when the AI provider fails', async () => {
      AIService.getUserSettings.mockResolvedValue({ provider: 'claude', apiKey: 'key' });
      AIService.isProviderConfigured.mockReturnValue(true);
      AIService.generateResponse.mockRejectedValue(new Error('provider unavailable'));

      const narrative = await EdgeReportService.generateNarrative('user-1', report);

      expect(AIService.generateResponse).toHaveBeenCalled();
      expect(narrative).toContain('You closed 5 trades this week');
      expect(narrative).toContain('Action for next week: Cut size in TSLA');
    });

    it('falls back when no AI provider is configured, without calling the provider', async () => {
      AIService.isProviderConfigured.mockReturnValue(false);

      const narrative = await EdgeReportService.generateNarrative('user-1', report);

      expect(AIService.generateResponse).not.toHaveBeenCalled();
      expect(narrative).toContain('Your edge: AAPL (symbol)');
    });

    it('uses the AI narrative when generation succeeds', async () => {
      AIService.getUserSettings.mockResolvedValue({ provider: 'claude', apiKey: 'key' });
      AIService.isProviderConfigured.mockReturnValue(true);
      AIService.generateResponse.mockResolvedValue('  Solid week with a clear AAPL edge.  ');

      const narrative = await EdgeReportService.generateNarrative('user-1', report);

      expect(narrative).toBe('Solid week with a clear AAPL edge.');
    });
  });

  describe('runWeeklyBatch', () => {
    it('isolates per-user failures and keeps processing remaining users', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 'user-a' }, { id: 'user-b' }, { id: 'user-c' }] });

      const spy = jest.spyOn(EdgeReportService, 'generateForUser')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'report-b' })
        .mockResolvedValueOnce(null);

      const stats = await EdgeReportService.runWeeklyBatch();

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith('user-a', { force: true });
      expect(spy).toHaveBeenCalledWith('user-b', { force: true });
      expect(spy).toHaveBeenCalledWith('user-c', { force: true });
      expect(stats).toEqual({ users: 3, generated: 1, skipped: 1, failed: 1 });

      spy.mockRestore();
    });

    it('only targets users with edge_report_enabled = true', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const stats = await EdgeReportService.runWeeklyBatch();

      expect(stats).toEqual({ users: 0, generated: 0, skipped: 0, failed: 0 });
      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain('edge_report_enabled = true');
    });
  });
});
