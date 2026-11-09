/** Reconcile broker fills before the round-trip parser discards duplicates.
 * Parsing/preview remains read-only unless the caller explicitly supplies this hook.
 */
const db = require('../../config/database');
const { computeTradePnl } = require('../pnlEngine');
const { parseDateTime, parseDate, parseNumeric } = require('../../utils/csv/shared');
const { localToUTC } = require('../../utils/timezone');
const { executionIdentityMatches } = require('../../utils/csv/dedup');
const { parseIBKRTradeConfirmationInstrumentData } = require('../../utils/csv/parsers/ibkr');

const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const executionsOf = value => typeof value === 'string' ? JSON.parse(value) : (value || []);
function reader(record) {
  const fields = new Map(Object.entries(record).map(([name, value]) => [key(name), value]));
  return (...names) => {
    for (const name of names) {
      const value = fields.get(key(name));
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return '';
  };
}
function fillFromRecord(record, context = {}) {
  const read = reader(record);
  const raw_commission = read('IBCommission', 'Commission', 'Comm/Fee');
  const datetime = parseDateTime(read('DateTime', 'Date/Time', 'TradeDate'));
  const timezone = context.sourceTimezone || context.userTimezone || 'UTC';
  const instrument = parseIBKRTradeConfirmationInstrumentData(record, read('Symbol'));
  return {
    execution_id: String(read('IBExecID', 'ExecID', 'ExecutionID') || ''),
    trade_id: String(read('TradeID') || ''),
    original_trade_id: String(read('OriginalTradeID', 'OrigTradeID') || ''),
    account_identifier: context.selectedAccountId || read('Account', 'AccountID', 'ClientAccountID') || null,
    conid: String(read('Conid') || ''),
    symbol: instrument.underlyingSymbol || read('Symbol'),
    instrument_type: instrument.instrumentType || 'stock',
    strike_price: instrument.strikePrice,
    expiration_date: instrument.expirationDate,
    option_type: instrument.optionType,
    quantity: Math.abs(parseNumeric(read('Quantity'), NaN)),
    price: parseNumeric(read('TradePrice', 'Price'), NaN),
    action: String(read('Buy/Sell', 'BuySell')).toLowerCase(),
    trade_date: parseDate(read('TradeDate', 'DateTime', 'Date/Time')),
    datetime: datetime && !/Z$|[+-]\d\d:\d\d$/.test(datetime) ? (timezone === 'UTC' ? `${datetime}Z` : localToUTC(datetime, timezone)) : datetime,
    ibkr_report_type: context.ibkr_report_type || read('ibkr_report_type') || 'activity',
    ibkr_commission: raw_commission === '' || !Number.isFinite(parseNumeric(raw_commission, NaN)) ? null : (-parseNumeric(raw_commission, 0) || 0),
    // IBKR correction/cancellation rows must never become new opening fills.
    correction: Boolean(read('OriginalTradeID', 'OrigTradeID')) || /cancel|correct/i.test(String(read('TransactionType'))),
    level: String(read('LevelOfDetail')).toUpperCase()
  };
}
function sameContract(trade, fill) {
  if (trade.conid && fill.conid) return String(trade.conid) === fill.conid;
  if (String(trade.symbol).toUpperCase() !== String(fill.symbol).toUpperCase()) return false;
  if ((trade.instrument_type || 'stock') !== fill.instrument_type) return false;
  if (fill.instrument_type !== 'option') return true;
  return Number(trade.strike_price) === Number(fill.strike_price)
    && String(trade.expiration_date instanceof Date ? trade.expiration_date.toISOString() : trade.expiration_date).slice(0, 10) === String(fill.expiration_date).slice(0, 10)
    && trade.option_type === fill.option_type;
}
function hasUnrepresentedClose(trade) {
  if (trade.exit_price == null && trade.exit_time == null) return false;
  const fills = executionsOf(trade.executions);
  if (!fills.length || fills.some(e => !e.action)) return false;
  return Math.abs(fills.reduce((sum, e) => sum + (e.action === 'sell' ? -1 : 1) * Math.abs(Number(e.quantity) || 0), 0)) > 0.000001;
}
function stableMatch(execution, fill) {
  const execution_id = execution.execution_id ?? execution.executionId ?? execution.ibExecID;
  if (execution_id && fill.execution_id) return String(execution_id) === fill.execution_id;
  const trade_id = execution.trade_id ?? execution.tradeId ?? execution.tradeID;
  return Boolean(trade_id && fill.trade_id && String(trade_id) === fill.trade_id);
}

/** Pure matching and allocation; the same broker fill may span a reversal's two trades. */
function reconcileRecords(records, trades, context = {}, exclusions = []) {
  const remaining = [], changed = new Set(), price_changed = new Set(), warnings = [];
  let duplicates = 0, excluded = 0;
  for (const record of records) {
    const fill = fillFromRecord(record, context);
    if (fill.level && !['EXECUTION', 'EXECUTIONS'].includes(fill.level)) { remaining.push(record); continue; }
    const floor = context.sync_start_date instanceof Date ? context.sync_start_date.toISOString().slice(0, 10) : String(context.sync_start_date || '').slice(0, 10);
    const ceiling = context.sync_end_date instanceof Date ? context.sync_end_date.toISOString().slice(0, 10) : String(context.sync_end_date || '').slice(0, 10);
    if (fill.trade_date && ((floor && fill.trade_date < floor) || (ceiling && fill.trade_date > ceiling))) continue;
    const scoped = trades.filter(trade => (trade.account_identifier || null) === fill.account_identifier && sameContract(trade, fill));
    let matches = scoped.flatMap(trade => executionsOf(trade.executions).map((execution, index) => ({ trade, execution, index })))
      .filter(({ execution }) => stableMatch(execution, fill));
    if (fill.correction && !matches.length && fill.original_trade_id) {
      matches = scoped.flatMap(trade => executionsOf(trade.executions).map((execution, index) => ({ trade, execution, index })))
        .filter(({ execution }) => String(execution.trade_id || execution.tradeId || '') === fill.original_trade_id);
    }
    let legacy = false;
    if (!matches.length && !fill.correction) {
      matches = scoped.flatMap(trade => executionsOf(trade.executions).map((execution, index) => ({ trade, execution, index })))
        .filter(({ execution }) => !((execution.execution_id || execution.trade_id) && (fill.execution_id || fill.trade_id)) && executionIdentityMatches(execution, fill));
      legacy = true;
    }
    const excluded_fill = exclusions.some(trade => (trade.account_identifier || null) === fill.account_identifier
      && sameContract(trade, fill) && executionsOf(trade.executions).some(execution => stableMatch(execution, fill) || executionIdentityMatches(execution, fill)));
    if (excluded_fill) { excluded++; continue; }
    if (!matches.length && !fill.correction) { remaining.push({ ...record, ibkr_report_type: fill.ibkr_report_type }); continue; }
    const total_quantity = matches.reduce((sum, match) => sum + Math.abs(Number(match.execution.quantity)), 0);
    const ambiguous = fill.correction || (legacy && matches.length !== 1) || matches.some(({ trade }) => hasUnrepresentedClose(trade))
      || !Number.isFinite(fill.price) || !Number.isFinite(fill.quantity) || !(fill.quantity > 0)
      || Math.abs(total_quantity - fill.quantity) > 0.000001
      || matches.some(({ execution }) => execution.action !== fill.action);
    if (ambiguous) {
      warnings.push(`IBKR fill ${fill.execution_id || fill.trade_id || fill.symbol} needs review: correction, changed quantity/side, an unrepresented manual close, or ambiguous legacy identity. No financial values were replaced.`);
      for (const { trade, execution } of matches) { execution.ibkr_needs_review = true; changed.add(trade); }
      continue;
    }
    duplicates++;
    for (const { trade, execution } of matches) {
      if (execution.ibkr_report_type === 'activity' && fill.ibkr_report_type === 'trade_confirmation') continue;
      const before = JSON.stringify(execution);
      const allocation = Math.abs(Number(execution.quantity)) / fill.quantity;
      const rate = Number(trade.exchange_rate) || 1;
      if (fill.ibkr_commission !== null && Number.isFinite(fill.ibkr_commission)) {
        execution.commission = fill.ibkr_commission * allocation * rate;
        execution.fees = 0;
        execution.ibkr_commission = fill.ibkr_commission * allocation;
      } else if (execution.ibkr_commission === undefined) execution.ibkr_commission = null;
      if (Number(execution.price) !== fill.price * rate && fill.ibkr_report_type === 'activity') {
        execution.price = fill.price * rate;
        price_changed.add(trade);
      }
      if (!(fill.ibkr_report_type === 'activity' && fill.ibkr_commission === null && execution.ibkr_report_type === 'trade_confirmation')) {
        execution.ibkr_report_type = fill.ibkr_report_type;
      } else {
        warnings.push(`IBKR Activity fill ${fill.execution_id || fill.trade_id} has no commission yet; reconciliation remains pending.`);
      }
      if (fill.ibkr_report_type === 'activity' && fill.ibkr_commission !== null) delete execution.ibkr_needs_review;
      execution.execution_id = fill.execution_id || execution.execution_id || null;
      execution.trade_id = fill.trade_id || execution.trade_id || null;
      if (before !== JSON.stringify(execution)) changed.add(trade);
    }
  }
  return { records: remaining, changed: [...changed], price_changed, duplicates, excluded, warnings };
}

function contextFromRows(rows) {
  const existingPositions = {}, existingExecutions = {}, existingOpenPositions = [];
  for (const row of rows) {
    const executions = executionsOf(row.executions).map(e => ({ ...e, account_identifier: row.account_identifier || null }));
    const expiry = row.expiration_date instanceof Date ? row.expiration_date.toISOString().slice(0, 10) : String(row.expiration_date || '').slice(0, 10);
    const position_key = row.instrument_type === 'option' ? `${row.symbol}_${Number(row.strike_price)}_${expiry}_${row.option_type}` : row.symbol;
    const keys = row.conid ? [position_key, `conid_${row.conid}`] : [position_key];
    for (const name of keys) (existingExecutions[name] ||= []).push(...executions);
    if (row.exit_price != null || row.exit_time != null) continue;
    const signed_quantity = executions.reduce((sum, execution) => sum + (execution.action === 'sell' ? -1 : 1) * Math.abs(Number(execution.quantity) || 0), 0);
    const position = { ...row, entryPrice: Number(row.entry_price), entryTime: row.entry_time, tradeDate: row.trade_date,
      commission: Number(row.commission), quantity: executions.length ? Math.abs(signed_quantity) : Number(row.quantity), instrumentType: row.instrument_type,
      strikePrice: row.strike_price, expirationDate: expiry, optionType: row.option_type,
      accountIdentifier: row.account_identifier || null, executions };
    existingOpenPositions.push(position);
    for (const name of keys) existingPositions[name] = position;
  }
  return { existingPositions, existingExecutions, existingOpenPositions };
}

async function persistProjection(client, trade, timezone, price_changed = false) {
  if (hasUnrepresentedClose(trade)) {
    // A journal can contain a manual close without a broker exit fill. Mark it
    // for review rather than letting an opening-only statement reopen it.
    await client.query('UPDATE trades SET executions = $1::jsonb, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(trade.executions), trade.id, trade.user_id]);
    return;
  }
  const result = computeTradePnl({ side: trade.side, instrumentType: trade.instrument_type,
    contractSize: trade.contract_size, pointValue: trade.point_value, executions: trade.executions,
    // Explicit broker zero must not fall back to yesterday's estimated totals.
    fallbackCommission: 0, fallbackFees: 0, timezone });
  const aggregate = result.aggregate;
  const Trade = require('../../models/Trade');
  const r_value = trade.stop_loss != null && aggregate.is_fully_closed && aggregate.exit_price != null
    ? Trade.calculateRValue(aggregate.entry_price, trade.stop_loss, aggregate.exit_price, trade.side, {
      quantity: aggregate.quantity, commission: aggregate.commission, fees: aggregate.fees,
      instrumentType: trade.instrument_type, contractSize: trade.contract_size, pointValue: trade.point_value,
      symbol: trade.symbol, underlyingAsset: trade.underlying_asset
    }) : null;
  const entry_action = trade.side === 'short' ? 'sell' : 'buy';
  const entry_commission = result.annotatedExecutions.filter(e => e.action === entry_action).reduce((sum, e) => sum + Number(e.commission || 0), 0);
  const exit_commission = aggregate.commission - entry_commission;
  await client.query(`UPDATE trades SET executions = $1::jsonb, commission = $2, fees = $3,
    pnl = $4, pnl_percent = $5, r_value = $6, entry_price = $7, exit_price = $8,
    entry_commission = $9, exit_commission = $10,
    original_commission_currency = $11, original_pnl_currency = $12,
    original_entry_price_currency = $16, original_exit_price_currency = $17, original_fees_currency = $18,
    quality_grade = NULL, quality_score = NULL, quality_metrics = NULL,
    mae = CASE WHEN $13 THEN NULL ELSE mae END, mfe = CASE WHEN $13 THEN NULL ELSE mfe END,
    post_exit_mae = CASE WHEN $13 THEN NULL ELSE post_exit_mae END,
    post_exit_mfe = CASE WHEN $13 THEN NULL ELSE post_exit_mfe END, updated_at = NOW()
    WHERE id = $14 AND user_id = $15`, [JSON.stringify(result.annotatedExecutions), aggregate.commission, aggregate.fees,
    aggregate.pnl, aggregate.pnl_percent, r_value, aggregate.entry_price, aggregate.exit_price,
    entry_commission, exit_commission, aggregate.commission / (Number(trade.exchange_rate) || 1),
    aggregate.pnl == null ? null : aggregate.pnl / (Number(trade.exchange_rate) || 1), price_changed, trade.id, trade.user_id,
    aggregate.entry_price == null ? null : aggregate.entry_price / (Number(trade.exchange_rate) || 1),
    aggregate.exit_price == null ? null : aggregate.exit_price / (Number(trade.exchange_rate) || 1),
    aggregate.fees / (Number(trade.exchange_rate) || 1)]);
  Object.assign(trade, aggregate, { executions: result.annotatedExecutions });
}

async function reconcileImportRecords(records, context) {
  if (!records.length) return { records: [], updated: 0, duplicates: 0, excluded: 0, warnings: [], ...contextFromRows([]) };
  const fills = records.map(record => fillFromRecord(record, context));
  const accounts = [...new Set(fills.map(fill => fill.account_identifier).filter(Boolean))];
  const conids = [...new Set(fills.map(fill => fill.conid).filter(Boolean))];
  const symbols = [...new Set(fills.map(fill => String(fill.symbol).toUpperCase()).filter(Boolean))];
  const client = await db.connect();
  let outcome, rows;
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM trades WHERE user_id = $1
      AND LOWER(broker) IN ('ibkr', 'captrader') AND executions IS NOT NULL
      AND (account_identifier = ANY($2::text[]) OR (account_identifier IS NULL AND $3::boolean))
      AND (conid = ANY($4::text[]) OR symbol = ANY($5::text[]))
      ORDER BY id FOR UPDATE`, [context.userId, accounts, fills.some(fill => !fill.account_identifier), conids, symbols]);
    rows = existing.rows.map(row => ({ ...row, executions: executionsOf(row.executions) }));
    const exclusions = await client.query('SELECT * FROM broker_trade_exclusions WHERE user_id = $1 AND broker_type = $2', [context.userId, 'ibkr']);
    outcome = reconcileRecords(records, rows, context, exclusions.rows);
    for (const trade of outcome.changed) await persistProjection(client, trade, context.sourceTimezone || context.userTimezone || 'UTC', outcome.price_changed.has(trade));
    if (outcome.changed.length) {
      for (const type of ['quality_backfill', ...(outcome.price_changed.size ? ['mae_recalc'] : [])]) {
        await client.query(`INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
          SELECT $1::varchar(50), jsonb_build_object('userId', $2::text), 4, $2::uuid, 'pending', NOW()
          WHERE NOT EXISTS (SELECT 1 FROM job_queue WHERE type = $1::varchar(50) AND user_id = $2::uuid AND status = 'pending')`, [type, context.userId]);
      }
      // Transactional DB invalidation; the combined invalidator below also clears memory.
      await client.query('DELETE FROM analytics_cache WHERE user_id = $1', [context.userId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  if (outcome.changed.length) await require('../analyticsCache').invalidate(context.userId);
  return { ...outcome, updated: outcome.changed.length, ...contextFromRows(rows) };
}
module.exports = { reader, fillFromRecord, sameContract, reconcileRecords, reconcileImportRecords, contextFromRows, persistProjection };
