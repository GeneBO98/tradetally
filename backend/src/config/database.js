const { Pool } = require('pg');
require('dotenv').config();
const { getRequestMetricsContext } = require('../utils/requestMetricsContext');
const { recordHistogram } = require('../utils/tracing');

// Increased pool size to handle concurrent requests and background services
// Default to 50, allow override via env var
const poolSize = parseInt(process.env.DB_POOL_SIZE || '50', 10);
const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: poolSize,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: connectionTimeout,
  // Allow statement timeout to prevent hanging queries
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

function queryLabel(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE|WITH|ALTER|CREATE|DROP)\s+([^(\s]+)?/i);
  return match ? `${match[1].toUpperCase()} ${match[2] || ''}`.trim() : 'QUERY';
}

function shouldRecordQuery(text, context) {
  if (!context.endpointKey) return false;
  const sql = String(text || '');
  return !sql.includes('execution_db_query_measurements')
    && !sql.includes('execution_performance_measurements');
}

async function query(text, params) {
  const startedAt = Date.now();
  try {
    return await pool.query(text, params);
  } finally {
    const context = getRequestMetricsContext();
    if (shouldRecordQuery(text, context)) {
      const durationMs = Math.max(0, Math.round(Date.now() - startedAt));
      const label = queryLabel(text);
      recordHistogram('db.query.duration_ms', durationMs, {
        'app.endpoint_key': context.endpointKey,
        'db.query_label': label
      }, {
        description: 'Database query latency by endpoint and normalized query label',
        unit: 'ms'
      });
      setImmediate(() => {
        pool.query(
          `
            INSERT INTO execution_db_query_measurements (endpoint_key, query_label, duration_ms)
            VALUES ($1, $2, $3)
          `,
          [context.endpointKey, label, durationMs]
        ).catch(() => {});
      });
    }
  }
}

module.exports = {
  query,
  connect: () => pool.connect(),
  pool
};
