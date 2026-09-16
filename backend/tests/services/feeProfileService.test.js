jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn()
}));

const db = require('../../src/config/database');
const service = require('../../src/services/feeProfileService');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

describe('feeProfileService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normalizes profile names, broker aliases, instruments, and rate amounts', () => {
    expect(service.normalizeProfilePayload({
      name: '  Tradeify Rithmic  ',
      notes: '  MES schedule  ',
      isZeroFee: false,
      rates: [{
        broker: 'Sierra Chart',
        instrument: ' mes ',
        commissionPerContract: '0.91',
        commissionPerSide: 0,
        exchangeFeePerContract: 0.1
      }]
    })).toEqual({
      name: 'Tradeify Rithmic',
      notes: 'MES schedule',
      is_zero_fee: false,
      rates: [{
        broker: 'sierrachart',
        instrument: 'MES',
        commission_per_contract: 0.91,
        commission_per_side: 0,
        exchange_fee_per_contract: 0.1,
        nfa_fee_per_contract: 0,
        clearing_fee_per_contract: 0,
        platform_fee_per_contract: 0,
        notes: null
      }]
    });
  });

  test.each([
    ['missing profile name', { rates: [] }],
    ['duplicate rate row', { name: 'Duplicate', rates: [{ broker: 'ibkr' }, { broker: 'Interactive Brokers' }] }],
    ['generic broker', { name: 'Generic', rates: [{ broker: 'auto' }] }],
    ['invalid amount', { name: 'Invalid', rates: [{ broker: 'ibkr', commissionPerSide: 'not-a-number' }] }]
  ])('rejects %s', (_label, payload) => {
    expect(() => service.normalizeProfilePayload(payload)).toThrow();
  });

  test('creates a profile and its rates in one transaction', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: PROFILE_ID, name: 'Tradovate', notes: null, is_zero_fee: false }] })
      .mockResolvedValueOnce({ rows: [] });
    db.withTransaction.mockImplementation(callback => callback(client));

    await expect(service.createProfile(USER_ID, {
      name: 'Tradovate',
      rates: [{ broker: 'tradovate', instrument: '', commission_per_contract: 0.5 }]
    })).resolves.toMatchObject({ id: PROFILE_ID, name: 'Tradovate' });

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[1][1]).toEqual([PROFILE_ID, 'tradovate', '', 0.5, 0, 0, 0, 0, 0, null]);
  });

  test('replaces rates while updating an owned profile', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: PROFILE_ID, name: 'Updated', notes: null, is_zero_fee: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    db.withTransaction.mockImplementation(callback => callback(client));

    await service.updateProfile(USER_ID, PROFILE_ID, {
      name: 'Updated',
      rates: [{ broker: 'sierra chart', instrument: 'MES', nfaFeePerContract: 0.02 }]
    });

    expect(client.query.mock.calls[1][0]).toContain('DELETE FROM fee_profile_rates');
    expect(client.query.mock.calls[2][1][1]).toBe('sierrachart');
  });

  test('assigns only user-owned accounts transactionally', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ACCOUNT_ID }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    db.withTransaction.mockImplementation(callback => callback(client));

    await expect(service.setProfileAccounts(USER_ID, PROFILE_ID, [ACCOUNT_ID]))
      .resolves.toEqual({ profileId: PROFILE_ID, accountIds: [ACCOUNT_ID] });
    expect(client.query.mock.calls[1][0]).toContain('user_accounts');
    expect(client.query.mock.calls[3][1]).toEqual([PROFILE_ID, USER_ID, [ACCOUNT_ID]]);
  });

  test('rejects a foreign account without changing assignments', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    db.withTransaction.mockImplementation(callback => callback(client));

    await expect(service.setProfileAccounts(USER_ID, PROFILE_ID, [ACCOUNT_ID]))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  test('returns account assignments and profile rate rows for import resolution', async () => {
    db.query.mockResolvedValue({ rows: [{
      account_identifier: 'RTSL0001',
      fee_profile_id: PROFILE_ID,
      fee_profile_name: 'Tradeify Rithmic',
      is_zero_fee: false,
      id: 'rate-1',
      broker: 'sierrachart',
      instrument: 'MES',
      commission_per_contract: '0.91'
    }] });

    await expect(service.getImportFeeConfiguration(USER_ID, ['RTSL0001']))
      .resolves.toEqual({
        assignments: [{
          account_identifier: 'RTSL0001',
          fee_profile_id: PROFILE_ID,
          fee_profile_name: 'Tradeify Rithmic',
          is_zero_fee: false
        }],
        feeRows: [expect.objectContaining({ account_identifier: 'RTSL0001', profile_id: PROFILE_ID })]
      });
  });
});
