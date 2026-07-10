jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const User = require('../../src/models/User');

describe('User session revocation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('increments session_version to revoke issued access tokens', async () => {
    db.query.mockResolvedValue({ rows: [{ session_version: 4 }] });

    await User.revokeSessions('user-1');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/session_version = session_version \+ 1/),
      ['user-1']
    );
  });

  test('password reset changes the password and session version atomically', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'user-1' }] });

    await User.updatePassword('user-1', 'hashed-password');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/password_hash = \$1/);
    expect(sql).toMatch(/session_version = session_version \+ 1/);
    expect(params).toEqual(['hashed-password', 'user-1']);
  });
});
