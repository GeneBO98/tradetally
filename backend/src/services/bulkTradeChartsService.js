const db = require('../config/database');
const AnalyticsCache = require('./analyticsCache');
const AppError = require('../utils/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function add(user_id, trade_ids, chart_url, chart_title) {
  if (!Array.isArray(trade_ids) || trade_ids.length < 1 || trade_ids.length > 500 ||
      trade_ids.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw new AppError(400, { error: 'Select between 1 and 500 valid trades' });
  }
  const ids = [...new Set(trade_ids.map(id => id.toLowerCase()))];
  let url;
  try { url = new URL(chart_url); } catch (_) { /* validated below */ }
  if (typeof chart_url !== 'string' || chart_url.length > 1000 || !url ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !/(^|\.)tradingview\.com$/i.test(url.hostname) || !/^\/(x|chart)\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) {
    throw new AppError(400, { error: 'Enter a TradingView snapshot or chart link' });
  }
  if (chart_title != null && (typeof chart_title !== 'string' || chart_title.trim().length > 255)) {
    throw new AppError(400, { error: 'Chart title must be at most 255 characters' });
  }
  const normalized_url = chart_url.trim();
  const title = chart_title?.trim() || null;

  const changes = await db.withTransaction(async client => {
    const owned = await client.query(
      `SELECT id FROM trades WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
      [user_id, ids]
    );
    if (owned.rows.length !== ids.length) {
      throw new AppError(404, { error: 'One or more selected trades were not found' });
    }
    const result = await client.query(
      `INSERT INTO trade_charts (trade_id, chart_url, chart_title)
       SELECT t.id, $3::text, $4::text FROM trades t
       WHERE t.user_id = $1 AND t.id = ANY($2::uuid[])
         AND NOT EXISTS (
           SELECT 1 FROM trade_charts tc WHERE tc.trade_id = t.id AND tc.chart_url = $3::text
         )
       RETURNING trade_id`,
      [user_id, ids, normalized_url, title]
    );
    return result.rows;
  });
  if (changes.length) await AnalyticsCache.invalidate(user_id);
  return { updated_trade_count: changes.length, skipped_trade_count: ids.length - changes.length, changes };
}

module.exports = { add };
