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
const brokerImportCorpus = require('../fixtures/brokerImportCorpus.v1.json');

function buf(value) {
  return Buffer.from(value, 'utf8');
}

function snapshotImportResult(result) {
  return {
    tradeCount: result.trades.length,
    diagnostics: result.diagnostics,
    trades: result.trades.map(trade => ({
      symbol: trade.symbol,
      side: trade.side,
      instrumentType: trade.instrumentType,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      status: trade.status,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      pnl: trade.pnl,
      commission: trade.commission,
      executions: (trade.executions || []).map(execution => ({
        action: execution.action,
        quantity: execution.quantity,
        price: execution.price,
        datetime: execution.datetime,
        orderId: execution.orderId
      }))
    }))
  };
}

const anonymizedBrokerFixtures = [
  ...brokerImportCorpus.contractFixtures
];

describe('broker import contract fixtures', () => {
  test.each(anonymizedBrokerFixtures)('parses $name without breaking the trade contract', async ({ broker, csv, expect: expected }) => {
    const result = await parseCSV(buf(csv), broker, {});
    expect(Array.isArray(result.trades)).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    const trade = result.trades[0];
    expect(trade.symbol).toBe(expected.symbol);
    expect(trade.entryTime || trade.tradeDate).toBeTruthy();
    expect(Number(trade.quantity)).toBeGreaterThan(0);
    if (expected.side) expect(trade.side).toBe(expected.side);
    if (expected.instrumentType) expect(trade.instrumentType).toBe(expected.instrumentType);
  });

  test.each(brokerImportCorpus.edgeCaseFixtures)('matches broker-import fixture snapshot for $name', async ({ broker, csv }) => {
    const result = await parseCSV(buf(csv), broker, {});
    expect({
      corpusVersion: brokerImportCorpus.corpusVersion,
      ...snapshotImportResult(result)
    }).toMatchSnapshot();
  });
});
