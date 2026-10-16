const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const Playbook = require('../../src/models/Playbook');
const Adherence = require('../../src/services/playbookAdherence.service');
const User = require('../../src/models/User');
const Trade = require('../../src/models/Trade');
const Charts = require('../../src/services/bulkTradeChartsService');
const Stops = require('../../src/services/bulkTradeStopsService');

describe('issues 414-417 (real database)', () => {
  let user_id;
  let other_user_id;
  let trade_ids;
  let foreign_trade_id;

  async function create_user() {
    const suffix = randomUUID().slice(0, 8);
    return (await db.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, 'test') RETURNING id`,
      [`issues-${suffix}@example.com`, `issues_${suffix}`]
    )).rows[0].id;
  }

  async function create_trade(owner) {
    return (await db.query(
      `INSERT INTO trades (user_id, symbol, side, quantity, entry_price, trade_date, pnl,
         instrument_type, contract_month, contract_year, underlying_asset, point_value)
       VALUES ($1, 'ESZ6', 'long', 2, 6000, '2026-10-15', 100, 'future', 'DEC', 2026, 'ES', 50) RETURNING id`, [owner]
    )).rows[0].id;
  }

  beforeAll(async () => {
    user_id = await create_user();
    other_user_id = await create_user();
    trade_ids = [await create_trade(user_id), await create_trade(user_id)];
    foreign_trade_id = await create_trade(other_user_id);
    await User.createSettings(user_id);
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[user_id, other_user_id].filter(Boolean)]);
    await db.pool.end();
  });

  test('417: edited items retain IDs and reviewed responses, notes, scores, and timestamps', async () => {
    const playbook = await Playbook.create(user_id, {
      name: 'Reviewed plan', checklistItems: [{ label: 'Entry' }, { label: 'Risk' }, { label: 'Remove me' }]
    });
    const original = playbook.checklist_items;
    const metrics = Adherence.buildReview(playbook, { side: 'long', entry_price: 6000 }, original,
      original.map(item => ({ checklistItemId: item.id, checked: true })));
    const saved = await Playbook.upsertTradeReview(user_id, trade_ids[0], {
      playbookId: playbook.id, reviewType: 'adherence', reviewNotes: 'Original review', ...metrics
    });
    const updated = await Playbook.update(playbook.id, user_id, {
      name: 'Reviewed plan', checklistItems: [
        { id: original[1].id, label: 'Risk required', isRequired: true, weight: 2 },
        { id: original[0].id, label: 'Entry renamed' },
        { label: 'New rule' }
      ]
    });
    expect(updated.checklist_items.slice(0, 2).map(item => item.id)).toEqual([original[1].id, original[0].id]);
    expect(updated.checklist_items[2].id).not.toBe(original[2].id);
    const review = await Playbook.getTradeReviewByTradeId(trade_ids[0], user_id, 'adherence');
    for (const key of ['checklist_responses', 'adherence_score', 'checklist_score', 'review_notes', 'reviewed_at']) {
      expect(review[key]).toEqual(saved[key]);
    }

    // An invalid item ID rolls back the parent edit and all item deletions.
    await expect(Playbook.update(playbook.id, user_id, {
      name: 'Must roll back', checklistItems: [{ id: randomUUID(), label: 'Foreign item' }]
    })).rejects.toMatchObject({ status: 400 });
    expect((await Playbook.findById(playbook.id, user_id)).checklist_items).toEqual(updated.checklist_items);
  });

  test('416: saves point defaults and uses them on new trades and bulk missing stops', async () => {
    const settings = { defaultStopLossType: 'points', default_stop_loss_points: 2,
      default_stop_loss_points_by_underlying: { ES: 1.5, NQ: 10 } };
    const saved = await User.updateSettings(user_id, settings);
    expect(saved.default_stop_loss_points_by_underlying).toEqual({ ES: 1.5, NQ: 10 });
    const trade = await Trade.create(user_id, {
      symbol: 'NQZ6', instrumentType: 'future', side: 'short', quantity: 3,
      contractMonth: 'DEC', contractYear: 2026, underlyingAsset: 'NQ',
      entryPrice: 22000, entryTime: '2026-10-15T14:00:00Z'
    }, { skipApiCalls: true, skipAchievements: true, skipStrategyClassification: true });
    expect(Number(trade.stop_loss)).toBe(22010);
    const result = await Stops.update(user_id, trade_ids, [], true);
    expect(result.updated_trade_count).toBe(2);
    expect(result.changes.every(change => change.stop_loss === 5998.5)).toBe(true);
  });

  test('414: concurrent submissions append one chart per trade and preserve previous links', async () => {
    const url = 'https://www.tradingview.com/x/Issue414/';
    await Trade.addChart(trade_ids[0], { chartUrl: 'https://www.tradingview.com/x/Existing/' });
    const results = await Promise.all([
      Charts.add(user_id, trade_ids, url, 'Re-entry'), Charts.add(user_id, trade_ids, url, 'Re-entry')
    ]);
    expect(results.map(result => result.updated_trade_count).sort()).toEqual([0, 2]);
    const rows = (await db.query('SELECT trade_id, chart_url FROM trade_charts WHERE trade_id = ANY($1::uuid[])', [trade_ids])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.filter(row => row.chart_url === url)).toHaveLength(2);
  });

  test('414: mixed ownership rejects the entire batch without appending any chart', async () => {
    const url = 'https://www.tradingview.com/x/Unauthorized/';
    await expect(Charts.add(user_id, [trade_ids[0], foreign_trade_id], url)).rejects.toMatchObject({ statusCode: 404 });
    const rows = await db.query('SELECT id FROM trade_charts WHERE chart_url = $1', [url]);
    expect(rows.rows).toEqual([]);
  });
});
