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

test('retains file-provided costs without warning that imported costs are unknown', () => {
  const feeSummary = { unknownAccounts: new Map(), knownZeroAccounts: new Set() };
  const [trade] = applyBrokerFeeSettingsToTrades({
    broker: 'auto',
    trades: [{ symbol: 'AMD', broker: 'ibkr', quantity: 5, entryPrice: 100, exitPrice: 105, commission: 1.5, fees: 0, pnl: 23.5 }],
    feeSummary
  });
  expect(trade.commission).toBe(1.5);
  expect(trade.pnl).toBe(23.5);
  expect(feeSummary.unknownAccounts.size).toBe(0);
});

test('Sierra Chart profile costs survive the same P&L recalculation used for persistence', () => {
  const { computeTradePnl } = require('../../src/services/pnlEngine');
  const [trade] = applyBrokerFeeSettingsToTrades({
    broker: 'auto',
    trades: [{ symbol: 'MESU6', broker: 'sierrachart', accountIdentifier: 'SIM', quantity: 2, entryPrice: 100, exitPrice: 101, pnl: 10, commission: 0, fees: 0,
      executions: [
        { action: 'buy', quantity: 2, price: 100, datetime: '2026-09-17T14:00:00Z', commission: 0, fees: 0 },
        { action: 'sell', quantity: 2, price: 101, datetime: '2026-09-17T14:01:00Z', commission: 0, fees: 0 }
      ] }],
    feeProfileAssignments: [{ account_identifier: 'SIM', fee_profile_id: 'profile' }],
    feeProfileRows: [{ profile_id: 'profile', broker: 'sierrachart', instrument: 'MES', commission_per_contract: 0.91 }]
  });
  const stored = computeTradePnl({ side: 'long', instrumentType: 'future', pointValue: 5, executions: trade.executions, fallbackCommission: trade.commission, fallbackFees: trade.fees });
  expect(trade.pnl).toBeCloseTo(6.36);
  expect(stored.aggregate.pnl).toBeCloseTo(6.36);
  expect(stored.aggregate.commission).toBeCloseTo(3.64);
});
