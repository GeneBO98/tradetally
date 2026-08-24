const db = require('../config/database');
const AnalyticsCache = require('./analyticsCache');

const RATIO_TOLERANCE = 0.000001;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAction(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveBasisQuantity(trade) {
  const executions = Array.isArray(trade?.executions) ? trade.executions : [];
  const tradeSide = normalizeAction(trade?.side);

  if (executions.length > 0) {
    const grouped = executions.every((execution) => execution && (
      execution.entry_price !== undefined || execution.entryPrice !== undefined
    ));

    if (grouped) {
      const groupedQuantity = executions.reduce((sum, execution) => {
        return sum + Math.abs(parseNumber(execution.quantity) || 0);
      }, 0);
      if (groupedQuantity > 0) return groupedQuantity;
    }

    const openingAction = tradeSide === 'short' ? 'sell' : 'buy';
    const openingQuantity = executions.reduce((sum, execution) => {
      const explicitAction = normalizeAction(execution.action || execution.side);
      const executionType = normalizeAction(execution.type);
      const isOpening = explicitAction
        ? explicitAction === openingAction
        : executionType === 'entry';
      return isOpening
        ? sum + Math.abs(parseNumber(execution.quantity) || 0)
        : sum;
    }, 0);

    if (openingQuantity > 0) return openingQuantity;
  }

  return Math.abs(parseNumber(trade?.quantity) || 0);
}

async function isEnabled(userId, client = db) {
  const result = await client.query(
    `SELECT COALESCE(trade_allocations_enabled, false) AS enabled
     FROM user_settings
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.enabled === true;
}

function normalizeAllocations(allocations) {
  if (!Array.isArray(allocations)) {
    const error = new Error('allocations must be an array');
    error.statusCode = 400;
    throw error;
  }

  if (allocations.length < 2) {
    const error = new Error('A trade allocation requires at least two groups');
    error.statusCode = 400;
    throw error;
  }

  const seen = new Set();
  const normalized = allocations.map((allocation) => {
    const groupId = String(allocation?.allocation_group_id || '').trim();
    const ratio = parseNumber(allocation?.allocation_ratio);
    if (!UUID_PATTERN.test(groupId) || ratio === null || ratio <= 0 || ratio > 1) {
      const error = new Error('Each allocation requires a valid group and a ratio greater than 0');
      error.statusCode = 400;
      throw error;
    }
    if (seen.has(groupId)) {
      const error = new Error('Each allocation group can only be used once per trade');
      error.statusCode = 400;
      throw error;
    }
    seen.add(groupId);
    return {
      allocation_group_id: groupId,
      allocation_ratio: ratio,
      input_method: allocation?.input_method === 'quantity' ? 'quantity' : 'percentage'
    };
  });

  const total = normalized.reduce((sum, allocation) => sum + allocation.allocation_ratio, 0);
  if (Math.abs(total - 1) > RATIO_TOLERANCE) {
    const error = new Error('Allocation percentages must total 100%');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

async function assertOwnedTrade(client, userId, tradeId) {
  if (!UUID_PATTERN.test(String(tradeId || ''))) {
    const error = new Error('Trade not found');
    error.statusCode = 404;
    throw error;
  }
  const result = await client.query(
    `SELECT id, quantity, side, executions
     FROM trades
     WHERE id = $1 AND user_id = $2`,
    [tradeId, userId]
  );
  if (result.rows.length === 0) {
    const error = new Error('Trade not found');
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

async function assertOwnedGroups(client, userId, groupIds, { existingTradeId = null } = {}) {
  const params = [userId, groupIds];
  const archivedCondition = existingTradeId
    ? `AND (
         archived_at IS NULL OR EXISTS (
           SELECT 1 FROM trade_allocations existing_ta
           WHERE existing_ta.trade_id = $${params.push(existingTradeId)}
             AND existing_ta.allocation_group_id = allocation_groups.id
         )
       )`
    : 'AND archived_at IS NULL';
  const result = await client.query(
    `SELECT id
     FROM allocation_groups
     WHERE user_id = $1 AND id = ANY($2::uuid[])
       ${archivedCondition}`,
    params
  );
  if (result.rows.length !== groupIds.length) {
    const error = new Error('One or more allocation groups are unavailable');
    error.statusCode = 400;
    throw error;
  }
}

async function listGroups(userId, { includeArchived = false } = {}) {
  const result = await db.query(
    `SELECT ag.id, ag.name, ag.color, ag.sort_order, ag.archived_at,
            ag.created_at, ag.updated_at,
            COUNT(DISTINCT ta.trade_id)::int AS trade_count
     FROM allocation_groups ag
     LEFT JOIN trade_allocations ta ON ta.allocation_group_id = ag.id
     WHERE ag.user_id = $1
       ${includeArchived ? '' : 'AND ag.archived_at IS NULL'}
     GROUP BY ag.id
     ORDER BY ag.archived_at NULLS FIRST, ag.sort_order, ag.name`,
    [userId]
  );
  return result.rows;
}

async function createGroup(userId, data) {
  const name = String(data?.name || '').trim();
  const color = String(data?.color || '#64748B').trim();
  if (!name || name.length > 80) {
    const error = new Error('Group name must be between 1 and 80 characters');
    error.statusCode = 400;
    throw error;
  }
  if (!COLOR_PATTERN.test(color)) {
    const error = new Error('Color must be a valid six-digit hex color');
    error.statusCode = 400;
    throw error;
  }

  try {
    const result = await db.query(
      `INSERT INTO allocation_groups (user_id, name, color, sort_order)
       VALUES (
         $1,
         $2,
         $3,
         COALESCE((SELECT MAX(sort_order) + 1 FROM allocation_groups WHERE user_id = $1), 0)
       )
       RETURNING *`,
      [userId, name, color]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      error.statusCode = 409;
      error.message = 'An active allocation group with this name already exists';
    }
    throw error;
  }
}

async function updateGroup(userId, groupId, data) {
  if (!UUID_PATTERN.test(String(groupId || ''))) {
    const error = new Error('Allocation group not found');
    error.statusCode = 404;
    throw error;
  }
  const updates = [];
  const values = [];
  let index = 1;

  if (data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name || name.length > 80) {
      const error = new Error('Group name must be between 1 and 80 characters');
      error.statusCode = 400;
      throw error;
    }
    updates.push(`name = $${index++}`);
    values.push(name);
  }
  if (data.color !== undefined) {
    const color = String(data.color || '').trim();
    if (!COLOR_PATTERN.test(color)) {
      const error = new Error('Color must be a valid six-digit hex color');
      error.statusCode = 400;
      throw error;
    }
    updates.push(`color = $${index++}`);
    values.push(color);
  }
  if (data.sort_order !== undefined) {
    const sortOrder = Number.parseInt(data.sort_order, 10);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      const error = new Error('Sort order must be a non-negative integer');
      error.statusCode = 400;
      throw error;
    }
    updates.push(`sort_order = $${index++}`);
    values.push(sortOrder);
  }
  if (updates.length === 0) {
    const error = new Error('No allocation group updates were provided');
    error.statusCode = 400;
    throw error;
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(groupId, userId);
  try {
    const result = await db.query(
      `UPDATE allocation_groups
       SET ${updates.join(', ')}
       WHERE id = $${index++} AND user_id = $${index} AND archived_at IS NULL
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      const error = new Error('Allocation group not found');
      error.statusCode = 404;
      throw error;
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      error.statusCode = 409;
      error.message = 'An active allocation group with this name already exists';
    }
    throw error;
  }
}

async function archiveGroup(userId, groupId) {
  if (!UUID_PATTERN.test(String(groupId || ''))) {
    const error = new Error('Allocation group not found');
    error.statusCode = 404;
    throw error;
  }
  const result = await db.query(
    `UPDATE allocation_groups
     SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
     RETURNING *`,
    [groupId, userId]
  );
  if (result.rows.length === 0) {
    const error = new Error('Allocation group not found');
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

async function getTradeAllocations(userId, tradeId) {
  const trade = await assertOwnedTrade(db, userId, tradeId);
  const basisQuantity = deriveBasisQuantity(trade);
  const result = await db.query(
    `SELECT ta.id, ta.trade_id, ta.allocation_group_id, ta.allocation_ratio,
            ta.input_method, ta.original_quantity_snapshot,
            ag.name AS allocation_group_name, ag.color AS allocation_group_color,
            ag.archived_at AS allocation_group_archived_at
     FROM trade_allocations ta
     JOIN allocation_groups ag ON ag.id = ta.allocation_group_id
     WHERE ta.trade_id = $1 AND ag.user_id = $2
     ORDER BY ag.sort_order, ag.name`,
    [tradeId, userId]
  );
  return {
    trade_id: tradeId,
    basis_quantity: basisQuantity,
    allocations: result.rows
  };
}

async function replaceTradeAllocations(userId, tradeId, allocations) {
  const normalized = normalizeAllocations(allocations);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const trade = await assertOwnedTrade(client, userId, tradeId);
    await assertOwnedGroups(
      client,
      userId,
      normalized.map((allocation) => allocation.allocation_group_id),
      { existingTradeId: tradeId }
    );
    const basisQuantity = deriveBasisQuantity(trade);

    await client.query('DELETE FROM trade_allocations WHERE trade_id = $1', [tradeId]);
    for (const allocation of normalized) {
      await client.query(
        `INSERT INTO trade_allocations (
           trade_id, allocation_group_id, allocation_ratio,
           input_method, original_quantity_snapshot
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tradeId,
          allocation.allocation_group_id,
          allocation.allocation_ratio,
          allocation.input_method,
          basisQuantity
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await AnalyticsCache.invalidate(userId);
  return getTradeAllocations(userId, tradeId);
}

async function clearTradeAllocations(userId, tradeId) {
  await assertOwnedTrade(db, userId, tradeId);
  await db.query('DELETE FROM trade_allocations WHERE trade_id = $1', [tradeId]);
  await AnalyticsCache.invalidate(userId);
}

async function replaceBulkTradeAllocations(userId, tradeIds, allocations) {
  const normalizedIds = Array.from(new Set(
    Array.isArray(tradeIds) ? tradeIds.map((id) => String(id || '').trim()).filter(Boolean) : []
  ));
  if (normalizedIds.length === 0 || normalizedIds.length > 500) {
    const error = new Error('Select between 1 and 500 trades');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedIds.some((id) => !UUID_PATTERN.test(id))) {
    const error = new Error('One or more selected trades were not found');
    error.statusCode = 404;
    throw error;
  }
  const normalized = normalizeAllocations(allocations);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const tradesResult = await client.query(
      `SELECT id, quantity, side, executions
       FROM trades
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       FOR UPDATE`,
      [userId, normalizedIds]
    );
    if (tradesResult.rows.length !== normalizedIds.length) {
      const error = new Error('One or more selected trades were not found');
      error.statusCode = 404;
      throw error;
    }
    await assertOwnedGroups(
      client,
      userId,
      normalized.map((allocation) => allocation.allocation_group_id)
    );

    await client.query('DELETE FROM trade_allocations WHERE trade_id = ANY($1::uuid[])', [normalizedIds]);
    for (const trade of tradesResult.rows) {
      const basisQuantity = deriveBasisQuantity(trade);
      for (const allocation of normalized) {
        await client.query(
          `INSERT INTO trade_allocations (
             trade_id, allocation_group_id, allocation_ratio,
             input_method, original_quantity_snapshot
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            trade.id,
            allocation.allocation_group_id,
            allocation.allocation_ratio,
            allocation.input_method,
            basisQuantity
          ]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await AnalyticsCache.invalidate(userId);
  return { updated_trade_count: normalizedIds.length };
}

async function getSummary(userId, { accounts } = {}) {
  const accountList = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
  const params = [userId];
  const accountCondition = accountList.length > 0
    ? `AND t.account_identifier = ANY($${params.push(accountList)}::text[])`
    : '';
  const groupsResult = await db.query(
    `SELECT
       ag.id,
       ag.name,
       ag.color,
       ag.sort_order,
       ag.archived_at,
       COUNT(DISTINCT t.id)::int AS trade_count,
       COALESCE(SUM(t.pnl * ta.allocation_ratio), 0) AS allocated_pnl,
       COALESCE(SUM(t.commission * ta.allocation_ratio), 0) AS allocated_commission,
       COALESCE(SUM(t.fees * ta.allocation_ratio), 0) AS allocated_fees,
       COALESCE(SUM(ABS(t.quantity) * ta.allocation_ratio), 0) AS allocated_quantity,
       COUNT(*) FILTER (WHERE t.pnl > 0)::int AS winning_trades,
       COUNT(*) FILTER (WHERE t.pnl < 0)::int AS losing_trades,
       COUNT(*) FILTER (WHERE t.pnl = 0)::int AS breakeven_trades
     FROM allocation_groups ag
     LEFT JOIN trade_allocations ta ON ta.allocation_group_id = ag.id
     LEFT JOIN trades t ON t.id = ta.trade_id AND t.user_id = $1 ${accountCondition}
     WHERE ag.user_id = $1
     GROUP BY ag.id
     ORDER BY ag.archived_at NULLS FIRST, ag.sort_order, ag.name`,
    params
  );

  const monthlyResult = await db.query(
    `SELECT
       DATE_TRUNC('month', COALESCE(t.exit_time, t.entry_time, t.trade_date::timestamp))::date AS month,
       ag.id AS allocation_group_id,
       ag.name AS allocation_group_name,
       ag.color AS allocation_group_color,
       ag.archived_at AS allocation_group_archived_at,
       COALESCE(SUM(t.pnl * ta.allocation_ratio), 0) AS allocated_pnl
     FROM trade_allocations ta
     JOIN allocation_groups ag ON ag.id = ta.allocation_group_id
     JOIN trades t ON t.id = ta.trade_id
     WHERE t.user_id = $1 AND ag.user_id = $1
       ${accountCondition}
     GROUP BY month, ag.id
     ORDER BY month, ag.archived_at NULLS FIRST, ag.sort_order, ag.name`,
    params
  );

  const allocationCountsResult = await db.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM trade_allocations ta WHERE ta.trade_id = t.id)
       )::int AS allocated_trade_count,
       COUNT(*) FILTER (
         WHERE NOT EXISTS (SELECT 1 FROM trade_allocations ta WHERE ta.trade_id = t.id)
       )::int AS unallocated_trade_count
     FROM trades t
     WHERE t.user_id = $1
       ${accountCondition}
    `,
    params
  );

  return {
    groups: groupsResult.rows,
    monthly: monthlyResult.rows,
    allocated_trade_count: allocationCountsResult.rows[0]?.allocated_trade_count || 0,
    unallocated_trade_count: allocationCountsResult.rows[0]?.unallocated_trade_count || 0
  };
}

module.exports = {
  deriveBasisQuantity,
  isEnabled,
  listGroups,
  createGroup,
  updateGroup,
  archiveGroup,
  getTradeAllocations,
  replaceTradeAllocations,
  clearTradeAllocations,
  replaceBulkTradeAllocations,
  getSummary
};
