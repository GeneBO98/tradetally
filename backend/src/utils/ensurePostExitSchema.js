const db = require('../config/database');

const TRADE_COLUMNS = [
  'post_exit_mae DECIMAL(20, 8) DEFAULT NULL',
  'post_exit_mfe DECIMAL(20, 8) DEFAULT NULL',
  'post_exit_window_override_minutes INTEGER DEFAULT NULL',
  'post_exit_window_minutes INTEGER DEFAULT NULL',
  'post_exit_window_source VARCHAR(30) DEFAULT NULL',
  'post_exit_window_end TIMESTAMPTZ DEFAULT NULL',
  'post_exit_calculated_at TIMESTAMPTZ DEFAULT NULL'
];

const USER_SETTINGS_COLUMNS = [
  "post_exit_excursion_window_mode VARCHAR(20) DEFAULT 'auto'",
  'post_exit_excursion_window_minutes INTEGER DEFAULT NULL'
];

async function ensureColumns(client, tableName, columnDefinitions) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  );

  const existingColumns = new Set(result.rows.map((row) => row.column_name));
  const missingDefinitions = columnDefinitions.filter((definition) => {
    const columnName = definition.split(' ')[0];
    return !existingColumns.has(columnName);
  });

  if (missingDefinitions.length === 0) {
    return [];
  }

  await client.query(`
    ALTER TABLE ${tableName}
    ${missingDefinitions.map((definition) => `ADD COLUMN IF NOT EXISTS ${definition}`).join(',\n    ')}
  `);

  return missingDefinitions.map((definition) => definition.split(' ')[0]);
}

async function ensurePostExitSchema() {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const repairedTradeColumns = await ensureColumns(client, 'trades', TRADE_COLUMNS);
    const repairedUserSettingsColumns = await ensureColumns(client, 'user_settings', USER_SETTINGS_COLUMNS);

    await client.query('COMMIT');

    return {
      repairedTradeColumns,
      repairedUserSettingsColumns
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { ensurePostExitSchema };
