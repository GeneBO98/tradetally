// Repairs TradingView forex imports that stored quote-currency P&L as USD.
// Dry run by default. Pass --apply after reviewing the printed plan.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const db = require('../src/config/database');
const currencyConverter = require('../src/utils/currencyConverter');
const { computeTradePnl } = require('../src/services/pnlEngine');
const { getTradingViewForexInstrumentData } = require('../src/utils/csv/parsers/tradingview');

const usernameArg = process.argv.find(arg => arg.startsWith('--username='));
const importArg = process.argv.find(arg => arg.startsWith('--import-id='));
const username = usernameArg ? usernameArg.slice('--username='.length) : null;
const importId = importArg ? importArg.slice('--import-id='.length) : null;
const shouldApply = process.argv.includes('--apply');

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scale(value, rate) {
  const parsed = numeric(value);
  return parsed === null ? value : parsed * rate;
}

function scaleExecution(execution, rate) {
  const converted = { ...execution };
  for (const field of [
    'price', 'entryPrice', 'entry_price', 'exitPrice', 'exit_price',
    'pnl', 'p_l', 'profit_loss', 'realized_pnl', 'gross_realized_pnl',
    'commission', 'fees'
  ]) {
    if (Object.prototype.hasOwnProperty.call(converted, field)) {
      converted[field] = scale(converted[field], rate);
    }
  }
  return converted;
}

function parseExecutions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function buildPlan(client, user) {
  const params = [user.id];
  let importFilter = '';
  if (importId) {
    params.push(importId);
    importFilter = ` AND t.import_id = $${params.length}`;
  }

  const result = await client.query(`
    SELECT t.id, t.import_id, t.symbol, t.trade_date, t.entry_time, t.exit_time,
           t.entry_price, t.exit_price, t.quantity, t.side, t.commission,
           t.entry_commission, t.exit_commission, t.fees, t.pnl, t.pnl_percent,
           t.executions, t.instrument_type, t.original_currency, t.exchange_rate,
           t.original_entry_price_currency, t.original_exit_price_currency,
           t.original_pnl_currency, t.original_commission_currency,
           t.original_fees_currency, t.updated_at
    FROM trades t
    WHERE t.user_id = $1
      AND lower(t.broker) = 'tradingview'
      ${importFilter}
    ORDER BY t.entry_time, t.id
  `, params);

  const plan = [];
  const skipped = [];

  for (const trade of result.rows) {
    const instrument = getTradingViewForexInstrumentData(trade.symbol);
    if (!instrument) {
      skipped.push({ id: trade.id, symbol: trade.symbol, reason: 'not_forex' });
      continue;
    }

    const quoteCurrency = instrument.quoteCurrency;
    const alreadyConverted = quoteCurrency === 'USD'
      ? trade.instrument_type === 'forex'
      : (
      String(trade.original_currency || '').toUpperCase() === quoteCurrency ||
      trade.original_entry_price_currency !== null ||
      trade.original_pnl_currency !== null
      );
    if (alreadyConverted) {
      skipped.push({ id: trade.id, symbol: trade.symbol, reason: 'already_converted' });
      continue;
    }

    const conversionDate = dateOnly(trade.exit_time) || dateOnly(trade.trade_date) || dateOnly(trade.entry_time);
    const rate = quoteCurrency === 'USD'
      ? 1
      : await currencyConverter.getForexRate(quoteCurrency, 'USD', conversionDate);
    if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      throw new Error(`Invalid ${quoteCurrency}/USD rate for ${conversionDate}: ${rate}`);
    }

    const rawExecutions = parseExecutions(trade.executions);
    const convertedExecutions = rawExecutions.map(execution => scaleExecution(execution, Number(rate)));
    const engine = computeTradePnl({
      tradeId: trade.id,
      side: trade.side,
      instrumentType: 'forex',
      executions: convertedExecutions,
      fallbackCommission: scale(trade.commission, Number(rate)),
      fallbackFees: scale(trade.fees, Number(rate)),
      timezone: user.timezone || 'UTC'
    });

    const aggregate = engine.aggregate;
    const expectedPnl = numeric(trade.pnl) === null ? null : numeric(trade.pnl) * Number(rate);
    if (expectedPnl !== null && aggregate.pnl !== null && Math.abs(aggregate.pnl - expectedPnl) > 0.02) {
      throw new Error(`Execution P&L mismatch for ${trade.id}: expected ${expectedPnl}, rebuilt ${aggregate.pnl}`);
    }

    plan.push({
      id: trade.id,
      importId: trade.import_id,
      symbol: trade.symbol,
      quoteCurrency,
      conversionDate,
      rate: Number(rate),
      oldPnl: numeric(trade.pnl),
      newPnl: aggregate.pnl,
      oldEntryPrice: numeric(trade.entry_price),
      newEntryPrice: aggregate.entry_price,
      oldExitPrice: numeric(trade.exit_price),
      newExitPrice: aggregate.exit_price,
      oldCommission: numeric(trade.commission) || 0,
      newCommission: aggregate.commission,
      oldFees: numeric(trade.fees) || 0,
      newFees: aggregate.fees,
      newPnlPercent: aggregate.pnl_percent,
      executions: engine.annotatedExecutions,
      originalCurrency: quoteCurrency,
      originalEntryPriceCurrency: quoteCurrency === 'USD' ? null : numeric(trade.entry_price),
      originalExitPriceCurrency: quoteCurrency === 'USD' ? null : numeric(trade.exit_price),
      originalPnlCurrency: quoteCurrency === 'USD' ? null : numeric(trade.pnl),
      originalCommissionCurrency: quoteCurrency === 'USD' ? null : numeric(trade.commission),
      originalFeesCurrency: quoteCurrency === 'USD' ? null : numeric(trade.fees),
      newEntryCommission: scale(trade.entry_commission, Number(rate)) || 0,
      newExitCommission: scale(trade.exit_commission, Number(rate)) || 0
    });
  }

  return { plan, skipped };
}

async function main() {
  if (!username) {
    throw new Error('Usage: node scripts/repair_tradingview_forex_import.js --username=<username> [--import-id=<uuid>] [--apply]');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

    const userResult = await client.query(
      'SELECT id, username, timezone FROM users WHERE lower(username) = lower($1) AND is_active = true',
      [username]
    );
    if (userResult.rows.length !== 1) throw new Error(`Active user not found: ${username}`);
    const user = userResult.rows[0];

    const { plan, skipped } = await buildPlan(client, user);
    const totals = plan.reduce((sum, item) => {
      sum.oldPnl += item.oldPnl || 0;
      sum.newPnl += item.newPnl || 0;
      return sum;
    }, { oldPnl: 0, newPnl: 0 });

    console.log(JSON.stringify({
      mode: shouldApply ? 'apply' : 'dry-run',
      username: user.username,
      userId: user.id,
      importId: importId || 'all TradingView imports',
      tradesPlanned: plan.length,
      skipped,
      totals,
      trades: plan.map(item => ({
        id: item.id,
        symbol: item.symbol,
        quoteCurrency: item.quoteCurrency,
        conversionDate: item.conversionDate,
        rate: item.rate,
        oldPnl: item.oldPnl,
        newPnl: item.newPnl
      }))
    }, null, 2));

    if (!shouldApply) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`repair_tradingview_forex:${user.id}`]);
    let updated = 0;
    for (const item of plan) {
      const result = await client.query(`
        UPDATE trades
        SET entry_price = $1,
            exit_price = $2,
            pnl = $3,
            pnl_percent = $4,
            commission = $5,
            entry_commission = $6,
            exit_commission = $7,
            fees = $8,
            executions = $9::jsonb,
            instrument_type = 'forex',
            underlying_asset = $10,
            underlying_symbol = $10,
            original_currency = $11,
            exchange_rate = $12,
            original_entry_price_currency = $13,
            original_exit_price_currency = $14,
            original_pnl_currency = $15,
            original_commission_currency = $16,
            original_fees_currency = $17,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $18
          AND user_id = $19
          AND pnl IS NOT DISTINCT FROM $20
        RETURNING id
      `, [
        item.newEntryPrice,
        item.newExitPrice,
        item.newPnl,
        item.newPnlPercent,
        item.newCommission,
        item.newEntryCommission,
        item.newExitCommission,
        item.newFees,
        JSON.stringify(item.executions),
        getTradingViewForexInstrumentData(item.symbol).underlyingAsset,
        item.originalCurrency,
        item.rate,
        item.originalEntryPriceCurrency,
        item.originalExitPriceCurrency,
        item.originalPnlCurrency,
        item.originalCommissionCurrency,
        item.originalFeesCurrency,
        item.id,
        user.id,
        item.oldPnl
      ]);
      if (result.rowCount !== 1) {
        throw new Error(`Trade changed during repair; nothing committed: ${item.id}`);
      }
      updated++;
    }

    await client.query('DELETE FROM analytics_cache WHERE user_id = $1', [user.id]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'committed', updated, totals }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
