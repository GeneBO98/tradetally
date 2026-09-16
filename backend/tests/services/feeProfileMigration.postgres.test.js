// Opt-in PostgreSQL coverage. All objects live in a random schema inside a
// rolled-back transaction; no application tables or migration history are used.
// FEE_PROFILE_TEST_DATABASE_URL=postgresql:///postgres?host=/tmp npm test -- feeProfileMigration.postgres
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');
const { restoreAccountAssignments } = require('../../src/services/feeProfileBackupService');

const postgres_describe = process.env.FEE_PROFILE_TEST_DATABASE_URL ? describe : describe.skip;
const migration = name => readFileSync(path.join(__dirname, '../../migrations', name), 'utf8');

postgres_describe('fee profile migrations and backup assignments', () => {
  let client;
  let user_id;
  beforeEach(async () => {
    client = new Client({ connectionString: process.env.FEE_PROFILE_TEST_DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    const schema = `fee_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query(`
      CREATE TABLE users (id UUID PRIMARY KEY);
      CREATE FUNCTION update_updated_at_column() RETURNS trigger AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
      $$ LANGUAGE plpgsql;
      CREATE TABLE user_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id),
        account_name VARCHAR(100) NOT NULL, account_identifier VARCHAR(255), broker VARCHAR(50),
        initial_balance NUMERIC NOT NULL DEFAULT 0, initial_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    user_id = randomUUID();
    await client.query('INSERT INTO users VALUES ($1)', [user_id]);
    await client.query(migration('105_add_broker_fee_settings.sql'));
  });
  afterEach(async () => {
    if (client) {
      try { await client.query('ROLLBACK'); } finally { await client.end(); }
    }
  });

  test('preserves conflicting rows, all cost fields and notes; repairs paid Sim1 assignment', async () => {
    await client.query(`INSERT INTO broker_fee_settings
      (user_id, broker, instrument, commission_per_contract, commission_per_side,
       exchange_fee_per_contract, nfa_fee_per_contract, clearing_fee_per_contract, platform_fee_per_contract, notes)
      VALUES ($1, 'tradovate', 'MES', 1, 2, 3, 4, 5, 6, 'canonical'),
             ($1, 'tradeovate', 'mes', 11, 12, 13, 14, 15, 16, 'alias'),
             ($1, 'trade ovate', 'MES', 21, 22, 23, 24, 25, 26, 'second alias')`, [user_id]);
    await client.query(`INSERT INTO user_accounts (user_id, account_name, account_identifier, broker)
      VALUES ($1, 'Sim1', 'Sim1', 'tradovate'), ($1, 'Live', 'LIVE1', 'tradovate')`, [user_id]);
    await client.query(migration('249_create_fee_profiles.sql'));
    // Force the bad outcome permitted by 249 rather than depending on query-plan order.
    await client.query(`UPDATE user_accounts SET fee_profile_id =
      (SELECT id FROM fee_profiles WHERE name = 'Tradovate') WHERE account_identifier = 'Sim1'`);
    await client.query(migration('250_preserve_legacy_fee_schedules.sql'));
    const { rows } = await client.query(`SELECT notes, commission_per_contract, commission_per_side,
      exchange_fee_per_contract, nfa_fee_per_contract, clearing_fee_per_contract, platform_fee_per_contract
      FROM fee_profile_rates ORDER BY commission_per_contract`);
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      expect(row.notes).toBe(['canonical', 'alias', 'second alias'][index]);
      Object.entries(row).filter(([key]) => key !== 'notes').forEach(([, value], field) => {
        expect(Number(value)).toBe(index * 10 + field + 1);
      });
    });
    const assignments = await client.query(`SELECT ua.account_identifier, fp.name, fp.is_zero_fee
      FROM user_accounts ua JOIN fee_profiles fp ON fp.id = ua.fee_profile_id ORDER BY ua.account_identifier`);
    expect(assignments.rows).toEqual([
      { account_identifier: 'LIVE1', name: 'Tradovate', is_zero_fee: false },
      { account_identifier: 'Sim1', name: 'Simulated', is_zero_fee: true }
    ]);
    await client.query(migration('250_preserve_legacy_fee_schedules.sql'));
    expect((await client.query('SELECT * FROM fee_profile_rates')).rows).toHaveLength(3);
  });

  test('restores missing accounts and preserves existing account details and user isolation', async () => {
    await client.query(migration('249_create_fee_profiles.sql'));
    const profile_id = randomUUID();
    const other_user_id = randomUUID();
    await client.query('INSERT INTO users VALUES ($1)', [other_user_id]);
    await client.query(`INSERT INTO fee_profiles (id, user_id, name) VALUES ($1, $2, 'Restored')`, [profile_id, user_id]);
    await client.query(`INSERT INTO user_accounts (user_id, account_name, account_identifier, initial_balance)
      VALUES ($1, 'Original name', 'EXISTING', 123), ($2, 'Other user', 'NEW', 456)`, [user_id, other_user_id]);
    await restoreAccountAssignments(client, user_id, profile_id, [' NEW ', 'EXISTING', 'NEW', '']);
    await restoreAccountAssignments(client, user_id, profile_id, ['NEW', 'EXISTING']);
    const { rows } = await client.query('SELECT * FROM user_accounts WHERE user_id = $1 ORDER BY account_identifier', [user_id]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ account_name: 'Original name', initial_balance: '123', fee_profile_id: profile_id });
    expect(rows[1]).toMatchObject({ account_name: 'NEW', initial_balance: '0', fee_profile_id: profile_id });
    expect((await client.query('SELECT fee_profile_id FROM user_accounts WHERE user_id = $1', [other_user_id])).rows[0].fee_profile_id).toBeNull();
  });
});
