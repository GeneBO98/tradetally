// Reset and email-verification tokens must be stored as sha256 hashes, not
// plaintext. The plaintext is only ever in the email sent to the user — a
// database read must not yield live account-takeover links.

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));
jest.mock('../../src/services/brokerSync/encryptionService', () => ({
  isEncrypted: jest.fn().mockReturnValue(false),
  encrypt: jest.fn(v => `enc(${v})`),
  decrypt: jest.fn(v => String(v).replace(/^enc\(|\)$/g, ''))
}));

const db = require('../../src/config/database');
const crypto = require('crypto');
const User = require('../../src/models/User');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

describe('User token hashing — at-rest protection for reset/verification tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ id: 'user-1', email: 'u@example.com' }] });
  });

  test('updateResetToken stores sha256(token), not the raw token', async () => {
    const rawToken = 'abc123plaintext';
    const expires = new Date(Date.now() + 3600 * 1000);

    await User.updateResetToken('user-1', rawToken, expires);

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(sha256(rawToken));
    expect(params[0]).not.toBe(rawToken);
  });

  test('findByResetToken hashes the input before lookup', async () => {
    const rawToken = 'lookup-token';
    await User.findByResetToken(rawToken);

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(sha256(rawToken));
    expect(params[0]).not.toBe(rawToken);
  });

  test('updateVerificationToken stores sha256(token), not the raw token', async () => {
    await User.updateVerificationToken('user-1', 'verify-raw', new Date());

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(sha256('verify-raw'));
  });

  test('findByVerificationToken hashes the input before lookup', async () => {
    await User.findByVerificationToken('verify-raw');

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(sha256('verify-raw'));
  });

  test('User.create hashes the verificationToken before INSERT', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'new-user' }] });

    await User.create({
      email: 'new@example.com',
      username: 'newuser',
      password: 'password123',
      fullName: 'New User',
      verificationToken: 'raw-signup-token',
      verificationExpires: new Date(),
      isVerified: false
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    // verification_token is the 5th positional value in the INSERT (index 4)
    expect(params[4]).toBe(sha256('raw-signup-token'));
  });
});
