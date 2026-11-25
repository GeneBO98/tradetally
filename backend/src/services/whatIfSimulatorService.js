const db = require('../config/database');
const TradeQueries = require('./tradeQueries');
const { getUserTimezone } = require('../utils/timezone');
const { fxUsd } = require('../utils/tradeFx');

const REVENGE_WINDOW_MS = 30 * 60 * 1000;
const OVERSIZED_LOSS_MULTIPLIER = 1.5;
const BROKEN_PLAYBOOK_SCORE = 70;
const DEFAULT_LOSS_LIMIT_AVG_LOSSES = 2;
const DEFAULT_MAX_TRADES_PER_DAY = 3;
const DEFAULT_CUTOFF_MINUTE = 11 * 60;
const MAX_TAG_OPTIONS = 12;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatHourLabel(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}:00 ${suffix}`;
}

function createHourFormatter(timezone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone || 'UTC'
    });
  } catch (_) {
    return null;
  }
}

function extractLocalHour(timestamp, formatter) {
  if (!timestamp) return null;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  if (formatter) {
    try {
      const parts = formatter.formatToParts(date);
      const hourPart = parts.find(p => p.type === 'hour');
      if (hourPart) {
        const parsed = parseInt(hourPart.value, 10);
        if (Number.isFinite(parsed)) return parsed % 24;
      }
    } catch (_) {
      // fall back to UTC below
    }
  }
  return date.getUTCHours();
}

function extractLocalMinuteOfDay(timestamp, formatter) {
  if (!timestamp) return null;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  if (formatter) {
    try {
      const parts = formatter.formatToParts(date);
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value, 10);
      if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
    } catch (_) {
      // fall back to UTC below
    }
  }
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const tag = String(raw || '').trim();
    if (!tag || tag.toLowerCase() === 'sample' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

// Playbook status from the trade's review: 'broken' when the trader marked the
// plan as not followed or the adherence score is below a C (70), 'followed'
// for any other reviewed trade, null when the trade was never reviewed.
function playbookStatus(row) {
  if (!row.review_type) return null;
  if (row.review_followed_plan === false) return 'broken';
  const score = Number(row.review_adherence_score);
  if (row.review_type === 'adherence' && Number.isFinite(score) && score < BROKEN_PLAYBOOK_SCORE) {
    return 'broken';
  }
  return 'followed';
}

function roundToNiceAmount(value) {
  const abs = Math.abs(Number(value) || 0);
  if (abs <= 0) return null;
  const step = abs >= 1000 ? 100 : abs >= 200 ? 50 : abs >= 50 ? 10 : 5;
  return Math.max(step, Math.round(abs / step) * step);
}

/**
 * Inputs for the forward-looking rule simulator (daily loss limit, max trades
 * per day, entry cutoff, tags, playbook). Defaults are conventions or the
 * trader's own configured limits, never values tuned to maximise the upside.
 */
function buildRuleContext(normalized, options = {}) {
  const losses = normalized.filter(t => t.pnl < 0);
  const avgLoss = losses.length > 0
    ? losses.reduce((sum, t) => sum + Math.abs(t.pnl), 0) / losses.length
    : 0;

  const configuredLimit = Number(options.accountDailyLossLimit);
  let dailyLossLimit = null;
  let dailyLossLimitSource = null;
  if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
    dailyLossLimit = round2(configuredLimit);
    dailyLossLimitSource = 'account_rule';
  } else if (avgLoss > 0) {
    dailyLossLimit = roundToNiceAmount(avgLoss * DEFAULT_LOSS_LIMIT_AVG_LOSSES);
    dailyLossLimitSource = 'avg_loss';
  }

  const tradesPerDay = new Map();
  let minMinute = null;
  let maxMinute = null;
  for (const t of normalized) {
    tradesPerDay.set(t.date, (tradesPerDay.get(t.date) || 0) + 1);
    if (t.entryMinute !== null) {
      minMinute = minMinute === null ? t.entryMinute : Math.min(minMinute, t.entryMinute);
      maxMinute = maxMinute === null ? t.entryMinute : Math.max(maxMinute, t.entryMinute);
    }
  }
  const maxTradesInADay = tradesPerDay.size > 0 ? Math.max(...tradesPerDay.values()) : 0;

  const tagTotals = new Map();
  for (const t of normalized) {
    for (const tag of t.tags) {
      const entry = tagTotals.get(tag) || { tag, tradeCount: 0, totalPnl: 0 };
      entry.tradeCount += 1;
      entry.totalPnl += t.pnl;
      tagTotals.set(tag, entry);
    }
  }
  // Most-used tags first (not most-losing), so the list is not cherry-picked.
  const tagOptions = [...tagTotals.values()]
    .filter(entry => entry.tradeCount >= 2)
    .sort((a, b) => b.tradeCount - a.tradeCount || a.tag.localeCompare(b.tag))
    .slice(0, MAX_TAG_OPTIONS)
    .map(entry => ({ ...entry, totalPnl: round2(entry.totalPnl) }));

  const reviewed = normalized.filter(t => t.playbook !== null);
  const broken = reviewed.filter(t => t.playbook === 'broken');

  return {
    dailyLossLimit: {
      default: dailyLossLimit,
      source: dailyLossLimitSource,
      avgLoss: round2(avgLoss)
    },
    maxTradesPerDay: {
      default: DEFAULT_MAX_TRADES_PER_DAY,
      maxTradesInADay,
      tradingDays: tradesPerDay.size
    },
    entryCutoff: {
      defaultMinute: DEFAULT_CUTOFF_MINUTE,
      earliestEntryMinute: minMinute,
      latestEntryMinute: maxMinute
    },
    tags: tagOptions,
    playbook: {
      reviewedCount: reviewed.length,
      brokenCount: broken.length,
      brokenPnl: round2(broken.reduce((sum, t) => sum + t.pnl, 0)),
      scoreThreshold: BROKEN_PLAYBOOK_SCORE
    }
  };
}

function formatDateKey(row) {
  if (row.trade_date instanceof Date && !Number.isNaN(row.trade_date.getTime())) {
    // pg returns DATE columns as local-midnight Date instances; read local Y-M-D
    const y = row.trade_date.getFullYear();
    const m = String(row.trade_date.getMonth() + 1).padStart(2, '0');
    const d = String(row.trade_date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof row.trade_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.trade_date)) {
    return row.trade_date.slice(0, 10);
  }
  const fallback = row.exit_time || row.entry_time;
  if (fallback) {
    const d = fallback instanceof Date ? fallback : new Date(fallback);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return '';
}

function summarizeTrades(items) {
  let totalPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const item of items) {
    const pnl = item.pnl;
    totalPnl += pnl;
    if (pnl > 0) {
      winCount += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      lossCount += 1;
      grossLoss += Math.abs(pnl);
    }
  }

  const tradeCount = items.length;
  const winRate = tradeCount > 0 ? round2((winCount / tradeCount) * 100) : 0;
  const profitFactor = grossLoss > 0
    ? round2(grossProfit / grossLoss)
    : (grossProfit > 0 ? null : 0);

  return {
    tradeCount,
    totalPnl: round2(totalPnl),
    winCount,
    lossCount,
    winRate,
    profitFactor
  };
}

/**
 * Find whether any *other* losing trade closed within [entryMs - windowMs, entryMs].
 * Works accurately even when positions overlap in time.
 */
function hasRecentPriorLoss(sortedLossExits, entryMs, selfIdx, windowMs) {
  if (sortedLossExits.length === 0 || entryMs === null) return false;
  // Binary search for the rightmost loss exit with exitMs <= entryMs
  let lo = 0;
  let hi = sortedLossExits.length - 1;
  let pos = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedLossExits[mid].exitMs <= entryMs) {
      pos = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  while (pos >= 0 && (entryMs - sortedLossExits[pos].exitMs) <= windowMs) {
    if (sortedLossExits[pos].idx !== selfIdx) {
      return true;
    }
    pos -= 1;
  }
  return false;
}

/**
 * Pure deterministic classifier & counterfactual builder.
 * Expects closed, non-sample trade rows ordered chronologically.
 */
function analyzeTrades(rows, timezone = 'UTC', options = {}) {
  const hourFormatter = createHourFormatter(timezone);
  const normalized = (rows || [])
    .map(row => {
      const pnl = Number(row.pnl);
      if (!Number.isFinite(pnl)) return null;
      const entryMs = row.entry_time ? new Date(row.entry_time).getTime() : null;
      const exitMs = row.exit_time ? new Date(row.exit_time).getTime() : null;
      return {
        date: formatDateKey(row),
        symbol: String(row.symbol || '').trim().toUpperCase(),
        pnl,
        entryMs: Number.isFinite(entryMs) ? entryMs : null,
        exitMs: Number.isFinite(exitMs) ? exitMs : null,
        entryHour: extractLocalHour(row.entry_time, hourFormatter),
        entryMinute: extractLocalMinuteOfDay(row.entry_time, hourFormatter),
        tags: normalizeTags(row.tags),
        playbook: playbookStatus(row),
        flags: []
      };
    })
    .filter(Boolean);

  const actual = summarizeTrades(normalized);

  if (normalized.length === 0) {
    return {
      actual,
      scenarios: [],
      trades: [],
      maxRecoverablePnl: 0,
      behavioralRecoverablePnl: 0,
      rules: buildRuleContext([], options)
    };
  }

  // 1. Average win baseline for oversized loss detection
  const wins = normalized.filter(t => t.pnl > 0);
  const avgWin = wins.length >= 2
    ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length
    : 0;
  const oversizedThreshold = avgWin > 0 ? avgWin * OVERSIZED_LOSS_MULTIPLIER : null;

  // 2. Worst symbol (net losing symbol with >= 2 trades)
  const symbolTotals = new Map();
  for (const t of normalized) {
    if (!t.symbol) continue;
    const existing = symbolTotals.get(t.symbol) || { totalPnl: 0, count: 0 };
    existing.totalPnl += t.pnl;
    existing.count += 1;
    symbolTotals.set(t.symbol, existing);
  }
  let worstSymbol = null;
  for (const [symbol, stats] of symbolTotals.entries()) {
    if (stats.count >= 2 && stats.totalPnl < 0) {
      if (!worstSymbol || stats.totalPnl < worstSymbol.totalPnl) {
        worstSymbol = { symbol, ...stats };
      }
    }
  }

  // 3. Worst entry hour (net losing hour in user's timezone with >= 2 trades)
  const hourTotals = new Map();
  for (const t of normalized) {
    if (t.entryHour === null) continue;
    const existing = hourTotals.get(t.entryHour) || { totalPnl: 0, count: 0 };
    existing.totalPnl += t.pnl;
    existing.count += 1;
    hourTotals.set(t.entryHour, existing);
  }
  let worstHour = null;
  for (const [hour, stats] of hourTotals.entries()) {
    if (stats.count >= 2 && stats.totalPnl < 0) {
      if (!worstHour || stats.totalPnl < worstHour.totalPnl) {
        worstHour = { hour, ...stats };
      }
    }
  }

  // 4. Pre-index all losing trade exits sorted ascending so overlapping
  //    positions never mask an earlier loss exit.
  const sortedLossExits = [];
  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];
    if (t.pnl < 0 && t.exitMs !== null) {
      sortedLossExits.push({ exitMs: t.exitMs, idx: i });
    }
  }
  sortedLossExits.sort((a, b) => a.exitMs - b.exitMs);

  // 5. Tag each trade with applicable rule flags.
  //    Cooling-off rule ("revenge") applies to ALL trades (wins and losses)
  //    entered within 30 minutes of a prior loss so the simulation reports
  //    the true net effect without hindsight bias.
  let revengeCount = 0;
  let revengeNetPnl = 0;
  let oversizedCount = 0;
  let oversizedPnl = 0;

  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i];

    if (hasRecentPriorLoss(sortedLossExits, t.entryMs, i, REVENGE_WINDOW_MS)) {
      t.flags.push('revenge');
      revengeCount += 1;
      revengeNetPnl += t.pnl;
    }

    if (oversizedThreshold !== null && t.pnl < 0 && Math.abs(t.pnl) > oversizedThreshold) {
      t.flags.push('oversized_loss');
      oversizedCount += 1;
      oversizedPnl += t.pnl;
    }

    if (worstSymbol && t.symbol === worstSymbol.symbol) {
      t.flags.push('worst_symbol');
    }

    if (worstHour && t.entryHour === worstHour.hour) {
      t.flags.push('worst_hour');
    }
  }

  // If net post-loss re-entries were profitable/flat overall, do not flag
  // them as a leak scenario and strip the flag so toggles stay aligned.
  if (revengeNetPnl >= 0 && revengeCount > 0) {
    for (const t of normalized) {
      const idx = t.flags.indexOf('revenge');
      if (idx !== -1) t.flags.splice(idx, 1);
    }
    revengeCount = 0;
    revengeNetPnl = 0;
  }

  const scenarios = [];
  if (revengeCount > 0 && revengeNetPnl < 0) {
    scenarios.push({
      key: 'revenge',
      label: 'Post-loss re-entries',
      shortLabel: 'Cooling-off rule',
      detail: 'All trades (wins & losses) entered within 30 min of a prior loss',
      tradeCount: revengeCount,
      recoverablePnl: round2(Math.abs(revengeNetPnl))
    });
  }

  if (oversizedCount > 0 && oversizedPnl < 0) {
    scenarios.push({
      key: 'oversized_loss',
      label: 'Oversized losses',
      shortLabel: 'Tail losses',
      detail: `Historical gross losses exceeding 1.5x your avg win ($${Math.round(avgWin).toLocaleString('en-US')})`,
      tradeCount: oversizedCount,
      recoverablePnl: round2(Math.abs(oversizedPnl))
    });
  }

  if (worstSymbol) {
    scenarios.push({
      key: 'worst_symbol',
      label: `Skip ${worstSymbol.symbol}`,
      shortLabel: `Skip ${worstSymbol.symbol}`,
      detail: `Net result on your most expensive ticker (${worstSymbol.count} trades)`,
      tradeCount: worstSymbol.count,
      recoverablePnl: round2(Math.abs(worstSymbol.totalPnl))
    });
  }

  if (worstHour) {
    const hourLabel = formatHourLabel(worstHour.hour);
    scenarios.push({
      key: 'worst_hour',
      label: `Skip ${hourLabel} hour`,
      shortLabel: `Skip ${hourLabel}`,
      detail: `Net result in your weakest entry hour (${worstHour.count} trades)`,
      tradeCount: worstHour.count,
      recoverablePnl: round2(Math.abs(worstHour.totalPnl))
    });
  }

  scenarios.sort((a, b) => b.recoverablePnl - a.recoverablePnl);

  // Best recoverable upside across all-off combination and individual scenarios
  const remainingAllOff = normalized.filter(t => t.flags.length === 0);
  const simulatedAllOffTotal = remainingAllOff.reduce((sum, t) => sum + t.pnl, 0);
  const allOffDelta = simulatedAllOffTotal - actual.totalPnl;
  const bestSingleScenario = scenarios.length > 0 ? scenarios[0].recoverablePnl : 0;
  const maxRecoverablePnl = round2(Math.max(0, allOffDelta, bestSingleScenario));

  // Ex-ante behavioral recoverable P&L: strictly the net effect of the
  // post-loss cooling-off rule (both wins and losses entered within 30 min of
  // a prior loss), excluding hindsight-selected scenarios (oversized_loss,
  // worst_symbol, worst_hour).
  const revengeScenario = scenarios.find(s => s.key === 'revenge');
  const behavioralRecoverablePnl = revengeScenario ? round2(Math.max(0, revengeScenario.recoverablePnl)) : 0;

  return {
    actual,
    scenarios,
    // Compact per-trade rows for the client-side simulator:
    // d=day, p=P&L, f=hindsight flags, e/x=entry/exit epoch ms,
    // m=entry minute of day (user timezone), tg=tags, pb=playbook status.
    trades: normalized.map(t => ({
      d: t.date,
      p: round2(t.pnl),
      f: t.flags,
      e: t.entryMs,
      x: t.exitMs,
      m: t.entryMinute,
      tg: t.tags,
      pb: t.playbook
    })),
    maxRecoverablePnl,
    behavioralRecoverablePnl,
    rules: buildRuleContext(normalized, options)
  };
}

// Rule data (tags + latest playbook review) is only loaded for the Pro
// simulator; other callers stay on the lean aggregate query.
// LATERAL ... LIMIT 1 keeps one row per trade even when a trade has both an
// adherence review and a manual grading review.
const RULE_DATA_COLUMNS = `,
          t.tags,
          pr.review_type,
          pr.adherence_score AS review_adherence_score,
          pr.followed_plan AS review_followed_plan`;
const RULE_DATA_JOIN = `
        LEFT JOIN LATERAL (
          SELECT r.review_type, r.adherence_score, r.followed_plan
          FROM trade_playbook_reviews r
          WHERE r.trade_id = t.id AND r.user_id = t.user_id
          ORDER BY (r.review_type = 'adherence') DESC, r.reviewed_at DESC NULLS LAST
          LIMIT 1
        ) pr ON true`;

class WhatIfSimulatorService {
  static async fetchRealClosedTrades(userId, filters = {}, { includeRuleData = false } = {}) {
    const extraColumns = includeRuleData ? RULE_DATA_COLUMNS : '';
    const extraJoin = includeRuleData ? RULE_DATA_JOIN : '';

    if (filters.tradeDateOnly) {
      const values = [userId];
      let whereClause = `WHERE t.user_id = $1`;
      let paramIdx = 2;
      if (filters.startDate) {
        whereClause += ` AND t.trade_date >= $${paramIdx}::date`;
        values.push(filters.startDate);
        paramIdx += 1;
      }
      if (filters.endDate) {
        whereClause += ` AND t.trade_date <= $${paramIdx}::date`;
        values.push(filters.endDate);
        paramIdx += 1;
      }
      const query = `
        SELECT
          t.id,
          t.symbol,
          t.trade_date,
          t.entry_time,
          t.exit_time,
          ${fxUsd('pnl', 't')} AS pnl${extraColumns}
        FROM trades t${extraJoin}
        ${whereClause}
          AND t.exit_price IS NOT NULL
          AND t.pnl IS NOT NULL
          AND NOT COALESCE('sample' = ANY(t.tags), false)
        ORDER BY COALESCE(t.exit_time, t.entry_time, t.trade_date::timestamptz) ASC, t.id ASC
      `;
      const result = await db.query(query, values);
      return result.rows;
    }

    const { whereClause, values, needsSectorOuterJoin } = await TradeQueries._buildWhereClause(userId, filters);
    const joinClause = needsSectorOuterJoin
      ? ' LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol'
      : '';

    const query = `
      SELECT
        t.id,
        t.symbol,
        t.trade_date,
        t.entry_time,
        t.exit_time,
        ${fxUsd('pnl', 't')} AS pnl${extraColumns}
      FROM trades t
      ${joinClause}${extraJoin}
      ${whereClause}
        AND t.exit_price IS NOT NULL
        AND t.pnl IS NOT NULL
        AND NOT COALESCE('sample' = ANY(t.tags), false)
      ORDER BY COALESCE(t.exit_time, t.entry_time, t.trade_date::timestamptz) ASC, t.id ASC
    `;

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Tightest active prop-firm daily loss limit, used as the default for the
   * simulator's daily loss limit rule. Returns null when none is configured.
   */
  static async fetchAccountDailyLossLimit(userId) {
    try {
      const result = await db.query(
        `SELECT MIN(max_daily_loss) AS max_daily_loss
         FROM account_rule_profiles
         WHERE user_id = $1 AND is_active = true AND max_daily_loss > 0`,
        [userId]
      );
      const value = Number(result.rows?.[0]?.max_daily_loss);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (error) {
      // Rule profiles are optional; fall back to the average-loss default.
      return null;
    }
  }

  static async computeSimulation(userId, filters = {}, { includeRuleData = false } = {}) {
    const [rows, timezone, accountDailyLossLimit] = await Promise.all([
      this.fetchRealClosedTrades(userId, filters, { includeRuleData }),
      getUserTimezone(userId),
      includeRuleData ? this.fetchAccountDailyLossLimit(userId) : Promise.resolve(null)
    ]);

    return analyzeTrades(rows, timezone, { accountDailyLossLimit });
  }
}

WhatIfSimulatorService.analyzeTrades = analyzeTrades;

module.exports = WhatIfSimulatorService;
