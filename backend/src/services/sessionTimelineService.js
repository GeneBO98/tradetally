const db = require('../config/database');
const TierService = require('./tierService');
const { getUserTimezone } = require('../utils/timezone');

const BLOCK_MINUTES = 15;
const BLOCK_COUNT = 24 * 60 / BLOCK_MINUTES;
const POST_LOSS_WINDOW_MINUTES = 30;
const MAX_BASELINE_DAYS = 20;
const BASELINE_LOOKBACK_DAYS = 90;
const MIN_BASELINE_DAYS = 10;

function assertDate(value, name) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`${name} must be an ISO date (YYYY-MM-DD)`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function accountCondition(params, accounts, alias = 't') {
  if (!Array.isArray(accounts) || accounts.length === 0) return '';
  if (accounts.includes('__unsorted__')) {
    return `AND (${alias}.account_identifier IS NULL OR ${alias}.account_identifier = '')`;
  }
  params.push(accounts);
  return `AND ${alias}.account_identifier = ANY($${params.length}::text[])`;
}

function localParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(value));
  const result = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(result.hour === '24' ? '00' : result.hour);
  const minute = Number(result.minute);
  return {
    date: `${result.year}-${result.month}-${result.day}`,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute
  };
}

function blockIndex(minuteOfDay) {
  return Math.max(0, Math.min(BLOCK_COUNT - 1, Math.floor(minuteOfDay / BLOCK_MINUTES)));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function blankCounts() {
  return Array.from({ length: BLOCK_COUNT }, () => 0);
}

function formatBlock(index) {
  const minutes = index * BLOCK_MINUTES;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function addDays(date, amount) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

class SessionTimelineService {
  static async getSessionTimeline(userId, options = {}) {
    const hasAccess = await TierService.hasFeatureAccess(userId, 'behavioral_analytics');
    if (!hasAccess) throw new Error('Behavioral analytics requires Pro tier');

    const sessionDateInput = assertDate(options.session_date, 'session_date');
    const startDate = assertDate(options.start_date, 'start_date');
    const endDate = assertDate(options.end_date, 'end_date');
    if (startDate && endDate && startDate > endDate) {
      const error = new Error('start_date must be before or equal to end_date');
      error.statusCode = 400;
      throw error;
    }

    const timezone = await getUserTimezone(userId);
    const accounts = options.accounts || [];

    // Resolve the available session dates first. The page date filter scopes
    // the reviewed sessions, while the personal baseline intentionally uses
    // the full 90-day history below.
    const dateParams = [userId, timezone];
    let dateFilter = '';
    if (startDate) {
      dateParams.push(startDate);
      dateFilter += ` AND (t.entry_time AT TIME ZONE $2)::date >= $${dateParams.length}::date`;
    }
    if (endDate) {
      dateParams.push(endDate);
      dateFilter += ` AND (t.entry_time AT TIME ZONE $2)::date <= $${dateParams.length}::date`;
    }
    dateFilter += accountCondition(dateParams, accounts, 't');
    const datesResult = await db.query(`
      SELECT (t.entry_time AT TIME ZONE $2)::date::text AS session_date,
             COUNT(*)::integer AS trade_count
      FROM trades t
      WHERE t.user_id = $1 AND t.entry_time IS NOT NULL ${dateFilter}
      GROUP BY 1
      ORDER BY 1 DESC
    `, dateParams);
    let availableSessionDates = datesResult.rows;
    const sessionDate = sessionDateInput || availableSessionDates[0]?.session_date || null;

    if (!sessionDate) {
      return {
        timezone,
        session_date: null,
        available_session_dates: [],
        block_minutes: BLOCK_MINUTES,
        blocks: [],
        losses: [],
        trades: [],
        baseline: { active_days: 0, sample_dates: [], minimum_days: MIN_BASELINE_DAYS, available: false },
        warnings: ['No trade entries were found for the selected date range.']
      };
    }

    const sessionParams = [userId, timezone, sessionDate];
    const sessionAccountCondition = accountCondition(sessionParams, accounts, 't');
    const sessionTradesResult = await db.query(`
      SELECT t.id, COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol) AS symbol,
             t.entry_time, t.exit_time, t.pnl, t.side, t.account_identifier
      FROM trades t
      WHERE t.user_id = $1 AND t.entry_time IS NOT NULL
        AND (t.entry_time AT TIME ZONE $2)::date = $3::date
        ${sessionAccountCondition}
      ORDER BY t.entry_time ASC, t.id ASC
    `, sessionParams);

    // Losses are queried independently from entries so an overnight trade
    // can still create a visible post-loss review window on this date.
    const lossParams = [userId, timezone, sessionDate, addDays(sessionDate, 1)];
    const lossAccountCondition = accountCondition(lossParams, accounts, 't');
    const lossesResult = await db.query(`
      SELECT t.id, COALESCE(NULLIF(t.underlying_symbol, ''), t.symbol) AS symbol,
             t.exit_time, t.pnl, t.account_identifier
      FROM trades t
      WHERE t.user_id = $1 AND t.exit_time IS NOT NULL AND t.pnl < 0
        AND t.exit_time >= (($3::date::timestamp - INTERVAL '30 minutes') AT TIME ZONE $2)
        AND t.exit_time < ($4::date::timestamp AT TIME ZONE $2)
        ${lossAccountCondition}
      ORDER BY t.exit_time ASC, t.id ASC
    `, lossParams);

    // The baseline query includes only entries before the selected session;
    // choose the most recent 20 active local dates in JavaScript so every
    // block gets an explicit zero for inactive days.
    const baselineParams = [userId, timezone, addDays(sessionDate, -BASELINE_LOOKBACK_DAYS), sessionDate];
    const baselineAccountCondition = accountCondition(baselineParams, accounts, 't');
    const baselineResult = await db.query(`
      SELECT t.id, t.entry_time,
             (t.entry_time AT TIME ZONE $2)::date::text AS local_date
      FROM trades t
      WHERE t.user_id = $1 AND t.entry_time IS NOT NULL
        AND (t.entry_time AT TIME ZONE $2)::date >= $3::date
        AND (t.entry_time AT TIME ZONE $2)::date < $4::date
        ${baselineAccountCondition}
      ORDER BY t.entry_time DESC, t.id DESC
    `, baselineParams);

    const byDate = new Map();
    for (const row of baselineResult.rows) {
      if (!byDate.has(row.local_date)) byDate.set(row.local_date, blankCounts());
      const local = localParts(row.entry_time, timezone);
      byDate.get(row.local_date)[blockIndex(local.minuteOfDay)] += 1;
    }
    const sampleDates = [...byDate.keys()].sort().reverse().slice(0, MAX_BASELINE_DAYS);
    const sampleCounts = sampleDates.map((date) => byDate.get(date));
    const baselineAvailable = sampleDates.length >= MIN_BASELINE_DAYS;

    // Build lightweight anomaly flags for the calendar. A day is marked only
    // when it contains a post-loss entry in a block that exceeds the selected
    // session's personal p75 range for that clock time.
    if (baselineAvailable && availableSessionDates.length > 0) {
      const calendarStartDate = availableSessionDates[availableSessionDates.length - 1].session_date;
      const calendarEndDate = availableSessionDates[0].session_date;
      const calendarEntryParams = [userId, timezone, calendarStartDate, calendarEndDate];
      const calendarEntryAccountCondition = accountCondition(calendarEntryParams, accounts, 't');
      const calendarEntriesResult = await db.query(`
        SELECT t.id, t.entry_time,
               (t.entry_time AT TIME ZONE $2)::date::text AS local_date
        FROM trades t
        WHERE t.user_id = $1 AND t.entry_time IS NOT NULL
          AND (t.entry_time AT TIME ZONE $2)::date >= $3::date
          AND (t.entry_time AT TIME ZONE $2)::date <= $4::date
          ${calendarEntryAccountCondition}
        ORDER BY t.entry_time ASC, t.id ASC
      `, calendarEntryParams);

      const calendarLossParams = [userId, timezone, calendarStartDate, addDays(calendarEndDate, 1)];
      const calendarLossAccountCondition = accountCondition(calendarLossParams, accounts, 't');
      const calendarLossesResult = await db.query(`
        SELECT t.id, t.exit_time
        FROM trades t
        WHERE t.user_id = $1 AND t.exit_time IS NOT NULL AND t.pnl < 0
          AND t.exit_time >= (($3::date::timestamp - INTERVAL '30 minutes') AT TIME ZONE $2)
          AND t.exit_time < ($4::date::timestamp AT TIME ZONE $2)
          ${calendarLossAccountCondition}
        ORDER BY t.exit_time ASC, t.id ASC
      `, calendarLossParams);

      const calendarLosses = calendarLossesResult.rows.map((loss) => new Date(loss.exit_time).getTime());
      const calendarCounts = new Map();
      for (const entry of calendarEntriesResult.rows) {
        const local = localParts(entry.entry_time, timezone);
        if (!calendarCounts.has(local.date)) calendarCounts.set(local.date, blankCounts().map(() => ({ total: 0, post_loss: 0 })));
        const block = calendarCounts.get(local.date)[blockIndex(local.minuteOfDay)];
        block.total += 1;
        const entryTime = new Date(entry.entry_time).getTime();
        if (calendarLosses.some((lossTime) => entryTime > lossTime && entryTime <= lossTime + POST_LOSS_WINDOW_MINUTES * 60 * 1000)) {
          block.post_loss += 1;
        }
      }
      availableSessionDates = availableSessionDates.map((session) => {
        const counts = calendarCounts.get(session.session_date) || [];
        const anomalous = counts.some((block, index) => block.post_loss > 0 && block.total > percentile(sampleCounts.map((day) => day[index]), 0.75));
        return { ...session, anomalous };
      });
    } else {
      availableSessionDates = availableSessionDates.map((session) => ({ ...session, anomalous: false }));
    }

    const losses = lossesResult.rows.map((row) => {
      const local = localParts(row.exit_time, timezone);
      return {
        id: row.id,
        symbol: row.symbol,
        pnl: Number(row.pnl),
        timestamp: row.exit_time,
        local_date: local.date,
        local_time: `${formatBlock(Math.floor(local.minuteOfDay / BLOCK_MINUTES))}`,
        block_index: blockIndex(local.minuteOfDay),
        visible: local.date === sessionDate
      };
    });
    const sessionTrades = sessionTradesResult.rows.map((row) => {
      const local = localParts(row.entry_time, timezone);
      const postLosses = losses.filter((loss) => {
        const lossTime = new Date(loss.timestamp).getTime();
        const entryTime = new Date(row.entry_time).getTime();
        return entryTime > lossTime && entryTime <= lossTime + POST_LOSS_WINDOW_MINUTES * 60 * 1000;
      });
      return {
        id: row.id,
        symbol: row.symbol,
        side: row.side,
        pnl: row.pnl === null ? null : Number(row.pnl),
        entry_time: row.entry_time,
        exit_time: row.exit_time,
        local_time: formatBlock(blockIndex(local.minuteOfDay)),
        block_index: blockIndex(local.minuteOfDay),
        post_loss: postLosses.length > 0,
        post_loss_ids: postLosses.map((loss) => loss.id)
      };
    });

    const sessionCounts = blankCounts();
    const postLossCounts = blankCounts();
    for (const trade of sessionTrades) {
      sessionCounts[trade.block_index] += 1;
      if (trade.post_loss) postLossCounts[trade.block_index] += 1;
    }

    const blocks = Array.from({ length: BLOCK_COUNT }, (_, index) => {
      const values = sampleCounts.map((counts) => counts[index]);
      const typical = baselineAvailable ? {
        p25: percentile(values, 0.25),
        median: percentile(values, 0.5),
        p75: percentile(values, 0.75)
      } : { p25: null, median: null, p75: null };
      return {
        index,
        start_minute: index * BLOCK_MINUTES,
        label: formatBlock(index),
        trade_count: sessionCounts[index],
        post_loss_count: postLossCounts[index],
        above_typical: baselineAvailable && sessionCounts[index] > typical.p75,
        ...typical
      };
    });

    return {
      timezone,
      session_date: sessionDate,
      available_session_dates: availableSessionDates,
      block_minutes: BLOCK_MINUTES,
      post_loss_window_minutes: POST_LOSS_WINDOW_MINUTES,
      blocks,
      losses,
      trades: sessionTrades,
      baseline: {
        active_days: sampleDates.length,
        sample_dates: sampleDates,
        minimum_days: MIN_BASELINE_DAYS,
        lookback_days: BASELINE_LOOKBACK_DAYS,
        available: baselineAvailable
      },
      warnings: []
    };
  }
}

module.exports = SessionTimelineService;
