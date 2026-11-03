jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

const { isIBKRCredentialError, IBKR_CREDENTIAL_ERROR_CODES, IBKR_REAUTH_INSTRUCTIONS } = require('../../src/services/brokerSync/ibkrService');

describe('IBKR credential error classification', () => {
  test('known Flex Web Service credential codes are credential errors', () => {
    for (const code of ['1012', '1014', '1015', '1020']) {
      expect(IBKR_CREDENTIAL_ERROR_CODES.has(code)).toBe(true);
      expect(isIBKRCredentialError(Object.assign(new Error('x'), { errorCode: code }))).toBe(true);
    }
  });

  test('human messages from older syncs are recognised without a code', () => {
    expect(isIBKRCredentialError(new Error('Flex Token is invalid. Please generate a new token in IBKR'))).toBe(true);
    expect(isIBKRCredentialError(new Error('Invalid request. Please check your Flex Token and Query ID.'))).toBe(true);
    expect(isIBKRCredentialError(new Error('Query is invalid. Please verify your Flex Query ID in IBKR.'))).toBe(true);
  });

  test('transient and unrelated failures are not credential errors', () => {
    expect(isIBKRCredentialError(Object.assign(new Error('Timeout waiting for IBKR report generation'), { transient: true, errorCode: 'TIMEOUT' }))).toBe(false);
    expect(isIBKRCredentialError(Object.assign(new Error('Statement is being generated'), { errorCode: '1019' }))).toBe(false);
    expect(isIBKRCredentialError(new Error('timeout of 120000ms exceeded'))).toBe(false);
    expect(isIBKRCredentialError(null)).toBe(false);
  });

  test('reauth instructions tell the user where to generate a token', () => {
    expect(IBKR_REAUTH_INSTRUCTIONS).toMatch(/Flex Web Service Configuration/);
    expect(IBKR_REAUTH_INSTRUCTIONS).toMatch(/Reconnect/);
  });
});
