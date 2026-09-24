jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const notificationsController = require('../../src/controllers/notifications.controller');

describe('notification category pagination', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockImplementation(async sql => {
      if (sql.includes('information_schema.tables')) return { rows: [{ exists: true }] };
      if (sql.includes('WITH combined_notifications')) return { rows: [] };
      if (sql.includes('AS total')) return { rows: [{ total: '21' }] };
      throw new Error('Unexpected query');
    });
  });

  test('filters items and count before paging the requested category', async () => {
    const res = { json: jest.fn() };
    const next = jest.fn();
    await notificationsController.getUserNotifications(
      { user: { id: 'user-1' }, query: { category: 'alerts', page: '2', limit: '10' } },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    const itemQuery = db.query.mock.calls.find(([sql]) => sql.includes('WITH combined_notifications'));
    const countQuery = db.query.mock.calls.find(([sql]) => sql.includes('AS total'));
    expect(itemQuery[0]).toContain('WHERE type = ANY($4::text[])');
    expect(itemQuery[1]).toEqual(['user-1', 10, 10,
      ['price_alert', 'portfolio_alert', 'behavioral_alert', 'earnings_announcement']]);
    expect(countQuery[0]).toContain('AND n.type = ANY($2::text[])');
    expect(countQuery[1]).toEqual(['user-1', itemQuery[1][3]]);
    expect(res.json.mock.calls[0][0].pagination).toEqual({
      page: 2, limit: 10, total: 21, totalPages: 3, category: 'alerts'
    });
  });

  test('other excludes every known type and rejects unknown categories', async () => {
    const res = { json: jest.fn() };
    await notificationsController.getUserNotifications(
      { user: { id: 'user-1' }, query: { category: 'other' } },
      res,
      jest.fn()
    );
    const itemQuery = db.query.mock.calls.find(([sql]) => sql.includes('WITH combined_notifications'));
    const countQuery = db.query.mock.calls.find(([sql]) => sql.includes('AS total'));
    expect(itemQuery[0]).toContain('WHERE type <> ALL($4::text[])');
    expect(itemQuery[1][3]).toContain('news_alert');
    expect(countQuery[0]).toContain('AND n.type <> ALL($2::text[])');

    db.query.mockClear();
    const invalidRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await notificationsController.getUserNotifications(
      { user: { id: 'user-1' }, query: { category: 'unexpected' } },
      invalidRes,
      jest.fn()
    );
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('unfiltered requests retain the shared feed', async () => {
    const res = { json: jest.fn() };
    await notificationsController.getUserNotifications(
      { user: { id: 'user-1' }, query: {} },
      res,
      jest.fn()
    );
    const itemQuery = db.query.mock.calls.find(([sql]) => sql.includes('WITH combined_notifications'));
    const countQuery = db.query.mock.calls.find(([sql]) => sql.includes('AS total'));
    expect(itemQuery[0]).not.toContain('WHERE type = ANY($4::text[])');
    expect(itemQuery[1]).toEqual(['user-1', 20, 0]);
    expect(countQuery[1]).toEqual(['user-1']);
    expect(res.json.mock.calls[0][0].pagination.category).toBeNull();
  });
});
