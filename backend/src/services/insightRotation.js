const db = require('../config/database');

// Dashboard insight rotation.
//
// The insight summary is cached per user + filter, but which insights lead the
// card is decided per request from dashboard_insight_impressions. Each insight
// carries a stable `key` (e.g. `edge:best:strategy:scalper`) so the same
// observation is recognised across rebuilds even when its numbers move.
//
// Rotated insights (edge, tendencies, discipline, open-position management)
// get a TTL: once a key has led the card for TTL days it is retired for a
// cooldown, then may return. Event-driven insights (earnings, news) expire on
// their own when the event passes, so they are never retired.

const DAY_MS = 24 * 60 * 60 * 1000;

const TTL_DAYS = 3;
const COOLDOWN_DAYS = 14;
// A key that has not been shown for this long counts as new when it returns.
const IMPRESSION_GAP_RESET_DAYS = 7;
// Each day a rotated insight stays on screen costs it priority, so fresher
// observations overtake it well before the TTL hard-retires it.
const STALENESS_PENALTY_PER_DAY = 4;
const MAX_STALENESS_PENALTY = 12;

const ROTATED_TYPES = new Set(['edge', 'behavior', 'discipline', 'streak', 'position']);

function isRotated(insight) {
  return !!insight && !!insight.key && ROTATED_TYPES.has(insight.type);
}

// The first_shown_at that will be in effect once this key is shown again.
// Mirrors the reset rules in recordImpressions().
function effectiveFirstShown(impression, now) {
  if (!impression) return null;
  const first = new Date(impression.first_shown_at).getTime();
  const last = new Date(impression.last_shown_at).getTime();
  if (now - last > IMPRESSION_GAP_RESET_DAYS * DAY_MS) return null;
  if (now - first > (TTL_DAYS + COOLDOWN_DAYS) * DAY_MS) return null;
  return first;
}

/**
 * Pure: filter and reorder insights given the user's impression history.
 * @param {Array} insights - priority-sorted insights from the summary builder
 * @param {Map<string, {first_shown_at, last_shown_at}>} impressionsByKey
 * @param {number} now - epoch ms
 * @returns {Array} insights to show, most relevant first
 */
function rotateInsights(insights, impressionsByKey, now = Date.now()) {
  if (!Array.isArray(insights) || insights.length === 0) return [];
  const impressions = impressionsByKey || new Map();

  const scored = [];
  const retired = [];
  insights.forEach((insight, order) => {
    let effectivePriority = insight.priority || 0;
    if (isRotated(insight)) {
      const first = effectiveFirstShown(impressions.get(insight.key), now);
      const ageDays = first === null ? 0 : (now - first) / DAY_MS;
      if (ageDays >= TTL_DAYS) {
        retired.push({ insight, order, ageDays });
        return;
      }
      effectivePriority -= Math.min(MAX_STALENESS_PENALTY, Math.floor(ageDays) * STALENESS_PENALTY_PER_DAY);
    }
    scored.push({ insight, order, effectivePriority });
  });

  // Never blank the card: if everything is retired, show the observations
  // that have been retired the shortest time first.
  if (scored.length === 0) {
    return retired
      .sort((a, b) => a.ageDays - b.ageDays || a.order - b.order)
      .map(entry => entry.insight);
  }

  return scored
    .sort((a, b) => b.effectivePriority - a.effectivePriority || a.order - b.order)
    .map(entry => entry.insight);
}

async function loadImpressions(userId, keys) {
  const map = new Map();
  if (!keys.length) return map;
  const result = await db.query(
    `SELECT insight_key, first_shown_at, last_shown_at
     FROM dashboard_insight_impressions
     WHERE user_id = $1 AND insight_key = ANY($2::text[])`,
    [userId, keys]
  );
  for (const row of result.rows) map.set(row.insight_key, row);
  return map;
}

async function recordImpressions(userId, keys) {
  if (!keys.length) return;
  await db.query(
    `INSERT INTO dashboard_insight_impressions (user_id, insight_key, first_shown_at, last_shown_at)
     SELECT $1, key, NOW(), NOW() FROM unnest($2::text[]) AS key
     ON CONFLICT (user_id, insight_key) DO UPDATE SET
       first_shown_at = CASE
         WHEN dashboard_insight_impressions.last_shown_at < NOW() - make_interval(days => $3)
           OR dashboard_insight_impressions.first_shown_at < NOW() - make_interval(days => $4)
         THEN NOW()
         ELSE dashboard_insight_impressions.first_shown_at
       END,
       last_shown_at = NOW()`,
    [userId, keys, IMPRESSION_GAP_RESET_DAYS, TTL_DAYS + COOLDOWN_DAYS]
  );
}

/**
 * Apply rotation to a cached summary payload for one request. Records an
 * impression for the lead insight unless `record` is false (cache warmers).
 * Falls back to the unrotated payload if the impressions table is unavailable.
 */
async function applyToSummary(userId, payload, { record = true, now = Date.now() } = {}) {
  const insights = Array.isArray(payload?.summaries) ? payload.summaries : null;
  if (!insights || insights.length === 0) return payload;

  try {
    const keys = [...new Set(insights.filter(isRotated).map(insight => insight.key))];
    const impressions = await loadImpressions(userId, keys);
    const rotated = rotateInsights(insights, impressions, now);

    // Only the leading rotated insight ages. Charging every carousel item
    // would retire them all on the same day; charging the lead lets the next
    // observation take over once it goes stale.
    const lead = rotated.find(isRotated);
    if (record && lead) {
      await recordImpressions(userId, [lead.key]);
    }

    return { ...payload, summary: rotated[0] || null, summaries: rotated };
  } catch (err) {
    console.warn('[AI] insight rotation failed, returning unrotated insights:', err.message);
    return payload;
  }
}

module.exports = {
  rotateInsights,
  applyToSummary,
  TTL_DAYS,
  COOLDOWN_DAYS,
  IMPRESSION_GAP_RESET_DAYS
};
