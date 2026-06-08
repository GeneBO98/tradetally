const db = require('../config/database');
const crypto = require('crypto');
const aiService = require('../utils/aiService');
const User = require('../models/User');
const Trade = require('../models/Trade');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const MAEEstimator = require('../utils/maeEstimator');
const symbolCategories = require('../utils/symbolCategories');
const { sendV1NotImplemented } = require('../utils/apiResponse');
const ensureString = require('../utils/ensureString');
const { getUserTimezone } = require('../utils/timezone');
const { POSITION_GROUP_KEY, GROUPED_BREAKEVEN, isPositionGroupingEnabled } = require('../utils/positionGrouping');
const { buildExcursionMetrics } = require('../utils/excursionMetrics');
const { normalizeConfig } = require('../utils/breakeven');

// Helper function to create a short but collision-resistant hash for cache keys
function createFilterHash(filters) {
  const str = JSON.stringify(filters);
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

// Lightweight keyword-based tone classifier for news headlines. NOT a real
// sentiment model — it just catches the obvious bull/bear signals so the
// dashboard insight reads as "likely positive/negative for your position"
// instead of generic "high coverage." Returns the dominant label and a
// magnitude score that reflects how strongly the headline matched.
const POSITIVE_NEWS_KEYWORDS = [
  'beat', 'beats', 'beaten', 'raise', 'raises', 'raised', 'upgrade', 'upgraded',
  'upgrades', 'outperform', 'outperforms', 'record', 'records', 'surge', 'surges',
  'soar', 'soars', 'rally', 'rallies', 'crush', 'crushes', 'tops', 'exceed',
  'exceeds', 'exceeded', 'strong', 'breakout', 'gain', 'gains', 'jumps',
  'rises', 'climbs', 'profit', 'profits', 'win', 'wins', 'wins', 'milestone',
  'launches', 'expansion', 'partnership', 'approved', 'approval', 'breakthrough',
  'positive', 'bullish', 'optimistic'
];
const NEGATIVE_NEWS_KEYWORDS = [
  'miss', 'misses', 'missed', 'cut', 'cuts', 'cutting', 'downgrade', 'downgrades',
  'downgraded', 'underperform', 'underperforms', 'recall', 'recalls', 'recalled',
  'lawsuit', 'sued', 'fraud', 'investigation', 'probe', 'probed', 'slump', 'slumps',
  'plunge', 'plunges', 'plunged', 'tumble', 'tumbles', 'falls', 'fell', 'drops',
  'dropped', 'decline', 'declines', 'declined', 'loss', 'losses', 'losing',
  'concern', 'concerns', 'warning', 'warns', 'warned', 'reduces', 'reduced',
  'layoffs', 'fired', 'firing', 'delays', 'delayed', 'cancels', 'cancelled',
  'breach', 'hacked', 'fine', 'fined', 'penalty', 'crash', 'crashes',
  'negative', 'bearish', 'pessimistic', 'risk', 'risks'
];

function classifyHeadlineTone(headline) {
  if (!headline || typeof headline !== 'string') {
    return { label: 'neutral', magnitude: 0 };
  }
  const text = headline.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_NEWS_KEYWORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) pos++;
  }
  for (const w of NEGATIVE_NEWS_KEYWORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) neg++;
  }
  if (pos > neg)  return { label: 'positive', magnitude: pos - neg };
  if (neg > pos)  return { label: 'negative', magnitude: neg - pos };
  return { label: 'neutral', magnitude: 0 };
}

// Async MAE/MFE calculation function
async function calculateMAEMFEAsync(userId, filterConditions, params) {
  try {
    // First try to get actual MAE/MFE if available
    const actualMaeQuery = `
      SELECT 
        COALESCE(AVG(mae), 0) as avg_mae,
        COALESCE(AVG(mfe), 0) as avg_mfe,
        COUNT(mae) as mae_count,
        COUNT(mfe) as mfe_count
      FROM trades
      WHERE user_id = $1 ${filterConditions}
        AND mae IS NOT NULL 
        AND mfe IS NOT NULL
    `;
    
    const actualMaeResult = await db.query(actualMaeQuery, params);
    const actualMaeData = actualMaeResult.rows[0];
    
    if (actualMaeData && actualMaeData.mae_count > 0) {
      // Use actual data if available
      return {
        avgMAE: parseFloat(actualMaeData.avg_mae).toFixed(2),
        avgMFE: parseFloat(actualMaeData.avg_mfe).toFixed(2),
        count: actualMaeData.mae_count
      };
    } else {
      // Estimate MAE/MFE from available trade data
      const estimateQuery = `
        SELECT
          id,
          symbol,
          entry_price,
          exit_price,
          CAST(quantity AS DECIMAL) as quantity,
          side,
          pnl,
          commission,
          fees,
          trade_date,
          entry_time,
          exit_time,
          instrument_type,
          point_value,
          underlying_asset,
          contract_size
        FROM trades
        WHERE user_id = $1 ${filterConditions}
          AND entry_price IS NOT NULL
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
          AND quantity IS NOT NULL
          AND entry_time IS NOT NULL
          AND exit_time IS NOT NULL
      `;
      
      const tradesResult = await db.query(estimateQuery, params);
      const trades = tradesResult.rows.map(trade => ({
        ...trade,
        quantity: parseFloat(trade.quantity)
      }));
      
      if (trades.length > 0) {
        const estimates = await MAEEstimator.estimateForTrades(trades);
        return estimates;
      } else {
        return { avgMAE: 'N/A', avgMFE: 'N/A', count: 0 };
      }
    }
  } catch (error) {
    console.error('MAE/MFE calculation error:', error);
    return { avgMAE: 'N/A', avgMFE: 'N/A', count: 0 };
  }
}

// New helper to convert query params into the Trade model's filter format
function convertQueryToTradeFilters(query) {
  // Sanitize all query parameters at the boundary to prevent SQL injection.
  // All string values are coerced to strings, arrays are validated, numbers are parsed.
  const toSafeString = (val) => (typeof val === 'string' ? val : '');

  const toArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean);
    const str = toSafeString(val);
    if (str.trim() !== '') {
      return str.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const toNumber = (val) => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  };

  const toIntArray = (val) => toArray(val).map(v => parseInt(v, 10)).filter(v => Number.isInteger(v));

  // Allowlist for enum-like fields to prevent injection via unexpected values
  const validSides = ['long', 'short'];
  const validStatuses = ['open', 'closed'];
  const validPnlTypes = ['profit', 'loss'];
  const validHoldTimes = [
    '< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min',
    '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months'
  ];

  const sideVal = toSafeString(query.side);
  const statusVal = toSafeString(query.status);
  const pnlTypeVal = toSafeString(query.pnlType);
  const holdTimeVal = toSafeString(query.holdTime);

  // Normalize brokers: support both `brokers` (CSV) and `broker` (single)
  const brokersStr = toSafeString(query.brokers).trim();
  const brokerStr = toSafeString(query.broker).trim();
  const brokersRaw = brokersStr !== '' ? brokersStr : (brokerStr !== '' ? brokerStr : undefined);

  return {
    startDate: toSafeString(query.startDate) || undefined,
    endDate: toSafeString(query.endDate) || undefined,
    symbol: query.symbol ? toSafeString(query.symbol).toUpperCase().trim() : undefined,
    strategies: toArray(query.strategies),
    setups: toArray(query.setups),
    sectors: toArray(query.sectors),
    tags: toArray(query.tags),
    hasNews: query.hasNews,
    side: validSides.includes(sideVal) ? sideVal : undefined,
    minPrice: toNumber(query.minPrice),
    maxPrice: toNumber(query.maxPrice),
    minQuantity: toNumber(query.minQuantity),
    maxQuantity: toNumber(query.maxQuantity),
    status: validStatuses.includes(statusVal) ? statusVal : undefined,
    minPnl: toNumber(query.minPnl),
    maxPnl: toNumber(query.maxPnl),
    pnlType: validPnlTypes.includes(pnlTypeVal) ? pnlTypeVal : undefined,
    brokers: brokersRaw,
    daysOfWeek: toIntArray(query.daysOfWeek),
    qualityGrades: toArray(query.qualityGrades),
    instrumentTypes: toArray(query.instrumentTypes),
    optionTypes: toArray(query.optionTypes),
    holdTime: validHoldTimes.includes(holdTimeVal) ? holdTimeVal : undefined,
    hasRValue: query.hasRValue,
    accounts: toArray(query.accounts)
  };
}

// Helper function to generate hold time filter SQL conditions
function getHoldTimeFilter(holdTimeRange) {
  let timeCondition = '';

  switch (holdTimeRange) {
    case '< 1 min':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) < 60`;
      break;
    case '1-5 min':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 60 AND 300`;
      break;
    case '5-15 min':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 300 AND 900`;
      break;
    case '15-30 min':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 900 AND 1800`;
      break;
    case '30-60 min':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 1800 AND 3600`;
      break;
    case '1-2 hours':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 3600 AND 7200`;
      break;
    case '2-4 hours':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 7200 AND 14400`;
      break;
    case '4-24 hours':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 14400 AND 86400`;
      break;
    case '1-7 days':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 86400 AND 604800`;
      break;
    case '1-4 weeks':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) BETWEEN 604800 AND 2419200`;
      break;
    case '1+ months':
      timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(exit_time, NOW()) - entry_time)) >= 2419200`;
      break;
    default:
      timeCondition = '';
  }

  return timeCondition;
}

// Helper function to build filter conditions for analytics queries using normalized Trade filters
function buildFilterConditions(query) {
  const filters = convertQueryToTradeFilters(query);

  console.log('--- Filter Debug (normalized) ---');
  console.log('Raw query object:', query);
  console.log('Normalized filters:', filters);
  console.log('Broker filter specifically:', filters.brokers);

  let filterConditions = '';
  const params = [];
  let paramIndex = 2; // $1 is reserved for user_id in callers

  // Date filters
  if (filters.startDate) {
    filterConditions += ` AND trade_date >= $${paramIndex}`;
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    filterConditions += ` AND trade_date <= $${paramIndex}`;
    params.push(filters.endDate);
    paramIndex++;
  }

  // Symbol filter (exact match or LIKE based on Trade expectations – here use exact to align with model)
  if (filters.symbol) {
    filterConditions += ` AND symbol = $${paramIndex}`;
    params.push(filters.symbol);
    paramIndex++;
  }

  // Multi-select strategies
  if (filters.strategies && filters.strategies.length > 0) {
    const placeholders = filters.strategies.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND strategy IN (${placeholders})`;
    params.push(...filters.strategies);
  }

  // Multi-select setups
  if (filters.setups && filters.setups.length > 0) {
    const placeholders = filters.setups.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND setup IN (${placeholders})`;
    params.push(...filters.setups);
  }

  // Multi-select sectors via subquery to symbol_categories (aligns with Trade model join)
  if (filters.sectors && filters.sectors.length > 0) {
    const placeholders = filters.sectors.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND symbol IN (SELECT symbol FROM symbol_categories WHERE finnhub_industry IN (${placeholders}))`;
    params.push(...filters.sectors);
  }

  // Tags filter (multi-select supported) - uses array overlap operator
  if (filters.tags && filters.tags.length > 0) {
    filterConditions += ` AND tags && $${paramIndex}`;
    params.push(filters.tags);
    paramIndex++;
  }

  // Broker filter (multi-select supported) - exactly like Trade model
  if (filters.brokers && String(filters.brokers).trim() !== '') {
    const brokerList = String(filters.brokers).split(',').map(b => b.trim()).filter(Boolean);
    if (brokerList.length > 0) {
      filterConditions += ` AND broker = ANY($${paramIndex}::text[])`;
      params.push(brokerList);
      paramIndex++;
    }
  }

  // Side filter
  if (filters.side) {
    filterConditions += ` AND side = $${paramIndex}`;
    params.push(filters.side);
    paramIndex++;
  }

  // Price filters
  if (filters.minPrice !== undefined) {
    filterConditions += ` AND entry_price >= $${paramIndex}`;
    params.push(filters.minPrice);
    paramIndex++;
  }
  if (filters.maxPrice !== undefined) {
    filterConditions += ` AND entry_price <= $${paramIndex}`;
    params.push(filters.maxPrice);
    paramIndex++;
  }

  // Quantity filters
  if (filters.minQuantity !== undefined) {
    filterConditions += ` AND CAST(quantity AS DECIMAL) >= $${paramIndex}`;
    params.push(filters.minQuantity);
    paramIndex++;
  }
  if (filters.maxQuantity !== undefined) {
    filterConditions += ` AND CAST(quantity AS DECIMAL) <= $${paramIndex}`;
    params.push(filters.maxQuantity);
    paramIndex++;
  }

  // Status filters
  if (filters.status === 'open') {
    filterConditions += ` AND exit_price IS NULL`;
  } else if (filters.status === 'closed') {
    filterConditions += ` AND exit_price IS NOT NULL`;
  }

  // P&L filters
  if (filters.minPnl !== undefined) {
    filterConditions += ` AND pnl >= $${paramIndex}`;
    params.push(filters.minPnl);
    paramIndex++;
  }
  if (filters.maxPnl !== undefined) {
    filterConditions += ` AND pnl <= $${paramIndex}`;
    params.push(filters.maxPnl);
    paramIndex++;
  }
  if (filters.pnlType === 'profit') {
    filterConditions += ` AND pnl > 0`;
  } else if (filters.pnlType === 'loss') {
    filterConditions += ` AND pnl < 0`;
  }

  // Day of week filter (use trade_date for simplicity within analytics context)
  if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
    const placeholders = filters.daysOfWeek.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND EXTRACT(DOW FROM trade_date) IN (${placeholders})`;
    params.push(...filters.daysOfWeek);
  }

  // hasNews filter
  if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
    if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
      filterConditions += ` AND has_news = true`;
    } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
      filterConditions += ` AND (has_news = false OR has_news IS NULL)`;
    }
  }

  // Quality grade filter - multi-select support (A, B, C, D, F)
  if (filters.qualityGrades && filters.qualityGrades.length > 0) {
    const placeholders = filters.qualityGrades.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND quality_grade IN (${placeholders})`;
    params.push(...filters.qualityGrades);
  }

  // Instrument types filter (stock, option, future)
  if (filters.instrumentTypes && filters.instrumentTypes.length > 0) {
    const placeholders = filters.instrumentTypes.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND instrument_type IN (${placeholders})`;
    params.push(...filters.instrumentTypes);
  }

  // Option types filter (call, put) - only applies to options
  if (filters.optionTypes && filters.optionTypes.length > 0) {
    const placeholders = filters.optionTypes.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND option_type IN (${placeholders})`;
    params.push(...filters.optionTypes);
  }

  // Hold time filter
  if (filters.holdTime) {
    filterConditions += getHoldTimeFilter(filters.holdTime);
  }

  // hasRValue filter - filter to only trades with stop_loss set (valid R-value trades)
  if (filters.hasRValue !== undefined && filters.hasRValue !== '' && filters.hasRValue !== null) {
    if (filters.hasRValue === 'true' || filters.hasRValue === true || filters.hasRValue === '1') {
      filterConditions += ` AND stop_loss IS NOT NULL`;
    }
  }

  // Account identifier filter - multi-select support
  if (filters.accounts && filters.accounts.length > 0) {
    const placeholders = filters.accounts.map(() => `$${paramIndex++}`).join(',');
    filterConditions += ` AND account_identifier IN (${placeholders})`;
    params.push(...filters.accounts);
  }

  console.log('--- Filter Results (normalized) ---');
  console.log('Final filter conditions:', filterConditions);
  console.log('Final params:', params);
  console.log('--- End Filter Debug ---');

  // Validate that filterConditions only contains parameterized placeholders ($N), not raw user input.
  // This serves as a security checkpoint - all user values MUST be in the params array.
  if (filterConditions) {
    // Strip all known safe SQL tokens and $N placeholders; remainder should be empty
    const stripped = filterConditions
      .replace(/\$\d+/g, '')
      .replace(/(::\w+\[\]|::\w+)/g, '')
      .replace(/\b(AND|OR|IN|IS|NOT|NULL|LIKE|UPPER|BETWEEN|EXTRACT|EPOCH|FROM|COALESCE|NOW|ANY|DOW|SELECT|WHERE|symbol|symbol_categories|finnhub_industry|trade_date|strategy|side|entry_price|exit_price|quantity|pnl|broker|tags|quality_grade|instrument_type|option_type|account_identifier|stop_loss|has_news|true|false|CAST|DECIMAL|AS)\b/gi, '')
      .replace(/[(),\s>=<!.&]+/g, '');
    if (stripped.length > 0) {
      console.warn('[SECURITY] Unexpected tokens in filter conditions:', stripped.substring(0, 100));
    }
  }

  return { filterConditions, params };
}

function buildCalendarRiskMetrics(rows = []) {
  const metricsByDate = new Map();

  rows.forEach((row) => {
    if (!row.trade_date) return;

    const current = metricsByDate.get(row.trade_date) || {
      dailyRValue: 0,
      dailyRiskAmount: 0,
      riskTradeCount: 0
    };

    const rValue = row.r_value != null ? parseFloat(row.r_value) : null;
    if (rValue != null && isFinite(rValue)) {
      current.dailyRValue += rValue;
    }

    const riskAmount = Trade.calculateRiskAmount(
      row.entry_price,
      row.stop_loss,
      row.quantity,
      row.side,
      row.instrument_type,
      row.contract_size,
      row.point_value,
      row.symbol,
      row.underlying_asset
    );

    if (riskAmount != null) {
      current.dailyRiskAmount += riskAmount;
      current.riskTradeCount += 1;
    }

    metricsByDate.set(row.trade_date, current);
  });

  return metricsByDate;
}

function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Returns YYYY-MM-DD for a timestamp candidate, interpreted in the given timezone.
// Used for the legacy fallback when a trade has no annotated executions.
function getExecutionDateString(timezone, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const str = String(candidate);
    const dateOnly = str.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) return dateOnly[1];

    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) continue;

    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(parsed);
    } catch (err) {
      return parsed.toISOString().split('T')[0];
    }
  }

  return null;
}

function getTradeValueMultiplier(trade) {
  if (trade.instrument_type === 'future') {
    const pointValue = parseNumericValue(trade.point_value);
    return pointValue != null && pointValue > 0 ? pointValue : 1;
  }

  if (trade.instrument_type === 'option') {
    const contractSize = parseNumericValue(trade.contract_size);
    return contractSize != null && contractSize > 0 ? contractSize : 100;
  }

  return 1;
}

// Convert a stored execution into { date, pnl } if it represents a closing leg.
// Prefers engine-stamped realized_pnl + exit_date; falls back to legacy reconstruction
// for trades that pre-date the canonical engine (pre-backfill).
function getExitEventFromExecution(execution, trade, timezone) {
  const realized = parseNumericValue(execution.realized_pnl);
  if (realized != null) {
    const date = execution.exit_date
      ? execution.exit_date
      : getExecutionDateString(
          timezone,
          execution.exitTime,
          execution.exit_time,
          execution.datetime
        );
    if (date) return { date, pnl: realized };
  }

  return legacyExitEventFromExecution(execution, trade, timezone);
}

function legacyExitEventFromExecution(execution, trade, timezone) {
  const date = getExecutionDateString(
    timezone,
    execution.exitTime,
    execution.exit_time,
    execution.datetime
  );
  if (!date) return null;

  const stored = parseNumericValue(execution.pnl ?? execution.p_l ?? execution.profit_loss);
  if (stored != null) return { date, pnl: stored };

  const exitPrice = parseNumericValue(execution.exitPrice ?? execution.exit_price);
  const entryPrice = parseNumericValue(execution.entryPrice ?? execution.entry_price);
  const quantity = Math.abs(parseNumericValue(execution.quantity) || 0);
  if (exitPrice == null || entryPrice == null || quantity <= 0) return null;

  const multiplier = getTradeValueMultiplier(trade);
  const side = execution.side || trade.side;
  const commission = parseNumericValue(execution.commission) || 0;
  const fees = parseNumericValue(execution.fees ?? execution.fee) || 0;

  const gross = side === 'short'
    ? (entryPrice - exitPrice) * quantity * multiplier
    : (exitPrice - entryPrice) * quantity * multiplier;
  return { date, pnl: gross - commission - fees };
}

function tradeExitEvents(trade, timezone) {
  const executions = Array.isArray(trade.executions) ? trade.executions : [];
  if (executions.length === 0) return [];

  const hasStamped = executions.some((e) => e && parseNumericValue(e.realized_pnl) != null);
  if (hasStamped) {
    return executions
      .map((exec) => exec && getExitEventFromExecution(exec, trade, timezone))
      .filter(Boolean);
  }

  const { computeTradePnl } = require('../services/pnlEngine');
  const engineResult = computeTradePnl({
    side: trade.side,
    instrumentType: trade.instrument_type || 'stock',
    contractSize: trade.contract_size,
    pointValue: trade.point_value,
    fallbackCommission: trade.commission != null ? parseNumericValue(trade.commission) : null,
    fallbackFees: trade.fees != null ? parseNumericValue(trade.fees) : null,
    executions,
    timezone,
    tradeId: trade.trade_id || trade.id
  });

  return engineResult.annotatedExecutions
    .filter((e) => parseNumericValue(e.realized_pnl) != null && e.exit_date)
    .map((e) => ({ date: e.exit_date, pnl: parseNumericValue(e.realized_pnl) }));
}

function buildCalendarDayContributions(trades, dateStr, timezone) {
  return trades
    .map((trade) => {
      const exitEvents = tradeExitEvents(trade, timezone);
      const eventsOnDay = exitEvents.filter((e) => e.date === dateStr);
      const exactTradePnl = parseNumericValue(trade.pnl);

      let pnl = null;
      let exitCount = 0;
      let totalExitCount = exitEvents.length;

      if (eventsOnDay.length > 0) {
        pnl = eventsOnDay.reduce((sum, e) => sum + (e.pnl || 0), 0);
        exitCount = eventsOnDay.length;
      } else if (
        totalExitCount === 0 &&
        exactTradePnl != null &&
        getExecutionDateString(timezone, trade.exit_time) === dateStr
      ) {
        pnl = exactTradePnl;
        exitCount = 1;
        totalExitCount = 1;
      }

      if (pnl == null || exitCount === 0) return null;

      const riskAmount = Trade.calculateRiskAmount(
        trade.entry_price,
        trade.stop_loss,
        trade.quantity,
        trade.side,
        trade.instrument_type,
        trade.contract_size,
        trade.point_value,
        trade.symbol,
        trade.underlying_asset
      );

      return {
        trade_id: trade.trade_id,
        symbol: trade.symbol,
        side: trade.side,
        pnl,
        r_value: (exitCount === totalExitCount && trade.r_value != null && trade.stop_loss != null)
          ? parseFloat(trade.r_value)
          : null,
        risk_amount: riskAmount != null ? Math.round(riskAmount * 100) / 100 : null,
        exit_count: exitCount,
        is_partial: exitCount < totalExitCount
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.trade_id || '').localeCompare(b.trade_id || ''));
}

function buildCalendarOverviewRows(trades, startDateStr, endDateStr, timezone) {
  const byDate = new Map();

  const add = (tradeId, date, pnl) => {
    if (!date || pnl == null) return;
    let day = byDate.get(date);
    if (!day) {
      day = { tradeIds: new Set(), dailyPnl: 0 };
      byDate.set(date, day);
    }
    day.tradeIds.add(tradeId);
    day.dailyPnl += pnl;
  };

  trades.forEach((trade) => {
    const exitEvents = tradeExitEvents(trade, timezone);
    if (exitEvents.length > 0) {
      exitEvents.forEach((event) => {
        if (event.date >= startDateStr && event.date <= endDateStr) {
          add(trade.trade_id, event.date, event.pnl);
        }
      });
      return;
    }

    const exactPnl = parseNumericValue(trade.pnl);
    const date = getExecutionDateString(timezone, trade.exit_time);
    if (exactPnl != null && date && date >= startDateStr && date <= endDateStr) {
      add(trade.trade_id, date, exactPnl);
    }
  });

  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, data]) => ({
      trade_date: date,
      trades: data.tradeIds.size,
      daily_pnl: data.dailyPnl
    }));
}
// Build the breakeven predicate (gross P&L within per-instrument tolerance) over
// raw `trades` columns, for the per-symbol/sector/tag/etc. breakdown queries so
// their win/loss counts stay consistent with the overview. Falls back to the
// exact `gross = 0` form when the user has no tolerance configured.
async function rawBreakevenPredicate(userId) {
  const { getBreakevenToleranceConfig, breakevenPredicate } = require('../utils/breakeven');
  return breakevenPredicate({
    gross: '(pnl + COALESCE(commission, 0) + COALESCE(fees, 0))',
    tickSize: 'tick_size',
    pointValue: 'point_value',
    quantity: 'quantity',
    underlying: 'underlying_asset'
  }, await getBreakevenToleranceConfig(userId));
}

const analyticsController = {
  async getOverview(req, res, next) {
    try {
      const filterData = buildFilterConditions(req.query);
      
      // Get user's preference for average vs median calculations
      const User = require('../models/User');
      const { normalizeConfig, breakevenPredicate, toleranceCacheKey } = require('../utils/breakeven');
      let useMedian = false;
      let breakevenConfig = { default: 0, byUnderlying: {} };
      // Whole-trade win rate (issue #339): a global profile setting. When on,
      // the completed_trades CTE collapses each multi-leg position (e.g. an
      // option spread) into a single synthetic trade so win rate, counts, avg,
      // and profit factor are measured per position instead of per leg. Total
      // P&L is unchanged (sum of legs == sum of groups).
      let groupByPosition = false;
      try {
        const userSettings = await User.getSettings(req.user.id);
        useMedian = userSettings?.statistics_calculation === 'median';
        groupByPosition = userSettings?.analytics_position_grouping === true;
        breakevenConfig = normalizeConfig({
          default: userSettings?.breakeven_tolerance_ticks,
          byUnderlying: userSettings?.breakeven_tolerance_ticks_by_underlying
        });
      } catch (error) {
        console.warn('Could not fetch user settings for analytics, using default (average):', error.message);
        useMedian = false;
      }

      // Breakeven predicate over the completed_trades CTE (SELECT * from trades).
      // In position-grouping mode the per-leg tick/point/underlying tolerance no
      // longer applies to a combined position, so a group is breakeven only when
      // its net P&L rounds to exactly zero.
      const be = groupByPosition
        ? GROUPED_BREAKEVEN
        : breakevenPredicate({
            gross: '(COALESCE(pnl, 0) + COALESCE(commission, 0) + COALESCE(fees, 0))',
            tickSize: 'tick_size',
            pointValue: 'point_value',
            quantity: 'quantity',
            underlying: 'underlying_asset'
          }, breakevenConfig);

      // Include filter hash in cache key to handle different filter combinations.
      // Tolerance config is part of the key so changing it yields fresh results.
      const normalizedFiltersForCache = convertQueryToTradeFilters(req.query);
      const filterHashKey = createFilterHash(normalizedFiltersForCache);
      const cacheKey = `analytics_overview_${req.user.id}_${filterHashKey}_${useMedian ? 'median' : 'avg'}_be${toleranceCacheKey(breakevenConfig)}_grp${groupByPosition ? 'pos' : 'leg'}`;
      
      // Check cache first for faster response
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(`[CACHE HIT] Analytics overview returned from cache for user ${req.user.id}`);
        return res.json(cachedData);
      }
      console.log(`[CACHE MISS] Computing analytics overview for user ${req.user.id}`);

      const { filterConditions, params: filterParams } = filterData;
      const params = [req.user.id, ...filterParams];

      // In position-grouping mode each row is one position: legs sharing the
      // same account, underlying (falling back to symbol), and exact entry_time
      // are summed into one synthetic trade. Trades with no entry_time fall back
      // to their own id so they are never merged. Only the columns referenced
      // downstream are projected; the trivial breakeven predicate above means
      // tick_size/point_value/quantity/underlying_asset are not needed here.
      const completedTradesCte = groupByPosition
        ? `completed_trades AS (
            SELECT
                SUM(pnl) as pnl,
                SUM(COALESCE(commission, 0)) as commission,
                SUM(COALESCE(fees, 0)) as fees,
                SUM(r_value) as r_value,
                MIN(stop_loss) as stop_loss,
                MIN(trade_date) as trade_date,
                MIN(entry_time) as entry_time
            FROM trades
            WHERE user_id = $1 ${filterConditions}
                AND exit_price IS NOT NULL
                AND pnl IS NOT NULL
            GROUP BY ${POSITION_GROUP_KEY}
        )`
        : `completed_trades AS (
            -- Each trade with both entry and exit price is a complete round trip
            SELECT
                *
            FROM trades
            WHERE user_id = $1 ${filterConditions}
                AND exit_price IS NOT NULL
                AND pnl IS NOT NULL
        )`;

      const overviewQuery = `
        WITH ${completedTradesCte},
        individual_trades AS (
            -- Get best/worst individual executions
            SELECT
                COALESCE(MAX(pnl), 0) as individual_best_trade,
                COALESCE(MIN(pnl), 0) as individual_worst_trade
            FROM completed_trades
        )
        SELECT
          (SELECT COUNT(*) FROM completed_trades)::integer as total_trades,
          -- Breakeven = gross P&L within tolerance (exited ~at entry, ignoring
          -- commissions/fees). Wins/losses use NET P&L among the rest.
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.isNot} AND pnl > 0)::integer as winning_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.isNot} AND pnl < 0)::integer as losing_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.is})::integer as breakeven_trades,
          COALESCE(SUM(pnl), 0)::numeric as total_pnl,
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl), 0)::numeric as avg_pnl'
            : 'COALESCE(AVG(pnl), 0)::numeric as avg_pnl'
          },
          ${useMedian
            ? `COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl) FILTER (WHERE ${be.isNot} AND pnl > 0), 0)::numeric as avg_win`
            : `COALESCE(AVG(pnl) FILTER (WHERE ${be.isNot} AND pnl > 0), 0)::numeric as avg_win`
          },
          ${useMedian
            ? `COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl) FILTER (WHERE ${be.isNot} AND pnl < 0), 0)::numeric as avg_loss`
            : `COALESCE(AVG(pnl) FILTER (WHERE ${be.isNot} AND pnl < 0), 0)::numeric as avg_loss`
          },
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r_value) FILTER (WHERE r_value IS NOT NULL AND stop_loss IS NOT NULL), 0)::numeric as avg_r_value'
            : 'COALESCE(AVG(r_value) FILTER (WHERE r_value IS NOT NULL AND stop_loss IS NOT NULL), 0)::numeric as avg_r_value'
          },
          COALESCE(SUM(r_value) FILTER (WHERE r_value IS NOT NULL AND stop_loss IS NOT NULL), 0)::numeric as total_r_value,
          -- R-value specific stats (only trades with stop_loss set)
          (SELECT COUNT(*) FROM completed_trades WHERE stop_loss IS NOT NULL)::integer as r_total_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.isNot} AND pnl > 0 AND stop_loss IS NOT NULL)::integer as r_winning_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.isNot} AND pnl < 0 AND stop_loss IS NOT NULL)::integer as r_losing_trades,
          (SELECT COUNT(*) FROM completed_trades WHERE ${be.is} AND stop_loss IS NOT NULL)::integer as r_breakeven_trades,
          COALESCE(SUM(pnl) FILTER (WHERE stop_loss IS NOT NULL), 0)::numeric as r_total_pnl,
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl) FILTER (WHERE stop_loss IS NOT NULL), 0)::numeric as r_avg_pnl'
            : 'COALESCE(AVG(pnl) FILTER (WHERE stop_loss IS NOT NULL), 0)::numeric as r_avg_pnl'
          },
          ${useMedian
            ? `COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl) FILTER (WHERE ${be.isNot} AND pnl > 0 AND stop_loss IS NOT NULL), 0)::numeric as r_avg_win`
            : `COALESCE(AVG(pnl) FILTER (WHERE ${be.isNot} AND pnl > 0 AND stop_loss IS NOT NULL), 0)::numeric as r_avg_win`
          },
          ${useMedian
            ? `COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pnl) FILTER (WHERE ${be.isNot} AND pnl < 0 AND stop_loss IS NOT NULL), 0)::numeric as r_avg_loss`
            : `COALESCE(AVG(pnl) FILTER (WHERE ${be.isNot} AND pnl < 0 AND stop_loss IS NOT NULL), 0)::numeric as r_avg_loss`
          },
          -- Best/worst trades
          (SELECT individual_best_trade FROM individual_trades) as best_trade,
          (SELECT individual_worst_trade FROM individual_trades) as worst_trade,
          (SELECT COUNT(*) FROM completed_trades)::integer as total_executions,
          COALESCE(SUM(pnl) FILTER (WHERE pnl > 0), 0) as total_gross_wins,
          COALESCE(ABS(SUM(pnl) FILTER (WHERE pnl < 0)), 0) as total_gross_losses,
          COALESCE(SUM(commission), 0) as total_commissions,
          COALESCE(SUM(fees), 0) as total_fees,
          COALESCE(STDDEV(pnl), 0) as pnl_stddev,
          (SELECT array_agg(pnl ORDER BY trade_date, entry_time) FROM completed_trades) as pnl_array
        FROM completed_trades
      `;

      const result = await db.query(overviewQuery, params);
      const overview = result.rows[0];

      // --- BEGIN DEBUG LOGGING ---
      console.log('--- Analytics Overview Debug ---');
      console.log('Query Parameters:', { filters: req.query, userId: req.user.id });
      console.log('Raw Query Result:', result.rows);
      if (overview) {
        console.log('Initial Overview Object:', JSON.parse(JSON.stringify(overview)));
        console.log('Total trades found:', overview.total_trades);
      } else {
        console.log('No overview data returned from query.');
        // Send a valid empty response if overview is missing
        return res.json({ 
          overview: {
            total_pnl: 0, win_rate: 0, win_rate_excluding_breakeven: 0, total_trades: 0, winning_trades: 0, losing_trades: 0,
            breakeven_trades: 0, avg_pnl: 0, avg_win: 0, avg_loss: 0, best_trade: 0,
            worst_trade: 0, profit_factor: 0, sqn: '0.00', probability_random: 'N/A', 
            kelly_percentage: '0.00', k_ratio: '0.00', total_commissions: 0, total_fees: 0, 
            avg_mae: 'N/A', avg_mfe: 'N/A' 
          }
        });
      }
      // --- END DEBUG LOGGING ---

      // Debug logging
      console.log('Overview query result:', {
        total_trades: overview.total_trades,
        has_pnl_array: !!overview.pnl_array,
        pnl_array_length: overview.pnl_array ? overview.pnl_array.length : 0,
        total_gross_wins: overview.total_gross_wins,
        total_gross_losses: overview.total_gross_losses
      });

      // Convert numeric values to proper format
      overview.total_trades = parseInt(overview.total_trades) || 0;
      overview.winning_trades = parseInt(overview.winning_trades) || 0;
      overview.losing_trades = parseInt(overview.losing_trades) || 0;
      overview.breakeven_trades = parseInt(overview.breakeven_trades) || 0;
      overview.total_executions = parseInt(overview.total_executions) || 0;

      overview.total_pnl = parseFloat(overview.total_pnl) || 0;
      overview.avg_pnl = parseFloat(overview.avg_pnl) || 0;
      overview.avg_win = parseFloat(overview.avg_win) || 0;
      overview.avg_loss = parseFloat(overview.avg_loss) || 0;
      overview.best_trade = parseFloat(overview.best_trade) || 0;
      overview.worst_trade = parseFloat(overview.worst_trade) || 0;
      overview.avg_r_value = parseFloat(overview.avg_r_value) || 0;

      overview.win_rate = overview.total_trades > 0
        ? (overview.winning_trades / overview.total_trades * 100).toFixed(2)
        : 0;

      // Win rate excluding breakeven trades (denominator = wins + losses only).
      // The issue reporter asked for both figures since breakeven-heavy
      // strategies skew the standard win rate.
      const decisiveTrades = overview.winning_trades + overview.losing_trades;
      overview.win_rate_excluding_breakeven = decisiveTrades > 0
        ? (overview.winning_trades / decisiveTrades * 100).toFixed(2)
        : 0;

      // Calculate advanced trading metrics
      
      // 1. Profit Factor (ratio) - Total gross wins divided by total gross losses
      overview.profit_factor = overview.total_gross_losses > 0
        ? (overview.total_gross_wins / overview.total_gross_losses).toFixed(2)
        : overview.total_gross_wins > 0 ? 'Infinite' : '0.00';

      // 2. System Quality Number (ratio) - Measures trading system quality
      // SQN = (Average Trade / Standard Deviation) * sqrt(Number of Trades)
      const stdDev = parseFloat(overview.pnl_stddev) || 0;
      const avgTrade = parseFloat(overview.avg_pnl) || 0;
      const sqrtTrades = Math.sqrt(overview.total_trades);
      
      if (stdDev > 0 && overview.total_trades > 0) {
        overview.sqn = ((avgTrade / stdDev) * sqrtTrades).toFixed(2);
      } else {
        overview.sqn = '0.00';
      }

      // 3. Kelly Percentage (% of capital) - Optimal position size for maximum growth
      // Kelly % = (Win Rate × Avg Win/Avg Loss - Loss Rate) / (Avg Win/Avg Loss)
      const winRate = overview.winning_trades / overview.total_trades;
      const lossRate = overview.losing_trades / overview.total_trades;
      const avgWin = Math.abs(parseFloat(overview.avg_win)) || 0;
      const avgLoss = Math.abs(parseFloat(overview.avg_loss)) || 0;
      
      if (avgLoss > 0 && overview.total_trades > 0) {
        const winLossRatio = avgWin / avgLoss;
        const kellyDecimal = (winRate * winLossRatio - lossRate) / winLossRatio;
        overview.kelly_percentage = (kellyDecimal * 100).toFixed(2);
        
        // Debug info
        console.log('Kelly % calculation:', {
          winRate: winRate.toFixed(4),
          lossRate: lossRate.toFixed(4),
          avgWin: avgWin.toFixed(2),
          avgLoss: avgLoss.toFixed(2),
          winLossRatio: winLossRatio.toFixed(4),
          kellyDecimal: kellyDecimal.toFixed(4),
          kellyPercentage: overview.kelly_percentage
        });
      } else {
        overview.kelly_percentage = '0.00';
      }

      // 4. K-Ratio (ratio) - Measures consistency of returns over time using user-entered equity values
      // K-Ratio = Average Return / Standard Deviation of Returns
      // Uses only user-entered equity snapshots, not calculated trade data
      
      try {
        console.log('Starting K-Ratio calculation using equity snapshots...');
        // Get user-entered equity snapshots only
        const equityQuery = `
          SELECT 
            equity_amount,
            snapshot_date
          FROM equity_snapshots
          WHERE user_id = $1
          ORDER BY snapshot_date ASC
        `;
        
        const equityResult = await db.query(equityQuery, [req.user.id]);
        const equitySnapshots = equityResult.rows;
        
        console.log('K-Ratio equity snapshots found:', equitySnapshots.length);
        console.log('K-Ratio equity snapshots data:', equitySnapshots);
        
        if (equitySnapshots && equitySnapshots.length >= 3) {
          // Calculate daily returns from user-entered equity values
          const returns = [];
          for (let i = 1; i < equitySnapshots.length; i++) {
            const prevEquity = parseFloat(equitySnapshots[i - 1].equity_amount);
            const currentEquity = parseFloat(equitySnapshots[i].equity_amount);
            console.log(`K-Ratio: Processing ${equitySnapshots[i].snapshot_date}: ${prevEquity} -> ${currentEquity}`);
            if (prevEquity > 0) {
              const dailyReturn = (currentEquity - prevEquity) / prevEquity;
              returns.push(dailyReturn);
              console.log(`K-Ratio: Daily return: ${dailyReturn.toFixed(6)}`);
            }
          }
          
          console.log('K-Ratio daily returns calculated:', returns.length);
          
          if (returns.length > 0) {
            // Calculate average return and standard deviation
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);
            
            // Calculate K-Ratio
            const kRatio = stdDev === 0 ? 0 : avgReturn / stdDev;
            overview.k_ratio = kRatio.toFixed(2);
            
            console.log('K-Ratio calculation details:');
            console.log('  equity snapshots:', equitySnapshots.length);
            console.log('  returns count:', returns.length);
            console.log('  avgReturn:', avgReturn.toFixed(6));
            console.log('  stdDev:', stdDev.toFixed(6));
            console.log('  kRatio:', kRatio.toFixed(6));
          } else {
            overview.k_ratio = '0.00';
            console.log('K-Ratio: No valid returns calculated');
          }
        } else {
          overview.k_ratio = '0.00';
          console.log('K-Ratio: Insufficient equity snapshots (need at least 2)');
        }
      } catch (error) {
        console.error('K-Ratio calculation error:', error);
        overview.k_ratio = '0.00';
      }

      // 5. Probability of Random Chance (probability) - Statistical significance of results
      // Uses chi-square test based on win rate deviation from 50%
      if (overview.total_trades > 0) {
        const expectedWins = overview.total_trades * 0.5;
        const chiSquare = Math.pow(overview.winning_trades - expectedWins, 2) / expectedWins +
                         Math.pow(overview.losing_trades - expectedWins, 2) / expectedWins;
        
        // Convert chi-square to probability (simplified)
        // For df=1, critical value at 95% confidence is 3.841
        if (chiSquare > 3.841) {
          overview.probability_random = '< 5%';
        } else if (chiSquare > 2.706) {
          overview.probability_random = '< 10%';
        } else if (chiSquare > 1.642) {
          overview.probability_random = '< 20%';
        } else {
          overview.probability_random = '> 20%';
        }
      } else {
        overview.probability_random = 'N/A';
      }

      // 6. Total Commissions and Fees (USD) - Total trading costs
      overview.total_commissions = parseFloat(overview.total_commissions) || 0;
      overview.total_fees = parseFloat(overview.total_fees) || 0;

      // 7. Average Position MAE and MFE - Calculate quickly with simple estimation
      try {
        console.log('Starting MAE/MFE calculation...');
        const estimates = await Promise.race([
          calculateMAEMFEAsync(req.user.id, filterConditions, params),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('MAE/MFE calculation timeout')), 5000)
          )
        ]);
        console.log('MAE/MFE calculation completed');
        overview.avg_mae = estimates.avgMAE;
        overview.avg_mfe = estimates.avgMFE;
      } catch (error) {
        console.error('MAE/MFE calculation error:', error);
        overview.avg_mae = 'N/A';
        overview.avg_mfe = 'N/A';
      }

      // Streak & momentum metrics — surfaced on the dashboard hero ribbon
      // and StreakMomentumCard. Computed from the same filtered trade set
      // so the global account/time filters apply consistently.
      try {
        const streakQuery = `
          WITH daily AS (
            SELECT
              trade_date,
              COALESCE(SUM(pnl), 0)::numeric AS day_pnl,
              COUNT(*)::integer AS day_trades
            FROM trades
            WHERE user_id = $1 ${filterConditions}
              AND pnl IS NOT NULL
              AND exit_price IS NOT NULL
            GROUP BY trade_date
            ORDER BY trade_date
          ),
          tagged AS (
            SELECT
              trade_date,
              day_pnl,
              day_trades,
              CASE WHEN day_pnl > 0 THEN 'W'
                   WHEN day_pnl < 0 THEN 'L'
                   ELSE 'B' END AS result
            FROM daily
          ),
          grouped AS (
            SELECT
              trade_date,
              result,
              ROW_NUMBER() OVER (ORDER BY trade_date)
                - ROW_NUMBER() OVER (PARTITION BY result ORDER BY trade_date) AS grp
            FROM tagged
          ),
          runs AS (
            SELECT
              result,
              COUNT(*)::integer AS run_length,
              MAX(trade_date) AS run_end
            FROM grouped
            GROUP BY result, grp
          )
          SELECT
            (SELECT COUNT(*) FROM daily)::integer AS trading_days,
            (SELECT COALESCE(AVG(day_trades), 0)::numeric FROM daily) AS avg_daily_trades,
            (SELECT COALESCE(day_trades, 0)::integer FROM daily
              WHERE trade_date = CURRENT_DATE) AS today_trade_count,
            (SELECT COALESCE(day_pnl, 0)::numeric FROM daily
              WHERE trade_date = CURRENT_DATE) AS today_pnl,
            (SELECT result FROM tagged ORDER BY trade_date DESC LIMIT 1) AS last_day_result,
            (SELECT run_length FROM runs
              ORDER BY run_end DESC LIMIT 1) AS current_run_length,
            (SELECT COALESCE(MAX(run_length), 0)::integer FROM runs WHERE result = 'W') AS best_win_streak,
            (SELECT COALESCE(MAX(run_length), 0)::integer FROM runs WHERE result = 'L') AS worst_loss_streak
        `;
        const streakResult = await db.query(streakQuery, params);
        const streak = streakResult.rows[0] || {};
        const lastResult = streak.last_day_result;
        const runLen = parseInt(streak.current_run_length) || 0;

        overview.trading_days = parseInt(streak.trading_days) || 0;
        overview.avg_daily_trades = parseFloat(streak.avg_daily_trades) || 0;
        overview.today_trade_count = parseInt(streak.today_trade_count) || 0;
        overview.today_pnl = parseFloat(streak.today_pnl) || 0;
        // Positive = winning streak, negative = losing streak, 0 = no streak / breakeven
        overview.current_streak = lastResult === 'W' ? runLen
          : lastResult === 'L' ? -runLen
          : 0;
        overview.best_win_streak = parseInt(streak.best_win_streak) || 0;
        overview.worst_loss_streak = parseInt(streak.worst_loss_streak) || 0;
      } catch (streakErr) {
        console.error('[STREAK] calculation error:', streakErr);
        overview.trading_days = 0;
        overview.avg_daily_trades = 0;
        overview.today_trade_count = 0;
        overview.today_pnl = 0;
        overview.current_streak = 0;
        overview.best_win_streak = 0;
        overview.worst_loss_streak = 0;
      }

      // Clean up temporary fields
      delete overview.pnl_array;
      delete overview.pnl_stddev;
      delete overview.total_gross_wins;
      delete overview.total_gross_losses;

      // Debug logging before sending response
      console.log('Final overview object keys:', Object.keys(overview));
      console.log('Advanced metrics values:', {
        sqn: overview.sqn,
        k_ratio: overview.k_ratio,
        kelly_percentage: overview.kelly_percentage,
        probability_random: overview.probability_random,
        avg_mae: overview.avg_mae,
        avg_mfe: overview.avg_mfe
      });

      // Surface whether these numbers are grouped per position (issue #339) so
      // the UI can label the win rate as "whole trade".
      overview.position_grouping = groupByPosition;

      // Cache until invalidated by trade mutations (24h fallback TTL)
      const cacheTTL = 24 * 60 * 60 * 1000;
      cache.set(cacheKey, { overview }, cacheTTL);
      res.json({ overview });
    } catch (error) {
      console.error('Analytics overview error:', error);
      next(error);
    }
  },

  async getMAEMFE(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      
      let dateFilter = '';
      const params = [req.user.id];
      
      if (startDate) {
        dateFilter += ' AND trade_date >= $2';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ` AND trade_date <= $${params.length + 1}`;
        params.push(endDate);
      }

      const estimates = await calculateMAEMFEAsync(req.user.id, dateFilter, params);
      
      res.json({
        success: true,
        data: estimates
      });
    } catch (error) {
      console.error('Error getting MAE/MFE:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate MAE/MFE'
      });
    }
  },

  async getMAEMFETrades(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];
      const userSettings = await User.getSettings(req.user.id).catch(() => null);
      const breakevenConfig = normalizeConfig({
        default: userSettings?.breakeven_tolerance_ticks,
        byUnderlying: userSettings?.breakeven_tolerance_ticks_by_underlying
      });

      const query = `
        SELECT
          id,
          symbol,
          side,
          pnl,
          r_value,
          mae,
          mfe,
          post_exit_mae,
          post_exit_mfe,
          post_exit_window_minutes,
          post_exit_window_source,
          post_exit_window_end,
          stop_loss,
          entry_price,
          exit_price,
          quantity,
          executions,
          instrument_type,
          contract_size,
          point_value,
          tick_size,
          underlying_asset
        FROM trades
        WHERE user_id = $1 ${filterConditions}
          AND exit_time IS NOT NULL
          AND mae IS NOT NULL
          AND mfe IS NOT NULL
        ORDER BY trade_date DESC
        LIMIT 2000
      `;

      const result = await db.query(query, params);
      const trades = result.rows.map(t => {
        const riskAmount = Trade.calculateRiskAmount(
          t.entry_price,
          t.stop_loss,
          t.quantity,
          t.side,
          t.instrument_type || 'stock',
          t.contract_size,
          t.point_value,
          t.symbol,
          t.underlying_asset
        );

        const executions = Array.isArray(t.executions)
          ? t.executions
          : (typeof t.executions === 'string' ? (() => {
              try { return JSON.parse(t.executions); } catch { return []; }
            })() : []);
        const pnl = parseFloat(t.pnl) || 0;
        const metrics = buildExcursionMetrics({
          ...t,
          executions
        }, riskAmount, breakevenConfig);

        return {
          id: t.id,
          symbol: t.symbol,
          side: t.side,
          pnl,
          r_value: t.r_value != null ? parseFloat(t.r_value) : null,
          mae: metrics.mae,
          mfe: metrics.mfe,
          post_exit_mae: metrics.post_exit_mae,
          post_exit_mfe: metrics.post_exit_mfe,
          captured_move: metrics.captured_move,
          best_mfe: metrics.best_mfe,
          post_exit_mfe_delta: metrics.post_exit_mfe_delta,
          missed_after_exit: metrics.missed_after_exit,
          exit_efficiency: metrics.exit_efficiency,
          gross_pnl: metrics.gross_pnl,
          mae_points: metrics.mae_points,
          mfe_points: metrics.mfe_points,
          post_exit_mae_points: metrics.post_exit_mae_points,
          post_exit_mfe_points: metrics.post_exit_mfe_points,
          captured_move_points: metrics.captured_move_points,
          best_mfe_points: metrics.best_mfe_points,
          post_exit_mfe_delta_points: metrics.post_exit_mfe_delta_points,
          missed_after_exit_points: metrics.missed_after_exit_points,
          mae_r: metrics.mae_r,
          mfe_r: metrics.mfe_r,
          post_exit_mae_r: metrics.post_exit_mae_r,
          post_exit_mfe_r: metrics.post_exit_mfe_r,
          captured_move_r: metrics.captured_move_r,
          best_mfe_r: metrics.best_mfe_r,
          post_exit_mfe_delta_r: metrics.post_exit_mfe_delta_r,
          missed_after_exit_r: metrics.missed_after_exit_r,
          post_exit_window_minutes: t.post_exit_window_minutes,
          post_exit_window_source: t.post_exit_window_source,
          post_exit_window_end: t.post_exit_window_end,
          risk_amount: riskAmount != null ? parseFloat(riskAmount.toFixed(2)) : null,
          quantity: t.quantity != null ? parseFloat(t.quantity) : null,
          instrument_type: t.instrument_type || 'stock',
          point_value: t.point_value != null ? parseFloat(t.point_value) : null,
          tick_size: t.tick_size != null ? parseFloat(t.tick_size) : null,
          is_winner: metrics.is_winner,
          outcome: metrics.outcome
        };
      });

      const winners = trades.filter(t => t.is_winner);
      const losers = trades.filter(t => !t.is_winner);

      const avg = (arr, key) => arr.length > 0
        ? arr.reduce((s, t) => s + (t[key] || 0), 0) / arr.length
        : null;

      const winnersAvgMae = avg(winners, 'mae');
      const losersAvgMfe = avg(losers, 'mfe');
      const avgProfitLeft = winners.length > 0
        ? winners.reduce((s, t) => s + (t.best_mfe != null && t.captured_move != null ? Math.max(0, t.best_mfe - t.captured_move) : 0), 0) / winners.length
        : null;
      const avgMfeVsPnlGap = trades.length > 0
        ? trades.reduce((s, t) => s + (t.best_mfe != null && t.captured_move != null ? t.best_mfe - t.captured_move : 0), 0) / trades.length
        : null;
      const postExitTrades = trades.filter(t => t.post_exit_mfe != null);
      const avgPostExitMfe = avg(postExitTrades, 'post_exit_mfe');
      const avgPostExitMfeDelta = avg(postExitTrades, 'post_exit_mfe_delta');
      const avgMissedAfterExit = avg(postExitTrades, 'missed_after_exit');
      const avgExitEfficiency = winners.length > 0
        ? avg(winners.filter(t => t.exit_efficiency != null), 'exit_efficiency')
        : null;

      res.json({
        success: true,
        trades,
        stats: {
          trades_with_data: trades.length,
          winners_avg_mae: winnersAvgMae != null ? parseFloat(winnersAvgMae.toFixed(2)) : null,
          losers_avg_mfe: losersAvgMfe != null ? parseFloat(losersAvgMfe.toFixed(2)) : null,
          avg_profit_left: avgProfitLeft != null ? parseFloat(avgProfitLeft.toFixed(2)) : null,
          avg_mfe_vs_pnl_gap: avgMfeVsPnlGap != null ? parseFloat(avgMfeVsPnlGap.toFixed(2)) : null,
          trades_with_post_exit_data: postExitTrades.length,
          avg_post_exit_mfe: avgPostExitMfe != null ? parseFloat(avgPostExitMfe.toFixed(2)) : null,
          avg_post_exit_mfe_delta: avgPostExitMfeDelta != null ? parseFloat(avgPostExitMfeDelta.toFixed(2)) : null,
          avg_missed_after_exit: avgMissedAfterExit != null ? parseFloat(avgMissedAfterExit.toFixed(2)) : null,
          avg_exit_efficiency: avgExitEfficiency != null ? parseFloat(avgExitEfficiency.toFixed(2)) : null
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getPerformance(req, res, next) {
    try {
      const { period = 'daily' } = req.query;

      // Whitelist allowed periods to prevent SQL injection
      const allowedPeriods = ['daily', 'weekly', 'monthly'];
      const sanitizedPeriod = allowedPeriods.includes(period) ? period : 'daily';
      
      let groupBy;
      switch (sanitizedPeriod) {
        case 'weekly':
          groupBy = "DATE_TRUNC('week', trade_date)";
          break;
        case 'monthly':
          groupBy = "DATE_TRUNC('month', trade_date)";
          break;
        default:
          groupBy = 'trade_date';
      }

      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const performanceQuery = `
        SELECT
          ${groupBy} as period,
          COUNT(*) as trades,
          COALESCE(SUM(pnl), 0) as pnl,
          COALESCE(SUM(SUM(pnl)) OVER (ORDER BY ${groupBy}), 0) as cumulative_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as r_value,
          COALESCE(SUM(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL)) OVER (ORDER BY ${groupBy}), 0) as cumulative_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM trades
        WHERE user_id = $1 ${filterConditions}
        GROUP BY ${groupBy}
        ORDER BY period
      `;

      const result = await db.query(performanceQuery, params);
      
      res.json({ performance: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getSymbolStats(req, res, next) {
    try {
      const { limit = 10 } = req.query;
      
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      // Validate and sanitize limit parameter
      const sanitizedLimit = parseInt(limit);
      if (isNaN(sanitizedLimit) || sanitizedLimit < 1 || sanitizedLimit > 100) {
        return res.status(400).json({ error: 'Invalid limit parameter. Must be between 1 and 100' });
      }
      
      params.push(sanitizedLimit);

      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);
      // Return losing + breakeven counts so the dashboard symbol list can show
      // an "excl. BE" win-rate line beneath the inclusive rate, matching the
      // overview and per-tag/strategy/hour tables.
      const symbolQuery = groupByPosition
        ? `
        WITH positions AS (
          SELECT
            COALESCE(NULLIF(underlying_symbol, ''), symbol) as symbol,
            SUM(pnl) as pnl,
            COALESCE(AVG(pnl_percent), 0) as pnl_percent
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY COALESCE(NULLIF(underlying_symbol, ''), symbol), ${POSITION_GROUP_KEY}
        )
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(pnl_percent), 0) as avg_pnl_percent
        FROM positions
        GROUP BY symbol
        ORDER BY total_pnl DESC
        LIMIT $${params.length}
      `
        : `
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(pnl_percent), 0) as avg_pnl_percent
        FROM trades
        WHERE user_id = $1 ${filterConditions}
        GROUP BY symbol
        ORDER BY total_pnl DESC
        LIMIT $${params.length}
      `;

      const result = await db.query(symbolQuery, params);
      
      res.json({ symbols: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getTagStats(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);
      // Mirror the overview/monthly pattern: classify trades as wins/losses/BE
      // using the breakeven predicate, then expose both inclusive and exclusive
      // win rates so the frontend can show "X% incl. BE" with "Y% excl. BE".
      const tagQuery = groupByPosition
        ? `
        WITH leg_tags AS (
          SELECT
            UNNEST(tags) as tag,
            account_identifier,
            underlying_symbol,
            symbol,
            position_group_id,
            entry_time,
            id,
            pnl,
            r_value,
            stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions} AND tags IS NOT NULL
        ),
        positions AS (
          SELECT
            tag,
            SUM(pnl) as pnl,
            SUM(r_value) as r_value,
            MIN(stop_loss) as stop_loss
          FROM leg_tags
          GROUP BY tag, ${POSITION_GROUP_KEY}
        )
        SELECT
          tag,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM positions
        GROUP BY tag
        ORDER BY total_trades DESC
      `
        : `
        SELECT
          UNNEST(tags) as tag,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM trades
        WHERE user_id = $1 ${filterConditions} AND tags IS NOT NULL
        GROUP BY tag
        ORDER BY total_trades DESC
      `;

      const result = await db.query(tagQuery, params);

      res.json({ tags: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getStrategyStats(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);

      // In position-grouping mode, collapse legs into positions (within each
      // strategy) first, then aggregate the win/loss counts per strategy.
      const strategyQuery = groupByPosition
        ? `
        WITH grouped_legs AS (
          SELECT
            position_group_id,
            MIN(NULLIF(strategy, '')) as leg_strategy,
            SUM(pnl) as pnl,
            SUM(r_value) as r_value,
            MIN(stop_loss) as stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions}
            AND (strategy IS NOT NULL OR position_group_id IS NOT NULL)
          GROUP BY position_group_id, ${POSITION_GROUP_KEY}
        ),
        positions AS (
          SELECT
            COALESCE(tpg.detected_strategy, grouped_legs.leg_strategy) as strategy,
            grouped_legs.pnl,
            grouped_legs.r_value,
            grouped_legs.stop_loss
          FROM grouped_legs
          LEFT JOIN trade_position_groups tpg ON tpg.id = grouped_legs.position_group_id
          WHERE COALESCE(tpg.detected_strategy, grouped_legs.leg_strategy) IS NOT NULL
            AND COALESCE(tpg.detected_strategy, grouped_legs.leg_strategy) != ''
        )
        SELECT
          strategy,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM positions
        GROUP BY strategy
        ORDER BY total_trades DESC
      `
        : `
        SELECT
          strategy,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM trades
        WHERE user_id = $1 ${filterConditions} AND strategy IS NOT NULL AND strategy != ''
        GROUP BY strategy
        ORDER BY total_trades DESC
      `;

      const result = await db.query(strategyQuery, params);

      res.json({ strategies: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getHourOfDayStats(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      // Get user timezone for proper hour calculation
      const { getUserTimezone } = require('../utils/timezone');
      const userTimezone = await getUserTimezone(req.user.id);

      // Timezone is appended after user_id ($1) and all filter params, so its
      // placeholder index depends on how many filters are active.
      const tzParam = params.length + 1;
      const hourParams = params.concat([userTimezone]);

      // Convert entry_time from UTC to user's timezone for hour extraction
      // For timestamptz columns, "AT TIME ZONE 'tz'" converts the UTC time to that timezone
      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);
      const hourQuery = groupByPosition
        ? `
        WITH positions AS (
          SELECT
            EXTRACT(HOUR FROM (MIN(entry_time) AT TIME ZONE $${tzParam})) as hour,
            SUM(pnl) as pnl,
            SUM(r_value) as r_value,
            MIN(stop_loss) as stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions}
            AND entry_time IS NOT NULL
          GROUP BY ${POSITION_GROUP_KEY}
        )
        SELECT
          hour,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM positions
        GROUP BY hour
        ORDER BY hour
      `
        : `
        SELECT
          EXTRACT(HOUR FROM (entry_time AT TIME ZONE $${tzParam})) as hour,
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl < 0 THEN 1 END) as losing_trades,
          COUNT(CASE WHEN ${be.is} THEN 1 END) as breakeven_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COALESCE(AVG(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as avg_r_value,
          COUNT(CASE WHEN stop_loss IS NOT NULL THEN 1 END) as trades_with_r
        FROM trades
        WHERE user_id = $1 ${filterConditions}
          AND entry_time IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM (entry_time AT TIME ZONE $${tzParam}))
        ORDER BY hour
      `;

      const result = await db.query(hourQuery, hourParams);

      res.json({ hours: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getCalendarData(req, res, next) {
    try {
      const { year } = req.query;
      
      // Require year parameter for performance - fetch only one year at a time
      if (!year) {
        return res.status(400).json({ error: 'Year parameter is required' });
      }
      
      const sanitizedYear = parseInt(year);
      if (isNaN(sanitizedYear) || sanitizedYear < 1900 || sanitizedYear > 2100) {
        return res.status(400).json({ error: 'Invalid year parameter' });
      }

      const startDate = `${sanitizedYear}-01-01`;
      const endDate = `${sanitizedYear}-12-31`;

      // Bucket trades by the user's configured timezone so cross-midnight UTC
      // trades land on the correct calendar day from the user's perspective.
      const userTz = await getUserTimezone(req.user.id);

      // Build filter conditions without date range - dates are handled explicitly in each CTE
      // Using req.query directly avoids adding trade_date filters that exclude trades whose
      // trade_date moved to a different year (e.g. partial exits spanning calendar years)
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      // Execution-level calendar: aggregate yearly rows with the same execution
      // reconstruction logic used by the day-detail modal so historical legacy
      // trades stay consistent even when stored trade P&L is stale.
      const paramOffset = params.length;
      const tableAlias = 't';
      const fc = filterConditions ? filterConditions.replace(/\btrade_date\b/g, `${tableAlias}.trade_date`).replace(/\bsymbol\b/g, `${tableAlias}.symbol`).replace(/\bstrategy\b/g, `${tableAlias}.strategy`).replace(/\bside\b/g, `${tableAlias}.side`) : '';
      // Note: do NOT require trade.pnl IS NOT NULL here. Open positions with partial
      // closes have realized P&L in their executions JSONB but trade.pnl stays NULL
      // until the position is fully closed (see csvParser.js IBKR open-position branch).
      // The execution-level aggregator handles those rows correctly.
      const calendarTradesQuery = `
        SELECT
          ${tableAlias}.id AS trade_id,
          ${tableAlias}.symbol,
          ${tableAlias}.side,
          ${tableAlias}.pnl,
          ${tableAlias}.commission,
          ${tableAlias}.fees,
          ${tableAlias}.r_value,
          ${tableAlias}.stop_loss,
          ${tableAlias}.entry_price,
          ${tableAlias}.quantity,
          ${tableAlias}.instrument_type,
          ${tableAlias}.contract_size,
          ${tableAlias}.point_value,
          ${tableAlias}.underlying_asset,
          ${tableAlias}.exit_time,
          ${tableAlias}.executions
        FROM trades ${tableAlias}
        WHERE ${tableAlias}.user_id = $1
          AND (
            (
              ${tableAlias}.pnl IS NOT NULL
              AND (${tableAlias}.exit_time AT TIME ZONE $${paramOffset + 3})::date >= $${paramOffset + 1}::date
              AND (${tableAlias}.exit_time AT TIME ZONE $${paramOffset + 3})::date <= $${paramOffset + 2}::date
            )
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(${tableAlias}.executions, '[]'::jsonb)) AS arr(exec)
              WHERE (exec->>'quantity') IS NOT NULL
                AND COALESCE(exec->>'exitTime', exec->>'exit_time', exec->>'datetime') IS NOT NULL
                AND (
                  exec->>'exitTime' IS NOT NULL
                  OR exec->>'exit_time' IS NOT NULL
                  OR exec->>'exitPrice' IS NOT NULL
                  OR exec->>'exit_price' IS NOT NULL
                  OR (
                    ${tableAlias}.side IN ('long', 'buy')
                    AND (
                      (exec->>'action') IN ('sell', 'short')
                      OR (exec->>'type') IN ('sell', 'short', 'exit')
                    )
                  )
                  OR (
                    ${tableAlias}.side IN ('short', 'sell')
                    AND (
                      (exec->>'action') IN ('buy', 'long')
                      OR (exec->>'type') IN ('buy', 'long', 'exit')
                    )
                  )
                )
                AND ((COALESCE(exec->>'exitTime', exec->>'exit_time', exec->>'datetime'))::timestamptz AT TIME ZONE $${paramOffset + 3})::date >= $${paramOffset + 1}::date
                AND ((COALESCE(exec->>'exitTime', exec->>'exit_time', exec->>'datetime'))::timestamptz AT TIME ZONE $${paramOffset + 3})::date <= $${paramOffset + 2}::date
            )
          )
          ${fc}
        ORDER BY ${tableAlias}.id
      `;

      const riskMetricsQuery = `
        SELECT
          (${tableAlias}.exit_time AT TIME ZONE $${paramOffset + 3})::date::text AS trade_date,
          ${tableAlias}.r_value,
          ${tableAlias}.entry_price,
          ${tableAlias}.stop_loss,
          ${tableAlias}.quantity,
          ${tableAlias}.side,
          ${tableAlias}.instrument_type,
          ${tableAlias}.contract_size,
          ${tableAlias}.point_value,
          ${tableAlias}.symbol,
          ${tableAlias}.underlying_asset
        FROM trades ${tableAlias}
        WHERE ${tableAlias}.user_id = $1
          AND ${tableAlias}.exit_time IS NOT NULL
          AND (${tableAlias}.exit_time AT TIME ZONE $${paramOffset + 3})::date >= $${paramOffset + 1}::date
          AND (${tableAlias}.exit_time AT TIME ZONE $${paramOffset + 3})::date <= $${paramOffset + 2}::date
          ${fc}
      `;

      // Add start date, end date, and user timezone to params
      const finalParams = [...params, startDate, endDate, userTz];
      const [calendarTradesResult, riskMetricsResult] = await Promise.all([
        db.query(calendarTradesQuery, finalParams),
        db.query(riskMetricsQuery, finalParams)
      ]);

      const calendarResultRows = buildCalendarOverviewRows(
        calendarTradesResult.rows,
        startDate,
        endDate,
        userTz
      );
      const riskMetricsByDate = buildCalendarRiskMetrics(riskMetricsResult.rows);
      const calendarRows = calendarResultRows.map((row) => {
        const riskMetrics = riskMetricsByDate.get(row.trade_date) || {
          dailyRValue: 0,
          dailyRiskAmount: 0,
          riskTradeCount: 0
        };

        return {
          ...row,
          daily_r_value: riskMetrics.dailyRValue,
          daily_risk_amount: riskMetrics.dailyRiskAmount,
          risk_trade_count: riskMetrics.riskTradeCount
        };
      });

      res.json({ calendar: calendarRows });
    } catch (error) {
      console.error('Calendar data error:', error);
      next(error);
    }
  },

  /**
   * Get execution-level contributions for a single calendar day (for day detail modal).
   * Returns each exit execution that occurred on the given date so the calendar detail
   * shows the same symbols/P&L as the execution-based calendar.
   */
  async getCalendarDayDetail(req, res, next) {
    try {
      const { date } = req.query;
      if (!date) {
        return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD)' });
      }
      const dateStr = String(date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Bucket trades by the user's configured timezone so the day modal matches
      // the calendar overview's cross-midnight handling.
      const userTz = await getUserTimezone(req.user.id);
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams, dateStr, userTz];
      const dateParam = params.length - 1;
      const tzParam = params.length;
      const fc = filterConditions ? filterConditions.replace(/\btrade_date\b/g, 't.trade_date').replace(/\bsymbol\b/g, 't.symbol').replace(/\bstrategy\b/g, 't.strategy').replace(/\bside\b/g, 't.side') : '';

      // Note: do NOT require trade.pnl IS NOT NULL here. Open positions with partial
      // closes have realized P&L in their executions JSONB but trade.pnl stays NULL
      // until the position is fully closed.
      const dayQuery = `
        SELECT
          t.id AS trade_id,
          t.symbol,
          t.side,
          t.pnl,
          t.commission,
          t.fees,
          t.r_value,
          t.stop_loss,
          t.entry_price,
          t.quantity,
          t.instrument_type,
          t.contract_size,
          t.point_value,
          t.underlying_asset,
          t.exit_time,
          t.executions
        FROM trades t
        WHERE t.user_id = $1
          AND (
            (t.pnl IS NOT NULL AND (t.exit_time AT TIME ZONE $${tzParam})::date = $${dateParam}::date)
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb)) AS arr(exec)
              WHERE (exec->>'quantity') IS NOT NULL
                AND COALESCE(exec->>'exitTime', exec->>'exit_time', exec->>'datetime') IS NOT NULL
                AND (
                  exec->>'exitTime' IS NOT NULL
                  OR exec->>'exit_time' IS NOT NULL
                  OR exec->>'exitPrice' IS NOT NULL
                  OR exec->>'exit_price' IS NOT NULL
                  OR (
                    t.side IN ('long', 'buy')
                    AND (
                      (exec->>'action') IN ('sell', 'short')
                      OR (exec->>'type') IN ('sell', 'short')
                    )
                  )
                  OR (
                    t.side IN ('short', 'sell')
                    AND (
                      (exec->>'action') IN ('buy', 'long')
                      OR (exec->>'type') IN ('buy', 'long')
                    )
                  )
                )
                AND ((COALESCE(exec->>'exitTime', exec->>'exit_time', exec->>'datetime'))::timestamptz AT TIME ZONE $${tzParam})::date = $${dateParam}::date
            )
          )
          ${fc}
        ORDER BY t.id
      `;
      const tradeResult = await db.query(dayQuery, params);
      const contributions = buildCalendarDayContributions(tradeResult.rows, dateStr, userTz);
      res.json({ date: dateStr, contributions });
    } catch (error) {
      console.error('Calendar day detail error:', error);
      next(error);
    }
  },

  async exportData(req, res, next) {
    try {
      const { format = 'csv' } = req.query;
      
      // Validate format parameter
      const allowedFormats = ['csv', 'json'];
      const sanitizedFormat = allowedFormats.includes(format) ? format : 'csv';
      
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const exportQuery = `
        SELECT * FROM trades
        WHERE user_id = $1 ${filterConditions}
        ORDER BY trade_date DESC, entry_time DESC
      `;

      const result = await db.query(exportQuery, params);
      
      if (sanitizedFormat === 'csv') {
        const csv = convertToCSV(result.rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
        res.send(csv);
      } else {
        res.json({ trades: result.rows });
      }
    } catch (error) {
      next(error);
    }
  },

  async getChartData(req, res, next) {
    try {
      // Include filter hash in cache key to handle different filter combinations
      const normalizedForCache = convertQueryToTradeFilters(req.query);
      const filterHashKey = createFilterHash(normalizedForCache);
      const cacheKey = `analytics_chart_data_${req.user.id}_${filterHashKey}`;
      const cachedData = cache.get(cacheKey);

      if (cachedData) {
        return res.json(cachedData);
      }

      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      // Trade Distribution by Price
      const tradeDistributionQuery = `
        WITH price_ranges AS (
          SELECT 
            CASE 
              WHEN entry_price < 2 THEN '< $2'
              WHEN entry_price < 5 THEN '$2-4.99'
              WHEN entry_price < 10 THEN '$5-9.99'
              WHEN entry_price < 20 THEN '$10-19.99'
              WHEN entry_price < 50 THEN '$20-49.99'
              WHEN entry_price < 100 THEN '$50-99.99'
              WHEN entry_price < 200 THEN '$100-199.99'
              ELSE '$200+'
            END as price_range,
            CASE 
              WHEN entry_price < 2 THEN 1
              WHEN entry_price < 5 THEN 2
              WHEN entry_price < 10 THEN 3
              WHEN entry_price < 20 THEN 4
              WHEN entry_price < 50 THEN 5
              WHEN entry_price < 100 THEN 6
              WHEN entry_price < 200 THEN 7
              ELSE 8
            END as range_order
          FROM trades
          WHERE user_id = $1 ${filterConditions}
        )
        SELECT price_range, COUNT(*) as trade_count
        FROM price_ranges
        GROUP BY price_range, range_order
        ORDER BY range_order
      `;

      // Performance by Price
      const performanceByPriceQuery = `
        WITH price_ranges AS (
          SELECT
            CASE
              WHEN entry_price < 2 THEN '< $2'
              WHEN entry_price < 5 THEN '$2-4.99'
              WHEN entry_price < 10 THEN '$5-9.99'
              WHEN entry_price < 20 THEN '$10-19.99'
              WHEN entry_price < 50 THEN '$20-49.99'
              WHEN entry_price < 100 THEN '$50-99.99'
              WHEN entry_price < 200 THEN '$100-199.99'
              ELSE '$200+'
            END as price_range,
            CASE
              WHEN entry_price < 2 THEN 1
              WHEN entry_price < 5 THEN 2
              WHEN entry_price < 10 THEN 3
              WHEN entry_price < 20 THEN 4
              WHEN entry_price < 50 THEN 5
              WHEN entry_price < 100 THEN 6
              WHEN entry_price < 200 THEN 7
              ELSE 8
            END as range_order,
            pnl,
            r_value,
            stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions}
        )
        SELECT
          price_range,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value
        FROM price_ranges
        GROUP BY price_range, range_order
        ORDER BY range_order
      `;

      // Performance by Volume
      const performanceByVolumeQuery = `
        WITH trade_volumes AS (
          SELECT
            CASE
              WHEN executions IS NOT NULL AND jsonb_array_length(executions) > 0 THEN
                (
                  SELECT COALESCE(SUM((exec->>'quantity')::numeric), 0)
                  FROM jsonb_array_elements(executions) AS exec
                )
              ELSE quantity  -- Fractional quantities (crypto) require numeric, not integer
            END as total_volume,
            pnl,
            r_value,
            stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions}
        ),
        volume_ranges AS (
          SELECT
            CASE
              WHEN total_volume BETWEEN 2 AND 4 THEN '2-4'
              WHEN total_volume BETWEEN 5 AND 9 THEN '5-9'
              WHEN total_volume BETWEEN 10 AND 19 THEN '10-19'
              WHEN total_volume BETWEEN 20 AND 49 THEN '20-49'
              WHEN total_volume BETWEEN 50 AND 99 THEN '50-99'
              WHEN total_volume BETWEEN 100 AND 499 THEN '100-500'
              WHEN total_volume BETWEEN 500 AND 999 THEN '500-999'
              WHEN total_volume BETWEEN 1000 AND 1999 THEN '1K-2K'
              WHEN total_volume BETWEEN 2000 AND 2999 THEN '2K-3K'
              WHEN total_volume BETWEEN 3000 AND 4999 THEN '3K-5K'
              WHEN total_volume BETWEEN 5000 AND 9999 THEN '5K-10K'
              WHEN total_volume BETWEEN 10000 AND 19999 THEN '10K-20K'
              WHEN total_volume >= 20000 THEN '20K+'
              ELSE 'Other'
            END as volume_range,
            CASE
              WHEN total_volume BETWEEN 2 AND 4 THEN 1
              WHEN total_volume BETWEEN 5 AND 9 THEN 2
              WHEN total_volume BETWEEN 10 AND 19 THEN 3
              WHEN total_volume BETWEEN 20 AND 49 THEN 4
              WHEN total_volume BETWEEN 50 AND 99 THEN 5
              WHEN total_volume BETWEEN 100 AND 499 THEN 6
              WHEN total_volume BETWEEN 500 AND 999 THEN 7
              WHEN total_volume BETWEEN 1000 AND 1999 THEN 8
              WHEN total_volume BETWEEN 2000 AND 2999 THEN 9
              WHEN total_volume BETWEEN 3000 AND 4999 THEN 10
              WHEN total_volume BETWEEN 5000 AND 9999 THEN 11
              WHEN total_volume BETWEEN 10000 AND 19999 THEN 12
              WHEN total_volume >= 20000 THEN 13
              ELSE 14
            END as range_order,
            pnl,
            r_value,
            stop_loss
          FROM trade_volumes
        )
        SELECT
          volume_range,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COUNT(*) as trade_count
        FROM volume_ranges
        GROUP BY volume_range, range_order
        ORDER BY range_order
      `;

      // Performance by Position Size - Consistent dynamic ranges based on actual data
      const performanceByPositionSizeQuery = `
        WITH position_sizes AS (
          SELECT
            (entry_price * quantity) as position_size,
            pnl,
            r_value,
            stop_loss
          FROM trades
          WHERE user_id = $1 ${filterConditions}
        ),
        stats AS (
          SELECT
            MIN(position_size) as min_size,
            MAX(position_size) as max_size,
            COUNT(*) as total_trades,
            -- Determine increment based on max position size
            CASE
              WHEN MAX(position_size) <= 1000 THEN 100
              WHEN MAX(position_size) <= 5000 THEN 500
              WHEN MAX(position_size) <= 10000 THEN 1000
              WHEN MAX(position_size) <= 50000 THEN 5000
              WHEN MAX(position_size) <= 100000 THEN 10000
              WHEN MAX(position_size) <= 500000 THEN 50000
              ELSE 100000
            END as increment
          FROM position_sizes
          WHERE position_size > 0
        ),
        range_buckets AS (
          -- Generate consistent range buckets from 0 to max
          SELECT
            generate_series(
              0,
              (SELECT CEIL(max_size / increment) * increment FROM stats),
              (SELECT increment FROM stats)
            ) as range_start
          FROM stats
        ),
        bucketed_trades AS (
          SELECT
            rb.range_start,
            ps.pnl,
            ps.r_value,
            ps.stop_loss
          FROM position_sizes ps
          CROSS JOIN stats s
          JOIN range_buckets rb ON ps.position_size >= rb.range_start
            AND ps.position_size < rb.range_start + s.increment
          WHERE ps.position_size > 0
        )
        SELECT
          range_start,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COUNT(*) as trade_count
        FROM bucketed_trades
        GROUP BY range_start
        HAVING COUNT(*) > 0
        ORDER BY range_start
      `;

      // Performance by Hold Time
      const performanceByHoldTimeQuery = `
        WITH hold_time_analysis AS (
          SELECT
            CASE
              WHEN entry_time IS NULL OR exit_time IS NULL THEN 'Open Position'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 60 THEN '< 1 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 300 THEN '1-5 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 900 THEN '5-15 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 1800 THEN '15-30 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 3600 THEN '30-60 min'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 7200 THEN '1-2 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 14400 THEN '2-4 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 86400 THEN '4-24 hours'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 604800 THEN '1-7 days'
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 2592000 THEN '1-4 weeks'
              ELSE '1+ months'
            END as hold_time_range,
            CASE
              WHEN entry_time IS NULL OR exit_time IS NULL THEN 0
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 60 THEN 1
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 300 THEN 2
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 900 THEN 3
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 1800 THEN 4
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 3600 THEN 5
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 7200 THEN 6
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 14400 THEN 7
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 86400 THEN 8
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 604800 THEN 9
              WHEN EXTRACT(EPOCH FROM (exit_time::timestamp - entry_time::timestamp)) < 2592000 THEN 10
              ELSE 11
            END as range_order,
            pnl,
            r_value,
            stop_loss,
            CASE WHEN pnl > 0 THEN 1 ELSE 0 END as is_winner
          FROM trades
          WHERE user_id = $1 ${filterConditions} AND pnl IS NOT NULL
        )
        SELECT
          hold_time_range,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value,
          COUNT(*) as trade_count,
          SUM(is_winner) as winning_trades
        FROM hold_time_analysis
        GROUP BY hold_time_range, range_order
        ORDER BY range_order
      `;

      const [tradeDistResult, perfByPriceResult, perfByVolumeResult, perfByPositionSizeResult, perfByHoldTimeResult] = await Promise.all([
        db.query(tradeDistributionQuery, params),
        db.query(performanceByPriceQuery, params),
        db.query(performanceByVolumeQuery, params),
        db.query(performanceByPositionSizeQuery, params),
        db.query(performanceByHoldTimeQuery, params)
      ]);

      console.log('Chart data query results:', {
        tradeDistribution: tradeDistResult.rows,
        performanceByPrice: perfByPriceResult.rows,
        performanceByVolume: perfByVolumeResult.rows,
        performanceByPositionSize: perfByPositionSizeResult.rows,
        performanceByHoldTime: perfByHoldTimeResult.rows
      });

      // Process data into arrays matching the chart labels
      const priceLabels = ['< $2', '$2-4.99', '$5-9.99', '$10-19.99', '$20-49.99', '$50-99.99', '$100-199.99', '$200+'];
      const volumeLabels = ['2-4', '5-9', '10-19', '20-49', '50-99', '100-500', '500-999', '1K-2K', '2K-3K', '3K-5K', '5K-10K', '10K-20K', '20K+'];
      const holdTimeLabels = ['< 1 min', '1-5 min', '5-15 min', '15-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4-24 hours', '1-7 days', '1-4 weeks', '1+ months'];

      const tradeDistribution = priceLabels.map(label => {
        const found = tradeDistResult.rows.find(row => row.price_range === label);
        return found ? parseInt(found.trade_count) : 0;
      });

      const performanceByPrice = priceLabels.map(label => {
        const found = perfByPriceResult.rows.find(row => row.price_range === label);
        return found ? parseFloat(found.total_pnl) : 0;
      });

      const performanceByPriceR = priceLabels.map(label => {
        const found = perfByPriceResult.rows.find(row => row.price_range === label);
        return found ? parseFloat(found.total_r_value) : 0;
      });

      const performanceByPriceCounts = priceLabels.map(label => {
        const found = tradeDistResult.rows.find(row => row.price_range === label);
        return found ? parseInt(found.trade_count) : 0;
      });

      // Dynamic volume categories - only include categories with data
      const volumeDataMap = new Map();
      const volumeRDataMap = new Map();
      const volumeCountMap = new Map();
      const volumeOrderMap = {
        '2-4': 1, '5-9': 2, '10-19': 3, '20-49': 4, '50-99': 5, '100-500': 6,
        '500-999': 7, '1K-2K': 8, '2K-3K': 9, '3K-5K': 10, '5K-10K': 11,
        '10K-20K': 12, '20K+': 13
      };

      // Collect data and filter out empty categories
      perfByVolumeResult.rows.forEach(row => {
        if (row.volume_range && row.volume_range !== 'Other' && parseFloat(row.total_pnl) !== 0) {
          volumeDataMap.set(row.volume_range, parseFloat(row.total_pnl));
          volumeRDataMap.set(row.volume_range, parseFloat(row.total_r_value || 0));
          volumeCountMap.set(row.volume_range, parseInt(row.trade_count || 0));
        }
      });

      // Sort by order and create arrays
      const sortedVolumeEntries = Array.from(volumeDataMap.entries())
        .sort((a, b) => (volumeOrderMap[a[0]] || 999) - (volumeOrderMap[b[0]] || 999));

      const dynamicVolumeLabels = sortedVolumeEntries.map(([label]) => label);
      const performanceByVolume = sortedVolumeEntries.map(([, pnl]) => pnl);
      const performanceByVolumeR = sortedVolumeEntries.map(([label]) => volumeRDataMap.get(label) || 0);
      const performanceByVolumeCounts = sortedVolumeEntries.map(([label]) => volumeCountMap.get(label) || 0);

      // Process dynamic position size data
      const formatPositionSizeRange = (rangeStart) => {
        const start = parseFloat(rangeStart);

        // Determine the increment based on the range
        let increment;
        if (start < 1000) increment = 100;
        else if (start < 5000) increment = 500;
        else if (start < 10000) increment = 1000;
        else if (start < 50000) increment = 5000;
        else if (start < 100000) increment = 10000;
        else if (start < 500000) increment = 50000;
        else increment = 100000;

        const end = start + increment;

        // Format the range label
        const formatCurrency = (val) => {
          if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
          if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
          return `$${val}`;
        };

        return `${formatCurrency(start)}-${formatCurrency(end)}`;
      };

      const positionSizeDataMap = new Map();
      perfByPositionSizeResult.rows.forEach(row => {
        if (row.range_start !== null) {
          const label = formatPositionSizeRange(row.range_start);
          positionSizeDataMap.set(label, {
            pnl: parseFloat(row.total_pnl),
            rValue: parseFloat(row.total_r_value || 0),
            tradeCount: parseInt(row.trade_count || 0),
            rangeStart: parseFloat(row.range_start)
          });
        }
      });

      // Sort by range_start value
      const sortedPositionSizeEntries = Array.from(positionSizeDataMap.entries())
        .sort((a, b) => a[1].rangeStart - b[1].rangeStart);

      const dynamicPositionSizeLabels = sortedPositionSizeEntries.map(([label]) => label);
      const performanceByPositionSize = sortedPositionSizeEntries.map(([, data]) => data.pnl);
      const performanceByPositionSizeR = sortedPositionSizeEntries.map(([, data]) => data.rValue);
      const performanceByPositionSizeCounts = sortedPositionSizeEntries.map(([, data]) => data.tradeCount);

      const performanceByHoldTime = holdTimeLabels.map(label => {
        const found = perfByHoldTimeResult.rows.find(row => row.hold_time_range === label);
        return found ? parseFloat(found.total_pnl) : 0;
      });

      const performanceByHoldTimeR = holdTimeLabels.map(label => {
        const found = perfByHoldTimeResult.rows.find(row => row.hold_time_range === label);
        return found ? parseFloat(found.total_r_value) : 0;
      });

      const performanceByHoldTimeCounts = holdTimeLabels.map(label => {
        const found = perfByHoldTimeResult.rows.find(row => row.hold_time_range === label);
        return found ? parseInt(found.trade_count) : 0;
      });

      // Day of Week Performance (timezone-aware and excluding weekends)
      // Convert entry_time from UTC to user's timezone for day extraction
      const { getUserTimezone } = require('../utils/timezone');
      const userTimezone = await getUserTimezone(req.user.id);

      // Timezone is appended after user_id ($1) and all filter params, so its
      // placeholder index depends on how many filters are active.
      const dowTzParam = params.length + 1;
      const dayOfWeekParams = params.concat([userTimezone]);

      const dayOfWeekQuery = `
        SELECT
          EXTRACT(DOW FROM (entry_time AT TIME ZONE $${dowTzParam})) as day_of_week,
          COUNT(*) as trade_count,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(r_value) FILTER (WHERE stop_loss IS NOT NULL), 0) as total_r_value
        FROM trades
        WHERE user_id = $1 ${filterConditions}
          AND EXTRACT(DOW FROM (entry_time AT TIME ZONE $${dowTzParam})) NOT IN (0, 6) -- Exclude weekends
        GROUP BY EXTRACT(DOW FROM (entry_time AT TIME ZONE $${dowTzParam}))
        ORDER BY EXTRACT(DOW FROM (entry_time AT TIME ZONE $${dowTzParam}))
      `;

      const dayOfWeekResult = await db.query(dayOfWeekQuery, dayOfWeekParams);

      // Process day of week data - only weekdays (1=Monday, ..., 5=Friday)
      // Skip weekends entirely since stock markets are closed
      const dayOfWeekData = [];
      for (let i = 1; i <= 5; i++) { // Only weekdays: 1=Monday through 5=Friday
        const found = dayOfWeekResult.rows.find(row => parseInt(row.day_of_week) === i);
        dayOfWeekData.push({
          total_pnl: found ? parseFloat(found.total_pnl) : 0,
          total_r_value: found ? parseFloat(found.total_r_value) : 0,
          trade_count: found ? parseInt(found.trade_count) : 0
        });
      }

      // Daily Volume Data - Calculate from executions for accurate trading volume
      const dailyVolumeQuery = `
        WITH execution_volumes AS (
          SELECT 
            trade_date,
            CASE 
              WHEN executions IS NOT NULL AND jsonb_array_length(executions) > 0 THEN
                (
                  SELECT COALESCE(SUM((exec->>'quantity')::numeric), 0)
                  FROM jsonb_array_elements(executions) AS exec
                )
              ELSE quantity  -- Fractional quantities (crypto) require numeric, not integer
            END as trade_volume
          FROM trades
          WHERE user_id = $1 ${filterConditions}
        )
        SELECT 
          trade_date,
          COALESCE(SUM(trade_volume), 0) as total_volume,
          COUNT(*) as trade_count
        FROM execution_volumes
        GROUP BY trade_date
        ORDER BY trade_date
      `;

      const dailyVolumeResult = await db.query(dailyVolumeQuery, params);

      const responseData = {
        tradeDistribution,
        performanceByPrice,
        performanceByPriceR,
        performanceByPriceCounts,
        performanceByVolume,
        performanceByVolumeR,
        performanceByVolumeCounts,
        performanceByPositionSize,
        performanceByPositionSizeR,
        performanceByPositionSizeCounts,
        performanceByHoldTime,
        performanceByHoldTimeR,
        performanceByHoldTimeCounts,
        dayOfWeek: dayOfWeekData,
        dailyVolume: dailyVolumeResult.rows,
        // Include dynamic labels for charts
        labels: {
          volume: dynamicVolumeLabels,
          price: priceLabels,
          positionSize: dynamicPositionSizeLabels,
          holdTime: holdTimeLabels
        }
      };

      // Cache until invalidated by trade mutations (24h fallback TTL)
      const cacheTTL = 24 * 60 * 60 * 1000;
      cache.set(cacheKey, responseData, cacheTTL);

      res.json(responseData);
    } catch (error) {
      next(error);
    }
  },

  async getProfitLoss(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Profit/loss analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getWinRate(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Win rate analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getMonthlySummary(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Monthly summary analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getDailyAnalytics(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Daily analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getWeeklyAnalytics(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Weekly analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getMonthlyAnalytics(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Monthly analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getYearlyAnalytics(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Yearly analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getDrawdownAnalysis(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const drawdownQuery = `
        WITH daily_pnl AS (
          SELECT 
            trade_date,
            COALESCE(SUM(pnl), 0) as daily_pnl
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY trade_date
          ORDER BY trade_date
        ),
        cumulative_pnl AS (
          SELECT 
            trade_date,
            daily_pnl,
            SUM(daily_pnl) OVER (ORDER BY trade_date) as cumulative_pnl
          FROM daily_pnl
        ),
        running_max AS (
          SELECT 
            trade_date,
            daily_pnl,
            cumulative_pnl,
            MAX(cumulative_pnl) OVER (ORDER BY trade_date) as running_max_pnl
          FROM cumulative_pnl
        )
        SELECT 
          trade_date,
          daily_pnl,
          cumulative_pnl,
          running_max_pnl,
          cumulative_pnl - running_max_pnl as drawdown
        FROM running_max
        ORDER BY trade_date
      `;

      const result = await db.query(drawdownQuery, params);
      
      res.json({ drawdown: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getRiskMetrics(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Risk metrics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getTradeDistribution(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Trade distribution analytics are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async getRecommendations(req, res, next) {
    try {
      console.log('[AI] Recommendations request started');

      // Dashboard summary mode — short, single insight for the AiInsightCard.
      // Cheaper than the full recommendation flow; works even when AI is not
      // configured (falls back to a deterministic insight derived from data).
      if (req.query.summary === 'true' || req.query.summary === '1') {
        return analyticsController.getRecommendationSummary(req, res, next);
      }

      const userSettings = await aiService.getUserSettings(req.user.id);

      if (!userSettings.provider) {
        console.log('[ERROR] AI provider not configured');
        return res.status(400).json({
          error: 'AI recommendations are not available. AI provider not configured in settings.'
        });
      }
      
      // Check if API key is required for this provider
      const providersRequiringApiKey = ['gemini', 'claude', 'openai', 'deepseek', 'kimi'];
      if (providersRequiringApiKey.includes(userSettings.provider) && !userSettings.apiKey) {
        console.log(`[ERROR] API key required for ${userSettings.provider} provider`);
        return res.status(400).json({ 
          error: `AI recommendations are not available. API key required for ${userSettings.provider} provider.` 
        });
      }
      
      // Check if API URL is required for this provider
      const providersRequiringApiUrl = ['ollama', 'lmstudio', 'local'];
      if (providersRequiringApiUrl.includes(userSettings.provider) && !userSettings.apiUrl) {
        console.log(`[ERROR] API URL required for ${userSettings.provider} provider`);
        return res.status(400).json({ 
          error: `AI recommendations are not available. API URL required for ${userSettings.provider} provider.` 
        });
      }
      
      console.log(`[OK] AI provider configured: ${userSettings.provider}`);

      // Use buildFilterConditions for consistency
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];

      const { startDate, endDate } = req.query;

      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);

      // Get overview metrics
      console.log('[DATA] Fetching trade metrics...');
      const overviewQuery = groupByPosition
        ? `
        WITH positions AS (
          SELECT
            SUM(pnl) as pnl,
            COALESCE(AVG(pnl_percent), 0) as pnl_percent,
            SUM(COALESCE(commission, 0)) as commission,
            SUM(COALESCE(fees, 0)) as fees
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY ${POSITION_GROUP_KEY}
        )
        SELECT
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(CASE WHEN ${be.isNot} AND pnl > 0 THEN pnl END), 0) as avg_win,
          COALESCE(AVG(CASE WHEN ${be.isNot} AND pnl < 0 THEN pnl END), 0) as avg_loss,
          COALESCE(MAX(pnl), 0) as best_trade,
          COALESCE(MIN(pnl), 0) as worst_trade
        FROM positions
      `
        : `
        SELECT
          COUNT(*) as total_trades,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COALESCE(AVG(CASE WHEN ${be.isNot} AND pnl > 0 THEN pnl END), 0) as avg_win,
          COALESCE(AVG(CASE WHEN ${be.isNot} AND pnl < 0 THEN pnl END), 0) as avg_loss,
          COALESCE(MAX(pnl), 0) as best_trade,
          COALESCE(MIN(pnl), 0) as worst_trade
        FROM trades
        WHERE user_id = $1 ${filterConditions}
      `;

      const overviewResult = await db.query(overviewQuery, params);
      const metrics = overviewResult.rows[0];
      console.log(`[INFO] Found ${metrics.total_trades} trades for analysis`);

      // Calculate derived metrics
      metrics.win_rate = metrics.total_trades > 0 
        ? (metrics.winning_trades / metrics.total_trades * 100).toFixed(2)
        : 0;
      
      metrics.profit_factor = metrics.avg_loss !== 0
        ? Math.abs(metrics.avg_win / metrics.avg_loss).toFixed(2)
        : 0;

      // Get recent trade data for pattern analysis
      const tradesQuery = `
        SELECT 
          symbol, entry_time, exit_time, entry_price, exit_price,
          quantity, side, pnl, pnl_percent, commission, fees, broker,
          trade_date, strategy, tags, notes
        FROM trades
        WHERE user_id = $1 ${filterConditions}
        ORDER BY trade_date DESC, entry_time DESC
        LIMIT 100
      `;

      const tradesResult = await db.query(tradesQuery, params);
      const trades = tradesResult.rows;

      // Get user's trading profile for personalized recommendations
      console.log('[USER] Fetching user trading profile...');
      let userProfileSettings = null;
      let tradingProfile = null;
      
      try {
        userProfileSettings = await User.getSettings(req.user.id);
        console.log('[CONFIG] User settings found:', !!userProfileSettings);
        
        if (userProfileSettings) {
          // Check if trading profile columns exist before accessing them
          tradingProfile = {
            tradingStrategies: userProfileSettings.trading_strategies || [],
            tradingStyles: userProfileSettings.trading_styles || [],
            riskTolerance: userProfileSettings.risk_tolerance || 'moderate',
            primaryMarkets: userProfileSettings.primary_markets || [],
            experienceLevel: userProfileSettings.experience_level || 'intermediate',
            averagePositionSize: userProfileSettings.average_position_size || 'medium',
            tradingGoals: userProfileSettings.trading_goals || [],
            preferredSectors: userProfileSettings.preferred_sectors || []
          };
          console.log('[PROFILE] Trading profile loaded with strategies:', tradingProfile.tradingStrategies.length);
        }
      } catch (settingsError) {
        console.warn('[WARNING] Failed to load user settings, continuing without trading profile:', settingsError.message);
        console.warn('This might be because trading profile columns do not exist in database yet');
        tradingProfile = null;
      }

      // Get sector performance data for AI analysis
      console.log('[SECTOR] Fetching sector performance for AI analysis...');
      let sectorData = null;
      try {
        // Get symbols and their P&L
        const symbolQuery = groupByPosition
          ? `
          WITH positions AS (
            SELECT
              COALESCE(NULLIF(underlying_symbol, ''), symbol) as symbol,
              SUM(pnl) as pnl
            FROM trades
            WHERE user_id = $1 ${filterConditions}
            GROUP BY COALESCE(NULLIF(underlying_symbol, ''), symbol), ${POSITION_GROUP_KEY}
          )
          SELECT
            symbol,
            COUNT(*) as total_trades,
            COALESCE(SUM(pnl), 0) as total_pnl,
            COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
          FROM positions
          GROUP BY symbol
          HAVING COUNT(*) > 0
          ORDER BY total_pnl DESC
          LIMIT 15
        `
          : `
          SELECT
            symbol,
            COUNT(*) as total_trades,
            COALESCE(SUM(pnl), 0) as total_pnl,
            COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY symbol
          HAVING COUNT(*) > 0
          ORDER BY total_pnl DESC
          LIMIT 15
        `;

        const symbolResult = await db.query(symbolQuery, params);
        const symbolData = symbolResult.rows;

        if (symbolData.length > 0) {
          console.log(`[ANALYSIS] Analyzing ${symbolData.length} symbols for sector data...`);

          // Read industries from symbol_categories table (populated by SymbolCategoryScheduler)
          const symbolList = symbolData.map(s => s.symbol);
          const catResult = await db.query(
            `SELECT symbol, finnhub_industry FROM symbol_categories WHERE symbol = ANY($1::text[])`,
            [symbolList]
          );
          const industryMap = new Map(catResult.rows.map(r => [r.symbol, r.finnhub_industry]));

          const sectorMap = new Map();
          for (const symbolInfo of symbolData) {
            const industry = industryMap.get(symbolInfo.symbol);
            if (!industry) continue;

            if (!sectorMap.has(industry)) {
              sectorMap.set(industry, {
                industry: industry,
                total_trades: 0,
                total_pnl: 0,
                winning_trades: 0,
                symbols: []
              });
            }

            const sector = sectorMap.get(industry);
            sector.total_trades += parseInt(symbolInfo.total_trades);
            sector.total_pnl += parseFloat(symbolInfo.total_pnl);
            sector.winning_trades += parseInt(symbolInfo.winning_trades);
            sector.symbols.push(symbolInfo.symbol);
          }

          // Convert to array with calculated metrics
          sectorData = Array.from(sectorMap.values()).map(sector => ({
            ...sector,
            win_rate: sector.total_trades > 0 ? ((sector.winning_trades / sector.total_trades) * 100).toFixed(1) : 0,
            avg_pnl: sector.total_trades > 0 ? (sector.total_pnl / sector.total_trades).toFixed(2) : 0
          })).sort((a, b) => b.total_pnl - a.total_pnl);

          console.log(`[COMPLETE] Sector analysis complete: ${sectorData.length} sectors identified`);
        } else {
          console.log('[SKIP] Skipping sector analysis - insufficient data');
        }
      } catch (error) {
        console.warn('[WARNING] Failed to fetch sector data for AI analysis:', error.message);
        sectorData = null;
      }

      // Generate AI recommendations with sector data
      console.log('[AI] Generating AI recommendations with sector analysis...');
      let recommendations;
      try {
        recommendations = await aiService.generateResponse(req.user.id, analyticsController.buildRecommendationPrompt(metrics, trades, tradingProfile, sectorData));
        if (!recommendations) {
          throw new Error('AI service returned undefined recommendations');
        }
      } catch (aiError) {
        console.error('[ERROR] AI service error:', aiError.message);
        return res.status(500).json({ 
          error: 'Failed to generate AI recommendations: ' + aiError.message 
        });
      }
      console.log('[SUCCESS] AI recommendations generated successfully');
      console.log('[DEBUG] Recommendations type:', typeof recommendations);
      console.log('[DEBUG] Recommendations content preview:', recommendations ? recommendations.substring(0, 100) + '...' : 'undefined');

      const response = { 
        recommendations,
        analysisDate: new Date().toISOString(),
        tradesAnalyzed: trades.length,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      };
      
      console.log('[RESPONSE] Sending response with keys:', Object.keys(response));
      res.json(response);

    } catch (error) {
      console.error('Error generating recommendations:', error);
      next(error);
    }
  },

  async getSectorPerformance(req, res, next) {
    try {
      console.log('[SECTOR] Starting sector performance analysis...');

      // Use buildFilterConditions for consistency
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];
      
      const { startDate, endDate } = req.query;
      
      console.log('Sector performance request - Filters:', req.query);
      console.log('Sector performance - Query params:', params);

      // Get all symbols and their P&L from trades
      console.log('[QUERY] Fetching symbols and P&L from trades...');
      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);
      const symbolQuery = groupByPosition
        ? `
        WITH positions AS (
            SELECT
            COALESCE(NULLIF(underlying_symbol, ''), symbol) as symbol,
            SUM(pnl) as pnl
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY COALESCE(NULLIF(underlying_symbol, ''), symbol), ${POSITION_GROUP_KEY}
        )
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
        FROM positions
        GROUP BY symbol
        HAVING COUNT(*) > 0
        ORDER BY total_pnl DESC
      `
        : `
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
        FROM trades
        WHERE user_id = $1 ${filterConditions}
        GROUP BY symbol
        HAVING COUNT(*) > 0
        ORDER BY total_pnl DESC
      `;

      const symbolResult = await db.query(symbolQuery, params);
      const symbolData = symbolResult.rows;
      
      console.log(`[INFO] Found ${symbolData.length} unique symbols to analyze`);

      if (symbolData.length === 0) {
        return res.json({ 
          sectors: [],
          message: 'No trading data found for the selected date range'
        });
      }

      // Get industry data from permanent storage first (fast)
      console.log('[STORAGE] Fetching industry data from permanent storage...');
      const symbols = symbolData.map(s => s.symbol);
      
      // Get all categories from storage (including those that failed categorization)
      const storedQuery = `
        SELECT symbol, finnhub_industry, company_name
        FROM symbol_categories 
        WHERE symbol = ANY($1::text[])
      `;
      const storedResult = await db.query(storedQuery, [symbols]);
      const storedCategories = new Map();
      
      for (const row of storedResult.rows) {
        storedCategories.set(row.symbol, row);
      }
      
      console.log(`[DATA] Found ${storedCategories.size} stored symbols in permanent storage`);
      
      const sectorMap = new Map();
      let categorizedCount = 0;
      let uncategorizedSymbols = [];
      let failedSymbols = 0;
      
      // Process symbols with stored categories first
      for (const symbolInfo of symbolData) {
        const category = storedCategories.get(symbolInfo.symbol.toUpperCase());
        
        if (category) {
          // Symbol has been processed
          if (category.finnhub_industry) {
            // Successfully categorized
            const industry = category.finnhub_industry;
            categorizedCount++;
            
            if (!sectorMap.has(industry)) {
              sectorMap.set(industry, {
                industry: industry,
                total_trades: 0,
                total_pnl: 0,
                winning_trades: 0,
                symbols: []
              });
            }
            
            const sector = sectorMap.get(industry);
            sector.total_trades += parseInt(symbolInfo.total_trades);
            sector.total_pnl += parseFloat(symbolInfo.total_pnl);
            sector.winning_trades += parseInt(symbolInfo.winning_trades);
            sector.symbols.push({
              symbol: symbolInfo.symbol,
              trades: parseInt(symbolInfo.total_trades),
              pnl: parseFloat(symbolInfo.total_pnl)
            });
          } else {
            // Processed but no industry data available
            failedSymbols++;
          }
        } else {
          // Not yet processed
          uncategorizedSymbols.push(symbolInfo.symbol);
        }
      }
      
      console.log(`[STATS] Immediate sector analysis: ${categorizedCount} categorized, ${uncategorizedSymbols.length} uncategorized`);

      // Convert map to array and calculate additional metrics
      const sectors = Array.from(sectorMap.values()).map(sector => ({
        ...sector,
        win_rate: sector.total_trades > 0 ? ((sector.winning_trades / sector.total_trades) * 100).toFixed(2) : 0,
        avg_pnl: sector.total_trades > 0 ? (sector.total_pnl / sector.total_trades).toFixed(2) : 0,
        symbol_count: sector.symbols.length
      })).sort((a, b) => b.total_pnl - a.total_pnl);

      console.log(`[RETURN] Returning ${sectors.length} sectors immediately`);

      const resultData = { 
        sectors,
        analysisDate: new Date().toISOString(),
        symbolsAnalyzed: categorizedCount,
        totalSymbols: symbolData.length,
        uncategorizedSymbols: uncategorizedSymbols.length,
        failedSymbols: failedSymbols,
        processedSymbols: categorizedCount + failedSymbols,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      };

      // Uncategorized symbols will be picked up by the symbol category scheduler
      if (uncategorizedSymbols.length > 0) {
        console.log(`[INFO] ${uncategorizedSymbols.length} uncategorized symbols will be processed by the category scheduler`);
      }

      res.json(resultData);

    } catch (error) {
      console.error('Error generating sector performance:', error);
      next(error);
    }
  },

  async categorizeSymbols(req, res, next) {
    try {
      console.log('[PROCESS] Starting symbol categorization process...');
      
      if (!finnhub.isConfigured()) {
        return res.status(400).json({ 
          error: 'Symbol categorization not available. Finnhub API key not configured.' 
        });
      }

      // Run categorization for the current user's trades
      const result = await symbolCategories.categorizeNewSymbols(req.user.id);
      
      // Get current stats
      const stats = await symbolCategories.getStats();
      
      res.json({
        success: true,
        result,
        stats,
        message: `Categorized ${result.processed} of ${result.total} new symbols`
      });

    } catch (error) {
      console.error('Error categorizing symbols:', error);
      next(error);
    }
  },

  async getSymbolCategoryStats(req, res, next) {
    try {
      const stats = await symbolCategories.getStats();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error getting symbol category stats:', error);
      next(error);
    }
  },

  async getAvailableSectors(req, res, next) {
    try {
      const query = `
        SELECT DISTINCT finnhub_industry
        FROM symbol_categories 
        WHERE finnhub_industry IS NOT NULL
        ORDER BY finnhub_industry
      `;
      
      const result = await db.query(query);
      const sectors = result.rows.map(row => row.finnhub_industry);
      
      res.json({ sectors });
    } catch (error) {
      console.error('Error getting available sectors:', error);
      next(error);
    }
  },

  async getAvailableBrokers(req, res, next) {
    try {
      const query = `
        SELECT DISTINCT broker
        FROM trades 
        WHERE user_id = $1 
          AND broker IS NOT NULL 
          AND broker != ''
        ORDER BY broker
      `;
      
      const result = await db.query(query, [req.user.id]);
      const brokers = result.rows.map(row => row.broker);
      
      res.json({ brokers });
    } catch (error) {
      console.error('Error getting available brokers:', error);
      next(error);
    }
  },

  async refreshSectorPerformance(req, res, next) {
    try {
      console.log('[REFRESH] Refreshing sector performance data...');
      
      // Use buildFilterConditions for consistency
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];
      
      const { startDate, endDate } = req.query;

      // Get all symbols and their P&L from trades
      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);
      const symbolQuery = groupByPosition
        ? `
        WITH positions AS (
            SELECT
            COALESCE(NULLIF(underlying_symbol, ''), symbol) as symbol,
            SUM(pnl) as pnl
          FROM trades
          WHERE user_id = $1 ${filterConditions}
          GROUP BY COALESCE(NULLIF(underlying_symbol, ''), symbol), ${POSITION_GROUP_KEY}
        )
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
        FROM positions
        GROUP BY symbol
        HAVING COUNT(*) > 0
        ORDER BY total_pnl DESC
      `
        : `
        SELECT
          symbol,
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl), 0) as avg_pnl,
          COUNT(CASE WHEN ${be.isNot} AND pnl > 0 THEN 1 END) as winning_trades
        FROM trades
        WHERE user_id = $1 ${filterConditions}
        GROUP BY symbol
        HAVING COUNT(*) > 0
        ORDER BY total_pnl DESC
      `;

      const symbolResult = await db.query(symbolQuery, params);
      const symbolData = symbolResult.rows;
      
      if (symbolData.length === 0) {
        return res.json({ 
          sectors: [],
          message: 'No trading data found for the selected date range'
        });
      }

      const symbols = symbolData.map(s => s.symbol);
      
      // Get all categories from storage (including those that failed categorization)
      const storedQuery = `
        SELECT symbol, finnhub_industry, company_name
        FROM symbol_categories 
        WHERE symbol = ANY($1::text[])
      `;
      const storedResult = await db.query(storedQuery, [symbols]);
      const storedCategories = new Map();
      
      for (const row of storedResult.rows) {
        storedCategories.set(row.symbol, row);
      }
      
      const sectorMap = new Map();
      let categorizedCount = 0;
      let uncategorizedSymbols = [];
      let failedSymbols = 0;
      
      // Process all symbols with their categories
      for (const symbolInfo of symbolData) {
        const category = storedCategories.get(symbolInfo.symbol.toUpperCase());
        
        if (category) {
          // Symbol has been processed
          if (category.finnhub_industry) {
            // Successfully categorized
            const industry = category.finnhub_industry;
            categorizedCount++;
            
            if (!sectorMap.has(industry)) {
              sectorMap.set(industry, {
                industry: industry,
                total_trades: 0,
                total_pnl: 0,
                winning_trades: 0,
                symbols: []
              });
            }
            
            const sector = sectorMap.get(industry);
            sector.total_trades += parseInt(symbolInfo.total_trades);
            sector.total_pnl += parseFloat(symbolInfo.total_pnl);
            sector.winning_trades += parseInt(symbolInfo.winning_trades);
            sector.symbols.push({
              symbol: symbolInfo.symbol,
              trades: parseInt(symbolInfo.total_trades),
              pnl: parseFloat(symbolInfo.total_pnl)
            });
          } else {
            // Processed but no industry data available
            failedSymbols++;
          }
        } else {
          // Not yet processed
          uncategorizedSymbols.push(symbolInfo.symbol);
        }
      }

      // Convert map to array and calculate additional metrics
      const sectors = Array.from(sectorMap.values()).map(sector => ({
        ...sector,
        win_rate: sector.total_trades > 0 ? ((sector.winning_trades / sector.total_trades) * 100).toFixed(2) : 0,
        avg_pnl: sector.total_trades > 0 ? (sector.total_pnl / sector.total_trades).toFixed(2) : 0,
        symbol_count: sector.symbols.length
      })).sort((a, b) => b.total_pnl - a.total_pnl);

      const resultData = { 
        sectors,
        analysisDate: new Date().toISOString(),
        symbolsAnalyzed: categorizedCount,
        totalSymbols: symbolData.length,
        uncategorizedSymbols: uncategorizedSymbols.length,
        failedSymbols: failedSymbols,
        processedSymbols: categorizedCount + failedSymbols,
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null
        }
      };

      res.json(resultData);

    } catch (error) {
      console.error('Error refreshing sector performance:', error);
      next(error);
    }
  },

  // Dashboard summary mode: short, single insight for the AiInsightCard.
  // Falls back to deterministic data-driven insight if AI isn't configured
  // (so free users still see a useful card). Caches aggressively per user+filter
  // so the dashboard doesn't burn AI credits on every refresh.
  async getRecommendationSummary(req, res, next) {
    try {
      const { filterConditions, params: filterParams } = buildFilterConditions(req.query);
      const params = [req.user.id, ...filterParams];
      const filterHashKey = createFilterHash(convertQueryToTradeFilters(req.query));
      const groupByPosition = await isPositionGroupingEnabled(req.user.id);
      const summaryCacheKey = `ai_insight_summary_${req.user.id}_${filterHashKey}_grp${groupByPosition ? 'pos' : 'leg'}`;

      const cached = cache.get(summaryCacheKey);
      if (cached) {
        return res.json(cached);
      }

      const be = groupByPosition ? GROUPED_BREAKEVEN : await rawBreakevenPredicate(req.user.id);

      // Pull the analytics we need to derive an insight.
      const completedCte = groupByPosition
        ? `completed AS (
            SELECT SUM(pnl) as pnl
            FROM trades
            WHERE user_id = $1 ${filterConditions}
              AND exit_price IS NOT NULL AND pnl IS NOT NULL
            GROUP BY ${POSITION_GROUP_KEY}
          )`
        : `completed AS (
            SELECT * FROM trades
            WHERE user_id = $1 ${filterConditions}
              AND exit_price IS NOT NULL AND pnl IS NOT NULL
          )`;

      const dataQuery = `
        WITH ${completedCte}
        SELECT
          (SELECT COUNT(*) FROM completed)::integer AS total_trades,
          (SELECT COUNT(*) FROM completed WHERE ${be.isNot} AND pnl > 0)::integer AS winning_trades,
          (SELECT COUNT(*) FROM completed WHERE ${be.isNot} AND pnl < 0)::integer AS losing_trades,
          (SELECT COALESCE(SUM(pnl), 0) FROM completed)::numeric AS total_pnl,
          (SELECT COALESCE(AVG(pnl), 0) FROM completed WHERE ${be.isNot} AND pnl > 0)::numeric AS avg_win,
          (SELECT COALESCE(AVG(pnl), 0) FROM completed WHERE ${be.isNot} AND pnl < 0)::numeric AS avg_loss
      `;
      const dataResult = await db.query(dataQuery, params);
      const m = dataResult.rows[0] || {};
      const totalTrades = parseInt(m.total_trades) || 0;

      // Not enough data yet — return an empty-state insight.
      if (totalTrades < 5) {
        const emptyInsight = {
          type: 'system',
          priority: 10,
          headline: 'Your insights unlock at 10 trades',
          body: totalTrades === 0
            ? 'Import your first trades to unlock AI-powered insights about your edge.'
            : `You've logged ${totalTrades} trade${totalTrades === 1 ? '' : 's'}. Insights become useful around 10+ trades.`,
          source: 'system',
          action_label: 'Import trades',
          action_url: '/import'
        };
        const response = {
          summary: emptyInsight,
          summaries: [emptyInsight],
          analysisDate: new Date().toISOString(),
          tradesAnalyzed: totalTrades
        };
        cache.set(summaryCacheKey, response, 60 * 60 * 1000); // 1h
        return res.json(response);
      }

      // Compute strongest per-symbol / per-strategy edge.
      const edgeQuery = `
        WITH completed AS (
          SELECT * FROM trades
          WHERE user_id = $1 ${filterConditions}
            AND exit_price IS NOT NULL AND pnl IS NOT NULL
        ),
        sym AS (
          SELECT symbol,
                 COUNT(*) AS n,
                 COUNT(*) FILTER (WHERE ${be.isNot} AND pnl > 0) AS wins,
                 COALESCE(SUM(pnl), 0) AS pnl
          FROM completed
          GROUP BY symbol
          HAVING COUNT(*) >= 3
        ),
        strat AS (
          SELECT strategy,
                 COUNT(*) AS n,
                 COUNT(*) FILTER (WHERE ${be.isNot} AND pnl > 0) AS wins,
                 COALESCE(SUM(pnl), 0) AS pnl
          FROM completed
          WHERE strategy IS NOT NULL AND strategy <> ''
          GROUP BY strategy
          HAVING COUNT(*) >= 3
        )
        SELECT 'symbol' AS kind, symbol AS label, n, wins, pnl
        FROM sym
        UNION ALL
        SELECT 'strategy' AS kind, strategy AS label, n, wins, pnl
        FROM strat
        ORDER BY pnl DESC
      `;
      const edgeResult = await db.query(edgeQuery, params);
      const edges = edgeResult.rows;
      const top = edges[0];
      const worst = edges[edges.length - 1];

      const winRate = totalTrades > 0
        ? ((parseInt(m.winning_trades) || 0) / totalTrades * 100)
        : 0;
      const avgWin = Math.abs(parseFloat(m.avg_win) || 0);
      const avgLoss = Math.abs(parseFloat(m.avg_loss) || 0);

      // -- Performance edge insight (existing data-driven behavior) --
      const edgeInsight = (() => {
        let headline = '';
        let body = '';
        let action_url = '/analytics';
        let action_label = 'View full analytics';

        if (top && parseFloat(top.pnl) > 0) {
          const winsRate = top.n > 0 ? (parseInt(top.wins) / parseInt(top.n) * 100) : 0;
          const sign = parseFloat(top.pnl) >= 0 ? '+' : '';
          headline = top.kind === 'symbol'
            ? `${top.label} is carrying your edge`
            : `Your ${top.label} setup is working`;
          body = `${winsRate.toFixed(0)}% win rate across ${top.n} ${top.kind === 'symbol' ? 'trades on this symbol' : 'attempts of this setup'}, ${sign}$${parseFloat(top.pnl).toFixed(0)} net.`;
          action_label = top.kind === 'symbol' ? `View ${top.label} trades` : 'View setup breakdown';
          action_url = top.kind === 'symbol'
            ? `/trades?symbol=${encodeURIComponent(top.label)}`
            : '/metrics#strategies';
        } else if (worst && parseFloat(worst.pnl) < 0) {
          headline = worst.kind === 'symbol'
            ? `${worst.label} is dragging on results`
            : `${worst.label} setup is leaking edge`;
          body = `${worst.n} trades, $${parseFloat(worst.pnl).toFixed(0)} net. Consider tighter rules or pausing this ${worst.kind === 'symbol' ? 'symbol' : 'setup'}.`;
          action_label = 'Investigate';
          action_url = worst.kind === 'symbol'
            ? `/trades?symbol=${encodeURIComponent(worst.label)}`
            : '/metrics#strategies';
        } else if (winRate >= 60) {
          headline = `${winRate.toFixed(0)}% win rate — your selection is sharp`;
          body = `Across ${totalTrades} trades, you're winning ${m.winning_trades} of them. Focus on letting winners run: avg win $${avgWin.toFixed(0)} vs avg loss $${avgLoss.toFixed(0)}.`;
        } else if (avgWin > 0 && avgLoss > 0 && avgWin / avgLoss > 1.5) {
          headline = `Your wins are ${(avgWin / avgLoss).toFixed(1)}x your losses`;
          body = `Strong risk-reward across ${totalTrades} trades (${winRate.toFixed(0)}% wins). The losses you take are well-controlled.`;
        } else if (avgWin > 0 && avgLoss > 0 && avgLoss / avgWin > 1.5) {
          headline = 'Your losses are bigger than your wins';
          body = `Avg loss $${avgLoss.toFixed(0)} vs avg win $${avgWin.toFixed(0)} across ${totalTrades} trades. Tighter stops or more disciplined exits would change everything.`;
        } else {
          headline = `${totalTrades} trades analyzed`;
          body = `Win rate ${winRate.toFixed(0)}%. Avg win $${avgWin.toFixed(0)}, avg loss $${avgLoss.toFixed(0)}. Dig into the breakdowns below for setup-level edge.`;
        }
        return {
          type: 'edge',
          priority: 30,
          headline,
          body,
          source: 'computed',
          action_label,
          action_url
        };
      })();

      // -- Open-position context: earnings + news insights --
      const contextInsights = await analyticsController
        .computeOpenPositionInsights(req.user.id)
        .catch(err => {
          console.warn('[AI] open-position insights failed:', err.message);
          return [];
        });

      // Final insights list, sorted by priority desc (higher = more urgent /
      // more time-sensitive). Caller can render top-N or paginate.
      let summaries = [...contextInsights, edgeInsight].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      );

      // Optionally enrich with AI if (a) user has an AI provider configured
      // AND (b) billing is disabled OR they're on the Pro tier. The
      // deterministic insights remain the floor; AI just rewrites the
      // recommendation bodies with deeper, context-aware analysis.
      try {
        const useAI = await analyticsController.shouldUseAIEnrichment(req.user.id);
        if (useAI) {
          summaries = await analyticsController.enrichInsightsWithAI(req.user.id, summaries);
        }
      } catch (aiErr) {
        console.warn('[AI] enrichment failed, returning deterministic insights:', aiErr.message);
      }

      const response = {
        // Keep `summary` for backward compat (current frontend reads the
        // single top insight). New clients should iterate `summaries`.
        summary: summaries[0] || null,
        summaries,
        analysisDate: new Date().toISOString(),
        tradesAnalyzed: totalTrades
      };

      // 1h cache: earnings and news shift more frequently than pure analytics.
      // The whole payload (incl. the deterministic edge insight) is cheap to
      // recompute, so a shorter TTL keeps the dashboard timely without
      // hammering Finnhub.
      cache.set(summaryCacheKey, response, 60 * 60 * 1000);
      return res.json(response);
    } catch (err) {
      console.error('[AI] summary error:', err);
      return res.status(500).json({ error: 'Failed to compute insight summary' });
    }
  },

  // Build insights from the user's currently-open positions:
  //   - Earnings alerts (any open position with earnings inside the next 14d)
  //   - Per-symbol news insights using actual headlines + position context
  //
  // Each insight is enriched with the user's historical performance on the
  // symbol (win rate, trade count, avg P&L) so recommendations can be
  // grounded in the user's own track record rather than generic advice.
  async computeOpenPositionInsights(userId) {
    const insights = [];

    // Fetch open positions — exit_price IS NULL is the canonical "open" flag.
    const openQuery = `
      SELECT symbol,
             SUM(quantity)::numeric AS total_qty,
             AVG(entry_price)::numeric AS avg_entry,
             COALESCE(MIN(side), 'long') AS side
      FROM trades
      WHERE user_id = $1
        AND exit_price IS NULL
        AND symbol IS NOT NULL
        AND symbol <> ''
      GROUP BY symbol
      HAVING SUM(quantity) IS NOT NULL AND SUM(quantity) <> 0
      LIMIT 50
    `;
    let openRows = [];
    try {
      const result = await db.query(openQuery, [userId]);
      openRows = result.rows;
    } catch (err) {
      console.warn('[AI] open-position lookup failed:', err.message);
      return [];
    }
    if (openRows.length === 0) return [];

    const symbols = openRows.map(r => r.symbol);
    const positionBySymbol = new Map(openRows.map(r => [r.symbol.toUpperCase(), r]));

    // Fetch user's historical performance on each open-position symbol. This
    // gives every recommendation an evidence base — "you've won 9 of 12 trades
    // on AAPL" is dramatically more actionable than "consider your handling."
    const historyBySymbol = new Map();
    try {
      const be = await rawBreakevenPredicate(userId);
      const histResult = await db.query(`
        SELECT
          UPPER(symbol) AS symbol,
          COUNT(*)::integer AS trade_count,
          COUNT(*) FILTER (WHERE ${be.isNot} AND pnl > 0)::integer AS wins,
          COUNT(*) FILTER (WHERE ${be.isNot} AND pnl < 0)::integer AS losses,
          COALESCE(AVG(pnl), 0)::numeric AS avg_pnl,
          COALESCE(SUM(pnl), 0)::numeric AS total_pnl
        FROM trades
        WHERE user_id = $1
          AND symbol = ANY($2::text[])
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
        GROUP BY UPPER(symbol)
      `, [userId, symbols]);
      for (const row of histResult.rows) {
        historyBySymbol.set(row.symbol, {
          tradeCount: parseInt(row.trade_count) || 0,
          wins: parseInt(row.wins) || 0,
          losses: parseInt(row.losses) || 0,
          avgPnl: parseFloat(row.avg_pnl) || 0,
          totalPnl: parseFloat(row.total_pnl) || 0,
          winRate: parseInt(row.trade_count) > 0
            ? (parseInt(row.wins) / parseInt(row.trade_count)) * 100
            : null
        });
      }
    } catch (err) {
      console.warn('[AI] history lookup failed:', err.message);
      // Continue without per-symbol history; recommendations degrade gracefully.
    }

    // Wraps the per-symbol historical context into a one-sentence preamble.
    // Returns "" if there's no history (new symbol for the user) so the
    // caller can decide whether to include it.
    const historyClause = (sym) => {
      const h = historyBySymbol.get(sym);
      if (!h || h.tradeCount === 0) return '';
      if (h.tradeCount < 3) {
        return `You've only traded ${sym} ${h.tradeCount} time${h.tradeCount === 1 ? '' : 's'} before — small sample, edge unproven.`;
      }
      const wr = h.winRate;
      const verdict = wr >= 65 ? 'this is a high-conviction name for you'
        : wr >= 55 ? 'you have a positive edge here'
        : wr >= 45 ? 'your edge is roughly coin-flip'
        : 'your historical performance on this name is poor';
      return `You've traded ${sym} ${h.tradeCount} times before with a ${wr.toFixed(0)}% win rate — ${verdict}.`;
    };

    // Specific action recommendation given news tone, position direction,
    // and the user's historical edge on the symbol. Concrete percentages
    // beat soft "consider your handling" language.
    const newsAction = (tone, sideLabel, h) => {
      const strongEdge = h && h.tradeCount >= 5 && h.winRate >= 60;
      const weakEdge = h && h.tradeCount >= 5 && h.winRate < 45;

      if (tone === 'positive' && sideLabel === 'long') {
        if (weakEdge) return 'Action: this is your chance to exit at strength. Trim 50%+ and tighten the stop on the remainder.';
        if (strongEdge) return 'Action: let it run with a trailing stop, or trim 25% to bank gains and ride the rest.';
        return 'Action: trim 25–33% to lock in a partial win; move the stop on the remainder to break-even.';
      }
      if (tone === 'positive' && sideLabel === 'short') {
        return 'Action: your short is fighting the tape. Close half now, move stop to break-even on the rest, and reassess the thesis tonight.';
      }
      if (tone === 'negative' && sideLabel === 'long') {
        if (weakEdge) return 'Action: exit fully — you have no edge on this name and the news is against you.';
        if (strongEdge) return 'Action: trim 25–50% to reduce gross exposure, tighten the stop, and only hold if your specific entry thesis still applies.';
        return 'Action: trim 25–50% and tighten the stop below the level the news is testing. If your thesis was tied to this news, exit fully.';
      }
      if (tone === 'negative' && sideLabel === 'short') {
        return 'Action: tailwind for your short. Trail the stop down behind the move; consider adding only if the position is small and risk is defined.';
      }
      // Neutral tone — soft guidance but still concrete.
      return 'Action: scan the article and ask if anything changes your thesis. If not, hold; if yes, size down 25%.';
    };

    // Specific earnings action recommendation given days until report,
    // position direction, position-size context, and historical edge.
    const earningsAction = (daysUntil, sideLabel, h) => {
      const strongEdge = h && h.tradeCount >= 5 && h.winRate >= 60;
      const weakEdge = h && h.tradeCount >= 5 && h.winRate < 45;
      const urgent = daysUntil <= 1;

      if (sideLabel === 'long') {
        if (urgent) {
          if (weakEdge) return 'Action: close the position before the bell. Your historical edge does not justify binary event risk.';
          if (strongEdge) return 'Action: you have an edge on this name, but earnings is still binary. Trim to half and let the rest ride if your conviction is high.';
          return 'Action: trim to half position before the bell, or close fully. The volatility ranges typically blow through normal stops.';
        }
        if (daysUntil <= 3) {
          return `Action: define your plan in the next 24h. Default: trim ${weakEdge ? '50%+' : '25–50%'} now and decide on the remainder by ${daysUntil === 2 ? 'tomorrow' : 'the day before'}.`;
        }
        return `Action: ${weakEdge ? 'plan to exit before the report' : 'decide whether to hold through or close before the date'}. Earnings adds binary risk that won't respect your normal stop.`;
      }
      // Short position
      if (urgent) {
        return 'Action: short into earnings is high-variance. Size down, define max loss with a hard stop, or close partial — short squeezes happen on beats.';
      }
      if (daysUntil <= 3) {
        return 'Action: tighten the stop and reduce size by at least 25% before the report. Asymmetric upside risk against you.';
      }
      return 'Action: have an exit plan before earnings day. Short squeezes from surprise beats can take out wide stops.';
    };

    // === Earnings alerts ===
    try {
      const EarningsService = require('../services/earningsService');
      const earnings = await EarningsService.getEarningsForSymbols(symbols);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      for (const e of earnings || []) {
        if (!e || !e.symbol || !e.date) continue;
        const earningsDate = new Date(e.date);
        if (Number.isNaN(earningsDate.getTime())) continue;
        earningsDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((earningsDate - now) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0 || daysUntil > 14) continue;

        const pos = positionBySymbol.get(String(e.symbol).toUpperCase());
        if (!pos) continue;

        const epsEst = parseFloat(e.epsEstimate);
        const revEst = parseFloat(e.revenueEstimate);
        const qty = Math.abs(parseFloat(pos.total_qty) || 0);
        const avgEntry = parseFloat(pos.avg_entry) || 0;
        const sideLabel = String(pos.side || 'long').toLowerCase() === 'short' ? 'short' : 'long';

        const whenLabel = daysUntil === 0 ? 'today'
          : daysUntil === 1 ? 'tomorrow'
          : `in ${daysUntil} days`;
        const hourLabel = e.hour === 'bmo' ? 'before open'
          : e.hour === 'amc' ? 'after close'
          : '';

        const sym = String(e.symbol).toUpperCase();
        const history = historyBySymbol.get(sym);

        const bits = [];
        bits.push(`Your ${sideLabel} position: ${qty} sh @ $${avgEntry.toFixed(2)} avg.`);
        if (Number.isFinite(epsEst)) bits.push(`Street consensus: $${epsEst.toFixed(2)} EPS.`);
        if (Number.isFinite(revEst)) {
          const revB = (revEst / 1e9).toFixed(2);
          bits.push(`Revenue: $${revB}B est.`);
        }
        const hist = historyClause(sym);
        if (hist) bits.push(hist);
        bits.push(earningsAction(daysUntil, sideLabel, history));

        insights.push({
          type: 'earnings',
          priority: daysUntil <= 1 ? 100 : daysUntil <= 3 ? 80 : 60,
          headline: `${e.symbol} reports earnings ${whenLabel}${hourLabel ? ` (${hourLabel})` : ''}`,
          body: bits.join(' '),
          source: 'context',
          action_label: `View ${e.symbol} trades`,
          action_url: `/trades?symbol=${encodeURIComponent(e.symbol)}`
        });
      }
    } catch (err) {
      console.warn('[AI] earnings insight failed:', err.message);
    }

    // === Per-symbol news insights ===
    // For each open position with recent news, surface the most signal-rich
    // headline and infer rough tone via keyword matching. Finnhub free tier
    // doesn't include sentiment, so this is intentionally crude — it catches
    // the obvious signals (beats/raises/upgrades vs. miss/cut/downgrade/
    // recall) and leaves "neutral" as the safe fallback rather than guessing.
    try {
      const NewsService = require('../services/newsService');
      const newsItems = await NewsService.getNewsForSymbols(symbols);
      const dayAgo = Date.now() / 1000 - 36 * 60 * 60; // 36h window — catches overnight news

      // Group recent items by symbol.
      const itemsBySymbol = new Map();
      for (const item of newsItems || []) {
        if (!item || !item.symbol || !item.headline) continue;
        const ts = Number(item.datetime) || 0;
        if (ts < dayAgo) continue;
        const sym = String(item.symbol).toUpperCase();
        if (!itemsBySymbol.has(sym)) itemsBySymbol.set(sym, []);
        itemsBySymbol.get(sym).push(item);
      }

      // Sort the per-symbol list and surface up to 4 strongest news insights
      // overall (so a user with many open positions doesn't drown in news).
      const ranked = [];
      for (const [sym, list] of itemsBySymbol.entries()) {
        const pos = positionBySymbol.get(sym);
        if (!pos) continue;
        // Score each headline: keyword tone strength + recency.
        const scored = list.map(item => {
          const tone = classifyHeadlineTone(item.headline);
          const ageHours = Math.max(0, (Date.now() / 1000 - Number(item.datetime || 0)) / 3600);
          // Stronger keyword signals + fresher articles rank higher.
          const score = (tone.magnitude * 10) + Math.max(0, 24 - ageHours);
          return { item, tone, score };
        }).sort((a, b) => b.score - a.score);

        const top = scored[0];
        if (!top) continue;
        ranked.push({ sym, pos, top, count: list.length });
      }

      // Show up to 4, prioritizing strong tone signals over volume alone.
      ranked.sort((a, b) => b.top.score - a.top.score);

      for (const { sym, pos, top, count } of ranked.slice(0, 4)) {
        const sideLabel = String(pos.side || 'long').toLowerCase() === 'short' ? 'short' : 'long';
        const qty = Math.abs(parseFloat(pos.total_qty) || 0);
        const headlineText = String(top.item.headline || '').trim();
        const source = top.item.source ? String(top.item.source).trim() : '';
        const tone = top.tone.label; // 'positive' | 'negative' | 'neutral'
        const history = historyBySymbol.get(sym);

        // Headline as the insight headline; body gets context + concrete action.
        const insightHeadline = `${sym}: ${headlineText}`;
        const bodyParts = [];
        if (source) bodyParts.push(source + '.');
        bodyParts.push(`Your ${sideLabel} position: ${qty} sh.`);
        if (tone === 'positive' && sideLabel === 'long') bodyParts.push('Headline tone reads positive for the long.');
        else if (tone === 'positive' && sideLabel === 'short') bodyParts.push('Headline tone reads positive — bad for the short.');
        else if (tone === 'negative' && sideLabel === 'long') bodyParts.push('Headline tone reads negative — bad for the long.');
        else if (tone === 'negative' && sideLabel === 'short') bodyParts.push('Headline tone reads negative — good for the short.');
        else if (count >= 4) bodyParts.push(`${count} headlines in the last 36h — something is moving the name.`);

        const hist = historyClause(sym);
        if (hist) bodyParts.push(hist);
        bodyParts.push(newsAction(tone, sideLabel, history));

        // Priority: stronger keyword tone = higher priority. Neutral = lower.
        const priority = tone === 'neutral'
          ? 40 + Math.min(15, count * 3)
          : 70 + Math.min(20, top.tone.magnitude * 5);

        insights.push({
          type: 'news',
          priority,
          tone,
          headline: insightHeadline,
          body: bodyParts.join(' '),
          source: 'context',
          action_label: top.item.url ? 'Read article' : 'Open news rail',
          action_url: top.item.url || '/dashboard',
          external_url: !!top.item.url
        });
      }
    } catch (err) {
      console.warn('[AI] news insight failed:', err.message);
    }

    return insights;
  },

  // Decide whether AI enrichment should run for this user. Two gates:
  //   1) An AI provider must be configured with whatever credential it needs.
  //   2) If billing is enabled on the instance, the user must be on Pro tier.
  //      If billing is disabled (self-hosted), AI runs for everyone.
  async shouldUseAIEnrichment(userId) {
    try {
      const aiSettings = await aiService.getUserSettings(userId);
      if (!aiSettings || !aiSettings.provider) return false;

      const keyRequired = ['gemini', 'claude', 'openai', 'deepseek', 'kimi'];
      if (keyRequired.includes(aiSettings.provider) && !aiSettings.apiKey) return false;

      const urlRequired = ['ollama', 'lmstudio', 'local'];
      if (urlRequired.includes(aiSettings.provider) && !aiSettings.apiUrl) return false;

      const TierService = require('../services/tierService');
      const billingEnabled = await TierService.isBillingEnabled();
      if (!billingEnabled) return true;

      const tier = await TierService.getUserTier(userId);
      return tier === 'pro';
    } catch (err) {
      console.warn('[AI] shouldUseAIEnrichment check failed:', err.message);
      return false;
    }
  },

  // Rewrite each insight body via the user's configured AI provider. Sends a
  // single batched prompt to keep cost/latency bounded regardless of how many
  // insights are in the list. Falls back to the original deterministic
  // body on any parsing/AI failure so the dashboard never goes blank.
  async enrichInsightsWithAI(userId, insights) {
    if (!Array.isArray(insights) || insights.length === 0) return insights;

    // Pre-strip non-enrichable insights (e.g. system/empty-state). We still
    // return them in the output so ordering and priorities stay intact.
    const enrichable = insights
      .map((ins, idx) => ({ ins, idx }))
      .filter(({ ins }) => ins.type === 'earnings' || ins.type === 'news' || ins.type === 'edge');

    if (enrichable.length === 0) return insights;

    const numbered = enrichable.map(({ ins }, i) => ({
      n: i + 1,
      type: ins.type,
      tone: ins.tone || null,
      headline: ins.headline,
      body: ins.body
    }));

    const prompt = `You are a senior trading coach. The user already has the following deterministic insights about their open positions and trading performance. Your job is to rewrite ONLY the BODY text of each insight to be sharper, more analytical, and more useful — keep the same data points but add concrete reasoning and a clearer action.

Rules — non-negotiable:
- Return ONLY a valid JSON array, no commentary, no markdown fences, no preface.
- Each item: {"n": <number>, "body": "<rewritten body>"}.
- Same number of items as input, same "n" values.
- Keep the original facts (position size, EPS, win rate, headline). Do not invent new numbers.
- Each body ≤ 320 characters. Single paragraph, no line breaks, no bullet points.
- End each body with a concrete action — a specific percentage to trim, a specific stop type, or an explicit "exit" / "hold" call. No "consider" without a what.
- Match the tone of the data: positive news + winning history = lean in; negative news + losing history = exit faster.

Input insights:
${JSON.stringify(numbered, null, 2)}

Respond with the JSON array now.`;

    let raw;
    try {
      raw = await aiService.generateResponse(userId, prompt);
    } catch (err) {
      console.warn('[AI] enrichment call failed:', err.message);
      return insights;
    }
    if (!raw || typeof raw !== 'string') return insights;

    // Parse defensively — the model may wrap JSON in ```json fences or add
    // trailing prose despite instructions. Extract the first JSON array.
    let parsed;
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('no JSON array in response');
      parsed = JSON.parse(match[0]);
    } catch (err) {
      console.warn('[AI] enrichment JSON parse failed:', err.message);
      return insights;
    }
    if (!Array.isArray(parsed)) return insights;

    // Build n → body map and apply to the original insights array.
    const enrichedBodyByN = new Map();
    for (const item of parsed) {
      if (item && Number.isFinite(item.n) && typeof item.body === 'string') {
        enrichedBodyByN.set(item.n, item.body.trim());
      }
    }

    const out = insights.slice();
    enrichable.forEach(({ idx }, i) => {
      const newBody = enrichedBodyByN.get(i + 1);
      if (newBody && newBody.length > 20) {
        out[idx] = { ...out[idx], body: newBody, ai_enhanced: true };
      }
    });
    return out;
  },

  buildRecommendationPrompt(metrics, trades, tradingProfile, sectorData) {
    const sectorAnalysis = sectorData && sectorData.length > 0 
      ? `\n\nSector Performance Analysis:\n${sectorData.map(s => 
          `- ${s.industry}: ${s.total_trades} trades, ${s.total_pnl > 0 ? '+' : ''}$${s.total_pnl.toFixed(2)} P&L, ${s.win_rate}% win rate`
        ).join('\n')}`
      : '';

    const tradingProfileInfo = tradingProfile 
      ? `\n\nTrading Profile:\n- Experience: ${tradingProfile.experienceLevel}\n- Risk Tolerance: ${tradingProfile.riskTolerance}\n- Trading Styles: ${tradingProfile.tradingStyles.join(', ')}\n- Strategies: ${tradingProfile.tradingStrategies.join(', ')}`
      : '';

    return `As a professional trading analyst, provide personalized trading recommendations based on this performance data:

PERFORMANCE METRICS:
- Total Trades: ${metrics.total_trades}
- Win Rate: ${metrics.win_rate}%
- Total P&L: $${parseFloat(metrics.total_pnl).toFixed(2)}
- Average P&L: $${parseFloat(metrics.avg_pnl).toFixed(2)}
- Average Win: $${parseFloat(metrics.avg_win).toFixed(2)}
- Average Loss: $${parseFloat(metrics.avg_loss).toFixed(2)}
- Best Trade: $${parseFloat(metrics.best_trade).toFixed(2)}
- Worst Trade: $${parseFloat(metrics.worst_trade).toFixed(2)}
- Profit Factor: ${metrics.profit_factor}${tradingProfileInfo}${sectorAnalysis}

RECENT TRADES SAMPLE:
${trades.slice(0, 10).map(t => 
  `${t.symbol} - ${t.side} - Entry: $${t.entry_price} - Exit: $${t.exit_price} - P&L: $${t.pnl}`
).join('\n')}

IMPORTANT: Format your response using proper markdown with clear headers and paragraphs. Use this exact structure:

# Performance Assessment

[Analyze strengths and weaknesses in detail]

## Key Strengths
- [Specific strength 1]
- [Specific strength 2]

## Areas for Improvement
- [Specific weakness 1]
- [Specific weakness 2]

# Risk Management

[Recommendations for position sizing and risk control]

## Position Sizing Strategy
[Detailed recommendations]

## Risk Control Measures
[Specific risk management techniques]

# Strategy Optimization

[Specific actionable improvements]

## Trading Approach
[Recommendations for trading methodology]

## Execution Improvements
[Specific execution tips]

# Sector Insights

[Analysis of sector performance if data available]

# Next Steps

[3-5 concrete actions to improve performance]

1. [Action 1]
2. [Action 2]
3. [Action 3]
4. [Action 4]
5. [Action 5]

Keep recommendations practical, specific, and actionable. Focus on data-driven insights. Use proper markdown formatting with clear headers (#, ##) and proper paragraph breaks.`;
  }
};

const { escapeCsv } = require('../utils/csvEscape');

function convertToCSV(data) {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvHeaders = headers.map(escapeCsv).join(',');

  const csvRows = data.map(row =>
    headers.map(header => escapeCsv(row[header])).join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = analyticsController;
