const db = require('../config/database');
const Trade = require('../models/Trade');
const AnalyticsCache = require('./analyticsCache');
const OptionStrategyGroupingService = require('./optionStrategyGroupingService');

const VALID_REVIEW_ACTIONS = new Set(['import_as_short', 'import_as_close_only', 'import_as_gifted_shares', 'ignore']);

function parseFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDateOnly(value, fallbackDateTime) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }

  const source = fallbackDateTime ? String(fallbackDateTime) : '';
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) {
    return source.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeReviewItem(item = {}) {
  const symbol = String(item.symbol || '').trim().toUpperCase();
  const quantity = Math.abs(parseFiniteNumber(item.quantity, 0));
  const price = parseFiniteNumber(item.price, 0);
  const datetime = String(item.datetime || '').trim();
  const action = String(item.action || 'sell').trim().toLowerCase();

  if (!symbol || !/^[A-Z][A-Z0-9.\-]{0,19}$/.test(symbol)) {
    throw new Error('Review item has an invalid symbol');
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Review item for ${symbol} has an invalid quantity`);
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Review item for ${symbol} has an invalid price`);
  }

  if (!datetime || Number.isNaN(Date.parse(datetime))) {
    throw new Error(`Review item for ${symbol} has an invalid execution time`);
  }

  if (action !== 'sell' && action !== 'buy') {
    throw new Error(`Review item for ${symbol} has an invalid action`);
  }

  return {
    id: item.id || null,
    review_type: item.review_type || 'ambiguous_sell_only_stock',
    broker: item.broker || 'ibkr',
    broker_connection_id: item.broker_connection_id || item.brokerConnectionId || null,
    import_id: item.import_id || item.importId || null,
    symbol,
    conid: item.conid ? String(item.conid) : null,
    order_id: item.order_id || item.orderId || null,
    action,
    quantity,
    price,
    commission: parseFiniteNumber(item.commission, parseFiniteNumber(item.fees, 0)) || 0,
    fees: 0,
    datetime,
    trade_date: normalizeDateOnly(item.trade_date || item.tradeDate, datetime),
    account_identifier: item.account_identifier || item.accountIdentifier || null,
    instrument_type: 'stock'
  };
}

function realExecutionFor(item, action) {
  return {
    action: item.action,
    quantity: item.quantity,
    price: item.price,
    datetime: item.datetime,
    commission: item.commission,
    fees: item.fees,
    conid: item.conid,
    orderId: item.order_id,
    manual_review_action: action,
    source: 'manual_review'
  };
}

function buildShortTrade(item) {
  const execution = realExecutionFor(item, 'import_as_short');

  return {
    symbol: item.symbol,
    side: 'short',
    quantity: item.quantity,
    entryPrice: item.price,
    exitPrice: null,
    entryTime: item.datetime,
    exitTime: null,
    tradeDate: item.trade_date,
    pnl: null,
    pnlPercent: null,
    commission: item.commission,
    fees: item.fees,
    broker: item.broker,
    brokerConnectionId: item.broker_connection_id,
    accountIdentifier: item.account_identifier,
    conid: item.conid,
    importId: item.import_id,
    instrumentType: 'stock',
    executions: [execution],
    executionData: [execution],
    notes: 'Imported after manual review of a sell-only stock execution with no matching opening buy. User confirmed it is a short entry.'
  };
}

function buildCloseOnlyTrade(item) {
  const originalSide = item.action === 'buy' ? 'short' : 'long';
  const syntheticOpeningExecution = {
    action: originalSide === 'short' ? 'sell' : 'buy',
    quantity: item.quantity,
    price: item.price,
    datetime: item.datetime,
    commission: 0,
    fees: 0,
    conid: item.conid,
    orderId: item.order_id ? `${item.order_id}-manual-review-synthetic-open` : null,
    synthetic: true,
    synthetic_reason: 'manual_review_missing_opening_execution',
    source: 'manual_review'
  };
  const closingExecution = realExecutionFor(item, 'import_as_close_only');

  return {
    symbol: item.symbol,
    side: originalSide,
    quantity: item.quantity,
    entryPrice: item.price,
    exitPrice: item.price,
    entryTime: item.datetime,
    exitTime: item.datetime,
    tradeDate: item.trade_date,
    pnl: -Math.abs(item.commission + item.fees),
    pnlPercent: 0,
    commission: item.commission,
    fees: item.fees,
    broker: item.broker,
    brokerConnectionId: item.broker_connection_id,
    accountIdentifier: item.account_identifier,
    conid: item.conid,
    importId: item.import_id,
    instrumentType: 'stock',
    executions: [syntheticOpeningExecution, closingExecution],
    executionData: [syntheticOpeningExecution, closingExecution],
    notes: 'Imported after manual review as a close-only stock trade. Opening execution was not present in the import or sync data.'
  };
}

function buildGiftedSharesTrade(item) {
  if (item.action !== 'sell') {
    throw new Error('Gifted shares review can only be applied to sell executions');
  }

  const syntheticOpeningExecution = {
    action: 'buy',
    quantity: item.quantity,
    price: 0,
    datetime: item.datetime,
    commission: 0,
    fees: 0,
    conid: item.conid,
    orderId: item.order_id ? `${item.order_id}-manual-review-gifted-open` : null,
    synthetic: true,
    synthetic_reason: 'manual_review_gifted_shares_zero_basis',
    source: 'manual_review'
  };
  const closingExecution = realExecutionFor(item, 'import_as_gifted_shares');
  const proceeds = item.price * item.quantity;

  return {
    symbol: item.symbol,
    side: 'long',
    quantity: item.quantity,
    entryPrice: 0,
    exitPrice: item.price,
    entryTime: item.datetime,
    exitTime: item.datetime,
    tradeDate: item.trade_date,
    pnl: proceeds - Math.abs(item.commission + item.fees),
    pnlPercent: null,
    commission: item.commission,
    fees: item.fees,
    broker: item.broker,
    brokerConnectionId: item.broker_connection_id,
    accountIdentifier: item.account_identifier,
    conid: item.conid,
    importId: item.import_id,
    instrumentType: 'stock',
    executions: [syntheticOpeningExecution, closingExecution],
    executionData: [syntheticOpeningExecution, closingExecution],
    notes: 'Imported after manual review as gifted, promotional, or reward shares with $0 cost basis. Opening execution was synthetic because no broker buy execution was present.'
  };
}

function buildTradeForDecision(reviewItem, action) {
  const item = normalizeReviewItem(reviewItem);

  if (action === 'import_as_short') {
    return buildShortTrade(item);
  }

  if (action === 'import_as_close_only') {
    return buildCloseOnlyTrade(item);
  }

  if (action === 'import_as_gifted_shares') {
    return buildGiftedSharesTrade(item);
  }

  throw new Error(`Unsupported manual review action: ${action}`);
}

async function hasExistingReviewedExecution(userId, reviewItem) {
  const item = normalizeReviewItem(reviewItem);
  if (!item.order_id) {
    return false;
  }

  const result = await db.query(
    `SELECT id
     FROM trades
     WHERE user_id = $1
       AND UPPER(symbol) = UPPER($2)
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(executions, '[]'::jsonb)) AS exec
         WHERE exec->>'orderId' = $3 OR exec->>'order_id' = $3
       )
     LIMIT 1`,
    [userId, item.symbol, String(item.order_id)]
  );

  return result.rows.length > 0;
}

async function applyManualReviewDecisions(userId, decisions = []) {
  if (!Array.isArray(decisions) || decisions.length === 0) {
    throw new Error('At least one manual review decision is required');
  }

  let imported = 0;
  let ignored = 0;
  let duplicates = 0;
  let failed = 0;
  const errors = [];

  for (const decision of decisions) {
    const action = String(decision?.action || '').trim();
    const reviewItem = decision?.item || decision?.review_item || null;

    if (!VALID_REVIEW_ACTIONS.has(action)) {
      failed++;
      errors.push({ action, error: 'Invalid manual review action' });
      continue;
    }

    if (action === 'ignore') {
      ignored++;
      continue;
    }

    try {
      if (await hasExistingReviewedExecution(userId, reviewItem)) {
        duplicates++;
        continue;
      }

      const trade = buildTradeForDecision(reviewItem, action);
      await Trade.create(userId, trade, {
        skipAchievements: true,
        skipApiCalls: true,
        skipOptionGrouping: true
      });
      imported++;
    } catch (error) {
      failed++;
      errors.push({
        symbol: reviewItem?.symbol || null,
        action,
        error: error.message
      });
    }
  }

  if (imported > 0) {
    await OptionStrategyGroupingService.rebuildUserGroupsSafe(userId, 'manual trade review');
    await AnalyticsCache.invalidate(userId);
  }

  return {
    imported,
    ignored,
    duplicates,
    failed,
    errors
  };
}

module.exports = {
  applyManualReviewDecisions,
  buildTradeForDecision,
  normalizeReviewItem
};
