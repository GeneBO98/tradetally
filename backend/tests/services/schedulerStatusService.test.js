jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const SchedulerStatusService = require('../../src/services/schedulerStatusService');

describe('SchedulerStatusService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('persists a bounded failure message while preserving scheduler identity', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const failure = new Error('x'.repeat(5000));

    await SchedulerStatusService.recordFailure('news', failure, new Date('2026-08-27T12:00:00Z'));

    expect(db.query.mock.calls[0][1][0]).toBe('news');
    expect(db.query.mock.calls[0][1][2]).toHaveLength(4000);
  });

  test('maps durable status to camelCase diagnostics', async () => {
    db.query.mockResolvedValue({ rows: [{
      scheduler_name: 'news',
      last_started_at: '2026-08-27T11:00:00Z',
      last_success_at: '2026-08-27T11:05:00Z',
      last_failure_at: '2026-08-26T11:00:00Z',
      last_error: null,
      last_summary: { fetched: 4, errors: 0 },
      updated_at: '2026-08-27T11:05:00Z'
    }] });

    await expect(SchedulerStatusService.get('news')).resolves.toEqual({
      schedulerName: 'news',
      lastStartedAt: '2026-08-27T11:00:00Z',
      lastSuccessAt: '2026-08-27T11:05:00Z',
      lastFailureAt: '2026-08-26T11:00:00Z',
      lastError: null,
      lastSummary: { fetched: 4, errors: 0 },
      updatedAt: '2026-08-27T11:05:00Z'
    });
  });
});
