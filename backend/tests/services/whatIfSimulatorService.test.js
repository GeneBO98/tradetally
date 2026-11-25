jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({
  _buildWhereClause: jest.fn()
}));
jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn()
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const { getUserTimezone } = require('../../src/utils/timezone');
const WhatIfSimulatorService = require('../../src/services/whatIfSimulatorService');

describe('WhatIfSimulatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TradeQueries._buildWhereClause.mockResolvedValue({
      whereClause: 'WHERE t.user_id = $1',
      values: ['user-1'],
      needsSectorOuterJoin: false
    });
    getUserTimezone.mockResolvedValue('America/New_York');
  });

  describe('analyzeTrades', () => {
    it('flags revenge trades, oversized losses, worst symbol, and worst hour without double counting', () => {
      const rows = [
        // Two solid wins establishing avgWin = $200 (oversized threshold = $300)
        {
          id: 't1',
          symbol: 'AAPL',
          trade_date: '2026-03-02',
          entry_time: '2026-03-02T14:35:00Z', // 09:35 NY
          exit_time: '2026-03-02T14:50:00Z',
          pnl: 200
        },
        {
          id: 't2',
          symbol: 'MSFT',
          trade_date: '2026-03-02',
          entry_time: '2026-03-02T15:00:00Z', // 10:00 NY
          exit_time: '2026-03-02T15:15:00Z',
          pnl: 200
        },
        // Loss on TSLA at 15:00 NY (20:00Z)
        {
          id: 't3',
          symbol: 'TSLA',
          trade_date: '2026-03-03',
          entry_time: '2026-03-03T20:05:00Z', // 15:05 NY
          exit_time: '2026-03-03T20:15:00Z',
          pnl: -150
        },
        // Immediate revenge re-entry 10 minutes later on TSLA, also an oversized loss (-$450 > $300)
        {
          id: 't4',
          symbol: 'TSLA',
          trade_date: '2026-03-03',
          entry_time: '2026-03-03T20:25:00Z', // 15:25 NY
          exit_time: '2026-03-03T20:40:00Z',
          pnl: -450
        }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'America/New_York');

      expect(result.actual).toEqual({
        tradeCount: 4,
        totalPnl: -200,
        winCount: 2,
        lossCount: 2,
        winRate: 50,
        profitFactor: 0.67
      });

      const keys = result.scenarios.map(s => s.key);
      expect(keys).toContain('revenge');
      expect(keys).toContain('oversized_loss');
      expect(keys).toContain('worst_symbol');
      expect(keys).toContain('worst_hour');

      const revenge = result.scenarios.find(s => s.key === 'revenge');
      expect(revenge.tradeCount).toBe(1);
      expect(revenge.recoverablePnl).toBe(450);

      const worstSymbol = result.scenarios.find(s => s.key === 'worst_symbol');
      expect(worstSymbol.label).toBe('Skip TSLA');
      expect(worstSymbol.recoverablePnl).toBe(600);

      const worstHour = result.scenarios.find(s => s.key === 'worst_hour');
      expect(worstHour.label).toContain('3:00 PM');
      expect(worstHour.recoverablePnl).toBe(600);

      // Deduplicated max recovery: removing t3 (-150) and t4 (-450) adds exactly +600 (not 450+450+600+600!)
      expect(result.maxRecoverablePnl).toBe(600);
      expect(result.trades[3].f).toEqual(expect.arrayContaining(['revenge', 'oversized_loss', 'worst_symbol', 'worst_hour']));
    });

    it('returns empty scenarios when user has no losing patterns', () => {
      const rows = [
        { id: 't1', symbol: 'SPY', trade_date: '2026-03-02', entry_time: '2026-03-02T14:30:00Z', exit_time: '2026-03-02T15:00:00Z', pnl: 120 },
        { id: 't2', symbol: 'QQQ', trade_date: '2026-03-03', entry_time: '2026-03-03T14:30:00Z', exit_time: '2026-03-03T15:00:00Z', pnl: 180 }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'UTC');
      expect(result.scenarios).toEqual([]);
      expect(result.maxRecoverablePnl).toBe(0);
      expect(result.behavioralRecoverablePnl).toBe(0);
      expect(result.actual.totalPnl).toBe(300);
    });

    it('detects post-loss entries across overlapping positions', () => {
      const rows = [
        // Trade A loses and exits at 15:10
        { id: 'A', symbol: 'AAPL', trade_date: '2026-03-02', entry_time: '2026-03-02T15:00:00Z', exit_time: '2026-03-02T15:10:00Z', pnl: -100 },
        // Trade C loses and exits at 15:40 (before B closes, so exit-order loop would have overwritten lastLossExitMs!)
        { id: 'C', symbol: 'MSFT', trade_date: '2026-03-02', entry_time: '2026-03-02T15:05:00Z', exit_time: '2026-03-02T15:40:00Z', pnl: -120 },
        // Trade B opens at 15:20 (10 min after A exited!) and closes at 16:00
        { id: 'B', symbol: 'TSLA', trade_date: '2026-03-02', entry_time: '2026-03-02T15:20:00Z', exit_time: '2026-03-02T16:00:00Z', pnl: -250 }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'UTC');
      const revenge = result.scenarios.find(s => s.key === 'revenge');
      expect(revenge).toBeDefined();
      expect(revenge.tradeCount).toBe(1);
      expect(revenge.recoverablePnl).toBe(250);
    });

    it('excludes post-loss cooling-off scenario when post-loss re-entries are net profitable', () => {
      const rows = [
        { id: 't1', symbol: 'AAPL', trade_date: '2026-03-02', entry_time: '2026-03-02T15:00:00Z', exit_time: '2026-03-02T15:10:00Z', pnl: -100 },
        // Re-entry 10m later wins +$400
        { id: 't2', symbol: 'AAPL', trade_date: '2026-03-02', entry_time: '2026-03-02T15:20:00Z', exit_time: '2026-03-02T15:30:00Z', pnl: 400 },
        // Another loss at 16:10
        { id: 't3', symbol: 'MSFT', trade_date: '2026-03-02', entry_time: '2026-03-02T16:00:00Z', exit_time: '2026-03-02T16:10:00Z', pnl: -100 },
        // Re-entry 10m later loses -$150 (net across both post-loss re-entries is +$250!)
        { id: 't4', symbol: 'MSFT', trade_date: '2026-03-02', entry_time: '2026-03-02T16:20:00Z', exit_time: '2026-03-02T16:30:00Z', pnl: -150 }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'UTC');
      expect(result.scenarios.find(s => s.key === 'revenge')).toBeUndefined();
      expect(result.behavioralRecoverablePnl).toBe(0);
    });

    it('keeps oversized_loss in scenarios but excludes it from ex-ante behavioralRecoverablePnl', () => {
      const rows = [
        { id: 't1', symbol: 'AAPL', trade_date: '2026-03-02', entry_time: '2026-03-02T14:30:00Z', exit_time: '2026-03-02T14:40:00Z', pnl: 100 },
        { id: 't2', symbol: 'MSFT', trade_date: '2026-03-03', entry_time: '2026-03-03T14:30:00Z', exit_time: '2026-03-03T14:40:00Z', pnl: 100 },
        { id: 't3', symbol: 'TSLA', trade_date: '2026-03-04', entry_time: '2026-03-04T14:30:00Z', exit_time: '2026-03-04T14:40:00Z', pnl: -1000 }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'UTC');
      expect(result.scenarios.find(s => s.key === 'oversized_loss')).toBeDefined();
      expect(result.maxRecoverablePnl).toBe(1000);
      expect(result.behavioralRecoverablePnl).toBe(0);
    });
  });

  describe('rule context', () => {
    const base = { symbol: 'AAPL', trade_date: '2026-03-02' };

    it('returns per-trade rule fields and conventional defaults', () => {
      const rows = [
        { ...base, id: 'a', entry_time: '2026-03-02T14:35:00Z', exit_time: '2026-03-02T14:50:00Z', pnl: -120, tags: ['fomo', 'sample'], review_type: 'adherence', review_adherence_score: 55, review_followed_plan: null },
        { ...base, id: 'b', entry_time: '2026-03-02T16:05:00Z', exit_time: '2026-03-02T16:20:00Z', pnl: 300, tags: ['fomo'], review_type: 'adherence', review_adherence_score: 92, review_followed_plan: true },
        { ...base, id: 'c', entry_time: '2026-03-02T17:00:00Z', exit_time: '2026-03-02T17:10:00Z', pnl: -80, tags: [], review_type: 'manual_grading', review_adherence_score: 0, review_followed_plan: false },
        { ...base, id: 'd', entry_time: null, exit_time: null, pnl: 10 }
      ];

      const result = WhatIfSimulatorService.analyzeTrades(rows, 'America/New_York');

      expect(result.trades[0]).toEqual(expect.objectContaining({ m: 9 * 60 + 35, tg: ['fomo'], pb: 'broken' }));
      expect(result.trades[1]).toEqual(expect.objectContaining({ m: 11 * 60 + 5, pb: 'followed' }));
      // Manual grading reviews only count as broken through followed_plan = false
      expect(result.trades[2].pb).toBe('broken');
      expect(result.trades[3]).toEqual(expect.objectContaining({ m: null, e: null, x: null, tg: [], pb: null }));

      expect(result.rules.dailyLossLimit).toEqual({ default: 200, source: 'avg_loss', avgLoss: 100 });
      expect(result.rules.maxTradesPerDay).toEqual({ default: 3, maxTradesInADay: 4, tradingDays: 1 });
      expect(result.rules.entryCutoff).toEqual({ defaultMinute: 660, earliestEntryMinute: 575, latestEntryMinute: 720 });
      expect(result.rules.tags).toEqual([{ tag: 'fomo', tradeCount: 2, totalPnl: 180 }]);
      expect(result.rules.playbook).toEqual({ reviewedCount: 3, brokenCount: 2, brokenPnl: -200, scoreThreshold: 70 });
    });

    it('prefers the configured prop-firm daily loss limit as the default', () => {
      const rows = [
        { ...base, id: 'a', entry_time: '2026-03-02T14:35:00Z', exit_time: '2026-03-02T14:50:00Z', pnl: -120 },
        { ...base, id: 'b', entry_time: '2026-03-02T15:35:00Z', exit_time: '2026-03-02T15:50:00Z', pnl: 50 }
      ];
      const result = WhatIfSimulatorService.analyzeTrades(rows, 'UTC', { accountDailyLossLimit: 1500 });
      expect(result.rules.dailyLossLimit).toEqual({ default: 1500, source: 'account_rule', avgLoss: 120 });
    });

    it('returns empty rule context for no trades', () => {
      const result = WhatIfSimulatorService.analyzeTrades([], 'UTC');
      expect(result.rules.dailyLossLimit.default).toBeNull();
      expect(result.rules.tags).toEqual([]);
      expect(result.rules.playbook.reviewedCount).toBe(0);
    });
  });

  describe('rule data query', () => {
    it('joins tags and one playbook review per trade only when rule data is requested', async () => {
      // The trade query and the rule-profile query run in parallel, so route by SQL.
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('account_rule_profiles')) return { rows: [{ max_daily_loss: '750.00' }] };
        return {
          rows: [
            { id: 'a', symbol: 'ES', trade_date: '2026-03-02', entry_time: '2026-03-02T14:35:00Z', exit_time: '2026-03-02T14:50:00Z', pnl: -100, tags: [] },
            { id: 'b', symbol: 'ES', trade_date: '2026-03-02', entry_time: '2026-03-02T15:35:00Z', exit_time: '2026-03-02T15:50:00Z', pnl: 60, tags: [] }
          ]
        };
      });

      const result = await WhatIfSimulatorService.computeSimulation('user-1', {}, { includeRuleData: true });
      const tradeSql = db.query.mock.calls.find(([sql]) => sql.includes('FROM trades t'))[0];
      expect(tradeSql).toContain('LEFT JOIN LATERAL');
      expect(tradeSql).toContain('LIMIT 1');
      expect(tradeSql).toContain('t.tags');
      expect(result.trades).toHaveLength(2);
      expect(result.rules.dailyLossLimit).toEqual({ default: 750, source: 'account_rule', avgLoss: 100 });

      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [] });
      await WhatIfSimulatorService.computeSimulation('user-1', {});
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query.mock.calls[0][0]).not.toContain('trade_playbook_reviews');
    });
  });

  describe('SQL query', () => {
    it('excludes sample trades in SQL and uses a valid fxUsd alias', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { id: '1', symbol: 'NVDA', trade_date: '2026-03-01', entry_time: '2026-03-01T15:00:00Z', exit_time: '2026-03-01T15:10:00Z', pnl: 100 },
          { id: '2', symbol: 'META', trade_date: '2026-03-02', entry_time: '2026-03-02T15:00:00Z', exit_time: '2026-03-02T15:10:00Z', pnl: -350 }
        ]
      });

      const result = await WhatIfSimulatorService.computeSimulation('user-1', {});

      const [sql] = db.query.mock.calls[0];
      expect(sql).toContain("NOT COALESCE('sample' = ANY(t.tags), false)");
      expect(sql).not.toContain('t.t.pnl');
      expect(sql).toContain('t.pnl');
      expect(result.actual.tradeCount).toBe(2);
      expect(result.actual.totalPnl).toBe(-250);
    });
  });
});
