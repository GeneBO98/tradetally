// Whole-trade win rate (issue #339)
//
// When a user enables the `analytics_position_grouping` profile setting,
// analytics collapse multi-leg positions (e.g. option spreads, iron condors)
// that were opened together into a single synthetic trade, so win rate and
// trade counts are measured per position instead of per individual leg.
//
// Two legs belong to the same position when they share the same account, the
// same underlying (falling back to the symbol for non-options), and the exact
// same entry time (one order ticket). Trades with no entry_time fall back to
// their own id so they are never merged. This is intentionally conservative —
// it never wrongly merges unrelated positions; at worst it leaves legs
// ungrouped (degrading to per-leg behaviour).
//
// IMPORTANT: queries that use this key must reference the raw `trades` table
// (no alias) or pass a matching alias, and apply the grouping in a subquery/CTE
// BEFORE counting wins/losses.
const POSITION_GROUP_KEY =
  "account_identifier, COALESCE(NULLIF(underlying_symbol, ''), symbol), COALESCE(entry_time::text, id::text)";

// Breakeven predicate for grouped positions. The per-leg tick/point tolerance
// used for individual trades does not apply to a combined multi-leg position,
// so a grouped position is breakeven only when its net P&L rounds to zero.
// Shape matches `breakevenPredicate()` ({ is, isNot }) so it is a drop-in.
const GROUPED_BREAKEVEN = Object.freeze({
  is: '(ROUND(pnl::numeric, 2) = 0)',
  isNot: '(ROUND(pnl::numeric, 2) <> 0)'
});

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

module.exports = { POSITION_GROUP_KEY, GROUPED_BREAKEVEN, isPositionGroupingEnabled };
