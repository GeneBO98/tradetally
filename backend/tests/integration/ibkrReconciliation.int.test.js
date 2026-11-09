const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const { reconcileImportRecords } = require('../../src/services/brokerSync/ibkrReconciliation');
const ibkr = require('../../src/services/brokerSync/ibkrService');
const fixture = require('../../../tests/fixtures/trading-calculation-contracts.json').ibkr_confirmation_reconciliation;
const user_id = randomUUID();
let connection_id, trade_id;

beforeAll(async () => {
  await db.query(`INSERT INTO users (id, email, username, password_hash) VALUES ($1,$2,$3,'test')`,
    [user_id, `ibkr430-${user_id}@example.com`, `ibkr_${user_id.slice(0, 8)}`]);
  const connection = await BrokerConnection.create(user_id, { brokerType: 'ibkr', ibkrFlexToken: 'test-token',
    ibkrFlexQueryId: 'activity', ibkr_trade_confirmation_query_id: 'confirmations', autoSyncEnabled: true });
  connection_id = connection.id;
  await BrokerConnection.updateStatus(connection_id, 'active');
});
afterEach(async () => {
  await db.query('DELETE FROM trades WHERE user_id = $1', [user_id]);
  await db.query('DELETE FROM job_queue WHERE user_id = $1', [user_id]);
});
afterAll(async () => {
  try { await db.query('DELETE FROM users WHERE id = $1', [user_id]); }
  finally { await db.pool.end(); }
});
async function savePending() {
  const result = await db.query(`INSERT INTO trades (user_id, symbol, side, quantity, entry_price, exit_price,
    entry_time, exit_time, trade_date, pnl, commission, fees, broker, account_identifier, conid, executions,
    notes, tags, stop_loss, take_profit, chart_url, broker_connection_id)
    VALUES ($1,'AAPL','long',10,100,110,'2026-11-06T09:30:00Z','2026-11-06T10:30:00Z','2026-11-06',100,0,0,
      'ibkr','U1','265598',$2::jsonb,'Original journal',ARRAY['setup'],95,120,'https://example.com/chart.png',$3) RETURNING id`,
  [user_id, JSON.stringify(fixture.executions), connection_id]);
  trade_id = result.rows[0].id;
}

test('finalizes costs without replacing trade identity, journal content, chart, tags, or risk plan', async () => {
  await savePending();
  expect((await db.query('SELECT ibkr_reconciliation_status FROM trades WHERE id=$1', [trade_id])).rows[0].ibkr_reconciliation_status).toBe('pending');
  const context = { userId: user_id, userTimezone: 'UTC' };
  const result = await reconcileImportRecords(fixture.activity_records, context);
  expect(result.updated).toBe(1);
  const stored = (await db.query('SELECT * FROM trades WHERE id=$1', [trade_id])).rows[0];
  expect(stored).toMatchObject({ id: trade_id, notes: 'Original journal', tags: ['setup'],
    chart_url: 'https://example.com/chart.png', ibkr_reconciliation_status: 'reconciled' });
  expect(Number(stored.pnl)).toBe(98);
  expect(Number(stored.commission)).toBe(2);
  expect(Number(stored.stop_loss)).toBe(95);
  expect(Number(stored.take_profit)).toBe(120);
  expect(Number(stored.r_value)).toBeCloseTo(1.96);
  expect((await reconcileImportRecords(fixture.activity_records, context)).updated).toBe(0);
  const late = fixture.activity_records.map(row => ({ ...row, IBCommission: '-8', ibkr_report_type: 'trade_confirmation' }));
  expect((await reconcileImportRecords(late, context)).updated).toBe(0);
  const totals = (await db.query('SELECT SUM(pnl) AS pnl, SUM(commission + fees) AS costs FROM trades WHERE user_id=$1', [user_id])).rows[0];
  expect(Number(totals.pnl)).toBe(98);
  expect(Number(totals.costs)).toBe(2);
  expect((await db.query('SELECT type FROM job_queue WHERE user_id=$1', [user_id])).rows.map(row => row.type)).toContain('quality_backfill');
});

test('confirmation success preserves Activity timestamps, schedule, and backfill retry metadata', async () => {
  await db.query(`UPDATE broker_connections SET last_sync_at='2026-11-01T06:00:00Z', next_scheduled_sync=NOW()+INTERVAL '1 day',
    broker_metadata='{"ibkr_backfill_retry":{"reference_code":"REF-ACTIVITY","retry_at":"2099-01-01","window_end":"2026-11-01"}}'::jsonb WHERE id=$1`, [connection_id]);
  const before = await BrokerConnection.findById(connection_id);
  await BrokerConnection.updateConfirmationSync(connection_id, { success: true });
  const after = await BrokerConnection.findById(connection_id);
  expect(after.lastSyncAt).toEqual(before.lastSyncAt);
  expect(after.nextScheduledSync).toEqual(before.nextScheduledSync);
  expect(after.ibkrBackfillRetry).toEqual(before.ibkrBackfillRetry);
  expect(after.ibkr_last_confirmation_sync_at).toBeTruthy();
  await BrokerConnection.update(connection_id, { ibkr_next_confirmation_sync_at: new Date(0) });
  expect((await BrokerConnection.findDueForConfirmationSync()).some(row => row.id === connection_id)).toBe(true);
  await BrokerConnection.updateConfirmationSync(connection_id, { error: Object.assign(new Error('Query is invalid'), { errorCode: '1014' }) });
  expect((await BrokerConnection.findDueForConfirmationSync()).some(row => row.id === connection_id)).toBe(false);
  expect((await BrokerConnection.findById(connection_id)).connectionStatus).toBe('active');
});

test('omitted confirmation ID preserves it on reconnect; explicit null removes it', async () => {
  const reconnect = { brokerType: 'ibkr', ibkrFlexToken: 'fresh-test-token', ibkrFlexQueryId: 'activity' };
  expect((await BrokerConnection.create(user_id, reconnect)).ibkr_trade_confirmation_query_id).toBe('confirmations');
  expect((await BrokerConnection.create(user_id, { ...reconnect, ibkr_trade_confirmation_query_id: null })).ibkr_trade_confirmation_query_id).toBeNull();
});

test('yesterday snapshot includes a position closed by today’s confirmations', async () => {
  await savePending();
  const snapshot = await ibkr.getSnapshotContext(user_id, '2026-11-06', 'UTC');
  expect(snapshot.existingOpenPositions).toHaveLength(0);
  await db.query(`UPDATE trades SET executions = $2::jsonb, exit_time='2026-11-07T10:30:00Z' WHERE id=$1`,
    [trade_id, JSON.stringify([fixture.executions[0], { ...fixture.executions[1], datetime: '2026-11-07T10:30:00Z' }])]);
  const yesterday = await ibkr.getSnapshotContext(user_id, '2026-11-06', 'UTC');
  const result = ibkr.extractOpenPositionTradesFromRecords([{ Symbol: 'AAPL', Conid: '265598', Account: 'U1', AssetClass: 'STK', Position: '10', CostBasisPrice: '100' }],
    { id: connection_id, userId: user_id }, yesterday, { sectionPresent: true, endDate: '2026-11-06' });
  expect(result.trades).toHaveLength(0);
  expect(yesterday.existingOpenPositions[0].quantity).toBe(10);
});

test('imports intraday opening and closing fills through the real parser and preserves their trade ID on Activity reconciliation', async () => {
  const fs = require('fs');
  const path = require('path');
  const { decodeIBKRFlexReport } = require('../../src/utils/ibkrFlexReport');
  const opening = fs.readFileSync(path.join(__dirname, '../fixtures/ibkr-trade-confirmation.xml'), 'utf8');
  const closing = opening.replace(/<TradeConfirm\s[^>]+\/>/g, '').replace('</TradeConfirms>',
    '<TradeConfirm accountId="U1" assetCategory="STK" symbol="AAPL" conid="265598" currency="USD" dateTime="20261106;103000" quantity="10" price="110" commission="-0.5" buySell="SELL" execID="E3" tradeID="T3" levelOfDetail="EXECUTION" /></TradeConfirms>');
  await BrokerConnection.update(connection_id, { ibkr_trade_confirmation_query_id: 'confirmations' });
  const connection = await BrokerConnection.findById(connection_id, true);
  const request = jest.spyOn(ibkr, 'requestFlexReport').mockResolvedValue({ referenceCode: 'REF-INTRADAY' });
  const fetch = jest.spyOn(ibkr, 'fetchGeneratedReport').mockResolvedValue({ decoded: decodeIBKRFlexReport(opening) });
  try {
    expect(await ibkr.syncConfirmations(connection)).toMatchObject({ imported: 1, failed: 0 });
    const first = (await db.query('SELECT * FROM trades WHERE user_id=$1', [user_id])).rows[0];
    expect(first.ibkr_reconciliation_status).toBe('pending');
    await db.query("UPDATE trades SET notes='Journal while fresh', mae=5, quality_grade='A', quality_score=90 WHERE id=$1", [first.id]);
    expect(await ibkr.syncConfirmations(connection)).toMatchObject({ imported: 0, failed: 0 });
    fetch.mockResolvedValue({ decoded: decodeIBKRFlexReport(closing) });
    expect(await ibkr.syncConfirmations(connection)).toMatchObject({ imported: 0, updated: 1, failed: 0 });
    const closed = (await db.query('SELECT * FROM trades WHERE user_id=$1', [user_id])).rows[0];
    expect(closed.id).toBe(first.id);
    expect(closed.notes).toBe('Journal while fresh');
    expect(closed.mae).toBeNull();
    expect(closed.quality_grade).toBeNull();
    expect(Number(closed.pnl)).toBeCloseTo(99.5);
    const records = [...decodeIBKRFlexReport(opening).trade_records, ...decodeIBKRFlexReport(closing).trade_records]
      .map(row => ({ ...row, IBCommission: '-1', commission: undefined, ibkr_report_type: 'activity' }));
    const reconciled = await reconcileImportRecords(records, { userId: user_id, userTimezone: 'UTC', ibkr_report_type: 'activity' });
    expect(reconciled.updated).toBe(1);
    const final = (await db.query('SELECT * FROM trades WHERE user_id=$1', [user_id])).rows[0];
    expect(final.id).toBe(first.id);
    expect(final.ibkr_reconciliation_status).toBe('reconciled');
    expect(Number(final.pnl)).toBe(97);
    expect(final.notes).toBe('Journal while fresh');
  } finally { request.mockRestore(); fetch.mockRestore(); }
});

test('reconciles a partial close and then closes only the remaining position on the next confirmation sync', async () => {
  const { parseIBKRRecords } = require('../../src/utils/csvParser');
  const { contextFromRows } = require('../../src/services/brokerSync/ibkrReconciliation');
  const opening = fixture.executions[0];
  const partial = { ...fixture.executions[1], quantity: 4, execution_id: 'PARTIAL', trade_id: 'PARTIAL', commission: 0.4 };
  await savePending();
  await db.query(`UPDATE trades SET exit_price=NULL, exit_time=NULL, executions=$2::jsonb WHERE id=$1`,
    [trade_id, JSON.stringify([opening, partial])]);
  const records = [fixture.activity_records[0], { ...fixture.activity_records[1], ExecID: 'PARTIAL', TradeID: 'PARTIAL', Quantity: '4', IBCommission: '-0.4' }];
  await reconcileImportRecords(records, { userId: user_id, userTimezone: 'UTC' });
  const rows = (await db.query('SELECT * FROM trades WHERE id=$1', [trade_id])).rows;
  expect(contextFromRows(rows).existingOpenPositions[0].quantity).toBe(6);
  const parsed = await parseIBKRRecords([{ ...fixture.activity_records[1], ExecID: 'REST', TradeID: 'REST', Quantity: '6', IBCommission: '-0.6', DateTime: '20261106;113000' }],
    { userId: user_id, userTimezone: 'UTC', reconcile_ibkr_records: reconcileImportRecords, ibkr_report_type: 'trade_confirmation' });
  expect(parsed.trades).toHaveLength(1);
  expect(parsed.trades[0]).toMatchObject({ isUpdate: true, existingTradeId: trade_id, exitPrice: 110 });
  const outcome = await ibkr.importTrades(user_id, parsed.trades, {});
  expect(outcome).toMatchObject({ updated: 1, failed: 0 });
  const closed = (await db.query('SELECT * FROM trades WHERE id=$1', [trade_id])).rows[0];
  expect(closed.exit_time).toBeTruthy();
  expect(Number(closed.pnl)).toBeCloseTo(98);
});

test('an opening-only report cannot reopen a manually closed journal trade', async () => {
  await savePending();
  await db.query('UPDATE trades SET executions=$2::jsonb WHERE id=$1', [trade_id, JSON.stringify([fixture.executions[0]])]);
  const result = await reconcileImportRecords([fixture.activity_records[0]], { userId: user_id, userTimezone: 'UTC' });
  expect(result.warnings[0]).toContain('manual close');
  const stored = (await db.query('SELECT * FROM trades WHERE id=$1', [trade_id])).rows[0];
  expect(Number(stored.exit_price)).toBe(110);
  expect(Number(stored.pnl)).toBe(100);
  expect(stored.exit_time).toBeTruthy();
  expect(stored.ibkr_reconciliation_status).toBe('needs_review');
});
