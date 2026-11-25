const encryption = require('../../src/services/brokerSync/encryptionService');
test('long plaintext OpenAI keys are not classified as ciphertext', () => {
  expect(encryption.isEncrypted('sk-proj-' + 'a'.repeat(160))).toBe(false);
  expect(encryption.isEncrypted('sk-' + 'b'.repeat(100))).toBe(false);
});
test('canonical ciphertext still round-trips and malformed base64 is rejected', () => {
  const previous = encryption.encryptionKey;
  encryption.encryptionKey = 'test-only-key-'.repeat(4);
  try {
    const encrypted = encryption.encrypt('an-api-key');
    expect(encryption.isEncrypted(encrypted)).toBe(true);
    expect(encryption.decrypt(encrypted)).toBe('an-api-key');
    expect(encryption.isEncrypted(encrypted + '!')).toBe(false);
    expect(encryption.isEncrypted(encrypted + '=')).toBe(false);
  } finally { encryption.encryptionKey = previous; }
});
