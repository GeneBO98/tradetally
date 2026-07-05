const { Pool, types } = require('pg');
require('dotenv').config();

// Return DATE columns (OID 1082) as plain YYYY-MM-DD strings instead of
// JavaScript Date objects. The default pg behavior creates a Date anchored to
// midnight in the server's local timezone, which produces non-midnight UTC
// timestamps for non-UTC servers. These don't match the frontend's
// date-only regex and cause timezone-shifted display (e.g. Jun 12 → Jun 11).
types.setTypeParser(1082, val => val);

// Increased pool size to handle concurrent requests and background services
// Default to 50, allow override via env var
const poolSize = parseInt(process.env.DB_POOL_SIZE || '50', 10);
const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10);
const dbSchema = (process.env.DB_SCHEMA || '').trim();

const poolConfig = {
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
};

if (dbSchema) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(dbSchema)) {
    throw new Error('DB_SCHEMA must be a single PostgreSQL identifier, such as tradetally');
  }

  poolConfig.options = `-c search_path="${dbSchema}",public`;
}

const pool = new Pool(poolConfig);

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
    try {
      await repairPostExitSchema();
    } catch (repairError) {
      // Surface the original missing-column error to the caller — a failed
      // repair (e.g. ALTER TABLE blocked behind a lock) replacing it would
      // misattribute the failure.
      console.warn('[DB] Post-exit schema repair failed:', repairError.message);
      throw error;
    }
    return pool.query(text, params);
  }
}

module.exports = {
  query,
  connect: () => pool.connect(),
  pool
};
