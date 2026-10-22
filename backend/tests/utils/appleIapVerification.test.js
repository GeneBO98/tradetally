const mockVerify = jest.fn();
jest.mock('@apple/app-store-server-library', () => {
  class VerificationException extends Error {
    constructor(status) { super(); this.status = status; }
  }
  return {
    SignedDataVerifier: jest.fn().mockImplementation(() => ({ verifyAndDecodeTransaction: mockVerify })),
    Environment: { PRODUCTION: 'Production', SANDBOX: 'Sandbox' },
    VerificationException,
    VerificationStatus: { 6: 'INVALID_CERTIFICATE', INVALID_CERTIFICATE: 6 }
  };
});
const { SignedDataVerifier, VerificationException } = require('@apple/app-store-server-library');
const { verifyAppleSignedTransaction } = require('../../src/utils/appleIapVerification');

describe('Apple signed transaction validation', () => {
  const originalEnv = process.env;
  const claims = { expectedTransactionId: 'tx', expectedProductId: 'monthly', expectedAppAccountToken: 'user' };
  let payload;
  const jws = (data, alg = 'ES256') => [Buffer.from(JSON.stringify({ alg })).toString('base64url'),
    Buffer.from(JSON.stringify(data)).toString('base64url'), 'signature'].join('.');
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'production', APPLE_APPLE_ID: '1234',
      APPLE_PRO_PRODUCT_IDS: 'monthly', APPLE_BUNDLE_IDS: 'com.tradetally.ios' };
    payload = { transactionId: 'tx', productId: 'monthly', appAccountToken: 'user',
      type: 'Auto-Renewable Subscription', environment: 'Production', bundleId: 'com.tradetally.ios',
      expiresDate: Date.now() + 86400000 };
    mockVerify.mockImplementation(async () => payload);
  });
  afterAll(() => { process.env = originalEnv; });

  test('uses Apple verification with the bundled root and accepts transactions without appAppleId', async () => {
    expect(await verifyAppleSignedTransaction(jws(payload), claims)).toEqual(payload);
    expect(mockVerify).toHaveBeenCalled();
    expect(SignedDataVerifier).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Buffer)]), true,
      'Production', 'com.tradetally.ios', 1234);
  });

  test.each(['Xcode', 'LocalTesting', 'Sandbox'])('rejects %s transactions in production', async (environment) => {
    await expect(verifyAppleSignedTransaction(jws({ ...payload, environment }), claims)).rejects.toThrow();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test('rejects a forged signature and preserves account ownership', async () => {
    mockVerify.mockRejectedValueOnce(new Error('invalid signature'));
    await expect(verifyAppleSignedTransaction(jws(payload), claims)).rejects.toThrow('invalid signature');
    payload.appAccountToken = 'another-user';
    await expect(verifyAppleSignedTransaction(jws(payload), claims)).rejects.toThrow('not bound');
  });

  test('reports Apple verification failures by status name', async () => {
    mockVerify.mockRejectedValueOnce(new VerificationException(6));
    await expect(verifyAppleSignedTransaction(jws(payload), claims))
      .rejects.toThrow('Apple signed transaction verification failed: INVALID_CERTIFICATE');
  });

  test.each([0, 'invalid', Date.now() - 1000])('rejects invalid or expired expiration %s', async (expiresDate) => {
    payload.expiresDate = expiresDate;
    await expect(verifyAppleSignedTransaction(jws(payload), claims)).rejects.toThrow();
  });
});
