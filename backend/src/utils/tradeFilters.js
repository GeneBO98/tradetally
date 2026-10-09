// Shared trade-filter parsing for controllers.
//
// Several handlers (trade list, trade count, CSV export, analytics, partial
// exits, round trips, Trade Management) historically built near-identical
// `filters` objects inline from req.query. This module consolidates that
// parsing while preserving each call site's exact historical output shape:
// the produced object is consumed by TradeQueries._buildWhereClause and the
// Trade model query builders, which skip undefined/empty fields, but tests
// and cache keys (JSON.stringify of the filter object) depend on the precise
// keys and per-field coercions each site used. Field sets and coercion quirks
// are therefore expressed as per-site profiles below.
//
// Per-field divergences preserved via options:
// - tags:     most sites split + trim + drop empties; round trips split only.
// - brokers:  trade list passes the raw comma string, count/export split it
//             into an array, analytics-style sites normalize '' -> undefined.
// - numbers:  list/count/export/round-trip coerce (parseFloat/parseInt, with
//             minPnl/maxPnl guarded so 0 and '0' survive); analytics-style
//             sites pass raw strings through (_buildWhereClause binds them
//             as SQL params directly).
// - strings:  Trade Management normalizes empty strings to undefined and
//             wraps symbol in ensureString(); other sites pass raw values.
const ensureString = require('./ensureString');

const splitList = (value) => (value ? ensureString(value).split(',') : undefined);
const splitTrimmedList = (value) =>
  value ? ensureString(value).split(',').map((item) => item.trim()).filter(Boolean) : undefined;

// `x ? coerce(x) : undefined` — historical list/count/export behavior for
// prices and quantities ('' and 0 both fall through to undefined).
const coercePositive = (value, coerce) => (value ? coerce(value) : undefined);
// Guarded coercion used for P&L bounds so 0 / '0' are kept.
const coerceDefined = (value, coerce) =>
  value !== undefined && value !== null && value !== '' ? coerce(value) : undefined;

// One builder per output field. Each receives (query, options) and must
// reproduce the exact expression the inline blocks used.
const FIELD_BUILDERS = {
  symbol: (q, o) => (o.normalizeStrings ? ensureString(q.symbol) || undefined : q.symbol),
  symbolExact: (q) => q.symbolExact === 'true',
  startDate: (q, o) => (o.normalizeStrings ? q.startDate || undefined : q.startDate),
  endDate: (q, o) => (o.normalizeStrings ? q.endDate || undefined : q.endDate),
  exitStartDate: (q) => q.exitStartDate,
  exitEndDate: (q) => q.exitEndDate,
  tags: (q, o) => (o.rawTagSplit ? splitList(q.tags) : splitTrimmedList(q.tags)),
  strategy: (q, o) => (o.normalizeStrings ? q.strategy || undefined : q.strategy),
  sector: (q, o) => (o.normalizeStrings ? q.sector || undefined : q.sector),
  strategies: (q) => splitList(q.strategies),
  setups: (q) => splitList(q.setups),
  sectors: (q) => splitList(q.sectors),
  hasNews: (q) => q.hasNews,
  daysOfWeek: (q) =>
    q.daysOfWeek ? ensureString(q.daysOfWeek).split(',').map((d) => parseInt(d)) : undefined,
  market_sessions: (q) => splitTrimmedList(q.market_sessions),
  instrumentTypes: (q) => splitList(q.instrumentTypes),
  optionTypes: (q) => splitList(q.optionTypes),
  qualityGrades: (q) => splitList(q.qualityGrades),
  side: (q, o) => (o.normalizeStrings ? q.side || undefined : q.side),
  minPrice: (q, o) => (o.coerceNumbers ? coercePositive(q.minPrice, parseFloat) : q.minPrice),
  maxPrice: (q, o) => (o.coerceNumbers ? coercePositive(q.maxPrice, parseFloat) : q.maxPrice),
  minQuantity: (q, o) => (o.coerceNumbers ? coercePositive(q.minQuantity, parseInt) : q.minQuantity),
  maxQuantity: (q, o) => (o.coerceNumbers ? coercePositive(q.maxQuantity, parseInt) : q.maxQuantity),
  status: (q, o) => (o.normalizeStrings ? q.status || undefined : q.status),
  minPnl: (q, o) => (o.coerceNumbers ? coerceDefined(q.minPnl, parseFloat) : q.minPnl),
  maxPnl: (q, o) => (o.coerceNumbers ? coerceDefined(q.maxPnl, parseFloat) : q.maxPnl),
  pnlType: (q, o) => (o.normalizeStrings ? q.pnlType || undefined : q.pnlType),
  broker: (q, o) => (o.normalizeStrings || o.normalizeBroker ? q.broker || undefined : q.broker),
  brokers: (q, o) => {
    if (o.splitBrokers) return splitList(q.brokers);
    if (o.normalizeStrings || o.normalizeBroker) return q.brokers || undefined;
    return q.brokers;
  },
  importId: (q, o) => (o.normalizeStrings ? q.importId || undefined : q.importId),
  accounts: (q) => splitList(q.accounts),
  holdTime: (q, o) => (o.normalizeStrings ? q.holdTime || undefined : q.holdTime),
  minPartials: (q) => q.minPartials,
  maxPartials: (q) => q.maxPartials
};

// Full field set, in the trade-list (getUserTrades) key order.
const ALL_FIELDS = [
  'symbol', 'symbolExact', 'startDate', 'endDate', 'exitStartDate', 'exitEndDate',
  'tags', 'strategy', 'sector', 'strategies', 'setups', 'sectors', 'hasNews',
  'daysOfWeek', 'market_sessions', 'instrumentTypes', 'optionTypes', 'qualityGrades',
  'side', 'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
  'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers', 'importId', 'accounts',
  'holdTime', 'minPartials', 'maxPartials'
];

/**
 * Parse trade filters from an Express query object.
 *
 * options:
 * - fields:          array of output keys (defines both which filters are
 *                    parsed AND the object's key order; keys not listed are
 *                    omitted entirely so endpoints don't grow new filters).
 * - coerceNumbers:   parseFloat/parseInt price, quantity, and P&L bounds.
 * - splitBrokers:    split `brokers` into an array (count/export style).
 * - normalizeBroker: `broker`/`brokers` empty strings become undefined.
 * - normalizeStrings: Trade Management style — all plain string fields use
 *                    `|| undefined`, and symbol goes through ensureString().
 * - rawTagSplit:     split tags without trimming (round-trip style).
 *
 * Pagination (limit/offset) is intentionally NOT handled here; call sites
 * add it after parsing.
 */
function parseTradeFilters(query = {}, options = {}) {
  const fields = options.fields || ALL_FIELDS;
  const filters = {};
  for (const field of fields) {
    const build = FIELD_BUILDERS[field];
    if (!build) {
      throw new Error(`Unknown trade filter field: ${field}`);
    }
    filters[field] = build(query, options);
  }
  return filters;
}

// Per-endpoint profiles. Field order mirrors the original inline object
// literals so JSON.stringify-based cache keys and logged shapes are unchanged.
const tradeFilterProfiles = {
  // trade.controller getUserTrades — coerced numbers, raw broker/brokers
  // strings, exit-date range, accounts. Pagination added at the call site.
  tradeList: {
    fields: [
      'symbol', 'symbolExact', 'startDate', 'endDate', 'exitStartDate', 'exitEndDate',
      'tags', 'strategy', 'sector', 'strategies', 'setups', 'sectors', 'hasNews',
      'daysOfWeek', 'market_sessions', 'instrumentTypes', 'optionTypes', 'qualityGrades',
      'side', 'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers', 'importId', 'accounts'
    ],
    coerceNumbers: true
  },
  // trade.controller getTradesCount — like tradeList but no symbolExact /
  // exit dates / accounts, and `brokers` is split into an array.
  tradeCount: {
    fields: [
      'symbol', 'startDate', 'endDate', 'tags', 'strategy', 'sector',
      'strategies', 'setups', 'sectors', 'hasNews', 'daysOfWeek', 'market_sessions',
      'instrumentTypes', 'optionTypes', 'qualityGrades', 'side',
      'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers', 'importId'
    ],
    coerceNumbers: true,
    splitBrokers: true
  },
  // trade.controller exportTradesToCSV — tradeCount minus importId.
  tradeExport: {
    fields: [
      'symbol', 'startDate', 'endDate', 'tags', 'strategy', 'sector',
      'strategies', 'setups', 'sectors', 'hasNews', 'daysOfWeek', 'market_sessions',
      'instrumentTypes', 'optionTypes', 'qualityGrades', 'side',
      'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers'
    ],
    coerceNumbers: true,
    splitBrokers: true
  },
  // trade.controller getRoundTripTrades — small field set; tags split
  // WITHOUT trim/filter (historical quirk of this endpoint).
  roundTrip: {
    fields: [
      'symbol', 'startDate', 'endDate', 'tags', 'strategy', 'sector', 'side',
      'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker'
    ],
    coerceNumbers: true,
    rawTagSplit: true
  },
  // trade.controller getAnalytics — raw numeric strings (bound directly as
  // SQL params), broker/brokers normalized '' -> undefined, holdTime.
  analytics: {
    fields: [
      'startDate', 'endDate', 'symbol', 'symbolExact', 'sector', 'strategy',
      'tags', 'strategies', 'setups', 'sectors', 'side',
      'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers', 'importId', 'accounts',
      'hasNews', 'holdTime', 'daysOfWeek', 'market_sessions',
      'instrumentTypes', 'optionTypes', 'qualityGrades'
    ],
    normalizeBroker: true
  },
  // trade.controller getPartialExitAnalytics — analytics subset plus
  // minPartials/maxPartials. Field order feeds a JSON.stringify cache key.
  partialExit: {
    fields: [
      'startDate', 'endDate', 'symbol', 'symbolExact', 'sector', 'strategy',
      'tags', 'strategies', 'setups', 'sectors', 'side', 'broker', 'brokers',
      'accounts', 'instrumentTypes', 'qualityGrades', 'minPartials', 'maxPartials'
    ],
    normalizeBroker: true
  },
  // tradeManagement.controller parseTradeManagementFilters — mirrors the
  // Performance-page (analytics) filter set, but normalizes every plain
  // string field ('' -> undefined) and ensureString()s symbol. No
  // market_sessions (historical omission on this page).
  tradeManagement: {
    fields: [
      'startDate', 'endDate', 'symbol', 'symbolExact', 'sector', 'strategy',
      'tags', 'strategies', 'setups', 'sectors', 'side',
      'minPrice', 'maxPrice', 'minQuantity', 'maxQuantity', 'status',
      'minPnl', 'maxPnl', 'pnlType', 'broker', 'brokers', 'importId', 'accounts',
      'hasNews', 'holdTime', 'daysOfWeek', 'instrumentTypes', 'optionTypes', 'qualityGrades'
    ],
    normalizeStrings: true
  }
};

module.exports = { parseTradeFilters, tradeFilterProfiles };
