jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ getDailyCrossRate: jest.fn() }));
jest.mock('../../src/services/lossAversionAnalyticsService', () => ({ getLatestMetrics: jest.fn(), getTopMissedTrades: jest.fn() }));
jest.mock('../../src/services/overconfidenceAnalyticsService', () => ({ getOverconfidenceAnalysis: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ hasFeatureAccess: jest.fn().mockResolvedValue(true) }));

const User = require('../../src/models/User');
const currencyConverter = require('../../src/utils/currencyConverter');
const { scaleMoneyInPayload, scaleMoneyText } = require('../../src/utils/displayCurrency');
const controller = require('../../src/controllers/behavioralAnalytics.controller');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('money walker options used by behavioral analytics', () => {
  test('explicit money keys scale, including ones the naming rules reject', () => {
    const payload = { totalMissedProfit: 200, position_size: 5000, quantity: 10, improvementPercent: 4 };
    scaleMoneyInPayload(payload, 0.5, { moneyKeys: new Set(['totalMissedProfit', 'position_size']) });
    expect(payload).toEqual({ totalMissedProfit: 100, position_size: 2500, quantity: 10, improvementPercent: 4 });
  });

  test('excluded keys are never scaled, but their children still are', () => {
    const payload = { entry_price: 100, high: 3, priceMovement: { maxPriceWithin24Hours: 110, pnl: 40 } };
    scaleMoneyInPayload(payload, 0.5, { excludeKey: (key) => /price|^high$/i.test(key) });
    expect(payload).toEqual({ entry_price: 100, high: 3, priceMovement: { maxPriceWithin24Hours: 110, pnl: 20 } });
  });

  test('amounts inside sentences are converted and re-symbolled', () => {
    expect(scaleMoneyText('this is costing you $41.20/month', 0.5, 'EUR')).toBe('this is costing you €20.60/month');
    expect(scaleMoneyText('Additional loss of $1,250.00', 2, 'GBP')).toBe('Additional loss of £2,500.00');
    expect(scaleMoneyText('Could have entered 5.0% better', 0.5, 'EUR')).toBe('Could have entered 5.0% better');

    const payload = { message: 'save $100/month', reasons: ['loss of $10.00', 'no stop set'], reason: 'support at $50.00' };
    scaleMoneyInPayload(payload, 0.5, { moneyTextKeys: new Set(['message', 'reasons']), textCurrency: 'EUR' });
    expect(payload).toEqual({ message: 'save €50/month', reasons: ['loss of €5.00', 'no stop set'], reason: 'support at $50.00' });
  });
});

describe('behavioral analytics responses follow the display currency', () => {
  const LossAversionAnalyticsService = require('../../src/services/lossAversionAnalyticsService');

  beforeEach(() => {
    jest.clearAllMocks();
    currencyConverter.getDailyCrossRate.mockResolvedValue(0.5);
  });

  const stored = () => ({
    analysis: {
      message: 'You exit winners 2.0x faster than losers - this is costing you $300.00/month',
      financialImpact: { estimatedMonthlyCost: 300, missedProfitPotential: 120, unnecessaryLossExtension: 80 },
      priceHistoryAnalysis: {
        totalMissedProfit: 500,
        avgMissedProfitPercent: 3.5,
        exampleTrades: [{
          entryPrice: 100,
          exitPrice: 104,
          actualProfit: 40,
          quantity: 10,
          potentialAdditionalProfit: { optimal: 60, priceAfter1Hour: 20, oneHour: 20 },
          priceMovement: { maxPriceWithin24Hours: 110, priceAfter1Hour: 106 },
          entryAnalysis: { bestEntryPrice: 99, improvementDollar: 1, improvedPnL: { withBetterEntry: 50, improvement: 10 } }
        }]
      }
    }
  });

  test('converts money, keeps quote prices, percentages and quantities', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    const source = stored();
    LossAversionAnalyticsService.getLatestMetrics.mockResolvedValue(source);
    const res = makeRes();

    await controller.getLatestLossAversionMetrics({ user: { id: 'user-1' }, query: {} }, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    const analysis = body.data.analysis;
    expect(body.display_currency).toBe('EUR');
    expect(analysis.message).toContain('€150.00/month');
    expect(analysis.financialImpact).toEqual({ estimatedMonthlyCost: 150, missedProfitPotential: 60, unnecessaryLossExtension: 40 });
    expect(analysis.priceHistoryAnalysis.totalMissedProfit).toBe(250);
    expect(analysis.priceHistoryAnalysis.avgMissedProfitPercent).toBe(3.5);

    const trade = analysis.priceHistoryAnalysis.exampleTrades[0];
    expect(trade.actualProfit).toBe(20);
    // Missed-profit amounts convert even though they are keyed like prices
    expect(trade.potentialAdditionalProfit).toEqual({ optimal: 30, priceAfter1Hour: 10, oneHour: 10 });
    expect(trade.priceMovement.priceAfter1Hour).toBe(106);
    expect(trade.entryAnalysis.improvedPnL).toEqual({ withBetterEntry: 25, improvement: 5 });
    expect(trade.quantity).toBe(10);
    // Quote prices and per-share price differences stay in the instrument's currency
    expect(trade.entryPrice).toBe(100);
    expect(trade.exitPrice).toBe(104);
    expect(trade.priceMovement.maxPriceWithin24Hours).toBe(110);
    expect(trade.entryAnalysis.bestEntryPrice).toBe(99);
    expect(trade.entryAnalysis.improvementDollar).toBe(1);

    // The stored analysis itself is untouched
    expect(source.analysis.financialImpact.estimatedMonthlyCost).toBe(300);
  });

  test('leaves USD users unchanged', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'USD' });
    LossAversionAnalyticsService.getLatestMetrics.mockResolvedValue(stored());
    const res = makeRes();

    await controller.getLatestLossAversionMetrics({ user: { id: 'user-1' }, query: {} }, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.display_currency).toBe('USD');
    expect(body.data.analysis.financialImpact.estimatedMonthlyCost).toBe(300);
    expect(body.data.analysis.message).toContain('$300.00/month');
  });

  test('reports USD when no exchange rate is available', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    currencyConverter.getDailyCrossRate.mockRejectedValue(new Error('no rate'));
    LossAversionAnalyticsService.getLatestMetrics.mockResolvedValue(stored());
    const res = makeRes();

    await controller.getLatestLossAversionMetrics({ user: { id: 'user-1' }, query: {} }, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.display_currency).toBe('USD');
    expect(body.data.analysis.financialImpact.estimatedMonthlyCost).toBe(300);
  });
});
