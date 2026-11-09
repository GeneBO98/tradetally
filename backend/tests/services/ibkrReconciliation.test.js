jest.mock('../../src/config/database', () => ({ connect: jest.fn() }));
const { reconcileRecords, fillFromRecord, contextFromRows } = require('../../src/services/brokerSync/ibkrReconciliation');
const { computeTradePnl } = require('../../src/services/pnlEngine');
const contract = require('../../../tests/fixtures/trading-calculation-contracts.json');

const record = (overrides = {}) => ({ Account: 'U1', AssetClass: 'STK', Symbol: 'AAPL', Conid: '265598',
  DateTime: '20261106;093000', Quantity: '10', Price: '100', Commission: '-1', 'Buy/Sell': 'BUY',
  ExecID: 'E1', TradeID: 'T1', LevelOfDetail: 'EXECUTION', ibkr_report_type: 'activity', ...overrides });
const trade = (overrides = {}) => ({ id: 'trade-1', user_id: 'user-1', account_identifier: 'U1', conid: '265598',
  symbol: 'AAPL', side: 'long', instrument_type: 'stock', exchange_rate: 1,
  executions: [{ execution_id: 'E1', trade_id: 'T1', action: 'buy', quantity: 10, price: 100,
    datetime: '2026-11-06T09:30:00Z', fees: 0, ibkr_commission: null, ibkr_report_type: 'trade_confirmation' }], ...overrides });

test('Activity replaces preliminary commission on the same fill and repeat imports do not change it', () => {
  const existing = trade();
  const first = reconcileRecords([record()], [existing]);
  expect(first.records).toHaveLength(0);
  expect(first.changed).toEqual([existing]);
  expect(existing.executions[0]).toMatchObject({ commission: 1, fees: 0, ibkr_report_type: 'activity' });
  expect(reconcileRecords([record()], [existing]).changed).toHaveLength(0);
  const later = reconcileRecords([record({ Commission: '-8', ibkr_report_type: 'trade_confirmation' })], [existing]);
  expect(later.changed).toHaveLength(0);
  expect(existing.executions[0].commission).toBe(1);
});

test.each([['0', 0], ['0.25', -0.25], ['-2', 2]])('preserves explicit commission %s and rebates', (Commission, expected) => {
  const existing = trade();
  reconcileRecords([record({ Commission })], [existing]);
  expect(existing.executions[0].commission).toBe(expected);
});

test('missing Activity commission keeps the trade pending and preserves estimated costs', () => {
  const existing = trade();
  existing.executions[0].fees = 0.5;
  const result = reconcileRecords([record({ Commission: '' })], [existing]);
  expect(existing.executions[0]).toMatchObject({ fees: 0.5, ibkr_commission: null, ibkr_report_type: 'trade_confirmation' });
  expect(result.warnings[0]).toContain('remains pending');
});

test('never matches across accounts or contracts, even with matching fill IDs', () => {
  const other_account = trade({ account_identifier: 'U2' });
  const other_contract = trade({ conid: '999' });
  const result = reconcileRecords([record()], [other_account, other_contract]);
  expect(result.changed).toHaveLength(0);
  expect(result.records).toHaveLength(1);
});

test('allocates finalized commission once across a reversal split between two trades', () => {
  const first = trade(), second = trade({ id: 'trade-2' });
  first.executions[0].quantity = 4;
  second.executions[0].quantity = 6;
  const result = reconcileRecords([record({ Commission: '-2' })], [first, second]);
  expect(result.changed).toHaveLength(2);
  expect(first.executions[0].commission).toBeCloseTo(0.8);
  expect(second.executions[0].commission).toBeCloseTo(1.2);
});

test('flags changed quantities and explicit corrections without replacing financial data', () => {
  for (const incoming of [record({ Quantity: '11' }), record({ OriginalTradeID: 'T0' })]) {
    const existing = trade();
    const result = reconcileRecords([incoming], [existing]);
    expect(result.records).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(existing.executions[0]).toMatchObject({ fees: 0, ibkr_needs_review: true });
  }
});

test('ambiguous legacy matches require review instead of dropping or duplicating fills', () => {
  const first = trade(), second = trade({ id: 'trade-2' });
  for (const existing of [first, second]) { delete existing.executions[0].execution_id; delete existing.executions[0].trade_id; }
  const result = reconcileRecords([record()], [first, second]);
  expect(result.warnings).toHaveLength(1);
  expect(result.records).toHaveLength(0);
  expect(first.executions[0].ibkr_needs_review).toBe(true);
});

test('deleted fills cannot be resurrected by either report', () => {
  expect(reconcileRecords([record()], [], {}, [trade()])).toMatchObject({ records: [], excluded: 1 });
});

test('normalizes confirmation time in report timezone across DST', () => {
  expect(fillFromRecord(record(), { userTimezone: 'America/New_York' }).datetime).toBe('2026-11-06T14:30:00Z');
  expect(fillFromRecord(record({ DateTime: '20260714;093000' }), { userTimezone: 'America/New_York' }).datetime).toBe('2026-07-14T13:30:00Z');
});

test('uses finalized costs in the shared net P&L contract', () => {
  const fixture = contract.ibkr_confirmation_reconciliation;
  const existing = trade({ executions: fixture.executions.map(e => ({ ...e })) });
  reconcileRecords(fixture.activity_records, [existing]);
  const result = computeTradePnl({ side: 'long', instrumentType: 'stock', executions: existing.executions, timezone: 'UTC' });
  expect(result.aggregate.pnl).toBeCloseTo(fixture.expected.pnl);
  expect(result.aggregate.commission).toBeCloseTo(fixture.expected.commission);
});


test('context tracks remaining quantity after a partial close, independently of stored aggregate quantity', () => {
  const existing = trade({ quantity: 10, exit_price: null, exit_time: null });
  existing.executions.push({ action: 'sell', quantity: 4, price: 110, datetime: '2026-11-06T10:30:00Z' });
  expect(contextFromRows([existing]).existingOpenPositions[0].quantity).toBe(6);
});

test.each([
  ['option', { AssetClass: 'OPT', Symbol: 'AAPL', UnderlyingSymbol: 'AAPL', Strike: '100', Expiry: '20261218', 'Put/Call': 'C', Multiplier: '100' }, { contract_size: 100, strike_price: 100, expiration_date: '2026-12-18', option_type: 'call' }],
  ['future', { AssetClass: 'FUT', Symbol: 'MESZ26', UnderlyingSymbol: 'MES', Multiplier: '5' }, { point_value: 5 }]
])('reconciles %s fills using contract identity and the shared multiplier', (instrument_type, fields, metadata) => {
  const existing = trade({ instrument_type, ...metadata });
  const result = reconcileRecords([record(fields)], [existing]);
  expect(result.changed).toHaveLength(1);
  expect(existing.executions[0].commission).toBe(1);
});

test('reconciles converted legacy fills without mixing source and stored price units', () => {
  const existing = trade({ exchange_rate: 1.25 });
  existing.executions[0].price = 125;
  const result = reconcileRecords([record()], [existing]);
  expect(existing.executions[0]).toMatchObject({ price: 125, commission: 1.25, ibkr_commission: 1 });
  expect(result.price_changed.size).toBe(0);
});

test('date floors work with Date objects without excluding a permitted same-day fill', () => {
  const existing = trade();
  expect(reconcileRecords([record()], [existing], { sync_start_date: new Date('2026-11-06T00:00:00Z') }).changed).toHaveLength(1);
  expect(reconcileRecords([record()], [trade()], { sync_start_date: '2026-11-07' }).changed).toHaveLength(0);
});
