const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const allocations = require('../../src/services/tradeAllocationService');

describe('trade allocations (real database)', () => {
  let user_id;
  let trade_id;
  let groups;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await db.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, 'test') RETURNING id`,
      [`allocation-${suffix}@example.com`, `allocation_${suffix}`]
    );
    user_id = user.rows[0].id;
    const trade = await db.query(
      `INSERT INTO trades (user_id, symbol, side, quantity, entry_price, trade_date, pnl, commission, fees, account_identifier)
       VALUES ($1, 'AAPL', 'long', 100, 10, '2026-08-01', 100, 2, 1, 'account-a') RETURNING id`, [user_id]
    );
    trade_id = trade.rows[0].id;
    groups = await Promise.all(['Core', 'Swing', 'Family', 'Savings'].map(name => allocations.createGroup(user_id, { name })));
  });

  afterAll(async () => {
    await db.query('DROP TRIGGER IF EXISTS allocation_test_delay ON trade_allocations');
    await db.query('DROP FUNCTION IF EXISTS allocation_test_delay()');
    if (user_id) {
      await db.query('DELETE FROM trades WHERE user_id = $1', [user_id]);
      await db.query('DELETE FROM users WHERE id = $1', [user_id]);
    }
    await db.pool.end();
  });

  const split = (offset) => groups.slice(offset, offset + 2).map((group, index) => ({
    allocation_group_id: group.id, allocation_ratio: index ? 0.4 : 0.6
  }));

  test('concurrent edits cannot combine two valid splits into a 200 percent allocation', async () => {
    // Widen the insertion race in the scratch database; only this test trade is delayed.
    await db.query(`CREATE FUNCTION allocation_test_delay() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.trade_id = '${trade_id}'::uuid THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER allocation_test_delay BEFORE INSERT ON trade_allocations
      FOR EACH ROW EXECUTE FUNCTION allocation_test_delay()`);
    try {
      await Promise.all([
        allocations.replaceTradeAllocations(user_id, trade_id, split(0)),
        allocations.replaceTradeAllocations(user_id, trade_id, split(2))
      ]);
      const saved = await allocations.getTradeAllocations(user_id, trade_id);
      expect(saved.allocations).toHaveLength(2);
      expect(saved.allocations.reduce((sum, row) => sum + Number(row.allocation_ratio), 0)).toBeCloseTo(1);
    } finally {
      await db.query('DROP TRIGGER allocation_test_delay ON trade_allocations');
      await db.query('DROP FUNCTION allocation_test_delay()');
    }
  });

  test('editing, reporting, archiving and clearing preserve proportional totals and account scope', async () => {
    await allocations.replaceTradeAllocations(user_id, trade_id, split(0));
    await allocations.updateGroup(user_id, groups[0].id, { name: 'Core updated' });
    const report = await allocations.getSummary(user_id, { accounts: ['account-a'] });
    expect(report.groups.reduce((sum, row) => sum + Number(row.allocated_pnl), 0)).toBeCloseTo(100);
    expect(report.allocated_trade_count).toBe(1);
    expect((await allocations.getSummary(user_id, { accounts: ['account-b'] })).allocated_trade_count).toBe(0);
    await allocations.archiveGroup(user_id, groups[0].id);
    expect((await allocations.listGroups(user_id)).map(group => group.id)).not.toContain(groups[0].id);
    expect((await allocations.getTradeAllocations(user_id, trade_id)).allocations).toHaveLength(2);
    await allocations.clearTradeAllocations(user_id, trade_id);
    expect((await allocations.getTradeAllocations(user_id, trade_id)).allocations).toEqual([]);
  });
});
