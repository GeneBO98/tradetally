// Shared trade date-range predicate.
//
// A trade is "in range" if EITHER its trade_date OR the date portion of its
// exit_time falls within [startDate, endDate] (a trade opened before the range
// but closed inside it still counts, and vice-versa). This rule was duplicated
// verbatim in TradeQueries._buildWhereClause and Trade.getPartialExitAnalytics;
// it lives here so those paths cannot drift.
//
// Callers own their own parameter counter. Given the next free parameter index
// this returns the SQL fragment (already prefixed with " AND ", or '' when no
// date filter is set) plus the ordered params to push; the caller advances its
// counter by params.length.
//
// `alias` is the table alias for the trades table (all current callers use 't').
function buildTradeDateRangeClause(filters, startParamIndex, alias = 't') {
  const params = [];
  let clause = '';
  const p = startParamIndex;

  if (filters.startDate && filters.endDate) {
    clause = ` AND ((${alias}.trade_date >= $${p} AND ${alias}.trade_date <= $${p + 1}) OR (${alias}.exit_time::date >= $${p} AND ${alias}.exit_time::date <= $${p + 1}))`;
    params.push(filters.startDate, filters.endDate);
  } else if (filters.startDate) {
    clause = ` AND (${alias}.trade_date >= $${p} OR ${alias}.exit_time::date >= $${p})`;
    params.push(filters.startDate);
  } else if (filters.endDate) {
    clause = ` AND (${alias}.trade_date <= $${p} OR ${alias}.exit_time::date <= $${p})`;
    params.push(filters.endDate);
  }

  return { clause, params };
}

module.exports = { buildTradeDateRangeClause };
