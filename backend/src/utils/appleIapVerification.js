const fs = require('fs');
const path = require('path');
const {
  SignedDataVerifier,
  Environment,
  VerificationException,
  VerificationStatus
} = require('@apple/app-store-server-library');
const verifierCache = new Map();

class AppleTransactionVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppleTransactionVerificationError';
    this.code = 'INVALID_APPLE_TRANSACTION';
    this.statusCode = statusCode;
  }
}

function loadTrustedRoots() {
  const configuredPaths = [];
  const rootPem = process.env.APPLE_IAP_ROOT_CA_PEM;

  if (rootPem && rootPem.trim()) {
    return [rootPem.includes('\\n') ? rootPem.replace(/\\n/g, '\n') : rootPem];
  }

  if (process.env.APPLE_IAP_ROOT_CA_PATH) {
    configuredPaths.push(...process.env.APPLE_IAP_ROOT_CA_PATH.split(',').map(value => value.trim()).filter(Boolean));
  }

  configuredPaths.push(path.join(__dirname, '../certs/apple-root-ca-g3.pem'));

  return configuredPaths
    .filter(filePath => fs.existsSync(filePath))
    .map(filePath => fs.readFileSync(filePath, 'utf8'));
}

function getVerifier(bundleId, environment) {
  const trustedRoots = loadTrustedRoots();
  if (trustedRoots.length === 0) {
    throw new AppleTransactionVerificationError('Apple root CA not configured on the server', 500);
  }

  const appId = Number(process.env.APPLE_APPLE_ID || process.env.APPLE_APP_ID);
  if (environment === Environment.PRODUCTION && (!Number.isSafeInteger(appId) || appId <= 0)) {
    throw new AppleTransactionVerificationError('Apple application ID is not configured', 500);
  }
  const key = JSON.stringify([bundleId, environment, appId, trustedRoots]);
  if (!verifierCache.has(key)) {
    verifierCache.set(key, new SignedDataVerifier(
      trustedRoots.map(root => Buffer.from(root)), true, environment, bundleId,
      environment === Environment.PRODUCTION ? appId : undefined
    ));
  }
  return verifierCache.get(key);
}

function getAllowedBundleIds() {
  const configured = process.env.APPLE_BUNDLE_IDS || process.env.APPLE_BUNDLE_ID || 'com.tradetally.ios';
  return configured.split(',').map(value => value.trim()).filter(Boolean);
}

function getAllowedProductIds() {
  const configured = process.env.APPLE_PRO_PRODUCT_IDS || '';
  return configured.split(',').map(value => value.trim()).filter(Boolean);
}

async function verifyAppleSignedTransaction(jws, expectedClaims = {}) {
  const {
    expectedTransactionId,
    expectedProductId,
    expectedAppAccountToken
  } = expectedClaims;

  let payload;
  try {
    // These untrusted fields select a verifier only. Apple's verifier checks
    // the signature, certificate chain, revocation, bundle, and environment.
    const parts = String(jws).split('.');
    if (parts.length !== 3) throw new Error('Expected a signed JWS transaction');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const unverified = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'ES256') throw new Error('Expected ES256 signature');
    if (!getAllowedBundleIds().includes(unverified.bundleId)) throw new Error('Unexpected bundle ID');
    if (![Environment.PRODUCTION, Environment.SANDBOX].includes(unverified.environment)) {
      throw new Error('Unsupported Apple environment');
    }
    if (process.env.NODE_ENV === 'production' && unverified.environment !== Environment.PRODUCTION &&
        process.env.APPLE_IAP_ALLOW_SANDBOX !== 'true') {
      throw new Error('Sandbox transactions are disabled on this server');
    }
    payload = await getVerifier(unverified.bundleId, unverified.environment).verifyAndDecodeTransaction(jws);
  } catch (error) {
    if (error instanceof AppleTransactionVerificationError) throw error;
    // Apple's VerificationException only carries a numeric status code
    const reason = error instanceof VerificationException
      ? VerificationStatus[error.status] || `status ${error.status}`
      : error.message || error.status;
    throw new AppleTransactionVerificationError(`Apple signed transaction verification failed: ${reason}`);
  }

  if (expectedTransactionId && String(payload.transactionId) !== String(expectedTransactionId)) {
    throw new AppleTransactionVerificationError(`Transaction ID mismatch: expected ${expectedTransactionId}, got ${payload.transactionId}`);
  }

  if (expectedProductId && payload.productId !== expectedProductId) {
    throw new AppleTransactionVerificationError(`Product ID mismatch: expected ${expectedProductId}, got ${payload.productId}`);
  }


  const allowedProductIds = getAllowedProductIds();
  if (allowedProductIds.length === 0) {
    throw new AppleTransactionVerificationError('Apple Pro product IDs are not configured');
  }
  if (!allowedProductIds.includes(payload.productId)) {
    throw new AppleTransactionVerificationError(`Unexpected Apple product ID: ${payload.productId}`);
  }

  if (String(payload.type || '').toLowerCase() !== 'auto-renewable subscription') {
    throw new AppleTransactionVerificationError('Apple transaction is not an auto-renewable subscription');
  }
  if (!payload.expiresDate || !Number.isFinite(new Date(payload.expiresDate).getTime())) {
    throw new AppleTransactionVerificationError('Apple subscription transaction is missing an expiration date');
  }

  if (!payload.appAccountToken ||
      String(payload.appAccountToken).toLowerCase() !== String(expectedAppAccountToken).toLowerCase()) {
    throw new AppleTransactionVerificationError('Apple transaction is not bound to the authenticated user');
  }

  if (!payload.bundleId) {
    throw new AppleTransactionVerificationError('Signed transaction is missing bundleId');
  }

  const allowedBundleIds = getAllowedBundleIds();
  if (!allowedBundleIds.includes(payload.bundleId)) {
    throw new AppleTransactionVerificationError(`Unexpected bundle ID: ${payload.bundleId}`);
  }

  const expectedAppAppleId = process.env.APPLE_APPLE_ID || process.env.APPLE_APP_ID;
  if (process.env.NODE_ENV === 'production' && !expectedAppAppleId) {
    throw new AppleTransactionVerificationError('Apple application ID is not configured');
  }
  // appAppleId is present on notifications/AppTransaction, but is not a
  // required field on StoreKit's JWSTransactionDecodedPayload.
  if (expectedAppAppleId && payload.appAppleId != null && String(payload.appAppleId) !== String(expectedAppAppleId)) {
    throw new AppleTransactionVerificationError(`Unexpected appAppleId: ${payload.appAppleId}`);
  }

  if (payload.revocationDate) {
    throw new AppleTransactionVerificationError('Transaction has been revoked by Apple');
  }

  if (payload.expiresDate && new Date(payload.expiresDate) <= new Date()) {
    throw new AppleTransactionVerificationError('Transaction has expired');
  }

  return payload;
}

module.exports = {
  AppleTransactionVerificationError,
  verifyAppleSignedTransaction,
  getAllowedProductIds
};
