jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');

describe('Trade.syncDefaultStopLossToExistingTrades', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.pool.connect.mockResolvedValue(client);
  });

  test('repairs percent-derived stops when dollar default risk is active', async () => {
    client.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, symbol')) {
        return {
          rows: [
            {
              id: 'trade-percent-default',
              symbol: 'AAPL',
              entry_price: 100,
              exit_price: 110,
              side: 'long',
              quantity: 10,
              commission: 0,
              fees: 0,
              instrument_type: 'stock',
              contract_size: null,
              point_value: null,
              underlying_asset: null,
              stop_loss: 95
            },
            {
              id: 'trade-manual-stop',
              symbol: 'MSFT',
              entry_price: 100,
              exit_price: 110,
              side: 'long',
              quantity: 10,
              commission: 0,
              fees: 0,
              instrument_type: 'stock',
              contract_size: null,
              point_value: null,
              underlying_asset: null,
              stop_loss: 92
            },
            {
              id: 'trade-missing-stop',
              symbol: 'TSLA',
              entry_price: 100,
              exit_price: 110,
              side: 'long',
              quantity: 10,
              commission: 0,
              fees: 0,
              instrument_type: 'stock',
              contract_size: null,
              point_value: null,
              underlying_asset: null,
              stop_loss: null
            }
          ]
        };
      }
      return { rows: [] };
    });

    const updatedCount = await Trade.syncDefaultStopLossToExistingTrades(
      'user-1',
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100, default_stop_loss_percent: 5 },
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100, default_stop_loss_percent: 5 }
    );

    const updateCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE trades SET stop_loss'));

    expect(updatedCount).toBe(2);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toEqual([90, 1, 'trade-percent-default', 'user-1']);
    expect(updateCalls[1][1]).toEqual([90, 1, 'trade-missing-stop', 'user-1']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('does not query trades when the active default is unusable', async () => {
    const updatedCount = await Trade.syncDefaultStopLossToExistingTrades(
      'user-1',
      { default_stop_loss_type: 'percent', default_stop_loss_percent: 5 },
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: null }
    );

    expect(updatedCount).toBe(0);
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  test('is idempotent: already-repaired trades are not rewritten', async () => {
    // This sync runs on every settings write while the dollar regression
    // fallback is active (saved percent value never cleared) — a repaired
    // trade must not be re-UPDATEd with identical values each time.
    client.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, symbol')) {
        return {
          rows: [
            {
              id: 'trade-already-repaired',
              symbol: 'AAPL',
              entry_price: 100,
              exit_price: 110,
              side: 'long',
              quantity: 10,
              commission: 0,
              fees: 0,
              instrument_type: 'stock',
              contract_size: null,
              point_value: null,
              underlying_asset: null,
              stop_loss: 90, // $100 risk on 10 shares — already the dollar default
              r_value: 1
            }
          ]
        };
      }
      return { rows: [] };
    });

    const updatedCount = await Trade.syncDefaultStopLossToExistingTrades(
      'user-1',
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100, default_stop_loss_percent: 5 },
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100, default_stop_loss_percent: 5 }
    );

    const updateCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE trades SET stop_loss'));
    expect(updatedCount).toBe(0);
    expect(updateCalls).toHaveLength(0);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('resolves futures point value like the R calculation when placing dollar stops', async () => {
    // getDollarStopLossPriceMove fell back to point value 1 while
    // calculateRiskAmount falls back to the symbol's real multiplier —
    // placing futures stops up to 50x too far from entry on rows with
    // NULL point_value.
    client.query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT id, symbol')) {
        return {
          rows: [
            {
              id: 'trade-es-future',
              symbol: 'ESH6',
              entry_price: 6000,
              exit_price: 6004,
              side: 'long',
              quantity: 1,
              commission: 0,
              fees: 0,
              instrument_type: 'future',
              contract_size: null,
              point_value: null, // must resolve via symbol (ES => $50/pt)
              underlying_asset: null,
              stop_loss: null,
              r_value: null
            }
          ]
        };
      }
      return { rows: [] };
    });

    await Trade.syncDefaultStopLossToExistingTrades(
      'user-1',
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100 },
      { default_stop_loss_type: 'dollar', default_stop_loss_dollars: 100 }
    );

    const updateCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE trades SET stop_loss'));
    expect(updateCalls).toHaveLength(1);
    // $100 risk / (1 contract * $50/pt) = 2 points below entry
    expect(updateCalls[0][1][0]).toBe(5998);
  });
});
