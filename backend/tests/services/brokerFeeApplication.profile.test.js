const { applyBrokerFeeSettingsToTrades } = require('../../src/services/brokerFeeApplicationService');

describe('account fee profile resolution', () => {
  test('uses an assigned profile before legacy broker defaults', () => {
    const feeSummary = { unknownAccounts: new Map(), knownZeroAccounts: new Set() };
    const [trade] = applyBrokerFeeSettingsToTrades({
      broker: 'auto',
      trades: [{
        symbol: 'MESU6',
        broker: 'sierrachart',
        accountIdentifier: 'RTSL0001',
        quantity: 2,
        entryPrice: 100,
        exitPrice: 101,
        pnl: 10,
        commission: 0,
        fees: 0
      }],
      feeRows: [{ broker: 'sierrachart', instrument: 'MES', commission_per_contract: 9 }],
      feeProfileAssignments: [{ account_identifier: 'RTSL0001', fee_profile_id: 'profile-1', is_zero_fee: false }],
      feeProfileRows: [{ profile_id: 'profile-1', broker: 'sierra chart', instrument: 'MES', commission_per_contract: 0.91 }],
      feeSummary
    });

    expect(trade.commission).toBeCloseTo(3.64);
    expect(trade.pnl).toBeCloseTo(6.36);
    expect(feeSummary.unknownAccounts.size).toBe(0);
  });

  test('zero-fee profiles override legacy defaults', () => {
    const feeSummary = { unknownAccounts: new Map(), knownZeroAccounts: new Set() };
    const [trade] = applyBrokerFeeSettingsToTrades({
      broker: 'tradovate',
      trades: [{ symbol: 'MESU6', account_identifier: 'Sim1', quantity: 1, entryPrice: 100, exitPrice: 101, pnl: 5, commission: 0, fees: 0 }],
      feeRows: [{ broker: 'tradovate', instrument: 'MES', commission_per_contract: 2 }],
      feeProfileAssignments: [{ account_identifier: 'Sim1', fee_profile_id: 'profile-2', is_zero_fee: true }],
      feeSummary
    });

    expect(trade.commission).toBe(0);
    expect(trade.fees).toBe(0);
    expect(trade.pnl).toBe(5);
    expect(feeSummary.knownZeroAccounts).toContain('Sim1');
  });

  test('reports unmapped fee state without blocking import', () => {
    const feeSummary = { unknownAccounts: new Map(), knownZeroAccounts: new Set() };
    const [trade] = applyBrokerFeeSettingsToTrades({
      broker: 'sierrachart',
      trades: [{ symbol: 'MESU6', accountIdentifier: 'Unmapped', quantity: 1, commission: 0, fees: 0 }],
      feeRows: [],
      feeProfileAssignments: [],
      feeSummary
    });

    expect(trade.commission).toBe(0);
    expect(feeSummary.unknownAccounts.get('Unmapped')).toMatchObject({
      account_identifier: 'Unmapped',
      trade_count: 1
    });
  });
});
