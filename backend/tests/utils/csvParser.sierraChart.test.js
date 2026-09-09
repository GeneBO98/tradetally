jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { parseCSV } = require('../../src/utils/csvParser');
const { applyBrokerFeeSettingsToTrades } = require('../../src/services/brokerFeeApplicationService');

const HEADER = [
  'ActivityType', 'DateTime', 'TransDateTime', 'Symbol', 'Quantity', 'BuySell',
  'FillPrice', 'FilledQuantity', 'TradeAccount', 'OpenClose', 'PositionQuantity',
  'FillExecutionServiceID', 'InternalOrderID', 'Note'
].join('\t');

function row({ datetime, symbol, side, price, quantity = 1, account = 'Sim1', executionId, orderId }) {
  return [
    'Fills', datetime, datetime, symbol, quantity, side, (price * 100).toFixed(7), quantity, account,
    side === 'Buy' ? 'Open' : 'Close', side === 'Buy' ? 1 : '', executionId,
    orderId, 'Test setup'
  ].join('\t');
}

function binaryField(id, value) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(id, 0);
  header.writeUInt32LE(value.length, 4);
  return Buffer.concat([header, value]);
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value);
  return buffer;
}

function int64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  return buffer;
}

function float64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleLE(value);
  return buffer;
}

function scDateTime(iso) {
  const scEpochMs = Date.UTC(1899, 11, 30);
  return int64(BigInt(new Date(iso).getTime() - scEpochMs) * 1000n);
}

function binaryFill({ datetime, symbol, side, price, executionId, orderId, account = 'Sim1' }) {
  return Buffer.concat([
    binaryField(101, int32(2)),
    binaryField(102, scDateTime(datetime)),
    binaryField(103, Buffer.from(symbol)),
    binaryField(105, int64(orderId)),
    binaryField(108, float64(1)),
    binaryField(109, Buffer.from([side === 'Buy' ? 1 : 2])),
    binaryField(113, float64(price * 100)),
    binaryField(114, float64(1)),
    binaryField(118, Buffer.from(account)),
    binaryField(120, Buffer.from([side === 'Buy' ? 1 : 2])),
    binaryField(124, Buffer.from(executionId)),
    binaryField(160, scDateTime(datetime)),
    binaryField(199, Buffer.alloc(0))
  ]);
}

describe('Sierra Chart parser', () => {
  test('auto-detects text exports and resolves the futures multiplier per contract', async () => {
    const text = [
      HEADER,
      row({ datetime: '2026-09-03 13:31:16.188840', symbol: 'ESU6.CME', side: 'Sell', price: 7708.25, executionId: 'ES-1', orderId: '1' }),
      row({ datetime: '2026-09-03 13:31:19.353480', symbol: 'ESU6.CME', side: 'Buy', price: 7708.75, executionId: 'ES-2', orderId: '2' }),
      row({ datetime: '2026-09-03 14:09:46.391718', symbol: 'MESU6.CME', side: 'Buy', price: 7714.75, executionId: 'MES-1', orderId: '3' }),
      row({ datetime: '2026-09-03 14:09:51.709774', symbol: 'MESU6.CME', side: 'Sell', price: 7715.25, executionId: 'MES-2', orderId: '4' })
    ].join('\n');

    const result = await parseCSV(Buffer.from(text), 'auto', { userTimezone: 'UTC' });

    expect(result.diagnostics.detectedBroker).toBe('sierrachart');
    expect(result.trades).toHaveLength(2);
    expect(result.trades.find(trade => trade.symbol === 'ESU6')).toEqual(expect.objectContaining({
      side: 'short',
      pointValue: 50,
      pnl: -25
    }));
    expect(result.trades.find(trade => trade.symbol === 'MESU6')).toEqual(expect.objectContaining({
      side: 'long',
      pointValue: 5,
      pnl: 2.5
    }));
  });

  test('decodes raw binary activity logs and retains execution identity', async () => {
    const file = Buffer.concat([
      binaryField(1, int64(2)),
      binaryFill({ datetime: '2026-09-08T14:02:58.329Z', symbol: 'MESU6.CME', side: 'Buy', price: 7688.5, executionId: '1030650', orderId: 122952 }),
      binaryFill({ datetime: '2026-09-08T14:03:02.094Z', symbol: 'MESU6.CME', side: 'Sell', price: 7688, executionId: '1031928', orderId: 122961 })
    ]);

    const result = await parseCSV(file, 'auto', { userTimezone: 'UTC' });

    expect(result.diagnostics.detectedBroker).toBe('sierrachart');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'MESU6',
      entryPrice: 7688.5,
      exitPrice: 7688,
      pnl: -2.5,
      accountIdentifier: 'Sim1'
    }));
    expect(result.trades[0].executions.map(execution => execution.execution_id)).toEqual(['1030650', '1031928']);
  });

  test('rejects Save Log As text because it contains display-local timestamps', async () => {
    const saveLogAs = [
      HEADER,
      [
        'Fills', '2026-09-08 09:02:58.329559', '2026-09-08 09:02:58.000000',
        'MESU6.CME', 1, 'Buy', '7688.50', 1, 'Sim1', 'Open', 1, '1', '1', 'Test setup'
      ].join('\t')
    ].join('\n');

    await expect(parseCSV(Buffer.from(saveLogAs), 'auto', { userTimezone: 'UTC' }))
      .rejects.toThrow('Save Log As files are not supported');
  });

  test('matches the issue 404 net P/L fixture when Sierra Chart broker fees are configured', async () => {
    const text = [
      HEADER,
      row({ datetime: '2026-09-08 14:02:58.329559', symbol: 'MESU6.CME', side: 'Buy', price: 7688.5, quantity: 3, executionId: '1', orderId: '1' }),
      row({ datetime: '2026-09-08 14:03:02.094209', symbol: 'MESU6.CME', side: 'Sell', price: 7688, quantity: 3, executionId: '2', orderId: '2' }),
      row({ datetime: '2026-09-08 14:03:08.472200', symbol: 'MESU6.CME', side: 'Buy', price: 7688.75, quantity: 3, executionId: '3', orderId: '3' }),
      row({ datetime: '2026-09-08 14:03:16.022529', symbol: 'MESU6.CME', side: 'Sell', price: 7688.75, executionId: '4', orderId: '4' }),
      row({ datetime: '2026-09-08 14:03:16.067420', symbol: 'MESU6.CME', side: 'Sell', price: 7688.5, executionId: '5', orderId: '4' }),
      row({ datetime: '2026-09-08 14:03:16.134942', symbol: 'MESU6.CME', side: 'Sell', price: 7688.5, executionId: '6', orderId: '4' }),
      row({ datetime: '2026-09-08 14:03:26.004707', symbol: 'MESU6.CME', side: 'Buy', price: 7689.5, quantity: 3, executionId: '7', orderId: '5' }),
      row({ datetime: '2026-09-08 14:03:35.929242', symbol: 'MESU6.CME', side: 'Sell', price: 7688, quantity: 3, executionId: '8', orderId: '6' }),
      row({ datetime: '2026-09-08 14:03:47.066171', symbol: 'MESU6.CME', side: 'Buy', price: 7688.75, quantity: 3, executionId: '9', orderId: '7' }),
      row({ datetime: '2026-09-08 14:03:58.559724', symbol: 'MESU6.CME', side: 'Sell', price: 7688.25, quantity: 3, executionId: '10', orderId: '8' })
    ].join('\n');
    const parsed = await parseCSV(Buffer.from(text), 'auto', { userTimezone: 'UTC' });
    const withFees = applyBrokerFeeSettingsToTrades({
      trades: parsed.trades,
      broker: 'auto',
      feeRows: [{
        broker: 'sierrachart',
        instrument: 'MES',
        commission_per_contract: 0.91,
        commission_per_side: 0,
        exchange_fee_per_contract: 0,
        nfa_fee_per_contract: 0,
        clearing_fee_per_contract: 0,
        platform_fee_per_contract: 0
      }]
    });

    expect(withFees.map(trade => Number(trade.pnl.toFixed(2)))).toEqual([-12.96, -7.96, -27.96, -12.96]);
    expect(Number(withFees.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2))).toBe(-61.84);
  });
});
