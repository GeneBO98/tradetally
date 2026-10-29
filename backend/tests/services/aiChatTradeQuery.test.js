jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/tradeQueries', () => ({
  getAnalytics: jest.fn(),
  findByUser: jest.fn()
}));
jest.mock('../../src/utils/aiProvider', () => ({
  generateResponse: jest.fn()
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const AIProvider = require('../../src/utils/aiProvider');
const AIChatTradeQuery = require('../../src/services/aiChatTradeQuery');
const AICurrency = require('../../src/services/aiCurrency');

// Thursday 2026-10-29
const TODAY = '2026-10-29';
const known = {
  symbols: new Set(['AAPL', 'AMD', 'NOW']),
  strategies: ['swing', 'mean_reversion', 'Opening Range Breakout'],
  setups: ['ORB', 'pullback'],
  tags: ['earnings', 'fomo'],
  timezone: 'UTC'
};
const parse = message => AIChatTradeQuery.parseDeterministic(message, { today: TODAY, known });

describe('AIChatTradeQuery.parseDateRange', () => {
  const range = message => AIChatTradeQuery.parseDateRange(message, TODAY);

  test.each([
    ['how did I do today', { startDate: '2026-10-29', endDate: '2026-10-29' }],
    ['yesterday', { startDate: '2026-10-28', endDate: '2026-10-28' }],
    ['this week', { startDate: '2026-10-26', endDate: '2026-10-29' }],
    ['last week', { startDate: '2026-10-19', endDate: '2026-10-25' }],
    ['this month', { startDate: '2026-10-01', endDate: '2026-10-29' }],
    ['last month', { startDate: '2026-09-01', endDate: '2026-09-30' }],
    ['ytd', { startDate: '2026-01-01', endDate: '2026-10-29' }],
    ['last year', { startDate: '2025-01-01', endDate: '2025-12-31' }],
    ['last 7 days', { startDate: '2026-10-23', endDate: '2026-10-29' }],
    ['past 2 weeks', { startDate: '2026-10-16', endDate: '2026-10-29' }],
    ['last few days', { startDate: '2026-10-27', endDate: '2026-10-29' }],
    ['in September', { startDate: '2026-09-01', endDate: '2026-09-30' }],
    ['sept 2025', { startDate: '2025-09-01', endDate: '2025-09-30' }],
    ['in December', { startDate: '2025-12-01', endDate: '2025-12-31' }],
    ['Q3', { startDate: '2026-07-01', endDate: '2026-09-30' }],
    ['q1 2025', { startDate: '2025-01-01', endDate: '2025-03-31' }],
    ['last quarter', { startDate: '2026-07-01', endDate: '2026-09-30' }],
    ['since March 5', { startDate: '2026-03-05', endDate: null }],
    ['since november', { startDate: '2025-11-01', endDate: null }],
    ['during 2025', { startDate: '2025-01-01', endDate: '2025-12-31' }]
  ])('%s', (message, expected) => {
    expect(range(message)).toEqual(expected);
  });

  test('bare "may" is a verb, "in May" is a month', () => {
    expect(range('I may need to size down')).toBeNull();
    expect(range('my trades in May')).toEqual({ startDate: '2026-05-01', endDate: '2026-05-31' });
  });

  test('returns null without a time reference', () => {
    expect(range('what is my win rate on AAPL')).toBeNull();
  });
});

describe('AIChatTradeQuery.parseDeterministic', () => {
  test('combines period, outcome, symbol, and strategy', () => {
    const result = parse('show me my losing AAPL swing trades last month');
    expect(result.filters).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      pnlType: 'loss',
      strategies: ['swing'],
      symbol: 'AAPL',
      symbolExact: true
    });
    expect(result.description).toBe('Sep 1, 2026 to Sep 30, 2026 · losers · strategy: swing · AAPL');
  });

  test('recognizes side, instrument, grades, tags, setups and weekdays', () => {
    const result = parse('How do my shorts on options do on Mondays? Especially grade D trades tagged #fomo with the ORB setup');
    expect(result.filters).toMatchObject({
      side: 'short',
      instrumentTypes: ['option'],
      qualityGrades: ['D'],
      daysOfWeek: [1],
      tags: ['fomo'],
      setups: ['ORB']
    });
  });

  test('matches multi-word strategies case-insensitively', () => {
    const result = parse('my opening range breakout winners this week');
    expect(result.filters.strategies).toEqual(['Opening Range Breakout']);
    expect(result.filters.pnlType).toBe('profit');
  });

  test('open positions become a status filter', () => {
    expect(parse('what are my open positions right now').filters).toEqual({ status: 'open' });
  });

  test('a symbol alone is not a trade query (symbol focus handles it)', () => {
    expect(parse('what do you think of AAPL')).toBeNull();
    expect(parse('hello there')).toBeNull();
  });

  test('ignores unknown tickers unless written as a cashtag', () => {
    expect(parse('my losers on XYZ this week').filters.symbol).toBeUndefined();
    expect(parse('my losers on $XYZ this week').filters.symbol).toBe('XYZ');
  });
});

describe('AIChatTradeQuery.parseExtraction', () => {
  test('validates model output against the trader vocabulary', () => {
    const raw = '```json\n{"is_trade_query":true,"start_date":"2026-09-01","end_date":"2026-09-30","symbols":["aapl","ZZZZ"],"strategies":["Swing","made-up"],"tags":["Earnings"],"side":"long","outcome":"loss","instrument_types":["option","bond"],"quality_grades":["b","z"],"status":"closed","days_of_week":[1,9]}\n```';
    const result = AIChatTradeQuery.parseExtraction(raw, { known });
    expect(result.filters).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      symbol: 'AAPL',
      symbolExact: true,
      strategies: ['swing'],
      tags: ['earnings'],
      side: 'long',
      pnlType: 'loss',
      instrumentTypes: ['option'],
      qualityGrades: ['B'],
      status: 'closed',
      daysOfWeek: [1]
    });
  });

  test('rejects non-queries and garbage', () => {
    expect(AIChatTradeQuery.parseExtraction('{"is_trade_query":false}', { known })).toBeNull();
    expect(AIChatTradeQuery.parseExtraction('not json', { known })).toBeNull();
    expect(AIChatTradeQuery.parseExtraction('{"is_trade_query":true,"symbols":["ZZZZ"]}', { known })).toBeNull();
  });
});

describe('AIChatTradeQuery.resolveFilters', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses the parser alone when the classifier model is disabled', async () => {
    const result = await AIChatTradeQuery.resolveFilters('my losers last week', { classifier: { enabled: false } }, known);
    expect(result.source).toBe('parser');
    expect(AIProvider.generateResponse).not.toHaveBeenCalled();
  });

  test('merges model output over the parser when the classifier is enabled', async () => {
    AIProvider.generateResponse.mockResolvedValueOnce('{"is_trade_query":true,"start_date":"2026-10-01","end_date":"2026-10-15","tags":["earnings"]}');
    const result = await AIChatTradeQuery.resolveFilters('my losers in the first half of october', { provider: 'openai', apiKey: 'k', modelName: 'gpt', classifier: { enabled: true } }, known);
    expect(result.source).toBe('merged');
    expect(result.filters).toMatchObject({ pnlType: 'loss', startDate: '2026-10-01', endDate: '2026-10-15', tags: ['earnings'] });
    const [prompt, settings, options] = AIProvider.generateResponse.mock.calls[0];
    expect(prompt).toContain('Today is 2026-10-29');
    expect(prompt).toContain('strategies: swing, mean_reversion, Opening Range Breakout');
    expect(settings.provider).toBe('openai');
    expect(options).toEqual({ maxTokens: 220, temperature: 0 });
  });

  test('model failures fall back to the parser', async () => {
    AIProvider.generateResponse.mockRejectedValueOnce(new Error('down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await AIChatTradeQuery.resolveFilters('my winners yesterday', { classifier: { enabled: true } }, known);
    expect(result.source).toBe('parser');
    warn.mockRestore();
  });
});

describe('AIChatTradeQuery.buildSection', () => {
  beforeEach(() => jest.clearAllMocks());

  test('runs the filter through TradeQueries and renders totals plus trades', async () => {
    TradeQueries.getAnalytics.mockResolvedValueOnce({ summary: { totalTrades: 3, totalPnL: -150, winRate: 33.3, profitFactor: 0.5, avgWin: 100, avgLoss: -125, bestTrade: 100, worstTrade: -200 } });
    TradeQueries.findByUser.mockResolvedValueOnce([
      { symbol: 'AAPL', side: 'long', quantity: '10', entry_price: '100', exit_price: '90', exit_time: '2026-09-10T15:00:00Z', pnl: '-100', r_value: '-1', strategy: 'swing', setup: 'ORB', tags: ['earnings'], quality_grade: 'D', notes: '<p>Chased it</p>', original_currency: 'USD' },
      { symbol: 'AAPL', side: 'long', quantity: '5', entry_price: '110', exit_price: null, exit_time: null, entry_time: '2026-09-20T15:00:00Z', pnl: null, original_currency: 'USD' }
    ]);
    const currency = new AICurrency('USD', { USD: 1 });
    currency.ensureRowRates = jest.fn(async () => {});

    const section = await AIChatTradeQuery.buildSection('user-1', {
      filters: { startDate: '2026-09-01', endDate: '2026-09-30', symbol: 'AAPL', symbolExact: true, pnlType: 'loss' },
      description: 'Sep 2026 · losers · AAPL',
      source: 'parser'
    }, currency);

    expect(TradeQueries.findByUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ symbol: 'AAPL', symbolExact: true, pnlType: 'loss', limit: 20 }));
    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', expect.not.objectContaining({ limit: 20 }));
    expect(section.trade_count).toBe(3);
    expect(section.text).toContain('TRADES MATCHING THE QUESTION (interpreted as: Sep 2026 · losers · AAPL; 3 trades):');
    expect(section.text).toContain('Totals: P&L -$150.00, win rate 33.3%, profit factor 0.50');
    expect(section.text).toContain('Most recent 2 of 3:');
    expect(section.text).toContain('- 2026-09-10 AAPL long 10 @ $100.00 -> $90.00, P&L -$100.00 (-1.00R, swing, setup: ORB, tags: earnings, grade D, notes: Chased it)');
    expect(section.text).toContain('- 2026-09-20 AAPL long 5 @ $110.00 -> open');
    expect(section.text).toContain('ask them to clarify');
  });

  test('open-position questions count the listed positions, not closed-trade analytics', async () => {
    TradeQueries.getAnalytics.mockResolvedValueOnce({ summary: { totalTrades: 0, profitFactor: 999.99 } });
    TradeQueries.findByUser.mockResolvedValueOnce([
      { symbol: 'CURR', side: 'long', quantity: '2000', entry_price: '2.05', exit_price: null, entry_time: '2025-12-19T15:00:00Z', original_currency: 'USD' }
    ]);
    const currency = new AICurrency('USD', { USD: 1 });
    currency.ensureRowRates = jest.fn(async () => {});

    const section = await AIChatTradeQuery.buildSection('user-1', { filters: { status: 'open' }, description: 'open positions', source: 'parser' }, currency);
    expect(section.trade_count).toBe(1);
    expect(section.text).toContain('(interpreted as: open positions; 1 trade):');
    expect(section.text).not.toContain('Totals:');
    expect(section.text).toContain('CURR long 2000 @ $2.05 -> open');
  });

  test('build never throws', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    TradeQueries.findByUser.mockRejectedValueOnce(new Error('db down'));
    await expect(AIChatTradeQuery.build('user-1', 'my losers last week', {}, new AICurrency('USD', { USD: 1 }))).resolves.toBeNull();
    warn.mockRestore();
  });
});
