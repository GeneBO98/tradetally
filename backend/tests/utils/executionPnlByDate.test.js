const {
  buildExecutionDailyPnlRows
} = require('../../src/utils/executionPnlByDate');

describe('buildExecutionDailyPnlRows', () => {
  test('splits a multi-day position across its realized exit dates', () => {
    const rows = buildExecutionDailyPnlRows([
      {
        trade_id: 'multi-day-position',
        position_key: 'account|AAPL|position',
        symbol: 'AAPL',
        side: 'long',
        pnl: 500,
        derived_r_value: 2,
        instrument_type: 'stock',
        executions: [
          {
            action: 'buy',
            quantity: 100,
            price: 100,
            datetime: '2026-07-16T14:30:00Z',
            realized_pnl: null,
            exit_date: null
          },
          {
            action: 'sell',
            quantity: 40,
            price: 105,
            datetime: '2026-07-20T15:00:00Z',
            realized_pnl: 200,
            exit_date: '2026-07-20'
          },
          {
            action: 'sell',
            quantity: 60,
            price: 105,
            datetime: '2026-07-23T15:00:00Z',
            realized_pnl: 300,
            exit_date: '2026-07-23'
          }
        ]
      },
      {
        trade_id: 'losing-position',
        position_key: 'account|MSFT|position',
        symbol: 'MSFT',
        side: 'long',
        pnl: -100,
        derived_r_value: -0.5,
        instrument_type: 'stock',
        exit_time: '2026-07-23T18:00:00Z',
        executions: []
      }
    ], 'America/Chicago', {
      startDate: '2026-07-20',
      endDate: '2026-07-23'
    });

    expect(rows).toEqual([
      {
        trade_date: '2026-07-20',
        daily_pnl: 200,
        cumulative_pnl: 200,
        r_value: 0.8,
        cumulative_r_value: 0.8,
        trade_count: 1
      },
      {
        trade_date: '2026-07-23',
        daily_pnl: 200,
        cumulative_pnl: 400,
        r_value: 0.7,
        cumulative_r_value: 1.5,
        trade_count: 2
      }
    ]);
  });

  test('includes an open position partial close reconstructed by the P&L engine', () => {
    const rows = buildExecutionDailyPnlRows([
      {
        trade_id: 'open-short-option',
        symbol: 'AVAV',
        side: 'short',
        pnl: null,
        instrument_type: 'option',
        contract_size: 100,
        executions: [
          {
            action: 'sell',
            quantity: 2,
            price: 0.9,
            datetime: '2026-07-16T14:30:00Z'
          },
          {
            action: 'buy',
            quantity: 1,
            price: 0.4,
            datetime: '2026-07-20T15:00:00Z'
          }
        ]
      }
    ], 'America/Chicago');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      trade_date: '2026-07-20',
      daily_pnl: 50,
      cumulative_pnl: 50,
      trade_count: 1
    }));
  });

  test('counts a grouped multi-leg position once per day', () => {
    const rows = buildExecutionDailyPnlRows([
      {
        trade_id: 'leg-1',
        position_key: 'spread-1',
        side: 'long',
        pnl: 100,
        exit_time: '2026-07-23T15:00:00Z',
        executions: []
      },
      {
        trade_id: 'leg-2',
        position_key: 'spread-1',
        side: 'short',
        pnl: -25,
        exit_time: '2026-07-23T15:00:00Z',
        executions: []
      }
    ], 'UTC', { groupByPosition: true });

    expect(rows[0]).toEqual(expect.objectContaining({
      trade_date: '2026-07-23',
      daily_pnl: 75,
      trade_count: 1
    }));
  });
});
