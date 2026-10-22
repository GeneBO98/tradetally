const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');
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

  let roots;
  let chain;
  try {
    roots = trustedRoots.map(pem => new X509Certificate(pem));
  } catch (error) {
    throw new AppleTransactionVerificationError(`Apple root CA could not be parsed: ${error.message}`, 500);
  }
  try {
    chain = header.x5c.map(certificate => new X509Certificate(Buffer.from(certificate, 'base64')));
  } catch (error) {
    throw new AppleTransactionVerificationError(`Apple certificate chain could not be parsed: ${error.message}`);
  }

  const now = Date.now();
  const isCurrentlyValid = certificate =>
    new Date(certificate.validFrom).getTime() <= now && now <= new Date(certificate.validTo).getTime();

  for (let i = 0; i < chain.length; i++) {
    const certificate = chain[i];
    if (!isCurrentlyValid(certificate)) {
      throw new AppleTransactionVerificationError('Apple certificate chain validation failed: certificate is expired or not yet valid');
    }
    if (i > 0 && !certificate.ca) {
      throw new AppleTransactionVerificationError('Apple certificate chain validation failed: issuer is not a CA');
    }
    const issuer = chain[i + 1];
    if (issuer && (!certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey))) {
      throw new AppleTransactionVerificationError('Apple certificate chain validation failed: signature does not match issuer');
    }
  }

  // The last certificate must either be a trusted root or be signed by one
  const last = chain[chain.length - 1];
  const anchored = roots.some(root =>
    isCurrentlyValid(root) &&
    (root.fingerprint256 === last.fingerprint256 ||
      (root.ca && last.checkIssued(root) && last.verify(root.publicKey)))
  );
  if (!anchored) {
    throw new AppleTransactionVerificationError('Apple certificate chain validation failed: chain is not anchored to a trusted Apple root');
  }

  return wrapPem(header.x5c[0]);
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
  if (!payload.expiresDate) {
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
  if (expectedAppAppleId && String(payload.appAppleId || '') !== String(expectedAppAppleId)) {
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
