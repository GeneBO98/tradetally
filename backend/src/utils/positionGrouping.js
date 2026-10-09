// Whole-trade win rate (issue #339)
//
// When a user enables the `analytics_position_grouping` profile setting,
// analytics collapse multi-leg positions (e.g. option spreads, iron condors)
// that were opened together into a single synthetic trade, so win rate and
// trade counts are measured per position instead of per individual leg.
//
// Persisted option strategy groups take precedence. Ungrouped legacy rows fall
// back to the conservative account + underlying + exact entry_time key only
// when broker order evidence is absent. Known but ungrouped orders stay separate.
//
// IMPORTANT: queries that use this key must reference the raw `trades` table
// (no alias) or pass a matching alias, and apply the grouping in a subquery/CTE
// BEFORE counting wins/losses.
function brokerageOrderSql(alias = '') {
  const column = alias ? `${alias}.executions` : 'executions';
  return `jsonb_path_exists(COALESCE(${column}, '[]'::jsonb), '$[*] ? (@.brokerage_order_id != null && @.brokerage_order_id != "")')`;
}

function hasBrokerageOrder(trade) {
  let executions = trade.executions || [];
  if (typeof executions === 'string') {
    try { executions = JSON.parse(executions); } catch { return false; }
  }
  return Array.isArray(executions) && executions.some(execution =>
    execution?.brokerage_order_id != null && execution.brokerage_order_id !== '');
}

const POSITION_GROUP_KEY =
  `COALESCE(position_group_id::text, CASE WHEN ${brokerageOrderSql()} THEN id::text ELSE CONCAT_WS('|', COALESCE(account_identifier, ''), COALESCE(NULLIF(underlying_symbol, ''), symbol), COALESCE(entry_time::text, id::text)) END)`;

// Read the user's whole-trade grouping preference. Defaults to false (per-leg)
// if settings can't be read.
async function isPositionGroupingEnabled(userId) {
  const User = require('../models/User');
  try {
    const settings = await User.getSettings(userId);
    return settings?.analytics_position_grouping === true;
  } catch (error) {
    console.warn('Could not read analytics_position_grouping setting, defaulting to per-leg:', error.message);
    return false;
  }
}

module.exports = { POSITION_GROUP_KEY, isPositionGroupingEnabled, brokerageOrderSql, hasBrokerageOrder };
