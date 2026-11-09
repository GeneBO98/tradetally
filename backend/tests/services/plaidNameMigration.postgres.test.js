// Opt-in PostgreSQL regression coverage for issue #431. All objects live in
// an isolated schema inside a rolled-back transaction; no application data or
// migration history is touched.
// PLAID_TEST_DATABASE_URL=postgresql:///postgres?host=/tmp npm test -- plaidNameMigration.postgres
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');

const postgres_describe = process.env.PLAID_TEST_DATABASE_URL ? describe : describe.skip;
const migration = name => readFileSync(path.join(__dirname, '../../migrations', name), 'utf8');
const fix_sql = migration('283_expand_plaid_name_columns.sql');
const name_columns = [
  ['plaid_transactions', 'merchant_name'],
  ['plaid_accounts', 'account_name'],
  ['plaid_accounts', 'official_name'],
  ['plaid_securities', 'name']
];

postgres_describe('Plaid name column migration', () => {
  let client;

  beforeEach(async () => {
    client = new Client({ connectionString: process.env.PLAID_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    const schema = `plaid_name_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query(`
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE TABLE user_accounts (id UUID PRIMARY KEY);
      CREATE TABLE account_transactions (id UUID PRIMARY KEY);
    `);
    await client.query(migration('190_ensure_plaid_funding_tables.sql'));
    await client.query(migration('206_create_plaid_securities.sql'));
    await client.query(`
      INSERT INTO users VALUES (gen_random_uuid());
      INSERT INTO plaid_connections (user_id, item_id, access_token, target_type)
      SELECT id, 'item-431', 'test-token', 'investment' FROM users;
      INSERT INTO plaid_accounts (connection_id, user_id, plaid_account_id, account_name)
      SELECT id, user_id, 'account-431', 'Existing account' FROM plaid_connections;
      INSERT INTO plaid_transactions (
        connection_id, plaid_account_row_id, user_id, external_transaction_id,
        transaction_source, amount, transaction_date, description, merchant_name
      )
      SELECT connection_id, id, user_id, 'transaction-431',
        'investment', 100, '2026-11-08', 'Existing description', 'Existing merchant'
      FROM plaid_accounts;
      INSERT INTO plaid_securities (plaid_security_id, name)
      VALUES ('security-431', 'Existing security');
    `);
  });

  afterEach(async () => {
    if (client) {
      try { await client.query('ROLLBACK'); } finally { await client.end(); }
    }
  });

  test('removes the length limit while preserving existing data and nullability', async () => {
    await client.query(fix_sql);
    expect((await client.query('SELECT account_name, official_name FROM plaid_accounts')).rows)
      .toEqual([{ account_name: 'Existing account', official_name: null }]);
    expect((await client.query('SELECT description, merchant_name FROM plaid_transactions')).rows)
      .toEqual([{ description: 'Existing description', merchant_name: 'Existing merchant' }]);
    expect((await client.query('SELECT name FROM plaid_securities')).rows)
      .toEqual([{ name: 'Existing security' }]);

    const { rows } = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `);
    for (const [table_name, column_name] of name_columns) {
      expect(rows.find(row => row.table_name === table_name && row.column_name === column_name))
        .toMatchObject({ data_type: 'text', is_nullable: column_name === 'account_name' ? 'NO' : 'YES' });
    }
  });

  test.each(name_columns)('%s.%s accepts full long names on insert and update', async (table_name, column_name) => {
    const long_name = 'Merrill investment description - '.repeat(30) + 'café';
    await client.query('SAVEPOINT before_long_name');
    await expect(client.query(`UPDATE ${table_name} SET ${column_name} = $1`, [long_name]))
      .rejects.toMatchObject({ code: '22001' });
    await client.query('ROLLBACK TO SAVEPOINT before_long_name');

    await client.query(fix_sql);
    await client.query(`UPDATE ${table_name} SET ${column_name} = $1`, [long_name]);
    // Reinsert the row to exercise inserts as well as updates, retaining all
    // its foreign keys and required values from the original schema.
    const { rows } = await client.query(`DELETE FROM ${table_name} RETURNING *`);
    const column_names = Object.keys(rows[0]);
    const placeholders = column_names.map((_, index) => `$${index + 1}`);
    await client.query(`INSERT INTO ${table_name} (${column_names.join(', ')}) VALUES (${placeholders.join(', ')})`,
      Object.values(rows[0]));
    expect((await client.query(`SELECT ${column_name} FROM ${table_name}`)).rows[0][column_name]).toBe(long_name);

    // Users who already widened merchant_name using the issue's workaround
    // must also be able to apply the migration without losing long values.
    await client.query(fix_sql);
    expect((await client.query(`SELECT ${column_name} FROM ${table_name}`)).rows[0][column_name]).toBe(long_name);
  });
});
