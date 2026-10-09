const db = require('../config/database');

// Match persisted economics, not request JSON or derived P&L. Notes, tags and
// enrichment can change independently of a retry. Keep the scope and contract
// fields: matching only a symbol/execution timestamp can hide legitimate trades.
const identity_fields = [
  'user_id', 'symbol', 'account_identifier', 'broker', 'instrument_type',
  'entry_time', 'exit_time', 'entry_price', 'exit_price', 'quantity', 'side',
  'commission', 'fees', 'strike_price', 'expiration_date', 'option_type',
  'contract_size', 'contract_month', 'contract_year', 'point_value', 'original_currency',
  'conid', 'underlying_symbol', 'underlying_asset'
];

async function insertRestTrade(insert_query, insert_values, identity) {
  return db.withTransaction(async client => {
    // The lock and lookup must be separate statements: after waiting for an
    // in-flight insert, READ COMMITTED gives the lookup a fresh snapshot.
    // Only hold the lock around SQL, never around market-data/enrichment calls.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `rest-trade:${identity.user_id}:${identity.symbol}`
    ]);
    const conditions = identity_fields.map(field => {
      const column = ['account_identifier', 'broker'].includes(field)
        ? `NULLIF(existing.${field}, '')` : `existing.${field}`;
      const operator = ['user_id', 'symbol'].includes(field) ? '=' : 'IS NOT DISTINCT FROM';
      return `${column} ${operator} candidate.${field}`;
    });
    // Apply the table's actual timestamp/numeric precision before comparing,
    // including installations with older numeric column precision.
    const existing = await client.query(
      `SELECT existing.* FROM trades existing
       CROSS JOIN json_populate_record(NULL::trades, $1::json) candidate
       WHERE ${conditions.join(' AND ')} ORDER BY existing.id LIMIT 1`,
      [JSON.stringify(identity)]
    );
    if (existing.rows.length) {
      return { trade: existing.rows[0], duplicate: true };
    }
    const result = await client.query(insert_query, insert_values);
    return { trade: result.rows[0], duplicate: false };
  });
}

module.exports = { insertRestTrade };
