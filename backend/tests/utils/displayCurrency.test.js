jest.mock('../../src/models/User', () => ({ getSettings: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  getDailyCrossRate: jest.fn(),
  getForexRate: jest.fn()
}));

const User = require('../../src/models/User');
const currencyConverter = require('../../src/utils/currencyConverter');
const {
  resolveDisplayCurrency,
  getRatesToDisplay,
  scaleMoneyFields
} = require('../../src/utils/displayCurrency');

describe('displayCurrency helpers', () => {
  beforeEach(() => {
    User.getSettings.mockReset();
    currencyConverter.getDailyCrossRate.mockReset();
  });

  test('resolveDisplayCurrency reads the user setting and uppercases it', async () => {
    User.getSettings.mockResolvedValue({ display_currency: 'eur' });
    await expect(resolveDisplayCurrency(1)).resolves.toBe('EUR');
  });

  test('resolveDisplayCurrency falls back to USD when settings fail', async () => {
    User.getSettings.mockRejectedValue(new Error('db down'));
    await expect(resolveDisplayCurrency(1)).resolves.toBe('USD');
  });

  test('getRatesToDisplay returns 1 for the display currency and null when the rate is unavailable', async () => {
    currencyConverter.getDailyCrossRate
      .mockImplementation((from) => (from === 'GBP' ? Promise.reject(new Error('offline')) : Promise.resolve(0.9)));

    const rates = await getRatesToDisplay(['USD', 'EUR', 'GBP', 'EUR'], 'USD');
    expect(rates.USD).toBe(1);
    expect(rates.EUR).toBe(0.9);
    expect(rates.GBP).toBeNull();
  });

  test('scaleMoneyFields multiplies only finite numbers on the listed keys', () => {
    const row = {
      totalAssets: 1000,
      totalDebt: null,
      sharesOutstanding: 50,
      year: '2025',
      ratio: Number.NaN
    };
    const out = scaleMoneyFields(row, 0.5, ['totalAssets', 'totalDebt', 'sharesOutstanding', 'ratio'], { copy: true });
    expect(out.totalAssets).toBe(500);
    expect(out.totalDebt).toBeNull();
    expect(out.sharesOutstanding).toBe(25);
    expect(out.year).toBe('2025');
    expect(Number.isNaN(out.ratio)).toBe(true);
    expect(row.totalAssets).toBe(1000); // copy mode leaves the source untouched
  });

  test('scaleMoneyFields is a no-op for null/1 rates', () => {
    const row = { revenue: 10 };
    expect(scaleMoneyFields(row, null, ['revenue'])).toBe(row);
    expect(scaleMoneyFields(row, 1, ['revenue']).revenue).toBe(10);
  });
});
