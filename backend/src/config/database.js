const { Pool } = require('pg');
require('dotenv').config();

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

let postExitSchemaRepairPromise = null;

function isMissingPostExitColumnError(error) {
  return error?.code === '42703' && typeof error.message === 'string' && (
    error.message.includes('post_exit_window_override_minutes') ||
    error.message.includes('post_exit_window_minutes') ||
    error.message.includes('post_exit_window_source') ||
    error.message.includes('post_exit_window_end') ||
    error.message.includes('post_exit_calculated_at') ||
    error.message.includes('post_exit_excursion_window_mode') ||
    error.message.includes('post_exit_excursion_window_minutes') ||
    error.message.includes('post_exit_mae') ||
    error.message.includes('post_exit_mfe')
  );
}

async function repairPostExitSchema() {
  if (!postExitSchemaRepairPromise) {
    postExitSchemaRepairPromise = (async () => {
      const { ensurePostExitSchema } = require('../utils/ensurePostExitSchema');
      const result = await ensurePostExitSchema();

      if (result.repairedTradeColumns.length > 0 || result.repairedUserSettingsColumns.length > 0) {
        console.warn(
          '[DB] Repaired missing post-exit schema columns on demand. trades:',
          result.repairedTradeColumns.join(', ') || 'none',
          'user_settings:',
          result.repairedUserSettingsColumns.join(', ') || 'none'
        );
      }

      return result;
    })().finally(() => {
      postExitSchemaRepairPromise = null;
    });
  }

  return postExitSchemaRepairPromise;
}

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    if (!isMissingPostExitColumnError(error)) {
      throw error;
    }

    console.warn('[DB] Missing post-exit schema detected during query. Attempting automatic repair.');
    await repairPostExitSchema();
    return pool.query(text, params);
  }
}

module.exports = {
  query,
  connect: () => pool.connect(),
  pool
};
