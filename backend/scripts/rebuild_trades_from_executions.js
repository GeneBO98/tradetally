#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs/promises');
const path = require('path');
const db = require('../src/config/database');
const Trade = require('../src/models/Trade');
const TraderVueComparisonService = require('../src/services/traderVueComparison.service');

function parseArgs(argv) {
  const args = {
    identifier: null,
    compareToTraderVue: false,
    cleanup: true,
    apply: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--') && !args.identifier) {
      args.identifier = arg;
      continue;
    }

    if (arg === '--user' || arg === '--username' || arg === '--email' || arg === '--id') {
      args.identifier = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--compare-tradervue') {
      args.compareToTraderVue = true;
      continue;
    }

    if (arg === '--no-cleanup') {
      args.cleanup = false;
      continue;
    }

    if (arg === '--apply') {
      args.apply = true;
    }
  }

  if (!args.identifier) {
    throw new Error('Usage: node backend/scripts/rebuild_trades_from_executions.js <username|email|userId> [--compare-tradervue] [--no-cleanup]');
  }

  return args;
}

async function resolveUser(identifier) {
  const result = await db.query(`
    SELECT id, username, email, full_name
    FROM users
    WHERE id::text = $1
       OR LOWER(username) = LOWER($1)
       OR LOWER(email) = LOWER($1)
    ORDER BY CASE
      WHEN id::text = $1 THEN 0
      WHEN LOWER(username) = LOWER($1) THEN 1
      WHEN LOWER(email) = LOWER($1) THEN 2
      ELSE 3
    END
    LIMIT 1
  `, [identifier]);

  return result.rows[0] || null;
}

async function loadTrades(userId) {
  const result = await db.query(`
    SELECT
      id,
      symbol,
      side,
      quantity,
      entry_price,
      exit_price,
      entry_time,
      exit_time,
      commission,
      fees,
      pnl,
      broker,
      executions,
      instrument_type,
      strike_price,
      expiration_date,
      option_type,
      underlying_symbol,
      account_identifier,
      contract_month,
      contract_year,
      point_value,
      underlying_asset,
      tick_size,
      contract_size
    FROM trades
    WHERE user_id = $1
    ORDER BY entry_time ASC NULLS LAST, created_at ASC, id ASC
  `, [userId]);

  return result.rows;
}

function normalizeExecutions(rawExecutions) {
  const executions = Array.isArray(rawExecutions) ? rawExecutions : [];
  const seen = new Set();

  return executions
    .filter(Boolean)
    .map((execution) => ({
      action: String(execution.action || execution.side || '').toLowerCase(),
      quantity: Number(execution.quantity || 0),
      price: Number(execution.price ?? execution.entryPrice ?? execution.exitPrice ?? 0),
      datetime: execution.datetime || execution.entryTime || execution.entry_time || execution.exitTime || execution.exit_time || null,
      commission: Number(execution.commission || 0),
      fees: Number(execution.fees || 0)
    }))
    .filter((execution) => execution.datetime && execution.quantity > 0 && Number.isFinite(execution.price))
    .sort((left, right) => new Date(left.datetime) - new Date(right.datetime))
    .filter((execution) => {
      const key = [
        execution.action,
        execution.quantity,
        execution.price,
        execution.datetime,
        execution.commission,
        execution.fees
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildBucketKey(trade) {
  return [
    trade.symbol,
    trade.instrument_type || 'stock',
    trade.strike_price ?? '',
    trade.expiration_date ?? '',
    trade.option_type ?? '',
    trade.underlying_symbol ?? '',
    trade.account_identifier ?? ''
  ].join('|');
}

function flattenTradeExecutions(trades) {
  const buckets = new Map();

  trades.forEach((trade) => {
    const executions = normalizeExecutions(trade.executions);
    if (executions.length === 0) return;

    const key = buildBucketKey(trade);
    if (!buckets.has(key)) {
      buckets.set(key, {
        trade,
        executions: []
      });
    }

    buckets.get(key).executions.push(...executions);
  });

  for (const bucket of buckets.values()) {
    bucket.executions = normalizeExecutions(bucket.executions);
  }

  return [...buckets.values()];
}

function signedQuantity(action, quantity) {
  return action === 'buy' ? quantity : -quantity;
}

function createTradeSeed(templateTrade, firstExecution, side) {
  return {
    symbol: templateTrade.symbol,
    broker: templateTrade.broker,
    side,
    instrument_type: templateTrade.instrument_type || 'stock',
    strike_price: templateTrade.strike_price,
    expiration_date: templateTrade.expiration_date,
    option_type: templateTrade.option_type,
    underlying_symbol: templateTrade.underlying_symbol,
    account_identifier: templateTrade.account_identifier,
    contract_month: templateTrade.contract_month,
    contract_year: templateTrade.contract_year,
    point_value: templateTrade.point_value,
    underlying_asset: templateTrade.underlying_asset,
    tick_size: templateTrade.tick_size,
    contract_size: templateTrade.contract_size,
    entryTime: firstExecution.datetime,
    tradeDate: new Date(firstExecution.datetime).toISOString().split('T')[0],
    executions: []
  };
}

function cloneExecution(execution, quantity) {
  return {
    action: execution.action,
    quantity,
    price: execution.price,
    datetime: execution.datetime,
    commission: execution.commission || 0,
    fees: execution.fees || 0
  };
}

function finalizeTrade(trade) {
  const aggregates = Trade.recalculateFromFills({
    side: trade.side,
    instrument_type: trade.instrument_type,
    contract_size: trade.contract_size || (trade.instrument_type === 'option' ? 100 : null),
    point_value: trade.point_value || null
  }, trade.executions);

  return {
    ...trade,
    quantity: aggregates.quantity,
    entryPrice: aggregates.entry_price,
    exitPrice: aggregates.exit_price,
    entryTime: aggregates.entry_time,
    exitTime: aggregates.exit_time,
    tradeDate: aggregates.trade_date,
    commission: aggregates.commission,
    fees: aggregates.fees,
    pnl: aggregates.pnl ?? 0,
    pnlPercent: aggregates.pnl_percent ?? 0
  };
}

function rebuildBucket(bucket) {
  const rebuilt = [];
  let currentPosition = 0;
  let currentTrade = null;

  const startNewTrade = (execution, side) => {
    currentTrade = createTradeSeed(bucket.trade, execution, side);
  };

  bucket.executions.forEach((execution) => {
    let remainingQty = execution.quantity;

    while (remainingQty > 0) {
      const currentSign = Math.sign(currentPosition);
      const executionSign = Math.sign(signedQuantity(execution.action, 1));

      if (currentPosition === 0 || currentSign === executionSign) {
        if (!currentTrade) {
          startNewTrade(execution, execution.action === 'buy' ? 'long' : 'short');
        }

        currentTrade.executions.push(cloneExecution(execution, remainingQty));
        currentPosition += signedQuantity(execution.action, remainingQty);
        remainingQty = 0;
        continue;
      }

      const closingQty = Math.min(Math.abs(currentPosition), remainingQty);
      currentTrade.executions.push(cloneExecution(execution, closingQty));
      currentPosition += signedQuantity(execution.action, closingQty);
      remainingQty -= closingQty;

      if (currentPosition === 0 && currentTrade) {
        rebuilt.push(finalizeTrade(currentTrade));
        currentTrade = null;
      }

      if (remainingQty > 0 && currentPosition === 0) {
        startNewTrade(execution, execution.action === 'buy' ? 'long' : 'short');
      }
    }
  });

  if (currentTrade && currentTrade.executions.length > 0) {
    rebuilt.push(finalizeTrade(currentTrade));
  }

  return rebuilt;
}

function aggregateTrades(trades) {
  return trades.reduce((summary, trade) => {
    const isOpen = !trade.exitTime && !trade.exitPrice;
    summary.tradeCount += 1;
    summary.openCount += isOpen ? 1 : 0;
    summary.closedCount += isOpen ? 0 : 1;
    summary.quantity += Number(trade.quantity || 0);
    summary.commission += Number(trade.commission || 0);
    summary.fees += Number(trade.fees || 0);
    summary.pnl += Number(trade.pnl || 0);
    return summary;
  }, {
    tradeCount: 0,
    openCount: 0,
    closedCount: 0,
    quantity: 0,
    commission: 0,
    fees: 0,
    pnl: 0
  });
}

function printTradeList(title, trades) {
  console.log(`\n${title}: ${trades.length}`);
  trades.slice(0, 10).forEach((trade, index) => {
    console.log(
      `${index + 1}. ${trade.symbol} ${trade.side} qty=${trade.quantity} ` +
      `entry=${trade.entryPrice ?? 'n/a'} exit=${trade.exitPrice ?? 'n/a'} ` +
      `start=${trade.entryTime ?? 'n/a'} end=${trade.exitTime ?? 'n/a'} pnl=${trade.pnl ?? 'n/a'}`
    );
  });
}

function getTraderVueConfig() {
  const username = (process.env.TRADERVUE_COMPARE_USERNAME || '').trim();
  const password = process.env.TRADERVUE_COMPARE_PASSWORD || '';

  if (!username || !password) {
    throw new Error('TRADERVUE_COMPARE_USERNAME and TRADERVUE_COMPARE_PASSWORD are required for --compare-tradervue');
  }

  return { username, password };
}

function compactIdentifier(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
}

async function compareToTraderVue(user, rebuiltTrades, cleanup) {
  const config = getTraderVueConfig();
  const service = new TraderVueComparisonService(config);
  const importTag = `reb-${compactIdentifier(user.username || user.id)}-${Date.now().toString(36)}`;

  const result = await service.compareImportedTrades(rebuiltTrades, importTag, { cleanup });
  console.log('\nTraderVue Comparison Summary');
  console.log(JSON.stringify(result.comparison.summary, null, 2));
  printTradeList('Only In Rebuilt Trades', result.comparison.details.onlyInTradeTally);
  printTradeList('Only In TraderVue', result.comparison.details.onlyInTraderVue);
}

async function backupTrades(user, currentTrades) {
  const backupDir = path.join(__dirname, '..', 'tmp', 'trade-rebuild-backups');
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${user.username || user.id}-${timestamp}.json`);

  await fs.writeFile(backupPath, JSON.stringify({
    user,
    createdAt: new Date().toISOString(),
    tradeCount: currentTrades.length,
    trades: currentTrades
  }, null, 2));

  return backupPath;
}

async function replaceTrades(user, rebuiltTrades) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM trades WHERE user_id = $1', [user.id]);

    const insertQuery = `
      INSERT INTO trades (
        user_id, symbol, trade_date, entry_time, exit_time, entry_price, exit_price,
        quantity, side, commission, fees, pnl, pnl_percent, notes, is_public, broker,
        executions, instrument_type, strike_price, expiration_date, option_type,
        underlying_symbol, account_identifier, contract_month, contract_year,
        tick_size, point_value, underlying_asset, contract_size, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, false, $15,
        $16::jsonb, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW()
      )
    `;

    for (const trade of rebuiltTrades) {
      await client.query(insertQuery, [
        user.id,
        String(trade.symbol || '').toUpperCase(),
        trade.tradeDate || null,
        trade.entryTime || null,
        trade.exitTime || null,
        trade.entryPrice ?? null,
        trade.exitPrice ?? null,
        trade.quantity ?? null,
        trade.side,
        trade.commission ?? 0,
        trade.fees ?? 0,
        trade.pnl ?? null,
        trade.pnlPercent ?? null,
        'Rebuilt from stored executions',
        trade.broker || null,
        JSON.stringify(trade.executions || []),
        trade.instrument_type || 'stock',
        trade.strike_price ?? null,
        trade.expiration_date ?? null,
        trade.option_type ?? null,
        trade.underlying_symbol ?? null,
        trade.account_identifier ?? null,
        trade.contract_month ?? null,
        trade.contract_year ?? null,
        trade.tick_size ?? null,
        trade.point_value ?? null,
        trade.underlying_asset ?? null,
        trade.contract_size ?? null
      ]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const user = await resolveUser(args.identifier);

  if (!user) {
    throw new Error(`User not found for identifier: ${args.identifier}`);
  }

  const currentTrades = await loadTrades(user.id);
  if (currentTrades.length === 0) {
    throw new Error(`No trades found for ${user.username}`);
  }

  const buckets = flattenTradeExecutions(currentTrades);
  const rebuiltTrades = buckets.flatMap(rebuildBucket);

  console.log(`User: ${user.username} (${user.email})`);
  console.log(`Current trades: ${currentTrades.length}`);
  console.log(`Execution buckets: ${buckets.length}`);
  console.log(`Rebuilt trades: ${rebuiltTrades.length}`);

  console.log('\nCurrent Summary');
  console.log(JSON.stringify(aggregateTrades(currentTrades.map((trade) => ({
    quantity: trade.quantity,
    commission: trade.commission,
    fees: trade.fees,
    pnl: trade.pnl,
    exitTime: trade.exit_time,
    exitPrice: trade.exit_price
  }))), null, 2));

  console.log('\nRebuilt Summary');
  console.log(JSON.stringify(aggregateTrades(rebuiltTrades), null, 2));

  printTradeList('Sample Rebuilt Trades', rebuiltTrades);

  if (args.compareToTraderVue) {
    await compareToTraderVue(user, rebuiltTrades, args.cleanup);
  }

  if (args.apply) {
    const backupPath = await backupTrades(user, currentTrades);
    await replaceTrades(user, rebuiltTrades);
    console.log(`\nApplied rebuilt trades for ${user.username}. Backup saved to ${backupPath}`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    if (error.response) {
      console.error(`HTTP ${error.response.status} ${error.response.statusText || ''}`.trim());
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
