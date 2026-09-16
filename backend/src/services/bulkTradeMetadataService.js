const db = require('../config/database');
const AnalyticsCache = require('./analyticsCache');
const OptionStrategyGroupingService = require('./optionStrategyGroupingService');
const AppError = require('../utils/AppError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['account_identifier', 'setup', 'strategy']);

function requestError(message, statusCode = 400) {
  return new AppError(statusCode, { error: message });
}

function normalizeRequest(tradeIds, updates) {
  if (!Array.isArray(tradeIds) || tradeIds.length < 1 || tradeIds.length > 500) {
    throw requestError('Select between 1 and 500 trades');
  }
  if (tradeIds.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    throw requestError('One or more trade IDs are invalid');
  }

  const ids = [...new Set(tradeIds.map(id => id.toLowerCase()))];
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw requestError('Updates are required');
  }
  const keys = Object.keys(updates);
  if (keys.length === 0) throw requestError('Choose at least one field to update');
  if (keys.some(key => !ALLOWED_FIELDS.has(key))) throw requestError('Only account, setup, and strategy can be bulk edited');

  const normalized = {};
  for (const key of keys) {
    const limit = key === 'account_identifier' ? 50 : 100;
    const value = updates[key];
    if (value === null) {
      normalized[key] = null;
    } else if (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit) {
      normalized[key] = value.trim();
    } else {
      throw requestError(`${key} must be a non-empty string of at most ${limit} characters, or null`);
    }
  }
  return { ids, updates: normalized };
}

async function bulkUpdateMetadata(userId, tradeIds, rawUpdates) {
  const { ids, updates } = normalizeRequest(tradeIds, rawUpdates);

  await db.withTransaction(async client => {
    if (updates.account_identifier !== undefined && updates.account_identifier !== null) {
      const account = await client.query(
        `SELECT id FROM user_accounts
         WHERE user_id = $1 AND account_identifier = $2 AND is_archived = false
         FOR UPDATE`,
        [userId, updates.account_identifier]
      );
      if (account.rows.length === 0) throw requestError('The selected account is unavailable');
    }

    const owned = await client.query(
      `SELECT id FROM trades
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY id FOR UPDATE`,
      [userId, ids]
    );
    if (owned.rows.length !== ids.length) {
      throw requestError('One or more selected trades were not found', 404);
    }

    const assignments = [];
    const values = [userId, ids];
    for (const [field, value] of Object.entries(updates)) {
      values.push(value);
      assignments.push(`${field} = $${values.length}`);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'strategy')) {
      assignments.push('manual_override = true');
      assignments.push(`strategy_confidence = ${updates.strategy === null ? 'NULL' : '100'}`);
      assignments.push("classification_method = 'manual'");
      values.push(JSON.stringify({ userProvided: true, cleared: updates.strategy === null }));
      assignments.push(`classification_metadata = $${values.length}::jsonb`);
    }
    assignments.push('updated_at = CURRENT_TIMESTAMP');

    await client.query(
      `UPDATE trades SET ${assignments.join(', ')}
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      values
    );
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'account_identifier')) {
    await OptionStrategyGroupingService.rebuildUserGroupsSafe(userId, 'bulk trade metadata update');
  }
  await AnalyticsCache.invalidate(userId);
  return { updated_trade_count: ids.length };
}

module.exports = { bulkUpdateMetadata, normalizeRequest };
