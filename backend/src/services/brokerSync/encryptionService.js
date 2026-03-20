/**
 * Encryption Service for Broker Credentials
 * Uses AES-256-GCM for secure at-rest encryption of sensitive broker credentials
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const TYPICAL_KEY_MIN_LENGTH = 32;

class EncryptionService {
  constructor() {
    this.encryptionKey = process.env.BROKER_ENCRYPTION_KEY;
  }

  /**
   * Resolve the configured broker encryption key from env/runtime state
   */
  getConfiguredKey() {
    const encryptionKey = process.env.BROKER_ENCRYPTION_KEY ?? this.encryptionKey;
    if (typeof encryptionKey !== 'string') {
      return null;
    }

    const normalizedKey = encryptionKey.trim();
    return normalizedKey || null;
  }

  /**
   * Return a configuration error message when the broker encryption key is invalid
   */
  getConfigurationError() {
    const encryptionKey = this.getConfiguredKey();

    if (!encryptionKey) {
      return 'BROKER_ENCRYPTION_KEY environment variable is not set correct - see .env';
    }

    if (encryptionKey.length < TYPICAL_KEY_MIN_LENGTH) {
      return `BROKER_ENCRYPTION_KEY must be at least ${TYPICAL_KEY_MIN_LENGTH} characters for a typical encryption key`;
    }

    return null;
  }

  /**
   * Validate that the encryption key is properly configured
   */
  validateKey() {
    const configurationError = this.getConfigurationError();
    if (configurationError) {
      throw new Error(configurationError);
    }

    return this.getConfiguredKey();
  }

  /**
   * Derive a key from the master key using PBKDF2
   * This adds an extra layer of security by using a unique salt per encryption
   */
  deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      100000, // iterations
      32, // key length (256 bits)
      'sha256'
    );
  }

  /**
   * Encrypt sensitive data
   * @param {string} plaintext - The data to encrypt
   * @returns {string} - Base64 encoded encrypted data (salt:iv:authTag:ciphertext)
   */
  encrypt(plaintext) {
    if (!plaintext) return null;

    const encryptionKey = this.validateKey();

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from master key using salt
    const key = this.deriveKey(encryptionKey, salt);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get auth tag for integrity verification
    const authTag = cipher.getAuthTag();

    // Combine salt, IV, auth tag, and ciphertext
    // Format: salt(32) + iv(16) + authTag(16) + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return combined.toString('base64');
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;

    const encryptionKey = this.validateKey();

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = combined.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );
      const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

      // Derive key using extracted salt
      const key = this.deriveKey(encryptionKey, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[ENCRYPTION] Decryption failed:', error.message);
      throw new Error('Failed to decrypt data - invalid key or corrupted data');
    }
  }

  /**
   * Check if a value appears to be encrypted (base64 encoded with expected length)
   * @param {string} value - Value to check
   * @returns {boolean}
   */
  isEncrypted(value) {
    if (!value || typeof value !== 'string') return false;

    try {
      const decoded = Buffer.from(value, 'base64');
      // Minimum length: salt(32) + iv(16) + authTag(16) + at least 1 byte ciphertext
      return decoded.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new encryption key (for initial setup)
   * @returns {string} - A secure random key suitable for BROKER_ENCRYPTION_KEY
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash sensitive data for logging/comparison (one-way)
   * @param {string} data - Data to hash
   * @returns {string} - SHA-256 hash prefix (first 12 chars)
   */
  hashForLog(data) {
    if (!data) return 'null';
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash.substring(0, 12) + '...';
  }
}

module.exports = new EncryptionService();
