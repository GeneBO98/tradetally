const { planFuturesImportRepair } = require('../../src/utils/futuresImportRepair');

const importLog = {
  id: 'import', broker: 'tradovate', error_details: { diagnostics: {
    broker_fallback: { selectedBroker: 'tradovate', usedBroker: 'generic' },
    headerAnalysis: { foundHeaders: ['Contract', 'Quantity', 'Price', 'commission'] }
  } }
};
function fixture(overrides = {}) {
  return {
    id: 'trade', import_id: 'import', symbol: 'MBTV6', instrument_type: 'future', side: 'long',
    point_value: '50', commission: '26.7', fees: '26.7', pnl: '194946.6', original_currency: 'USD', exchange_rate: '1',
    executions: [
      { action: 'buy', quantity: 5, price: 83865, datetime: '2026-10-01T10:00:00Z', commission: 13.35, fees: 13.35 },
      { action: 'sell', quantity: 5, price: 84645, datetime: '2026-10-01T11:00:00Z', commission: 13.35, fees: 13.35 }
    ], ...overrides
  };
}

test('repairs the reproduced MBT round trip using allocated source costs once', () => {
  const plan = planFuturesImportRepair(fixture(), importLog);
  expect(plan.after.pointValue).toBe(0.1);
  expect(plan.after.pnl).toBeCloseTo(363.3, 6);
  expect(plan.after.commission).toBeCloseTo(26.7);
  expect(plan.after.fees).toBe(0);
  expect(plan.after.executions[1].realized_pnl).toBeCloseTo(363.3, 6);
});

test('is idempotent after repair', () => {
  const trade = fixture();
  const plan = planFuturesImportRepair(trade, importLog);
  expect(planFuturesImportRepair({ ...trade, point_value: plan.after.pointValue, executions: plan.after.executions }, importLog).skipped).toBe('already_correct');
});

test('uses the prorated cost on a reversal leg instead of the full order commission', () => {
  const trade = fixture({ symbol: 'MNQZ6', side: 'short', point_value: '2', executions: [
    { action: 'sell', quantity: 4, price: 31042.75, datetime: '2026-10-01T10:00:00Z', commission: 2.6, fees: 2.08 },
    { action: 'buy', quantity: 4, price: 31045.75, datetime: '2026-10-01T11:00:00Z', commission: 2.08, fees: 2.08 }
  ] });
  const plan = planFuturesImportRepair(trade, importLog);
  expect(plan.after.pnl).toBeCloseTo(-28.16, 6);
  expect(plan.after.commission).toBeCloseTo(4.16);
});

test('preserves a partly open position and recomputes its realized exit', () => {
  const trade = fixture({ executions: [
    { action: 'buy', quantity: 4, price: 86710, datetime: '2026-10-01T10:00:00Z', commission: 10.68, fees: 10.68 },
    { action: 'sell', quantity: 1, price: 86070, datetime: '2026-10-01T11:00:00Z', commission: 2.67, fees: 2.67, pnl: -32000 }
  ] });
  const plan = planFuturesImportRepair(trade, importLog);
  expect(plan.after.pnl).toBeCloseTo(-69.34, 6);
  expect(plan.after.executions[1].pnl).toBeCloseTo(-69.34, 6);
  expect(plan.after.executions[0].realized_pnl).toBeNull();
});

test.each([
  [{ economics_edited_at: '2026-10-02' }, 'edited_trade'],
  [{ manual_override: true }, 'edited_trade'],
  [{ point_value: '3' }, 'custom_or_unexplained_multiplier'],
  [{ original_currency: 'EUR' }, 'non_usd_economics'],
  [{ exchange_rate: '1.2' }, 'non_usd_economics'],
  [{ symbol: 'ZZTZ6' }, 'unknown_contract'],
  [{ executions: [] }, 'incomplete_execution_history']
])('skips unsafe trade repairs: %s', (overrides, reason) => {
  expect(planFuturesImportRepair(fixture(overrides), importLog).skipped).toBe(reason);
});

test('requires matching import provenance', () => {
  expect(planFuturesImportRepair(fixture(), { ...importLog, id: 'other' }).skipped).toBe('import_mismatch');
  expect(planFuturesImportRepair(fixture(), { ...importLog, broker: 'ibkr' }).skipped).toBe('not_verified_tradovate_generic_fallback');
});

test('does not deduplicate legitimate, separately reported fees', () => {
  const log = { ...importLog, error_details: { diagnostics: { ...importLog.error_details.diagnostics,
    headerAnalysis: { foundHeaders: ['commission', 'Fees'] }
  } } };
  const plan = planFuturesImportRepair(fixture(), log);
  expect(plan.costsRepaired).toBe(false);
  expect(plan.after.pnl).toBeCloseTo(336.6, 6);
});

const directImport = { ...importLog, error_details: { diagnostics: {
  detectedBroker: 'tradovate', selectedBroker: 'tradovate', broker_fallback: null,
  headerAnalysis: { recognizedAs: 'tradovate', foundHeaders: ['Contract', 'FEE', 'commission'] }
} } };

test.each([['NNQU6', 0.2, -5.48], ['NESU6', 0.5, -13.43]])(
  'repairs the legacy multiplier on direct Tradovate %s imports without changing fees',
  (symbol, pointValue, pnl) => {
    const trade = fixture({ symbol, commission: 0, fees: 0.18, executions: [
      { action: 'buy', quantity: 1, price: 29184, datetime: '2026-10-01T10:00:00Z', commission: 0, fees: 0.09 },
      { action: 'sell', quantity: 1, price: 29157.5, datetime: '2026-10-01T11:00:00Z', commission: 0, fees: 0.09 }
    ] });
    const plan = planFuturesImportRepair(trade, directImport);
    expect(plan.after.pointValue).toBe(pointValue);
    expect(plan.after.pnl).toBeCloseTo(pnl, 6);
    expect(plan.costsRepaired).toBe(false);
    expect(plan.after.fees).toBeCloseTo(0.18);
    expect(planFuturesImportRepair({ ...trade, point_value: pointValue, executions: plan.after.executions }, directImport).skipped).toBe('already_correct');
  }
);

test('direct imports never use the generic commission-only repair', () => {
  const log = { ...directImport, error_details: { diagnostics: { ...directImport.error_details.diagnostics,
    headerAnalysis: { recognizedAs: 'tradovate', foundHeaders: ['Contract', 'commission'] }
  } } };
  const plan = planFuturesImportRepair(fixture(), log);
  expect(plan.costsRepaired).toBe(false);
  expect(plan.after.commission).toBeCloseTo(26.7);
  expect(plan.after.fees).toBeCloseTo(26.7);
});

test('direct import multiplier repairs require matching diagnostics and preserve custom values', () => {
  expect(planFuturesImportRepair(fixture({ point_value: 3 }), directImport).skipped).toBe('custom_or_unexplained_multiplier');
  const log = { ...directImport, error_details: { diagnostics: { ...directImport.error_details.diagnostics, selectedBroker: 'generic' } } };
  expect(planFuturesImportRepair(fixture(), log).skipped).toBe('not_verified_tradovate_generic_fallback');
});
