jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../../src/config/database');
const User = require('../../src/models/User');

describe('User.deleteUser', () => {
  test('deletes all user-owned jobs before deleting trades', async () => {
    const calls = [];
    const client = {
      query: jest.fn(async (sql, params) => {
        calls.push({ sql: String(sql), params });
        if (String(sql).includes('SELECT id, username, email, tier')) {
          return {
            rows: [{
              id: 'user-1',
              username: 'trader',
              email: 'user@example.com',
              tier: 'pro',
              created_at: new Date('2025-01-01'),
              trade_count: '3'
            }]
          };
        }
        if (String(sql).includes('DELETE FROM users')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn()
    };
    db.pool.connect.mockResolvedValue(client);

    await expect(User.deleteUser('user-1', { deletionType: 'self' })).resolves.toBe(true);

    const jobIndex = calls.findIndex(call => call.sql.includes('DELETE FROM job_queue'));
    const tradeIndex = calls.findIndex(call => call.sql.includes('DELETE FROM trades WHERE'));
    expect(jobIndex).toBeGreaterThan(-1);
    expect(tradeIndex).toBeGreaterThan(-1);
    expect(jobIndex).toBeLessThan(tradeIndex);

    const jobDelete = calls[jobIndex];
    expect(jobDelete.sql).toMatch(/user_id = \$1/);
    expect(jobDelete.sql).toMatch(/data->>'userId' = \$1/);
    expect(jobDelete.sql).toMatch(/data->>'tradeId'/);
    expect(jobDelete.sql).toMatch(/LOWER\(data->>'email'\)/);
    expect(jobDelete.params).toEqual([
      'user-1',
      ['verification_email', 'password_reset_email', 'account_lockout_email'],
      'user@example.com'
    ]);
    expect(client.release).toHaveBeenCalled();
  });
});
