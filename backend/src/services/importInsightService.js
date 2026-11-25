const db = require('../config/database');
const { fxUsd } = require('../utils/tradeFx');
const { getUserTimezone } = require('../utils/timezone');

function round2(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function round1(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 10) / 10;
}

function formatMoney(value) {
  const num = Math.abs(round2(value));
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatHourLabel(hour) {
  const h = parseInt(hour, 10);
  if (!Number.isFinite(h)) return 'unknown';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

/**
 * First diagnosis shown after an import: the single biggest net leak (or, when
 * there is none, the strongest edge) in the user's own real closed trades.
 * Scoped to the import when it has at least 5 closed trades, otherwise to the
 * whole account. Aggregates only; no individual trades are returned.
 */
class ImportInsightService {
  static async getImportInsight(userId, { importId = null } = {}) {
    let scope = 'account';
    let scopedImportId = null;

    if (importId) {
      const importCountRes = await db.query(`
        SELECT COUNT(*)::int AS count
        FROM trades t
        WHERE t.user_id = $1
          AND t.import_id = $2
          AND t.exit_price IS NOT NULL
          AND t.pnl IS NOT NULL
          AND NOT COALESCE('sample' = ANY(t.tags), false)
      `, [userId, importId]);
      const importClosedCount = parseInt(importCountRes.rows[0]?.count, 10) || 0;
      if (importClosedCount >= 5) {
        scope = 'import';
        scopedImportId = importId;
      }
    }

    const userTimezone = (await getUserTimezone(userId)) || 'UTC';
    const scopeWhere = scopedImportId
      ? `WHERE t.user_id = $1 AND t.import_id = $2 AND t.exit_price IS NOT NULL AND t.pnl IS NOT NULL AND NOT COALESCE('sample' = ANY(t.tags), false)`
      : `WHERE t.user_id = $1 AND t.exit_price IS NOT NULL AND t.pnl IS NOT NULL AND NOT COALESCE('sample' = ANY(t.tags), false)`;
    const params = scopedImportId ? [userId, scopedImportId] : [userId];
    const tzParamIndex = params.length + 1;
    const hourParams = [...params, userTimezone];

    const [statsRes, revengeRes, symbolRes, hourRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS trade_count,
          COUNT(*) FILTER (WHERE t.pnl > 0)::int AS wins,
          COUNT(*) FILTER (WHERE t.pnl < 0)::int AS losses,
          COALESCE(AVG(${fxUsd('pnl', 't')}) FILTER (WHERE t.pnl > 0), 0)::numeric AS avg_win,
          COALESCE(AVG(ABS(${fxUsd('pnl', 't')})) FILTER (WHERE t.pnl < 0), 0)::numeric AS avg_loss,
          COALESCE(SUM(ABS(${fxUsd('pnl', 't')})) FILTER (WHERE t.pnl < 0), 0)::numeric AS total_losses,
          AVG(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60.0)
            FILTER (WHERE t.pnl > 0 AND t.entry_time IS NOT NULL AND t.exit_time IS NOT NULL AND t.exit_time > t.entry_time) AS avg_winner_hold,
          AVG(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 60.0)
            FILTER (WHERE t.pnl < 0 AND t.entry_time IS NOT NULL AND t.exit_time IS NOT NULL AND t.exit_time > t.entry_time) AS avg_loser_hold
        FROM trades t
        ${scopeWhere}
      `, params),
      db.query(`
        WITH closed AS (
          SELECT t.id, t.entry_time, t.exit_time, ${fxUsd('pnl', 't')} AS pnl
          FROM trades t
          ${scopeWhere}
            AND t.entry_time IS NOT NULL
            AND t.exit_time IS NOT NULL
        ),
        events AS (
          SELECT id, exit_time AS ev_time, 0 AS ev_kind, NULL::numeric AS pnl, 0 AS self_overlap
          FROM closed
          WHERE pnl < 0
          UNION ALL
          SELECT
            id,
            entry_time AS ev_time,
            1 AS ev_kind,
            pnl,
            CASE
              WHEN pnl < 0 AND exit_time <= entry_time AND exit_time >= entry_time - INTERVAL '30 minutes'
              THEN 1 ELSE 0
            END AS self_overlap
          FROM closed
        ),
        swept AS (
          SELECT
            id,
            ev_kind,
            pnl,
            self_overlap,
            COUNT(*) FILTER (WHERE ev_kind = 0) OVER (
              ORDER BY ev_time ASC
              RANGE BETWEEN INTERVAL '30 minutes' PRECEDING AND CURRENT ROW
            ) AS losses_in_window
          FROM events
        ),
        post_loss AS (
          SELECT id, pnl
          FROM swept
          WHERE ev_kind = 1
            AND losses_in_window > self_overlap
        )
        SELECT
          COUNT(*) FILTER (WHERE pnl < 0)::int AS losing_hits,
          COUNT(*)::int AS total_hits,
          COALESCE(SUM(pnl), 0)::numeric AS net_pnl,
          COALESCE(SUM(ABS(pnl)) FILTER (WHERE pnl < 0), 0)::numeric AS loss_cost
        FROM post_loss
      `, params),
      db.query(`
        SELECT
          t.symbol AS name,
          COUNT(*)::int AS trades,
          COUNT(*) FILTER (WHERE t.pnl > 0)::int AS wins,
          COALESCE(SUM(${fxUsd('pnl', 't')}), 0)::numeric AS total_pnl
        FROM trades t
        ${scopeWhere}
        GROUP BY t.symbol
        HAVING COUNT(*) >= 2
      `, params),
      db.query(`
        SELECT
          EXTRACT(HOUR FROM (t.entry_time AT TIME ZONE $${tzParamIndex}))::int AS hour_num,
          COUNT(*)::int AS trades,
          COUNT(*) FILTER (WHERE t.pnl > 0)::int AS wins,
          COALESCE(SUM(${fxUsd('pnl', 't')}), 0)::numeric AS total_pnl
        FROM trades t
        ${scopeWhere}
          AND t.entry_time IS NOT NULL
        GROUP BY 1
        HAVING COUNT(*) >= 2
      `, hourParams)
    ]);

    const stats = statsRes.rows[0] || {};
    const tradeCount = parseInt(stats.trade_count, 10) || 0;
    if (tradeCount < 3) {
      return { ready: false, scope, trade_count: tradeCount, insight: null };
    }

    const scopeLabel = scope === 'import'
      ? `this import (${tradeCount} closed trades)`
      : `your account history (${tradeCount} closed trades)`;
    const candidates = [];

    // 1. Post-loss chasing / revenge re-entries (net effect across wins & losses)
    const revenge = revengeRes.rows[0] || {};
    const revengeLosingHits = parseInt(revenge.losing_hits, 10) || 0;
    const revengeTotalHits = parseInt(revenge.total_hits, 10) || 0;
    const hasNetPnl = revenge.net_pnl !== undefined && revenge.net_pnl !== null;
    const revengeNetPnl = parseFloat(revenge.net_pnl);
    const revengeCost = hasNetPnl
      ? (revengeNetPnl < 0 ? round2(Math.abs(revengeNetPnl)) : 0)
      : round2(revenge.loss_cost);

    if (revengeLosingHits >= 2 && revengeCost > 0) {
      candidates.push({
        priority: 1,
        impact: revengeCost,
        kind: 'revenge_proxy',
        tone: 'danger',
        headline: `Post-loss re-entries cost you ${formatMoney(revengeCost)} net`,
        detail: `${revengeTotalHits} trade${revengeTotalHits === 1 ? '' : 's'} opened within 30 minutes of a loss (${revengeLosingHits} lost) across ${scopeLabel}. A 15-minute cooling-off rule targets this leak directly.`,
        impact_amount: -revengeCost,
        cta_label: 'Inspect in Behavioral Analytics',
        cta_route: '/metrics/behavioral'
      });
    }

    // 2. Oversized losers vs winners
    const losses = parseInt(stats.losses, 10) || 0;
    const avgWin = round2(stats.avg_win);
    const avgLoss = round2(stats.avg_loss);
    const totalLosses = round2(stats.total_losses);
    const avgWinnerHold = parseFloat(stats.avg_winner_hold);
    const avgLoserHold = parseFloat(stats.avg_loser_hold);
    const holdRatio = (Number.isFinite(avgWinnerHold) && avgWinnerHold > 0 && Number.isFinite(avgLoserHold))
      ? round1(avgLoserHold / avgWinnerHold)
      : null;

    if (losses >= 3 && avgWin > 0 && avgLoss > avgWin * 1.5) {
      const ratio = round1(avgLoss / avgWin);
      const excessCost = round2((avgLoss - avgWin) * losses);
      candidates.push({
        priority: 2,
        impact: excessCost > 0 ? excessCost : totalLosses,
        kind: 'oversized_losses',
        tone: 'warning',
        headline: `Your average loss is ${ratio}x your average win`,
        detail: `Avg loss of ${formatMoney(avgLoss)} vs avg win of ${formatMoney(avgWin)} across ${losses} losing trades in ${scopeLabel}${holdRatio && holdRatio > 1.3 ? ` (and you hold losers ${holdRatio}x longer)` : ''}.`,
        impact_amount: -excessCost,
        cta_label: 'Inspect Loss Patterns',
        cta_route: '/metrics/behavioral'
      });
    }

    // 3. Biggest single symbol leak
    const losingSymbols = (symbolRes.rows || [])
      .map(r => ({
        name: String(r.name),
        trades: parseInt(r.trades, 10) || 0,
        wins: parseInt(r.wins, 10) || 0,
        total_pnl: round2(r.total_pnl)
      }))
      .filter(r => r.total_pnl < 0)
      .sort((a, b) => a.total_pnl - b.total_pnl);

    if (losingSymbols.length > 0) {
      const worst = losingSymbols[0];
      const winRate = worst.trades > 0 ? Math.round((worst.wins / worst.trades) * 100) : 0;
      const lossAmt = Math.abs(worst.total_pnl);
      candidates.push({
        priority: 3,
        impact: lossAmt,
        kind: 'symbol_leak',
        tone: 'danger',
        headline: `${worst.name} is your biggest leak at -${formatMoney(lossAmt)}`,
        detail: `${worst.trades} trades in ${worst.name} (${winRate}% win rate) across ${scopeLabel}. Cutting or sizing down this ticker immediately protects your equity curve.`,
        impact_amount: -lossAmt,
        cta_label: 'See Full Edge Report',
        cta_route: '/metrics/edge-report'
      });
    }

    // 4. Weakest entry hour (in user's configured timezone)
    const losingHours = (hourRes.rows || [])
      .map(r => ({
        hour: parseInt(r.hour_num, 10),
        trades: parseInt(r.trades, 10) || 0,
        wins: parseInt(r.wins, 10) || 0,
        total_pnl: round2(r.total_pnl)
      }))
      .filter(r => Number.isFinite(r.hour) && r.total_pnl < 0)
      .sort((a, b) => a.total_pnl - b.total_pnl);

    if (losingHours.length > 0) {
      const worstHour = losingHours[0];
      const winRate = worstHour.trades > 0 ? Math.round((worstHour.wins / worstHour.trades) * 100) : 0;
      const lossAmt = Math.abs(worstHour.total_pnl);
      candidates.push({
        priority: 4,
        impact: lossAmt,
        kind: 'hour_leak',
        tone: 'warning',
        headline: `Entries around ${formatHourLabel(worstHour.hour)} cost you ${formatMoney(lossAmt)}`,
        detail: `${worstHour.trades} trades opened during the ${formatHourLabel(worstHour.hour)} hour (${winRate}% win rate) in ${scopeLabel}.`,
        impact_amount: -lossAmt,
        cta_label: 'Open Weekly Edge Report',
        cta_route: '/metrics/edge-report'
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.impact - a.impact) || (a.priority - b.priority));
      const { priority, impact, ...chosen } = candidates[0];
      return { ready: true, scope, trade_count: tradeCount, insight: chosen };
    }

    // Positive fallback: highlight their strongest edge if there are no net leaks
    const winningSymbols = (symbolRes.rows || [])
      .map(r => ({
        name: String(r.name),
        trades: parseInt(r.trades, 10) || 0,
        wins: parseInt(r.wins, 10) || 0,
        total_pnl: round2(r.total_pnl)
      }))
      .filter(r => r.total_pnl > 0)
      .sort((a, b) => b.total_pnl - a.total_pnl);

    if (winningSymbols.length > 0) {
      const best = winningSymbols[0];
      const winRate = best.trades > 0 ? Math.round((best.wins / best.trades) * 100) : 0;
      return {
        ready: true,
        scope,
        trade_count: tradeCount,
        insight: {
          kind: 'top_edge',
          tone: 'success',
          headline: `${best.name} is your clearest edge at +${formatMoney(best.total_pnl)}`,
          detail: `${best.trades} trades with a ${winRate}% win rate across ${scopeLabel}. Track this setup as a Playbook to scale what works.`,
          impact_amount: best.total_pnl,
          cta_label: 'Build a Playbook',
          cta_route: '/playbooks'
        }
      };
    }

    return { ready: false, scope, trade_count: tradeCount, insight: null };
  }
}

module.exports = ImportInsightService;
