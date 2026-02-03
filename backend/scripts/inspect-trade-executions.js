#!/usr/bin/env node
/**
 * Inspect a trade's executions for calendar debugging.
 * Usage: node scripts/inspect-trade-executions.js <trade_id>
 * Example: node scripts/inspect-trade-executions.js 604f0cc4-00ea-4a59-82ba-38a0706aefeb
 *
 * Run from backend directory. Requires .env with DB_* vars.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/database');

const tradeId = process.argv[2];
if (!tradeId) {
  console.error('Usage: node scripts/inspect-trade-executions.js <trade_id>');
  process.exit(1);
}

async function main() {
  const q = `
    SELECT id, user_id, symbol, side, trade_date, entry_time, exit_time, entry_price, exit_price, quantity, pnl, executions
    FROM trades
    WHERE id = $1
  `;
  const { rows } = await db.query(q, [tradeId]);
  if (rows.length === 0) {
    console.log('No trade found with id:', tradeId);
    return;
  }
  const t = rows[0];
  console.log('Trade:', t.id);
  console.log('  user_id:', t.user_id);
  console.log('  symbol:', t.symbol);
  console.log('  side:', t.side);
  console.log('  trade_date:', t.trade_date);
  console.log('  entry_time:', t.entry_time);
  console.log('  exit_time:', t.exit_time);
  console.log('  entry_price:', t.entry_price);
  console.log('  exit_price:', t.exit_price);
  console.log('  quantity:', t.quantity);
  console.log('  pnl:', t.pnl);
  const execs = t.executions;
  if (!execs) {
    console.log('  executions: null');
    return;
  }
  const arr = typeof execs === 'string' ? JSON.parse(execs) : execs;
  console.log('  executions count:', arr.length);
  arr.forEach((e, i) => {
    console.log('  --- execution', i + 1, '---');
    console.log('    Keys:', Object.keys(e).join(', '));
    console.log('    datetime:', e.datetime);
    console.log('    entryTime:', e.entryTime);
    console.log('    exitTime:', e.exitTime);
    console.log('    exit_time:', e.exit_time);
    console.log('    action:', e.action);
    console.log('    type:', e.type);
    console.log('    pnl:', e.pnl);
    console.log('    profitLoss:', e.profitLoss);
    console.log('    quantity:', e.quantity);
    console.log('    price:', e.price);
    const exitDate = e.exitTime || e.exit_time || e.datetime;
    if (exitDate) {
      try {
        const d = new Date(exitDate);
        console.log('    exitDate (parsed):', d.toISOString(), '-> date:', d.toISOString().slice(0, 10));
      } catch (err) {
        console.log('    exitDate parse error:', err.message);
      }
    }
  });
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
