const { publishInBackground } = require('./domainEvents');

// One enrichment.completed event per user per batch of trades that just moved
// to enrichment_status = 'completed'. `trigger` says what completed them:
// jobs_finished, cusip_resolved, recovered, or force_completed.
function publishEnrichmentCompleted(userId, tradeIds, trigger, source) {
  if (!userId || !Array.isArray(tradeIds) || tradeIds.length === 0) return;
  publishInBackground('enrichment.completed', {
    tradeIds,
    count: tradeIds.length,
    trigger
  }, { source, userId });
}

// Rows are { id, user_id }; publishes one event per user.
function publishEnrichmentCompletedForRows(rows, trigger, source) {
  const byUser = new Map();
  for (const row of rows || []) {
    if (!row.user_id) continue;
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row.id);
  }
  for (const [userId, tradeIds] of byUser) {
    publishEnrichmentCompleted(userId, tradeIds, trigger, source);
  }
}

module.exports = {
  publishEnrichmentCompleted,
  publishEnrichmentCompletedForRows
};
