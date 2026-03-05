const { publish, subscribe } = require('../../src/events/domainEvents');

describe('domainEvents bus', () => {
  test('publishes to exact event subscribers', async () => {
    const handler = jest.fn();
    const unsubscribe = subscribe('trade.created', handler);

    const event = await publish('trade.created', { tradeId: 't-1' }, { source: 'test' });
    unsubscribe();

    expect(event.type).toBe('trade.created');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: 'trade.created',
      payload: { tradeId: 't-1' },
      metadata: { source: 'test' }
    });
  });

  test('publishes to wildcard subscribers', async () => {
    const wildcardHandler = jest.fn();
    const unsubscribe = subscribe('*', wildcardHandler);

    await publish('trade.deleted', { tradeId: 't-2' });
    unsubscribe();

    expect(wildcardHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler.mock.calls[0][0].type).toBe('trade.deleted');
  });
});
