const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 8;
const BACKUP_CODE_HASH_ROUNDS = 10;

function normalizeBackupCode(code) {
  return String(code || '').replace(/[\s-]+/g, '').trim().toUpperCase();
}

function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase()
  );
}

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$/.test(value);
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashBackupCode(code) {
  const normalized = normalizeBackupCode(code);
  if (!normalized) {
    throw new Error('Backup code is required');
  }

  return bcrypt.hash(normalized, BACKUP_CODE_HASH_ROUNDS);
}

async function hashBackupCodes(codes) {
  return Promise.all((codes || []).map(hashBackupCode));
}

async function backupCodeMatches(storedCode, candidateCode) {
  const normalizedCandidate = normalizeBackupCode(candidateCode);
  if (!storedCode || !normalizedCandidate) {
    return false;
  }

  if (isBcryptHash(storedCode)) {
    return bcrypt.compare(normalizedCandidate, storedCode);
  }

  // Legacy plaintext backup codes may still exist. Accept them once, then the
  // caller removes the used value so plaintext disappears naturally over time.
  return timingSafeStringEqual(normalizeBackupCode(storedCode), normalizedCandidate);
}

async function findMatchingBackupCodeIndex(storedCodes, candidateCode) {
  for (let index = 0; index < (storedCodes || []).length; index++) {
    if (await backupCodeMatches(storedCodes[index], candidateCode)) {
      return index;
    }
  }

  return -1;
}

module.exports = {
  BACKUP_CODE_COUNT,
  BACKUP_CODE_BYTES,
  normalizeBackupCode,
  generateBackupCodes,
  hashBackupCode,
  hashBackupCodes,
  backupCodeMatches,
  findMatchingBackupCodeIndex
};
