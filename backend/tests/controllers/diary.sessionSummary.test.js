jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/Diary', () => ({
  findByDate: jest.fn()
}));
jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('America/New_York'),
  getDateInTimezone: jest.fn().mockReturnValue('2026-04-10')
}));

const db = require('../../src/config/database');
const Diary = require('../../src/models/Diary');
const { getSessionSummary } = require('../../src/controllers/diary.controller');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('diary.controller getSessionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Diary.findByDate.mockResolvedValue(null);
  });

  it('summarizes real closed trades, excludes sample trades & sample diary entries, uses valid fxUsd SQL, and detects overlapping post-loss re-entries', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            symbol: 'NVDA',
            entry_time: '2026-04-10T14:30:00Z',
            exit_time: '2026-04-10T14:40:00Z',
            pnl: 320
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            symbol: 'TSLA',
            entry_time: '2026-04-10T15:00:00Z',
            exit_time: '2026-04-10T15:10:00Z',
            pnl: -180
          },
          {
            id: '44444444-4444-4444-4444-444444444444',
            symbol: 'META',
            entry_time: '2026-04-10T15:05:00Z', // opened before TSLA loss exited, closes at 15:40
            exit_time: '2026-04-10T15:40:00Z',
            pnl: -50
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            symbol: 'TSLA',
            entry_time: '2026-04-10T15:20:00Z', // 10 min after TSLA loss exited, closes AFTER META loss
            exit_time: '2026-04-10T16:00:00Z',
            pnl: -90
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] }); // non-sample existing diary entry query

    const req = { user: { id: 'user-1' }, query: {} };
    const res = makeRes();

    await getSessionSummary(req, res);

    const [tradesSql] = db.query.mock.calls[0];
    expect(tradesSql).toContain("NOT COALESCE('sample' = ANY(t.tags), false)");
    expect(tradesSql).not.toContain('t.t.pnl');
    expect(tradesSql).toContain('t.pnl');

    const [diarySql] = db.query.mock.calls[1];
    expect(diarySql).toContain('FROM diary_entries');
    expect(diarySql).toContain("NOT COALESCE('sample' = ANY(tags), false)");

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-04-10',
      tradeCount: 4,
      wins: 1,
      losses: 3,
      netPnl: 0,
      winRate: 25,
      bestTrade: { id: '11111111-1111-1111-1111-111111111111', symbol: 'NVDA', pnl: 320 },
      worstTrade: { id: '22222222-2222-2222-2222-222222222222', symbol: 'TSLA', pnl: -180 },
      symbols: ['NVDA', 'TSLA', 'META'],
      postLossReentries: 1,
      existingEntry: null
    }));
  });

  it('rejects malformed or impossible calendar date query parameters', async () => {
    for (const badDate of ['not-a-date', '2026-02-30', '2026-13-01']) {
      const req = { user: { id: 'user-1' }, query: { date: badDate } };
      const res = makeRes();

      await getSessionSummary(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(db.query).not.toHaveBeenCalled();
    }
  });
});
