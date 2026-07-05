const { schemas } = require('../../src/middleware/validation');
const { normalizeEmail } = require('../../src/utils/normalizeEmail');

// Mobile keyboards can inject invisible characters (zero-width space/joiner,
// BOM, soft hyphen) or stray whitespace when typing an email. These pass
// email-format validation but never match the stored address, so login and
// password reset fail with "Invalid credentials" even though the visible
// characters are correct. Issue #362: phone browser login always 401ed while
// desktop worked with the same credentials.
describe('email fields are normalized before validation', () => {
  const password = 'test1234';

  test('login strips zero-width characters from the email', () => {
    const { error, value } = schemas.login.validate({ email: 'user\u200B@example.com', password });

    expect(error).toBeUndefined();
    expect(value.email).toBe('user@example.com');
  });

  test('login trims surrounding whitespace instead of rejecting', () => {
    const { error, value } = schemas.login.validate({ email: ' user@example.com ', password });

    expect(error).toBeUndefined();
    expect(value.email).toBe('user@example.com');
  });

  test('login lowercases the email', () => {
    const { error, value } = schemas.login.validate({ email: 'User@Example.COM', password });

    expect(error).toBeUndefined();
    expect(value.email).toBe('user@example.com');
  });

  test('register and forgotPassword normalize the same way', () => {
    const register = schemas.register.validate({ email: ' User\u200D@example.com', password });
    const forgot = schemas.forgotPassword.validate({ email: 'User\uFEFF@example.com ' });

    expect(register.error).toBeUndefined();
    expect(register.value.email).toBe('user@example.com');
    expect(forgot.error).toBeUndefined();
    expect(forgot.value.email).toBe('user@example.com');
  });

  test('malformed emails are still rejected', () => {
    const { error } = schemas.login.validate({ email: 'not-an-email', password });

    expect(error).toBeDefined();
  });
});

describe('normalizeEmail util', () => {
  test('strips invisible characters, trims, and lowercases', () => {
    expect(normalizeEmail(' User\u200B\u2060@Example.COM\u00AD ')).toBe('user@example.com');
  });

  test('passes non-strings through untouched', () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeNull();
  });
});
