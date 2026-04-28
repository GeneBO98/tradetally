const { schemas } = require('../../src/middleware/validation');

describe('trade execution validation', () => {
  test('allows preserved broker metadata on individual fill executions during update', () => {
    const payload = {
      chartUrl: 'https://www.tradingview.com/chart/example/',
      executions: [
        {
          action: 'sell',
          quantity: 4,
          price: 7157.5,
          datetime: '2026-04-23T16:00:28.000Z',
          commission: 0,
          fees: 0,
          orderId: '425825160659',
          pnl: null
        },
        {
          action: 'buy',
          quantity: 2,
          price: 7157.5,
          datetime: '2026-04-23T16:03:38.000Z',
          commission: 0,
          fees: 0,
          orderId: '425825160669',
          pnl: 0
        }
      ]
    };

    const { error, value } = schemas.updateTrade.validate(payload);

    expect(error).toBeUndefined();
    expect(value.executions[0].orderId).toBe('425825160659');
    expect(value.executions[1].pnl).toBe(0);
  });

  test('still rejects individual fill executions without required trade fields', () => {
    const payload = {
      executions: [
        {
          quantity: 4,
          price: 7157.5,
          datetime: '2026-04-23T16:00:28.000Z',
          orderId: '425825160659'
        }
      ]
    };

    const { error } = schemas.updateTrade.validate(payload);

    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(['executions', 0]);
  });
});
