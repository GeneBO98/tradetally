const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const migration = fs.readFileSync(path.join(__dirname, '../../migrations/912_preserve_futures_tick_precision.sql'), 'utf8');

suite('futures tick precision with dependent views', () => {
  let client;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!/test/i.test(url.pathname)) throw new Error('This migration regression requires a disposable test database.');
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
  });
  afterAll(async () => { if (client) await client.end(); });
  beforeEach(async () => {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA futures_precision_regression');
    await client.query('SET LOCAL search_path=futures_precision_regression,public');
    await client.query(`CREATE TABLE trades(id integer,tick_size numeric(10,6),pnl numeric);
      CREATE TABLE instrument_templates(tick_size numeric(15,6));
      INSERT INTO trades VALUES(1,0.25,25);
      CREATE VIEW trades_with_health_analytics WITH (security_barrier=true) AS SELECT * FROM trades;
      CREATE MATERIALIZED VIEW health_trade_correlations AS
        SELECT count(*) AS trade_count,sum(pnl) AS total_pnl FROM trades_with_health_analytics;
      CREATE UNIQUE INDEX health_correlation_test_index ON health_trade_correlations(trade_count);
      GRANT SELECT ON trades_with_health_analytics,health_trade_correlations TO PUBLIC;
      COMMENT ON VIEW trades_with_health_analytics IS 'Keep this health view comment';
      COMMENT ON MATERIALIZED VIEW health_trade_correlations IS 'Keep this aggregate comment'`);
  });
  afterEach(async () => { await client.query('ROLLBACK'); });

  async function metadata() {
    return (await client.query(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS grants,
      c.reloptions,obj_description(c.oid,'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='futures_precision_regression' AND c.relkind IN ('v','m') ORDER BY c.relname`)).rows;
  }

  test('widens ticks while preserving definitions, owners, grants, options, indexes and aggregate data', async () => {
    const before = await metadata();
    await client.query(migration);
    expect(await metadata()).toEqual(before);
    await client.query('INSERT INTO trades VALUES(2,0.0000005,50)');
    await client.query('INSERT INTO instrument_templates VALUES(0.0000005)');
    expect((await client.query('SELECT tick_size::text AS tick FROM trades WHERE id=2')).rows[0].tick).toBe('0.0000005000');
    expect((await client.query('SELECT tick_size::text AS tick FROM trades_with_health_analytics WHERE id=2')).rows[0].tick).toBe('0.0000005000');
    expect((await client.query('SELECT tick_size::text AS tick FROM instrument_templates')).rows[0].tick).toBe('0.0000005000');
    expect((await client.query('SELECT * FROM health_trade_correlations')).rows).toEqual([{ trade_count: '1', total_pnl: '25' }]);
    expect((await client.query("SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='futures_precision_regression' AND tablename='health_trade_correlations'")).rows[0].count).toBe(1);
    await client.query(migration);
    expect(await metadata()).toEqual(before);
  });

  test('fails without dropping unexpected downstream views', async () => {
    await client.query('CREATE VIEW custom_downstream_view AS SELECT * FROM trades_with_health_analytics');
    await client.query('SAVEPOINT before_migration');
    await expect(client.query(migration)).rejects.toMatchObject({ code: '2BP01' });
    await client.query('ROLLBACK TO SAVEPOINT before_migration');
    expect((await client.query('SELECT count(*)::int AS count FROM custom_downstream_view')).rows[0].count).toBe(1);
    expect((await client.query('SELECT * FROM health_trade_correlations')).rows).toHaveLength(1);
  });
});
