const { computeTradePnl } = require('../../src/services/pnlEngine');

function nearly(actual, expected, tol = 0.001) {
  expect(actual).toBeGreaterThanOrEqual(expected - tol);
  expect(actual).toBeLessThanOrEqual(expected + tol);
}

describe('pnlEngine.computeTradePnl', () => {
  describe('fill-based shape', () => {
    test('long single round trip', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });

      expect(annotatedExecutions[0].realized_pnl).toBeNull();
      nearly(annotatedExecutions[1].realized_pnl, 100);
      expect(annotatedExecutions[1].exit_date).toBe('2026-01-05');
      nearly(aggregate.pnl, 100);
      nearly(aggregate.entry_price, 10);
      nearly(aggregate.exit_price, 11);
      expect(aggregate.is_fully_closed).toBe(true);
    });

    test('short single round trip', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'short',
        instrumentType: 'stock',
        executions: [
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-05T10:00:00Z' },
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });

      expect(annotatedExecutions[0].realized_pnl).toBeNull();
      nearly(annotatedExecutions[1].realized_pnl, 100);
      nearly(aggregate.pnl, 100);
      expect(aggregate.is_fully_closed).toBe(true);
    });

    test('partial close splits realized P&L across exits', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 30, price: 11, datetime: '2026-01-05T11:00:00Z' },
          { action: 'sell', quantity: 70, price: 12, datetime: '2026-01-05T12:00:00Z' }
        ],
        timezone: 'UTC'
      });

      nearly(annotatedExecutions[1].realized_pnl, 30);
      nearly(annotatedExecutions[2].realized_pnl, 140);
      nearly(aggregate.pnl, 170);
      expect(aggregate.is_fully_closed).toBe(true);
      nearly(aggregate.exit_price, 11.7);
    });

    test('multi-entry FIFO into single exit', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 50, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'buy', quantity: 50, price: 11, datetime: '2026-01-05T11:00:00Z' },
          { action: 'sell', quantity: 100, price: 12, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });

      nearly(annotatedExecutions[2].realized_pnl, 150);
      nearly(aggregate.pnl, 150);
      nearly(aggregate.entry_price, 10.5);
    });

    test('same-second tie-breaker puts entries before exits', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'sell', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' }
        ],
        timezone: 'UTC'
      });

      const sellExec = annotatedExecutions.find((e) => e.action === 'sell');
      nearly(sellExec.realized_pnl, 0);
      nearly(aggregate.pnl, 0);
    });

    test('respects unsorted input order (chronological sort)', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'sell', quantity: 100, price: 12, datetime: '2026-01-05T14:00:00Z' },
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' }
        ],
        timezone: 'UTC'
      });

      nearly(aggregate.pnl, 200);
      expect(aggregate.entry_time).toBe('2026-01-05T10:00:00Z');
      expect(aggregate.exit_time).toBe('2026-01-05T14:00:00Z');
    });
  });

  describe('grouped shape', () => {
    test('JNJ fixture from existing controller test', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [{
          quantity: 100,
          side: 'long',
          entryPrice: 150,
          exitPrice: 153.36,
          entryTime: '2026-04-03T09:31:00Z',
          exitTime: '2026-04-03T15:10:00Z',
          commission: 2.82,
          fees: 0
        }],
        timezone: 'UTC'
      });

      nearly(annotatedExecutions[0].realized_pnl, 333.18);
      expect(annotatedExecutions[0].exit_date).toBe('2026-04-03');
      nearly(aggregate.pnl, 333.18);
      expect(aggregate.is_fully_closed).toBe(true);
    });

    test('grouped multi-leg across different exit dates', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          {
            quantity: 60,
            entryPrice: 10,
            exitPrice: 12,
            entryTime: '2026-04-01T09:30:00Z',
            exitTime: '2026-04-03T11:00:00Z',
            commission: 0.5,
            fees: 0
          },
          {
            quantity: 40,
            entryPrice: 10,
            exitPrice: 11,
            entryTime: '2026-04-01T09:30:00Z',
            exitTime: '2026-04-04T15:30:00Z',
            commission: 0.5,
            fees: 0
          }
        ],
        timezone: 'UTC'
      });

      nearly(annotatedExecutions[0].realized_pnl, 119.5);
      nearly(annotatedExecutions[1].realized_pnl, 39.5);
      expect(annotatedExecutions[0].exit_date).toBe('2026-04-03');
      expect(annotatedExecutions[1].exit_date).toBe('2026-04-04');
      nearly(aggregate.pnl, 159);
    });
  });

  describe('legacy shape', () => {
    test('legacy {side, type} normalizes to fill-based', () => {
      const { aggregate } = computeTradePnl({
        side: 'short',
        instrumentType: 'stock',
        executions: [
          { side: 'short', type: 'entry', quantity: 100, price: 100, datetime: '2026-04-01T09:30:00Z', commission: 1, fees: 0 },
          { side: 'long', type: 'exit', quantity: 100, price: 90, datetime: '2026-04-03T14:45:00Z', commission: 1, fees: 0 }
        ],
        timezone: 'UTC'
      });

      nearly(aggregate.pnl, 998);
    });
  });

  describe('multipliers', () => {
    test('options use contractSize=100 by default', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'option',
        executions: [
          { action: 'buy', quantity: 1, price: 5, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 1, price: 6, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 100);
    });

    test('futures use pointValue=5 (ES)', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'future',
        pointValue: 5,
        executions: [
          { action: 'buy', quantity: 1, price: 4000, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 1, price: 4001, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 5);
    });

    test('futures use pointValue=2 (MNQ)', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'future',
        pointValue: 2,
        executions: [
          { action: 'buy', quantity: 1, price: 17000, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 1, price: 17010, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 20);
    });
  });

  describe('commission and fees rule', () => {
    test('negative commission (rebate) is added to P&L', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, commission: -0.5, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, commission: 0, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 100.5);
      nearly(aggregate.commission, -0.5);
    });

    test('no per-exec commission → prorate fallbackCommission by quantity', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        fallbackCommission: 10,
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(annotatedExecutions[0].commission, 5);
      nearly(annotatedExecutions[1].commission, 5);
      nearly(aggregate.commission, 10);
      nearly(aggregate.pnl, 90);
    });

    test('mixed — per-exec wins, fallback not applied', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        fallbackCommission: 100,
        executions: [
          { action: 'buy', quantity: 100, price: 10, commission: 1, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(annotatedExecutions[0].commission, 1);
      nearly(annotatedExecutions[1].commission, 0);
      nearly(aggregate.commission, 1);
      nearly(aggregate.pnl, 99);
    });

    test('per-exec costs are authoritative when any leg carries a cost field', () => {
      // Trade-level fallbackFees should NOT be added on top of per-exec commissions —
      // they represent the same broker cost in different storage locations on some
      // importers (IBKR records commission in both trade.commission AND execution.fees).
      // Double-counting would over-deduct. Per-exec values win.
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        fallbackCommission: 0,
        fallbackFees: 5,
        executions: [
          { action: 'buy', quantity: 100, price: 10, commission: 1, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, commission: 1, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.commission, 2);
      nearly(aggregate.fees, 0);
      nearly(aggregate.pnl, 98);
    });

    test('IBKR-style double-recorded cost (trade.commission == sum(exec.fees)) is not double-counted', () => {
      // Regression for issue #318: IBKR importer stores the broker commission in
      // both trade.commission AND execution.fees. The engine must NOT deduct both.
      // AGQ short option fixture from real user data:
      //   - 4 contracts @ $0.47 entry, $0.00 exit (worthless expiry)
      //   - trade.commission = -1.53 (rebate stored at trade level)
      //   - executions[0].fees = -1.53 (same rebate, stored on entry leg)
      //   - Correct net P&L = (0.47 - 0) * 4 * 100 - (-1.53) = $189.53
      const { aggregate } = computeTradePnl({
        side: 'short',
        instrumentType: 'option',
        contractSize: 100,
        fallbackCommission: -1.53244,
        fallbackFees: 0,
        executions: [
          { action: 'sell', quantity: 4, price: 0.47, fees: -1.53244, datetime: '2025-12-30T18:11:00Z' },
          { action: 'buy', quantity: 4, price: 0, fees: 0, datetime: '2026-01-02T21:20:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 189.53244, 0.001);
    });
  });

  describe('edge cases', () => {
    test('empty executions returns zeroed aggregate', () => {
      const result = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [],
        timezone: 'UTC'
      });
      expect(result.annotatedExecutions).toHaveLength(0);
      expect(result.aggregate.pnl).toBeNull();
      expect(result.aggregate.is_fully_closed).toBe(false);
    });

    test('unmatched exit (no entry) → realized_pnl null, no throw', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      expect(annotatedExecutions[0].realized_pnl).toBeNull();
      expect(aggregate.pnl).toBeNull();
      warnSpy.mockRestore();
    });

    test('open partial close: realized P&L set, exit_time stays null', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 30, price: 11, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.pnl, 30);
      expect(aggregate.is_fully_closed).toBe(false);
      expect(aggregate.exit_time).toBeNull();
      expect(aggregate.exit_price).toBeNull();
    });

    test('unparseable timestamps (grouped) → null entry/exit/trade_date, P&L intact', () => {
      // A garbage 2-digit-year timestamp like "24-03-12" must never be chosen
      // as entry/exit and written verbatim into a timestamp column.
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { entry_price: 100, exit_price: 110, quantity: 10, entry_time: '24-03-12', exit_time: '24-03-12' }
        ],
        timezone: 'America/New_York'
      });
      nearly(aggregate.pnl, 100);
      expect(aggregate.entry_time).toBeNull();
      expect(aggregate.exit_time).toBeNull();
      expect(aggregate.trade_date).toBeNull();
    });

    test('unparseable timestamps (fill-based) → null entry/exit/trade_date, P&L intact', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 10, price: 100, datetime: '24-03-12' },
          { action: 'sell', quantity: 10, price: 110, datetime: '24-03-12' }
        ],
        timezone: 'America/New_York'
      });
      nearly(aggregate.pnl, 100);
      expect(aggregate.entry_time).toBeNull();
      expect(aggregate.exit_time).toBeNull();
      expect(aggregate.trade_date).toBeNull();
    });

    test('corrupt low-year entry ("0024-...") is not selected; valid exit kept, P&L intact', () => {
      // Real Webull import data: a mangled year ("0024" for "2024"). Date.parse
      // accepts it, but it must not become entry_time/trade_date — that would
      // overwrite good stored data and format to an out-of-range "24-03-12".
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          {
            entryPrice: 2.78, exitPrice: 2.6201, quantity: 100,
            entryTime: '0024-03-12T14:37:02.000Z',
            exitTime: '2024-03-01T14:37:00.000Z',
            pnl: '-16.030000', fees: 0.03, commission: 0
          }
        ],
        timezone: 'America/Chicago'
      });
      expect(aggregate.entry_time).toBeNull();
      expect(aggregate.trade_date).toBeNull();
      expect(aggregate.exit_time).toBe('2024-03-01T14:37:00.000Z');
      nearly(aggregate.pnl, -16.02, 0.01);
    });

    test('one parseable, one garbage exit timestamp → picks the parseable one', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 20, price: 100, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 10, price: 110, datetime: '24-03-12' },
          { action: 'sell', quantity: 10, price: 110, datetime: '2026-01-05T15:00:00Z' }
        ],
        timezone: 'UTC'
      });
      expect(aggregate.is_fully_closed).toBe(true);
      expect(aggregate.exit_time).toBe('2026-01-05T15:00:00Z');
    });
  });

  describe('timezone-bucketed exit_date', () => {
    test('UTC 03:00 maps to America/New_York previous-day exit_date', () => {
      const { annotatedExecutions } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-01-15T13:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, datetime: '2026-01-16T03:00:00Z' }
        ],
        timezone: 'America/New_York'
      });
      expect(annotatedExecutions[1].exit_date).toBe('2026-01-15');
    });
  });

  describe('IBKR-style asymmetric fees', () => {
    test('long: SEC fee stamped on sell leg only', () => {
      const { aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, commission: 1, datetime: '2026-01-05T10:00:00Z' },
          { action: 'sell', quantity: 100, price: 11, commission: 1, fees: 0.05, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.commission, 2);
      nearly(aggregate.fees, 0.05);
      nearly(aggregate.pnl, 97.95);
    });

    test('short: SEC fee stamped on opening sell leg', () => {
      const { aggregate } = computeTradePnl({
        side: 'short',
        instrumentType: 'stock',
        executions: [
          { action: 'sell', quantity: 100, price: 11, commission: 1, fees: 0.05, datetime: '2026-01-05T10:00:00Z' },
          { action: 'buy', quantity: 100, price: 10, commission: 1, datetime: '2026-01-05T14:00:00Z' }
        ],
        timezone: 'UTC'
      });
      nearly(aggregate.commission, 2);
      nearly(aggregate.fees, 0.05);
      nearly(aggregate.pnl, 97.95);
    });
  });

  describe('existing controller test fixtures', () => {
    test('NEM partial exit on 2026-04-03 yields 118.68', () => {
      const { annotatedExecutions, aggregate } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 10, datetime: '2026-04-01T09:30:00Z', commission: 1.2, fees: 0 },
          { action: 'sell', quantity: 60, price: 12, datetime: '2026-04-03T11:00:00Z', commission: 0.6, fees: 0 },
          { action: 'sell', quantity: 40, price: 11, datetime: '2026-04-04T15:30:00Z', commission: 0.4, fees: 0 }
        ],
        timezone: 'UTC'
      });

      const exit1 = annotatedExecutions.find((e) => e.action === 'sell' && e.quantity === 60);
      const exit2 = annotatedExecutions.find((e) => e.action === 'sell' && e.quantity === 40);
      nearly(exit1.realized_pnl, 118.68);
      nearly(exit2.realized_pnl, 39.12);
      expect(exit1.exit_date).toBe('2026-04-03');
      expect(exit2.exit_date).toBe('2026-04-04');
      nearly(aggregate.pnl, 157.8);
    });

    test('IBKR-decorated exit fill stays in FIFO path and deducts both commissions', () => {
      // csvParser:5170 stamps entryPrice/exitPrice/entryTime/exitTime on the
      // closing fill of an IBKR partial close. The engine must NOT switch to
      // grouped mode just because one fill carries those fields — the opening
      // fill is a separate plain fill, and grouped mode would skip its commission.
      const { aggregate, annotatedExecutions } = computeTradePnl({
        side: 'long',
        instrumentType: 'stock',
        executions: [
          { action: 'buy', quantity: 100, price: 200, datetime: '2025-12-15T10:00:00Z', commission: 1, fees: 0 },
          {
            action: 'sell', quantity: 100, price: 201.89, datetime: '2026-01-02T14:00:00Z',
            commission: 1, fees: 0,
            entryTime: '2025-12-15T10:00:00Z', entryPrice: 200,
            exitTime: '2026-01-02T14:00:00Z', exitPrice: 201.89,
            pnl: 189
          }
        ],
        timezone: 'UTC'
      });

      nearly(aggregate.pnl, 187);
      nearly(aggregate.commission, 2);
      const exit = annotatedExecutions.find((e) => e.action === 'sell');
      nearly(exit.realized_pnl, 187);
    });

    test('AVAV-style open short option partial close yields 88.80', () => {
      const { aggregate } = computeTradePnl({
        side: 'short',
        instrumentType: 'option',
        contractSize: 100,
        executions: [
          { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: -0.05204 },
          { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.64796 },
          { action: 'sell', quantity: 2, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.59592 },
          { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.29796 },
          { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:00', fees: 0.29796 },
          { action: 'sell', quantity: 1, price: 0.9, datetime: '2026-01-05T10:23:03', fees: 0.29796 },
          { action: 'buy', quantity: 1, price: 0.45, datetime: '2026-01-08T10:46:38', fees: -0.04875 },
          { action: 'buy', quantity: 1, price: 0.45, datetime: '2026-01-08T10:46:38', fees: 0.65125 }
        ],
        timezone: 'UTC'
      });

      nearly(aggregate.pnl, 90 - 1.19842, 0.01);
      expect(aggregate.is_fully_closed).toBe(false);
    });
  });
});
