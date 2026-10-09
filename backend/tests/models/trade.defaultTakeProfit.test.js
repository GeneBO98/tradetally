jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));

const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');

describe('Trade default take-profit modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['long', 100, 106],
    ['short', 100, 94]
  ])('calculates a percentage target for a %s trade', (side, entryPrice, expected) => {
    const result = Trade.calculateDefaultTakeProfitFromSettings(
      { entry_price: entryPrice, side },
      { default_take_profit_type: 'percent', default_take_profit_percent: 6 }
    );

    expect(result).toBe(expected);
  });

  test.each([
    ['long', 100, 95, 110],
    ['short', 100, 105, 90]
  ])('calculates a 2R target for a %s trade', (side, entryPrice, stopLoss, expected) => {
    const result = Trade.calculateDefaultTakeProfitFromSettings(
      { entry_price: entryPrice, stop_loss: stopLoss, side },
      { default_take_profit_type: 'risk_reward', default_take_profit_r_multiple: 2 }
    );

    expect(result).toBe(expected);
  });

  test('requires a valid stop on the risk side of entry for risk/reward mode', () => {
    const settings = {
      default_take_profit_type: 'risk_reward',
      default_take_profit_r_multiple: 2
    };

    expect(Trade.calculateDefaultTakeProfitFromSettings(
      { entry_price: 100, stop_loss: null, side: 'long' },
      settings
    )).toBeNull();
    expect(Trade.calculateDefaultTakeProfitFromSettings(
      { entry_price: 100, stop_loss: 105, side: 'long' },
      settings
    )).toBeNull();
  });

  test.each([
    [
      { entry_price: 100, side: 'long', quantity: 50, instrument_type: 'stock' },
      500,
      110
    ],
    [
      { entry_price: 5, side: 'long', quantity: 2, instrument_type: 'option', contract_size: 100 },
      200,
      6
    ],
    [
      { symbol: 'ESH6', entry_price: 6000, side: 'long', quantity: 2, instrument_type: 'future' },
      500,
      6005
    ]
  ])('converts a trade-level dollar target to the correct price move', (trade, dollars, expected) => {
    const result = Trade.calculateDefaultTakeProfitFromSettings(trade, {
      default_take_profit_type: 'dollar',
      default_take_profit_dollars: dollars
    });

    expect(result).toBe(expected);
  });

  test('backfills only trades that have enough data for the selected mode', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id, symbol')) {
          return {
            rows: [
              {
                id: 'with-stop',
                entry_price: 100,
                stop_loss: 95,
                side: 'long',
                quantity: 10,
                instrument_type: 'stock'
              },
              {
                id: 'without-stop',
                entry_price: 100,
                stop_loss: null,
                side: 'long',
                quantity: 10,
                instrument_type: 'stock'
              }
            ]
          };
        }
        return { rows: [] };
      }),
      release: jest.fn()
    };
    db.pool.connect.mockResolvedValue(client);

    const count = await Trade.applyDefaultTakeProfitToExistingTrades('user-1', {
      default_take_profit_type: 'risk_reward',
      default_take_profit_r_multiple: 2
    });

    const updateCalls = client.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE trades'));
    expect(count).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual([110, 'with-stop', 'user-1']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
