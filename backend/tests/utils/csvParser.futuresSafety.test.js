jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade), userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { parseCSV, detectBrokerFormat, parseInstrumentData } = require('../../src/utils/csvParser');
const { parseTradovateTransactions } = require('../../src/utils/csv/parsers/tradovate');
const { computeTradePnl } = require('../../src/services/pnlEngine');

const parse = (rows, broker = 'auto', context = {}) => parseCSV(Buffer.from(rows.join('\n')), broker, {
  tradeGroupingSettings: { enabled: false }, ...context
});
const persistedPnl = trade => computeTradePnl({
  side: trade.side, instrumentType: trade.instrumentType, pointValue: trade.pointValue,
  contractSize: trade.contractSize, executions: trade.executions || trade.executionData,
  fallbackCommission: trade.commission, fallbackFees: trade.fees
}).aggregate;
const fillHeaders = '_id,_orderId,_contractId,_timestamp,_tradeDate,_action,_qty,_price,_active,_accountId,Fill ID,Order ID,Timestamp,Date,Account,B/S,Quantity,Price,Contract,Product,commission';
const fill = (id, order, side, quantity, price, symbol, product, cost = 0, active = true) =>
  `${id},${order},1,2026-10-01T12:00:00Z,2026-10-01,${side},${quantity},${price},${active},1,${id},${order},2026-10-01T12:0${id}:00Z,2026-10-01,SYNTHETIC,${side},${quantity},${price},${symbol},${product},${cost}`;

describe('Tradovate fills and futures economics', () => {
  test.each(['auto', 'tradovate'])('imports Micro Bitcoin fills directly using %s selection', async broker => {
    const rows = [fillHeaders, fill(1, 101, 'Buy', 5, 83865, 'MBTV6', 'MBT', 13.35), fill(2, 102, 'Sell', 5, 84645, 'MBTV6', 'MBT', 13.35)];
    expect(detectBrokerFormat(Buffer.from(rows.join('\n')))).toBe('tradovate');
    const result = await parse(rows, broker);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ broker: 'tradovate', pointValue: 0.1, tickSize: 5 });
    expect(result.diagnostics.brokerFallback).toBeUndefined();
    expect(persistedPnl(result.trades[0]).pnl).toBeCloseTo(363.3, 6);
  });

  test('keeps distinct partial fills of one order and prorates reversal costs', async () => {
    const result = await parse([fillHeaders,
      fill(1, 101, 'Buy', 1, 100, 'MNQZ6', 'MNQ', 0.52),
      fill(2, 101, 'Buy', 1, 101, 'MNQZ6', 'MNQ', 0.52),
      fill(3, 102, 'Sell', 3, 110, 'MNQZ6', 'MNQ', 1.56),
      fill(4, 103, 'Buy', 1, 105, 'MNQZ6', 'MNQ', 0.52)
    ]);
    expect(result.trades).toHaveLength(2);
    const economics = result.trades.map(persistedPnl);
    expect(economics[0].pnl).toBeCloseTo(35.92, 6);
    expect(economics[1].pnl).toBeCloseTo(8.96, 6);
    expect(economics.reduce((sum, t) => sum + t.commission + t.fees, 0)).toBeCloseTo(3.12);
  });

  test('excludes inactive fills', async () => {
    const result = await parse([fillHeaders, fill(1, 101, 'Buy', 1, 100, 'MESZ6', 'MES', 1, false)]);
    expect(result.trades).toHaveLength(0);
  });

  test('a fill ID prevents importing the same executions twice', async () => {
    const rows = [fillHeaders, fill(1, 101, 'Buy', 1, 100, 'MESZ6', 'MES'), fill(2, 102, 'Sell', 1, 101, 'MESZ6', 'MES')];
    const first = await parse(rows);
    const second = await parse(rows, 'tradovate', { existingExecutions: { MESZ6: first.trades[0].executions } });
    expect(second.trades).toHaveLength(0);
  });

  test.each([['MBTZ6', 0.1], ['NNQZ6', 0.2], ['NDOWZ6', 0.05], ['VXZ6', 1000], ['VXMZ6', 100], ['PAZ6', 100], ['MHGZ6', 2500], ['6EZ6', 125000]])(
    'applies %s multiplier through generic parsing and persistence', async (symbol, multiplier) => {
      const result = await parse(['Symbol,Side,Quantity,Price,Date,Commission,Fees',
        `${symbol},Buy,1,100,2026-10-01 10:00:00,1,0.25`,
        `${symbol},Sell,1,101,2026-10-01 11:00:00,1,0.25`
      ], 'generic');
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].pointValue).toBe(multiplier);
      expect(persistedPnl(result.trades[0]).pnl).toBeCloseTo(multiplier - 2.5, 6);
    }
  );

  test.each(['generic', 'tradovate', 'auto'])('rejects unknown multipliers with actionable diagnostics (%s)', async broker => {
    const result = await parse(['orderId,Status,B/S,Contract,Product,filledQty,avgPrice,Fill Time',
      '101,Filled,Buy,ZZTZ6,ZZT,1,100,2026-10-01 10:00:00',
      '102,Filled,Sell,ZZTZ6,ZZT,1,101,2026-10-01 11:00:00'
    ], broker);
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.skippedReasons.some(item => /unknown futures point value/i.test(item.reason))).toBe(true);
  });

  test('preserves an explicit broker multiplier for an unlisted product', async () => {
    const trades = await parseTradovateTransactions([
      { orderId: '101', Status: 'Filled', 'B/S': 'Buy', Contract: 'ZZTZ6', Product: 'ZZT', filledQty: 1, avgPrice: 100, 'Fill Time': '2026-10-01 10:00:00' },
      { orderId: '102', Status: 'Filled', 'B/S': 'Sell', Contract: 'ZZTZ6', Product: 'ZZT', filledQty: 1, avgPrice: 101, 'Fill Time': '2026-10-01 11:00:00' }
    ], {}, { pointValueByProduct: { ZZT: 7 } });
    expect(trades[0].pointValue).toBe(7);
    expect(persistedPnl(trades[0]).pnl).toBe(7);
  });

  test('explains why cash history cannot reconstruct executions', async () => {
    const result = await parse(['Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract',
      'SYNTHETIC,1,2026-10-01 10:00:00,2026-10-01,205,50205,Trade Paired,USD,PLF7'
    ], 'tradovate');
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.nonTradeFile).toBe('cash_history');
    expect(result.diagnostics.user_summary.title).toMatch(/cash history/);
  });

  test('a custom mapping with only fees does not also create commission', async () => {
    const result = await parse(['Symbol,Side,Quantity,Price,Date,Costs',
      'AAPL,Buy,1,10,2026-10-01 10:00:00,1',
      'AAPL,Sell,1,20,2026-10-01 11:00:00,1'
    ], 'generic', { customMapping: { symbol_column: 'Symbol', side_column: 'Side', quantity_column: 'Quantity',
      entry_price_column: 'Price', entry_date_column: 'Date', fees_column: 'Costs' } });
    expect(result.trades).toHaveLength(1);
    const aggregate = persistedPnl(result.trades[0]);
    expect(aggregate.commission).toBe(0);
    expect(aggregate.fees).toBe(2);
    expect(aggregate.pnl).toBe(8);
  });

  test.each([null, undefined, 0, -1, Infinity, 'invalid'])('canonical P&L rejects invalid futures point value %s', pointValue => {
    expect(() => computeTradePnl({ instrumentType: 'future', pointValue, side: 'long', executions: [
      { action: 'buy', quantity: 1, price: 100 }, { action: 'sell', quantity: 1, price: 101 }
    ] })).toThrow(/point value/);
  });

  test('a familiar price shape does not turn a stock into a new futures root', () => {
    expect(parseInstrumentData('AAPL').instrumentType).toBe('stock');
  });
});
