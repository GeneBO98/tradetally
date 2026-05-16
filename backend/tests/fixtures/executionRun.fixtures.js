const BASE_TIME = '2026-05-11T13:30:00.000Z';

function executionRunRow(overrides = {}) {
  return {
    id: overrides.id || `run-${overrides.mode || 'live'}`,
    user_id: overrides.user_id || 'user-1',
    mode: overrides.mode || 'live',
    name: overrides.name || `${overrides.mode || 'live'} fixture`,
    status: overrides.status || 'created',
    source: overrides.source || 'trade-management',
    config: overrides.config || { accounts: '__unsorted__', symbol: '' },
    metrics: overrides.metrics || {},
    parent_run_id: overrides.parent_run_id || null,
    lineage_type: overrides.lineage_type || null,
    market_data_snapshot_id: overrides.market_data_snapshot_id || null,
    market_data_snapshot: overrides.market_data_snapshot || {},
    confidence: overrides.confidence || {},
    started_at: overrides.started_at || null,
    ended_at: overrides.ended_at || null,
    error_message: overrides.error_message || null,
    share_token: overrides.share_token || null,
    shared_at: overrides.shared_at || null,
    share_expires_at: overrides.share_expires_at || null,
    user_email: overrides.user_email || null,
    username: overrides.username || null,
    created_at: overrides.created_at || BASE_TIME,
    updated_at: overrides.updated_at || BASE_TIME
  };
}

function executionRunModesFixture() {
  return ['live', 'replay', 'backtest'].map(mode => executionRunRow({ mode }));
}

module.exports = {
  BASE_TIME,
  executionRunModesFixture,
  executionRunRow
};
