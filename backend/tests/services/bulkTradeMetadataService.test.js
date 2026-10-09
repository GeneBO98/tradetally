jest.mock('../../src/config/database', () => ({ withTransaction: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({ rebuildUserGroupsSafe: jest.fn() }));

const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const OptionStrategyGroupingService = require('../../src/services/optionStrategyGroupingService');
const service = require('../../src/services/bulkTradeMetadataService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TRADE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRADE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function ownedClient(...ownedRows) {
  const client = { query: jest.fn() };
  client.query
    .mockResolvedValueOnce({ rows: ownedRows })
    .mockResolvedValueOnce({ rowCount: ownedRows.length });
  db.withTransaction.mockImplementation(callback => callback(client));
  return client;
}

describe('bulkTradeMetadataService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normalizes supported partial updates and deduplicates trade IDs', () => {
    expect(service.normalizeRequest([TRADE_A, TRADE_A], { setup: '  Breakout  ', strategy: null })).toEqual({
      ids: [TRADE_A],
      updates: { setup: 'Breakout', strategy: null }
    });
  });

  test('preserves name case while trimming and accepts maximum lengths', () => {
    const maxSetup = 'S'.repeat(100);
    const maxStrategy = 'M'.repeat(100);
    const maxAccount = 'A'.repeat(50);
    expect(service.normalizeRequest([TRADE_A], { setup: maxSetup, strategy: ` ${maxStrategy} `, account_identifier: maxAccount })).toEqual({
      ids: [TRADE_A],
      updates: { setup: maxSetup, strategy: maxStrategy, account_identifier: maxAccount }
    });
  });

  test.each([
    ['empty ID array', [], { setup: 'A' }],
    ['missing ID array', null, { setup: 'A' }],
    ['non-string ID', [123], { setup: 'A' }],
    ['malformed ID', ['not-a-uuid'], { setup: 'A' }],
    ['batch above 500', Array(501).fill(TRADE_A), { setup: 'A' }],
    ['empty updates', [TRADE_A], {}],
    ['missing updates', [TRADE_A], undefined],
    ['unknown field', [TRADE_A], { notes: 'nope' }],
    ['unknown field alongside allowed', [TRADE_A], { setup: 'A', symbol: 'X' }],
    ['blank setup', [TRADE_A], { setup: ' ' }],
    ['blank strategy', [TRADE_A], { strategy: '' }],
    ['non-string setup', [TRADE_A], { setup: 42 }],
    ['setup over 100 chars', [TRADE_A], { setup: 'S'.repeat(101) }],
    ['strategy over 100 chars', [TRADE_A], { strategy: 'M'.repeat(101) }],
    ['account identifier over 50 chars', [TRADE_A], { account_identifier: 'A'.repeat(51) }]
  ])('rejects %s', (_name, ids, updates) => {
    expect(() => service.normalizeRequest(ids, updates)).toThrow();
  });

  test('updates all owned trades atomically and invalidates derived data', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'account-row' }] })
      .mockResolvedValueOnce({ rows: [{ id: TRADE_A }, { id: TRADE_B }] })
      .mockResolvedValueOnce({ rowCount: 2 });
    db.withTransaction.mockImplementation(callback => callback(client));

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A, TRADE_B], {
      account_identifier: 'ACC-1', strategy: null
    })).resolves.toEqual({ updated_trade_count: 2 });

    const updateCall = client.query.mock.calls[2];
    expect(updateCall[0]).toContain('manual_override = true');
    expect(updateCall[0]).toContain('strategy_confidence = NULL');
    expect(updateCall[0]).toContain("classification_method = 'manual'");
    expect(updateCall[0]).toContain('updated_at = CURRENT_TIMESTAMP');
    expect(updateCall[1]).toEqual([USER_ID, [TRADE_A, TRADE_B], 'ACC-1', null, expect.any(String)]);
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).toHaveBeenCalledWith(USER_ID, 'bulk trade metadata update');
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith(USER_ID);
  });

  test('strategy Set marks manual control with full confidence and fresh metadata', async () => {
    const client = ownedClient({ id: TRADE_A });

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A], { strategy: 'Momentum' }))
      .resolves.toEqual({ updated_trade_count: 1 });

    const updateCall = client.query.mock.calls[1];
    expect(updateCall[0]).toContain('strategy_confidence = 100');
    expect(updateCall[0]).not.toContain('strategy_confidence = NULL');
    const metadata = JSON.parse(updateCall[1][3]);
    expect(metadata).toMatchObject({ userProvided: true, cleared: false });
    // Setup/account untouched when not requested
    expect(updateCall[0]).not.toContain('setup =');
    expect(updateCall[0]).not.toContain('account_identifier =');
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).not.toHaveBeenCalled();
  });

  test.each([
    ['account clear', { account_identifier: null }, true],
    ['setup clear', { setup: null }, false],
    ['strategy clear', { strategy: null }, false]
  ])('applies %s without touching other fields', async (_name, updates, regroupExpected) => {
    const client = ownedClient({ id: TRADE_A });

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A], updates))
      .resolves.toEqual({ updated_trade_count: 1 });

    const updateCall = client.query.mock.calls[1];
    const assignedColumns = updateCall[0];
    for (const field of ['account_identifier', 'setup', 'strategy']) {
      const assignsField = new RegExp(`\\b${field} =`).test(assignedColumns);
      if (updates.hasOwnProperty(field)) {
        expect(assignsField).toBe(true);
      } else {
        expect(assignsField).toBe(false);
      }
    }
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).toHaveBeenCalledTimes(regroupExpected ? 1 : 0);
    expect(AnalyticsCache.invalidate).toHaveBeenCalledWith(USER_ID);
  });

  test('account clear does not require an account destination', async () => {
    const client = ownedClient({ id: TRADE_A });

    await service.bulkUpdateMetadata(USER_ID, [TRADE_A], { account_identifier: null });

    // Only the owned-trades SELECT ran before the UPDATE — no account lookup
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain('FROM trades');
  });

  test('deduplicates IDs for ownership checks and counts', async () => {
    const client = ownedClient({ id: TRADE_A }, { id: TRADE_B });

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A, TRADE_B, TRADE_A, TRADE_B], { setup: 'Gap' }))
      .resolves.toEqual({ updated_trade_count: 2 });

    const ownedCall = client.query.mock.calls[0];
    expect(ownedCall[1]).toEqual([USER_ID, [TRADE_A, TRADE_B]]);
  });

  test('rejects the entire batch when any trade is not owned', async () => {
    const client = ownedClient({ id: TRADE_A });

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A, TRADE_B], { setup: 'Gap' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
  });

  test('rolls back and reports nothing when the update fails', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: TRADE_A }, { id: TRADE_B }] })
      .mockRejectedValueOnce(new Error('simulated update failure'));
    db.withTransaction.mockImplementation(async callback => {
      try {
        return await callback(client);
      } catch (error) {
        throw error;
      }
    });

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A, TRADE_B], { setup: 'Gap' }))
      .rejects.toThrow('simulated update failure');
    expect(AnalyticsCache.invalidate).not.toHaveBeenCalled();
    expect(OptionStrategyGroupingService.rebuildUserGroupsSafe).not.toHaveBeenCalled();
  });

  test('rejects archived, missing, or foreign accounts before touching trades', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db.withTransaction.mockImplementation(callback => callback(client));

    await expect(service.bulkUpdateMetadata(USER_ID, [TRADE_A], { account_identifier: 'OTHER' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});
