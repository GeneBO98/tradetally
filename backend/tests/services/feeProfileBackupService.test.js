const { restoreAccountAssignments } = require('../../src/services/feeProfileBackupService');

describe('fee profile backup assignments', () => {
  test('creates missing accounts before assigning normalized identifiers', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await restoreAccountAssignments(client, 'user', 'profile', [' A ', 'A', null, '', 'B']);
    expect(client.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO user_accounts'), ['user', 'profile', ['A', 'B']]);
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE user_accounts'), ['profile', 'user', ['A', 'B']]);
  });
  test.each([{}, 'invalid', ['x'.repeat(256)]])('rejects malformed identifiers before writing', async identifiers => {
    const client = { query: jest.fn() };
    await expect(restoreAccountAssignments(client, 'user', 'profile', identifiers)).rejects.toThrow();
    expect(client.query).not.toHaveBeenCalled();
  });
  test('does not create accounts for empty assignments', async () => {
    const client = { query: jest.fn() };
    await restoreAccountAssignments(client, 'user', 'profile', []);
    expect(client.query).not.toHaveBeenCalled();
  });
});
