const {
  buildExistingTradeIndex,
  classifyImportTrade
} = require('../../src/utils/importDuplicateDetection');

function existingRow(overrides = {}) {
  return {
    id: overrides.id || 'existing-1',
    symbol: 'MES',
    entry_time: '2026-09-08T14:02:58.000Z',
    entry_price: '7688.50000000',
    exit_price: '7688.00000000',
    pnl: '-2.50000000',
    quantity: '1.00000000',
    side: 'long',
    executions: [{
      datetime: '2026-09-08T14:02:58.000Z',
      entryTime: '2026-09-08T14:02:58.000Z',
      entryPrice: 7688.5,
      quantity: 1,
      side: 'long'
    }],
    instrument_type: 'future',
    conid: null,
    account_identifier: 'RTSL00000000000',
    ...overrides
  };
}

function newTrade(overrides = {}) {
  return {
    symbol: 'MES',
    entryTime: '2026-09-08T14:02:58.000Z',
    exitTime: '2026-09-08T14:03:02.000Z',
    entryPrice: 7688.5,
    exitPrice: 7688,
    pnl: -2.5,
    quantity: 1,
    side: 'long',
    instrumentType: 'future',
    accountIdentifier: 'RTSL00000000000',
    executionData: [{
      datetime: '2026-09-08T14:02:58.000Z',
      quantity: 1,
      price: 7688.5
    }],
    ...overrides
  };
}

describe('account-aware import duplicate detection', () => {
  test('does not dedupe identical executions across different accounts', () => {
    const index = buildExistingTradeIndex([existingRow({ account_identifier: 'RTSL00000000000' })]);
    const trade = newTrade({ accountIdentifier: 'SUMD00000000001' });
    expect(classifyImportTrade(trade, index, null).is_duplicate).toBe(false);
  });

  test('dedupes identical executions within the same account', () => {
    const index = buildExistingTradeIndex([existingRow({ account_identifier: 'RTSL00000000000' })]);
    const trade = newTrade({ accountIdentifier: 'RTSL00000000000' });
    expect(classifyImportTrade(trade, index, null).is_duplicate).toBe(true);
  });

  test('trades without an account keep legacy cross-account matching', () => {
    const index = buildExistingTradeIndex([existingRow({ account_identifier: 'RTSL00000000000' })]);
    const trade = newTrade({ accountIdentifier: null });
    expect(classifyImportTrade(trade, index, null).is_duplicate).toBe(true);
  });

  test('partial-close update target is scoped to the same account', () => {
    const index = buildExistingTradeIndex([
      existingRow({ id: 'other-account', account_identifier: 'SUMD00000000001' })
    ]);
    const trade = newTrade({
      accountIdentifier: 'RTSL00000000000',
      executionData: [
        { datetime: '2026-09-08T14:02:58.000Z', quantity: 1, price: 7688.5 },
        { datetime: '2026-09-08T14:03:02.000Z', quantity: 1, price: 7688 }
      ]
    });
    const result = classifyImportTrade(trade, index, null);
    expect(result.is_duplicate).toBe(false);
    expect(result.update_target).toBeNull();
  });
});
