jest.mock('../../src/utils/finnhub', () => ({
  apiKey: 'test',
  getForexRate: jest.fn().mockResolvedValue(0.00625)
}));
jest.mock('../../src/services/manualFxService', () => ({
  getRateMap: jest.fn().mockResolvedValue({})
}));

const finnhub = require('../../src/utils/finnhub');
const { convertTradeToUSD } = require('../../src/utils/currencyConverter');
const { computeTradePnl } = require('../../src/services/pnlEngine');

test('currency conversion scales executions used to rebuild persisted P&L', async () => {
  const trade = {
    entryPrice: 160,
    exitPrice: 161,
    pnl: 1000,
    commission: 0,
    entryCommission: 0,
    exitCommission: 0,
    fees: 0,
    executions: [
      { action: 'buy', quantity: 1000, price: 160, fees: 0 },
      { action: 'sell', quantity: 1000, price: 161, fees: 0, realized_pnl: 1000 }
    ]
  };

  const converted = await convertTradeToUSD(trade, 'JPY', '2026-09-03');

  expect(finnhub.getForexRate).toHaveBeenCalledWith('JPY', 'USD', '2026-09-03');
  expect(converted).toMatchObject({
    originalCurrency: 'JPY',
    exchangeRate: 0.00625,
    originalEntryPriceCurrency: 160,
    originalExitPriceCurrency: 161,
    originalPnlCurrency: 1000,
    originalCommissionCurrency: 0,
    originalFeesCurrency: 0,
    entryPrice: 1,
    exitPrice: 1.00625,
    pnl: 6.25
  });
  expect(converted.executions[0]).toMatchObject({ price: 1, fees: 0 });
  expect(converted.executions[1]).toMatchObject({ price: 1.00625, realized_pnl: 6.25 });
  const rebuilt = computeTradePnl({
    side: 'long',
    instrumentType: 'forex',
    executions: converted.executions,
    fallbackCommission: converted.commission,
    fallbackFees: converted.fees
  });
  expect(rebuilt.aggregate.pnl).toBeCloseTo(6.25);
});
