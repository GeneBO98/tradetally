jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ getDailyCrossRate: jest.fn() }));

const User = require('../../src/models/User');
const converter = require('../../src/utils/currencyConverter');
const { convertForDisplay, scaleMoneyInPayload } = require('../../src/utils/displayCurrency');
const { attachNativeTradePrices } = require('../../src/utils/tradePriceDisplay');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

describe('native quote prices with reporting-currency P&L (issue 418)', () => {
  test.each(contracts.trade_price_currency_cases)('$id', async (fixture) => {
    User.getSettings.mockResolvedValue({ display_currency: fixture.display_currency });
    converter.getDailyCrossRate.mockImplementation(async (from) => {
      if (fixture.rates[from]) return fixture.rates[from];
      throw new Error('FX unavailable');
    });
    const payload = { trades: [fixture.trade] };
    const before = JSON.stringify(payload);
    const out = await convertForDisplay({ user: { id: 'user' } }, payload, { rowCurrency: true });
    const row = out.trades[0];
    const expected = fixture.expected;
    expect(row.entry_price).toBeCloseTo(expected.entry_price);
    if (expected.exit_price === null) expect(row.exit_price).toBeNull();
    else expect(row.exit_price).toBeCloseTo(expected.exit_price);
    expect(row.pnl).toBeCloseTo(expected.pnl);
    expect(row.commission).toBeCloseTo(expected.commission);
    expect(row.quantity).toBe(fixture.trade.quantity);
    expect(row.effective_currency).toBe(expected.effective_currency);
    expect(row.price_currency).toBe(expected.price_currency);
    expect(row.native_prices.entry_price).toBe(expected.native_entry_price);
    expect(row.native_prices.exit_price ?? null).toBe(expected.native_exit_price);
    const execution = row.executions[0];
    const native_execution = row.native_prices.executions[0];
    expect(native_execution.entry_price ?? native_execution.price).toBeCloseTo(expected.native_entry_price);
    expect(execution.realized_pnl).toBeCloseTo(expected.pnl);
    expect(execution.commission).toBeCloseTo(expected.commission);
    expect(JSON.stringify(payload)).toBe(before);
  });

  test('raw edit responses have no display snapshots or converted values', async () => {
    const payload = { trade: structuredClone(contracts.trade_price_currency_cases[0].trade) };
    const out = await convertForDisplay({ user: { id: 'user' } }, payload, { raw: true, rowCurrency: true });
    expect(out.trade.entry_price).toBe(2700);
    expect(out.trade.native_prices).toBeUndefined();
  });

  test('preserves precise prices, stops and targets before string scaling rounds them', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'EUR' });
    converter.getDailyCrossRate.mockResolvedValue(0.8);
    const out = await convertForDisplay({ user: { id: 'user' } }, { trade: {
      original_currency: 'USD', entry_price: '1.123457', exit_price: null,
      stop_loss: '1.100001', take_profit_targets: [{ price: '1.234567', shares: 2 }]
    } }, { rowCurrency: true });
    expect(out.trade.native_prices.entry_price).toBe(1.123457);
    expect(out.trade.native_prices.stop_loss).toBe(1.100001);
    expect(out.trade.native_prices.take_profit_targets[0].price).toBe(1.234567);
    const prices = structuredClone(out.trade.native_prices);
    scaleMoneyInPayload(out, 2);
    expect(out.trade.native_prices).toEqual(prices);
  });

  test('an import without a recoverable historical rate keeps an honest stored-currency label', () => {
    const row = { original_currency: 'JPY', original_pnl_currency: 20, entry_price: 1, exit_price: 2 };
    attachNativeTradePrices(row);
    expect(row.price_currency).toBe('USD');
    expect(row.native_prices.entry_price).toBe(1);
  });

  test('edited import prices take precedence over stale original-price metadata', () => {
    const row = {
      original_currency: 'EUR', exchange_rate: 1.2,
      original_entry_price_currency: 90, entry_price: 120
    };
    attachNativeTradePrices(row);
    expect(row.price_currency).toBe('EUR');
    expect(row.native_prices.entry_price).toBe(100);
  });

  test('recovers imported fills but preserves strikes and target arrays that were already native', () => {
    const row = {
      original_currency: 'EUR', exchange_rate: 1.2, original_entry_price_currency: 100,
      entry_price: 120, stop_loss: 108, take_profit: 132, strike_price: 100,
      take_profit_targets: [{ price: 110 }],
      executions: [{ entryPrice: 120, stopLoss: 90, takeProfit: 110, takeProfitTargets: [{ price: 110 }] }]
    };
    attachNativeTradePrices(row);
    expect(row.native_prices).toMatchObject({
      entry_price: 100, stop_loss: 90, take_profit: 110, strike_price: 100,
      take_profit_targets: [{ price: 110 }],
      executions: [{ entry_price: 100, stop_loss: 90, take_profit: 110, take_profit_targets: [{ price: 110 }] }]
    });
  });
});
