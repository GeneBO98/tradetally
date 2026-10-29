jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/tradeQueries', () => ({ getAnalytics: jest.fn() }));
jest.mock('../../src/utils/finnhubClient', () => ({
  isConfigured: jest.fn(),
  getQuote: jest.fn(),
  getCompanyProfile: jest.fn(),
  getCompanyNews: jest.fn(),
  getEarningsCalendar: jest.fn()
}));
jest.mock('../../src/utils/tradeFx', () => ({
  fxUsd: (column, alias = 't') => `trade_amount_usd(${alias ? `${alias}.` : ''}${column})`,
  tradeBaseCurrency: row => String(row?.original_currency || 'USD').toUpperCase()
}));
jest.mock('../../src/utils/displayCurrency', () => ({
  resolveDisplayCurrency: jest.fn(async () => 'USD'),
  getRatesToDisplay: jest.fn(async () => ({})),
  currencySymbolFor: code => ({ USD: '$', EUR: '\u20AC' })[code] || code,
  scaleMoneyInPayload: jest.fn(payload => payload)
}));

const db = require('../../src/config/database');
const finnhub = require('../../src/utils/finnhubClient');
const displayCurrency = require('../../src/utils/displayCurrency');
const AIChatContext = require('../../src/services/aiChatContext');
const AICurrency = require('../../src/services/aiCurrency');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('extractSymbols', () => {
  test('matches cashtags and traded symbols, skipping trading abbreviations', () => {
    const known = new Set(['NOW', 'AAPL']);
    expect(AIChatContext.extractSymbols('NOW missed EPS, what is the outlook for my position vs AAPL?', known))
      .toEqual(['NOW', 'AAPL']);
    expect(AIChatContext.extractSymbols('Should I add to $msft before the FOMC and CPI?', known)).toEqual(['MSFT']);
  });

  test('ignores lowercase words and caps the number of symbols', () => {
    const known = new Set(['NOW', 'A', 'B', 'C', 'D']);
    expect(AIChatContext.extractSymbols('what should I do now', known)).toEqual([]);
    expect(AIChatContext.extractSymbols('$AA $BB $CC $DD', known)).toHaveLength(AIChatContext.MAX_FOCUS_SYMBOLS);
  });
});

describe('buildSymbolContext', () => {
  test('combines the user position with quote, earnings, and news', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    db.query.mockResolvedValue({
      rows: [{ symbol: 'NOW', side: 'long', quantity: 10, entry_price: '900', exit_price: null, entry_time: '2026-09-01T14:00:00Z', instrument_type: 'stock' }]
    });
    finnhub.getQuote.mockResolvedValue({ c: 850, d: -60, dp: -6.6, h: 880, l: 840, o: 870, pc: 910, t: 1793000000 });
    finnhub.getCompanyProfile.mockResolvedValue({ name: 'ServiceNow Inc', finnhubIndustry: 'Technology', marketCapitalization: 175000 });
    finnhub.getCompanyNews.mockResolvedValue([{ headline: 'ServiceNow misses EPS estimates', summary: '<p>Shares fall</p>', source: 'Reuters', datetime: 1793000000 }]);
    finnhub.getEarningsCalendar.mockResolvedValue([
      { symbol: 'NOW', date: '2026-10-28', hour: 'amc', quarter: 3, year: 2026, epsActual: 3.9, epsEstimate: 4.1 },
      { symbol: 'OTHER', date: '2026-10-28', epsActual: 1, epsEstimate: 1 }
    ]);

    const context = await AIChatContext.buildSymbolContext('user-1', 'NOW');
    expect(context.quote.price).toBe(850);
    expect(context.earnings).toHaveLength(1);

    const text = AIChatContext.formatSymbolContexts([context]);
    expect(text).toContain('SYMBOL FOCUS: NOW (ServiceNow Inc)');
    expect(text).toContain('approx. unrealized P&L -$500.00 (LOSS: last price $850.00 is below the $900.00 entry on a long position)');
    expect(text).toContain('Quote in USD');
    expect(text).toContain('EPS (USD) 3.9 vs est 4.1 (missed by 4.9%)');
    expect(text).toContain('ServiceNow misses EPS estimates - Shares fall');
  });

  test('drops unknown words when there are no trades and no market data', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    db.query.mockResolvedValue({ rows: [] });
    await expect(AIChatContext.buildSymbolContext('user-1', 'XYZQ')).resolves.toBeNull();

    finnhub.isConfigured.mockReturnValue(true);
    finnhub.getQuote.mockResolvedValue({ c: 0 });
    finnhub.getCompanyProfile.mockResolvedValue({});
    finnhub.getCompanyNews.mockResolvedValue([]);
    finnhub.getEarningsCalendar.mockResolvedValue([]);
    await expect(AIChatContext.buildSymbolContext('user-1', 'XYZQ')).resolves.toBeNull();
  });

  test('market data failures do not drop the user history', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: [{ symbol: 'NOW', side: 'long', quantity: 5, entry_price: '900', exit_price: '950', pnl: '250' }] });
    finnhub.getQuote.mockRejectedValue(new Error('rate limited'));
    finnhub.getCompanyProfile.mockRejectedValue(new Error('rate limited'));
    finnhub.getCompanyNews.mockRejectedValue(new Error('rate limited'));
    finnhub.getEarningsCalendar.mockRejectedValue(new Error('rate limited'));

    const context = await AIChatContext.buildSymbolContext('user-1', 'NOW');
    expect(context.trades).toHaveLength(1);
    expect(AIChatContext.formatSymbolContexts([context])).toContain('combined P&L $250.00');
  });
});

describe('display currency', () => {
  test('journal amounts convert to the display currency while quotes keep their own', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    // Stored values are USD (trade_amount_usd); EUR display at 0.9 per USD.
    db.query.mockResolvedValue({
      rows: [{ symbol: 'NOW', side: 'long', quantity: 100, entry_price: '100', exit_price: null, stop_loss: '90', instrument_type: 'stock' }]
    });
    finnhub.getQuote.mockResolvedValue({ c: 120, d: -10, dp: -7.7, h: 125, l: 118, o: 124, pc: 130 });
    finnhub.getCompanyProfile.mockResolvedValue({ name: 'ServiceNow Inc', currency: 'USD' });
    finnhub.getCompanyNews.mockResolvedValue([]);
    finnhub.getEarningsCalendar.mockResolvedValue([{ symbol: 'NOW', date: '2026-10-28', quarter: 3, year: 2026, epsActual: 1, epsEstimate: 1.03, revenueActual: 4106000000 }]);

    const currency = new AICurrency('EUR', { USD: 0.9 });
    const context = await AIChatContext.buildSymbolContext('user-1', 'NOW', currency);
    const text = AIChatContext.formatSymbolContexts([context]);

    expect(db.query.mock.calls[0][0]).toContain('trade_amount_usd(entry_price) AS entry_price');
    expect(text).toContain('long 100 @ \u20AC90.00');
    expect(text).toContain('stop \u20AC81.00');
    expect(text).toContain('Quote converted to EUR (trades in USD, native last price $120.00)');
    expect(text).toContain(': \u20AC108.00, change -\u20AC9.00 (-7.70%), day range \u20AC106.20-\u20AC112.50, previous close \u20AC117.00');
    // (108 - 90) * 100 in EUR, both sides converted before comparing
    expect(text).toContain('approx. unrealized P&L +\u20AC1800.00 (GAIN: last price \u20AC108.00 is above the \u20AC90.00 entry');
    expect(text).toContain('revenue 4.11B USD');
    expect(text).not.toContain('$90.00');
  });

  test('falls back to USD labels when no rate is available', async () => {
    displayCurrency.resolveDisplayCurrency.mockResolvedValueOnce('EUR');
    displayCurrency.getRatesToDisplay.mockResolvedValueOnce({ USD: null });
    const currency = await AICurrency.forUser('user-1');
    expect(currency.code).toBe('USD');
    expect(currency.format(-12.5)).toBe('-$12.50');
  });

  test('account context states the currency for the model', () => {
    const currency = new AICurrency('EUR', { USD: 0.9 });
    const text = AIChatContext.formatAccountContext({
      currency,
      all_time: { total_trades: 2, total_pnl: 45, win_rate: 50 },
      open_positions: [], symbol_stats: [], strategy_stats: [], recent_trades: [], journal_entries: []
    });
    expect(text).toContain('The trader works in EUR');
    expect(text).toContain('P&L \u20AC45.00');
  });
});

