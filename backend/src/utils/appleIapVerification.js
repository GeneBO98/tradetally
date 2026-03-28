const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { decodeProtectedHeader, importX509, jwtVerify } = require('jose');

class AppleTransactionVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppleTransactionVerificationError';
    this.code = 'INVALID_APPLE_TRANSACTION';
    this.statusCode = statusCode;
  }
}

function wrapPem(base64Der) {
  const formatted = base64Der.match(/.{1,64}/g)?.join('\n') || base64Der;
  return `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;
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

function verifyCertificateChain(header) {
  if (!header.x5c || header.x5c.length === 0) {
    throw new AppleTransactionVerificationError('JWS header missing x5c certificate chain');
  }

  const trustedRoots = loadTrustedRoots();
  if (trustedRoots.length === 0) {
    throw new AppleTransactionVerificationError('Apple root CA not configured on the server', 500);
  }

  const caStore = forge.pki.createCaStore(trustedRoots);
  const chain = header.x5c.map(certificate => forge.pki.certificateFromPem(wrapPem(certificate)));

  try {
    forge.pki.verifyCertificateChain(caStore, chain);
  } catch (error) {
    throw new AppleTransactionVerificationError(`Apple certificate chain validation failed: ${error.message}`);
  }

  return wrapPem(header.x5c[0]);
}

function getAllowedBundleIds() {
  const configured = process.env.APPLE_BUNDLE_IDS || process.env.APPLE_BUNDLE_ID || 'com.tradetally.app';
  return configured.split(',').map(value => value.trim()).filter(Boolean);
}

async function verifyAppleSignedTransaction(jws, expectedClaims = {}) {
  const {
    expectedTransactionId,
    expectedProductId
  } = expectedClaims;

  const header = decodeProtectedHeader(jws);
  const leafCertPem = verifyCertificateChain(header);
  const publicKey = await importX509(leafCertPem, header.alg);

  let payload;
  try {
    ({ payload } = await jwtVerify(jws, publicKey, {
      algorithms: [header.alg]
    }));
  } catch (error) {
    throw new AppleTransactionVerificationError(`Apple signed transaction verification failed: ${error.message}`);
  }

  if (expectedTransactionId && String(payload.transactionId) !== String(expectedTransactionId)) {
    throw new AppleTransactionVerificationError(`Transaction ID mismatch: expected ${expectedTransactionId}, got ${payload.transactionId}`);
  }

  if (expectedProductId && payload.productId !== expectedProductId) {
    throw new AppleTransactionVerificationError(`Product ID mismatch: expected ${expectedProductId}, got ${payload.productId}`);
  }

  if (!payload.bundleId) {
    throw new AppleTransactionVerificationError('Signed transaction is missing bundleId');
  }

  const allowedBundleIds = getAllowedBundleIds();
  if (!allowedBundleIds.includes(payload.bundleId)) {
    throw new AppleTransactionVerificationError(`Unexpected bundle ID: ${payload.bundleId}`);
  }

  const expectedAppAppleId = process.env.APPLE_APPLE_ID || process.env.APPLE_APP_ID;
  if (expectedAppAppleId && payload.appAppleId && String(payload.appAppleId) !== String(expectedAppAppleId)) {
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
  verifyAppleSignedTransaction
};
