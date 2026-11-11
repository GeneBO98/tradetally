jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const {
  rotateInsights,
  applyToSummary,
  TTL_DAYS,
  COOLDOWN_DAYS
} = require('../../src/services/insightRotation');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-11T15:00:00Z');

const edge = (key, priority) => ({ type: 'edge', key, priority, headline: key });
const shown = (firstDaysAgo, lastDaysAgo = 0) => ({
  first_shown_at: new Date(NOW - firstDaysAgo * DAY).toISOString(),
  last_shown_at: new Date(NOW - lastDaysAgo * DAY).toISOString()
});

describe('rotateInsights', () => {
  test('keeps priority order for never-shown insights', () => {
    const out = rotateInsights([edge('a', 30), edge('b', 26)], new Map(), NOW);
    expect(out.map(i => i.key)).toEqual(['a', 'b']);
  });

  test('a lead shown for a couple of days loses to a fresh insight', () => {
    const out = rotateInsights(
      [edge('a', 30), edge('b', 26)],
      new Map([['a', shown(2)]]),
      NOW
    );
    expect(out.map(i => i.key)).toEqual(['b', 'a']);
  });

  test('retires an insight once it has led for the TTL', () => {
    const out = rotateInsights(
      [edge('scalper', 30), edge('b', 20)],
      new Map([['scalper', shown(TTL_DAYS)]]),
      NOW
    );
    expect(out.map(i => i.key)).toEqual(['b']);
  });

  test('brings a retired insight back after the cooldown', () => {
    const out = rotateInsights(
      [edge('scalper', 30)],
      new Map([['scalper', shown(TTL_DAYS + COOLDOWN_DAYS + 1, TTL_DAYS + COOLDOWN_DAYS)]]),
      NOW
    );
    expect(out.map(i => i.key)).toEqual(['scalper']);
  });

  test('treats an insight unseen for a week as fresh', () => {
    const out = rotateInsights(
      [edge('a', 30), edge('b', 26)],
      new Map([['a', shown(10, 8)]]),
      NOW
    );
    expect(out.map(i => i.key)).toEqual(['a', 'b']);
  });

  test('never retires earnings/news or keyless insights', () => {
    const earnings = { type: 'earnings', key: 'earnings:aapl', priority: 80 };
    const system = { type: 'system', priority: 10 };
    const out = rotateInsights(
      [earnings, system],
      new Map([['earnings:aapl', shown(30)]]),
      NOW
    );
    expect(out).toEqual([earnings, system]);
  });

  test('does not blank the card when every insight is retired', () => {
    const out = rotateInsights(
      [edge('a', 30), edge('b', 26)],
      new Map([['a', shown(10)], ['b', shown(5)]]),
      NOW
    );
    expect(out.map(i => i.key)).toEqual(['b', 'a']);
  });
});

describe('applyToSummary', () => {
  beforeEach(() => db.query.mockReset());

  test('records an impression for the lead rotated insight only', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const payload = { summaries: [edge('a', 30), edge('b', 26)], summary: null };
    const out = await applyToSummary('user-1', payload, { now: NOW });
    expect(out.summary.key).toBe('a');
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][1]).toEqual(['user-1', ['a'], 7, TTL_DAYS + COOLDOWN_DAYS]);
  });

  test('cache warmers do not record impressions', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await applyToSummary('user-1', { summaries: [edge('a', 30)] }, { record: false, now: NOW });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('returns the unrotated payload if the impressions table fails', async () => {
    db.query.mockRejectedValueOnce(new Error('relation does not exist'));
    const payload = { summaries: [edge('a', 30)], summary: edge('a', 30) };
    await expect(applyToSummary('user-1', payload, { now: NOW })).resolves.toBe(payload);
  });
});
