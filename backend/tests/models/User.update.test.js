jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const User = require('../../src/models/User');

describe('User.update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates only allowlisted profile fields with parameterized SQL', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 'user-1',
        full_name: 'Alice Trader',
        timezone: 'America/New_York'
      }]
    });

    const result = await User.update('user-1', {
      full_name: 'Alice Trader',
      timezone: 'America/New_York'
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('full_name = $1');
    expect(sql).toContain('timezone = $2');
    expect(sql).toContain('WHERE id = $3');
    expect(values).toEqual(['Alice Trader', 'America/New_York', 'user-1']);
    expect(result.full_name).toBe('Alice Trader');
  });

  test('rejects unknown fields before building SQL', async () => {
    await expect(User.update('user-1', {
      role: 'admin'
    })).rejects.toThrow('Unsupported user update field: role');

    expect(db.query).not.toHaveBeenCalled();
  });

  test('hashes password updates into password_hash only', async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 'user-1' }]
    });

    await User.update('user-1', {
      password: 'plain-password'
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('password_hash = $1');
    expect(sql).not.toContain('password =');
    expect(values[0]).not.toBe('plain-password');
    expect(values[1]).toBe('user-1');
  });

  test('returns safe user columns for no-op updates', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 'user-1',
        email: 'alice@example.com'
      }]
    });

    await User.update('user-1', {});

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('SELECT id, email, username, full_name');
    expect(sql).not.toContain('two_factor_secret');
    expect(sql).not.toContain('two_factor_backup_codes');
    expect(values).toEqual(['user-1']);
  });
});
