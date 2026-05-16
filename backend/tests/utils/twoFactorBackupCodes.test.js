const {
  BACKUP_CODE_COUNT,
  generateBackupCodes,
  findMatchingBackupCodeIndex,
  hashBackupCode,
  hashBackupCodes,
  normalizeBackupCode
} = require('../../src/utils/twoFactorBackupCodes');

describe('twoFactorBackupCodes', () => {
  test('generates ten high-entropy display codes', () => {
    const codes = generateBackupCodes();

    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    codes.forEach(code => {
      expect(code).toMatch(/^[A-F0-9]{16}$/);
    });
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('hashes backup codes and matches normalized user input', async () => {
    const hashes = await hashBackupCodes(['ABCDEF1234567890', '0011223344556677']);

    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe('ABCDEF1234567890');
    expect(hashes[0]).toMatch(/^\$2[aby]\$/);
    await expect(findMatchingBackupCodeIndex(hashes, 'abcd-ef12 3456 7890')).resolves.toBe(0);
  });

  test('continues to consume legacy plaintext codes without accepting partial input', async () => {
    await expect(findMatchingBackupCodeIndex(['ABCDEF1234567890'], 'abcd ef12 3456 7890')).resolves.toBe(0);
    await expect(findMatchingBackupCodeIndex(['ABCDEF1234567890'], 'ABCDEF123456')).resolves.toBe(-1);
  });

  test('normalizes only presentation separators and casing', () => {
    expect(normalizeBackupCode(' abcd-ef12 3456 7890 ')).toBe('ABCDEF1234567890');
  });

  test('rejects blank codes before hashing', async () => {
    await expect(hashBackupCode('   ')).rejects.toThrow('Backup code is required');
  });
});
