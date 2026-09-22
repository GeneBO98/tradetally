const db = require('../config/database');
const { executionIdentityMatches } = require('../utils/csv/dedup');

function executionsOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return executionsOf(JSON.parse(value)); } catch (_) { return []; }
  }
  return [];
}

function executionId(execution) {
  return execution.execution_id ?? execution.executionId ?? execution.ibExecID ?? execution.IBExecID;
}

function isSynthetic(execution) {
  return execution?.synthetic === true;
}

function conidOf(executions) {
  const conid = executions.find(execution => execution?.conid)?.conid;
  return conid ? String(conid) : null;
}

function matches(exclusion, trade) {
  const account = trade.account_identifier ?? trade.accountIdentifier ?? null;
  if (String(exclusion.symbol).toUpperCase() !== String(trade.symbol).toUpperCase()) return false;
  if (String(exclusion.side).toLowerCase() !== String(trade.side).toLowerCase()) return false;

  const excludedExecutions = executionsOf(exclusion.executions);
  const incomingExecutions = executionsOf(trade.executions ?? trade.executionData);
  if ((exclusion.account_identifier || null) !== (account || null)) {
    // Older IBKR rows did not always retain their account identifier. Only a
    // shared broker execution ID can safely bridge that missing metadata.
    if (exclusion.account_identifier && account) return false;
    const ids = new Set(excludedExecutions.map(executionId).filter(Boolean).map(String));
    if (!incomingExecutions.some(execution => ids.has(String(executionId(execution))))) return false;
  }
  // Trades synthesized from IBKR Open Positions take their entry time from
  // each report date, so time never matches again. Identify them by contract,
  // quantity and cost basis instead.
  if (excludedExecutions.some(isSynthetic) && incomingExecutions.some(isSynthetic)) {
    const excludedConid = conidOf(excludedExecutions);
    const incomingConid = trade.conid ? String(trade.conid) : conidOf(incomingExecutions);
    if (excludedConid && incomingConid && excludedConid !== incomingConid) return false;
    return Math.abs(Number(exclusion.quantity) - Number(trade.quantity)) < 0.0001
      && Math.abs(Number(exclusion.entry_price) - Number(trade.entry_price ?? trade.entryPrice)) < 0.01;
  }

  if (excludedExecutions.length && incomingExecutions.length) {
    return incomingExecutions.some(incoming =>
      excludedExecutions.some(excluded => executionIdentityMatches(incoming, excluded)));
  }

  const excludedTime = new Date(exclusion.entry_time).getTime();
  const incomingTime = new Date(trade.entry_time ?? trade.entryTime).getTime();
  return Number.isFinite(excludedTime) && Number.isFinite(incomingTime)
    && Math.abs(excludedTime - incomingTime) < 1000
    && Math.abs(Number(exclusion.entry_price) - Number(trade.entry_price ?? trade.entryPrice)) < 0.01
    && Math.abs(Number(exclusion.quantity) - Number(trade.quantity)) < 0.0001;
}

async function recordDeleted(client, userId, tradeIds) {
  if (!tradeIds.length) return;
  await client.query(`
    INSERT INTO broker_trade_exclusions
      (user_id, source_trade_id, broker_type, account_identifier, symbol, side, entry_time, entry_price, quantity, executions)
    SELECT user_id, id, 'ibkr', account_identifier, symbol, side, entry_time, entry_price, quantity,
           COALESCE(executions, '[]'::jsonb)
    FROM trades
    WHERE user_id = $1 AND id = ANY($2::uuid[])
      AND (broker_connection_id IN (
        SELECT id FROM broker_connections WHERE user_id = $1 AND broker_type = 'ibkr'
      ) OR (broker_connection_id IS NULL AND lower(broker) = 'ibkr' AND import_id IS NULL))
    ON CONFLICT (user_id, source_trade_id) DO NOTHING
  `, [userId, tradeIds]);
}

async function list(userId) {
  const result = await db.query(`
    SELECT id, user_id, broker_type, account_identifier, symbol, side,
           entry_time, entry_price, quantity, executions, created_at
    FROM broker_trade_exclusions WHERE user_id = $1 AND broker_type = 'ibkr'
    ORDER BY created_at DESC
  `, [userId]);
  return result.rows;
}

async function restore(userId, id) {
  const result = await db.query(
    'DELETE FROM broker_trade_exclusions WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount > 0;
}

module.exports = { matches, recordDeleted, list, restore };
