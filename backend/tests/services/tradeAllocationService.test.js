jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidate: jest.fn()
}));

const db = require('../../src/config/database');
const TradeAllocationService = require('../../src/services/tradeAllocationService');

const GROUP_ONE = '11111111-1111-4111-8111-111111111111';
const GROUP_TWO = '22222222-2222-4222-8222-222222222222';

describe('TradeAllocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deriveBasisQuantity', () => {
    test('uses total opening fills for a partially closed long trade', () => {
      const quantity = TradeAllocationService.deriveBasisQuantity({
        side: 'long',
        quantity: 40,
        executions: [
          { action: 'buy', quantity: 60 },
          { action: 'buy', quantity: 40 },
          { action: 'sell', quantity: 60 }
        ]
      });

      expect(quantity).toBe(100);
    });

    test('uses sell fills as the opening side of a short trade', () => {
      const quantity = TradeAllocationService.deriveBasisQuantity({
        side: 'short',
        quantity: 5,
        executions: [
          { type: 'entry', quantity: 12 },
          { type: 'exit', quantity: 7 }
        ]
      });

      expect(quantity).toBe(12);
    });

    test('sums grouped round-trip execution quantities', () => {
      const quantity = TradeAllocationService.deriveBasisQuantity({
        side: 'long',
        quantity: 1,
        executions: [
          { entry_price: 10, quantity: 3 },
          { entryPrice: 11, quantity: 2 }
        ]
      });

      expect(quantity).toBe(5);
    });

    test('falls back to the absolute trade quantity', () => {
      expect(TradeAllocationService.deriveBasisQuantity({ quantity: -2.5 })).toBe(2.5);
    });
  });

  describe('replaceTradeAllocations validation', () => {
    test('rejects a split that does not total 100 percent before opening a transaction', async () => {
      await expect(TradeAllocationService.replaceTradeAllocations('user-1', 'trade-1', [
        { allocation_group_id: GROUP_ONE, allocation_ratio: 0.6 },
        { allocation_group_id: GROUP_TWO, allocation_ratio: 0.3 }
      ])).rejects.toMatchObject({
        statusCode: 400,
        message: 'Allocation percentages must total 100%'
      });

      expect(db.connect).not.toHaveBeenCalled();
    });

    test('rejects duplicate groups before opening a transaction', async () => {
      await expect(TradeAllocationService.replaceTradeAllocations('user-1', 'trade-1', [
        { allocation_group_id: GROUP_ONE, allocation_ratio: 0.5 },
        { allocation_group_id: GROUP_ONE, allocation_ratio: 0.5 }
      ])).rejects.toMatchObject({
        statusCode: 400,
        message: 'Each allocation group can only be used once per trade'
      });

      expect(db.connect).not.toHaveBeenCalled();
    });
  });

  describe('group validation', () => {
    test('rejects an invalid color without querying the database', async () => {
      await expect(TradeAllocationService.createGroup('user-1', {
        name: 'Core',
        color: 'primary'
      })).rejects.toMatchObject({ statusCode: 400 });

      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
