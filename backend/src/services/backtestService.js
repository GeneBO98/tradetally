/**
 * Backtest Sandbox persistence and accounting.
 *
 * A backtest session is a past symbol/day played bar-by-bar (candles served by
 * replayDataService.getBacktestSessionData) during which the user places
 * simulated orders. On save the client sends the chronological fills; stats
 * are recomputed server-side so the stored summary never depends on client
 * math. Sessions must be flat (net position zero) when saved - the frontend
 * auto-flattens at the current bar before submitting.
 *
 * backtest_usage meters the free tier: each distinct symbol/session-date a
 * user loads counts once, ever, mirroring replay_usage.
 */

const db = require('../config/database');

const MAX_FILLS = 500;
const MAX_QUANTITY = 10_000_000;
const MAX_NOTES_LENGTH = 5000;

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/**
 * Validate and normalize client-submitted fills against the session window.
 * Returns chronologically sorted fills in canonical shape.
 */
function normalizeSessionFills(rawFills, session) {
  if (!Array.isArray(rawFills) || rawFills.length === 0) {
    throw validationError('A backtest session needs at least one fill');
  }
  if (rawFills.length > MAX_FILLS) {
    throw validationError(`A backtest session supports at most ${MAX_FILLS} fills`);
  }

  const fills = rawFills.map((fill) => {
    const time = Number(fill?.time);
    const price = Number(fill?.price);
    const quantity = Number(fill?.quantity);
    const action = fill?.action === 'buy' || fill?.action === 'sell' ? fill.action : null;

    if (!Number.isInteger(time) || time < session.from_ts || time > session.to_ts) {
      throw validationError('Fill times must fall inside the session window');
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw validationError('Fill prices must be positive numbers');
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      throw validationError('Fill quantities must be positive numbers');
    }
    if (!action) {
      throw validationError('Fill actions must be "buy" or "sell"');
    }
    return { time, price, quantity, action };
  });

  fills.sort((a, b) => a.time - b.time);
  return fills;
}

/**
 * Realized P&L and round-trip stats from chronological fills, using the same
 * average-cost accounting as the frontend replay engine. A round trip closes
 * whenever the position returns to zero (or flips through it). `multiplier`
 * scales price moves into dollars (futures point value; 1 for stocks).
 */
function computeSessionStats(fills, multiplier = 1) {
  let position = 0;
  let avgCost = 0;
  let realized = 0;
  let roundTrips = 0;
  let wins = 0;
  let losses = 0;
  let tripPnl = 0;

  const closeTrip = () => {
    roundTrips += 1;
    if (tripPnl > 0) wins += 1;
    else if (tripPnl < 0) losses += 1;
    tripPnl = 0;
  };

  for (const fill of fills) {
    const qty = fill.action === 'buy' ? fill.quantity : -fill.quantity;
    if (position === 0 || Math.sign(qty) === Math.sign(position)) {
      const newPosition = position + qty;
      avgCost = newPosition !== 0
        ? (avgCost * Math.abs(position) + fill.price * Math.abs(qty)) / Math.abs(newPosition)
        : 0;
      position = newPosition;
    } else {
      const closingQty = Math.min(Math.abs(qty), Math.abs(position));
      const pnl = (fill.price - avgCost) * closingQty * Math.sign(position) * multiplier;
      realized += pnl;
      tripPnl += pnl;
      position += qty;
      if (Math.sign(position) === Math.sign(qty) && position !== 0) {
        // Flipped through zero: the old trip closes, remainder opens fresh
        closeTrip();
        avgCost = fill.price;
      } else if (position === 0) {
        closeTrip();
        avgCost = 0;
      }
    }
  }

  return {
    position,
    total_pnl: realized,
    round_trips: roundTrips,
    wins,
    losses
  };
}

function toSessionSummary(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    session_date: row.session_date instanceof Date
      ? row.session_date.toISOString().split('T')[0]
      : String(row.session_date),
    instrument_type: row.instrument_type || 'stock',
    multiplier: row.multiplier !== undefined ? Number(row.multiplier) : 1,
    total_pnl: Number(row.total_pnl),
    round_trips: row.round_trips,
    wins: row.wins,
    losses: row.losses,
    fill_count: row.fill_count !== undefined ? Number(row.fill_count) : undefined,
    notes: row.notes,
    created_at: row.created_at
  };
}

async function createSession(userId, { symbol, sessionDate, instrumentType, multiplier, fills, notes, stats }) {
  const result = await db.query(
    `INSERT INTO backtest_sessions
       (user_id, symbol, session_date, instrument_type, multiplier, fills, total_pnl, round_trips, wins, losses, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, symbol, session_date, instrument_type, multiplier, total_pnl, round_trips, wins, losses, notes, created_at`,
    [
      userId,
      symbol,
      sessionDate,
      instrumentType || 'stock',
      multiplier || 1,
      JSON.stringify(fills),
      stats.total_pnl,
      stats.round_trips,
      stats.wins,
      stats.losses,
      notes || null
    ]
  );
  return toSessionSummary(result.rows[0]);
}

async function listSessions(userId) {
  const result = await db.query(
    `SELECT id, symbol, session_date, instrument_type, multiplier, total_pnl, round_trips, wins, losses, notes,
            jsonb_array_length(fills) AS fill_count, created_at
     FROM backtest_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [userId]
  );
  return result.rows.map(toSessionSummary);
}

async function getSession(sessionId, userId) {
  const result = await db.query(
    `SELECT id, symbol, session_date, instrument_type, multiplier, fills, total_pnl, round_trips, wins, losses, notes, created_at
     FROM backtest_sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const summary = toSessionSummary(row);
  summary.fills = Array.isArray(row.fills) ? row.fills : JSON.parse(row.fills || '[]');
  return summary;
}

async function deleteSession(sessionId, userId) {
  const result = await db.query(
    'DELETE FROM backtest_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
    [sessionId, userId]
  );
  return result.rows.length > 0;
}

async function countBacktestedSessions(userId) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS count FROM backtest_usage WHERE user_id = $1',
    [userId]
  );
  return result.rows[0].count;
}

async function hasBacktestedSession(userId, symbol, sessionDate) {
  const result = await db.query(
    'SELECT 1 FROM backtest_usage WHERE user_id = $1 AND symbol = $2 AND session_date = $3',
    [userId, symbol, sessionDate]
  );
  return result.rows.length > 0;
}

async function recordBacktestUsage(userId, symbol, sessionDate) {
  await db.query(
    `INSERT INTO backtest_usage (user_id, symbol, session_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, symbol, session_date) DO NOTHING`,
    [userId, symbol, sessionDate]
  );
}

module.exports = {
  normalizeSessionFills,
  computeSessionStats,
  createSession,
  listSessions,
  getSession,
  deleteSession,
  countBacktestedSessions,
  hasBacktestedSession,
  recordBacktestUsage
};
