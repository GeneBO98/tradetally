jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
// Emulates TradeQueries._buildWhereClause: REPORTING_SCOPE stands in for the
// include_in_reports exclusion so tests can assert every raw query uses it.
jest.mock('../../src/services/tradeQueries', () => ({
  getAnalytics: jest.fn(),
  _buildWhereClause: jest.fn(async (userId, filters = {}) => {
    const values = [userId];
    let whereClause = 'WHERE t.user_id = $1 AND REPORTING_SCOPE';
    if (filters.accounts && filters.accounts.length) {
      whereClause += ` AND t.account_identifier IN (${filters.accounts.map((_, i) => `$${i + 2}`).join(',')})`;
      values.push(...filters.accounts);
    }
    return { whereClause, values, paramCount: values.length + 1 };
  })
}));
jest.mock('../../src/utils/finnhubClient', () => ({
  isConfigured: jest.fn(),
  getQuote: jest.fn(),
  getBatchQuotes: jest.fn(),
  getCompanyProfile: jest.fn(),
  getCompanyNews: jest.fn(),
  getEarningsCalendar: jest.fn()
}));
jest.mock('../../src/utils/tradeFx', () => ({
  fxUsd: (column, alias = 't') => `trade_amount_usd(${alias ? `${alias}.` : ''}${column})`,
  tradeBaseCurrency: row => String(row?.original_currency || 'USD').toUpperCase()
}));
jest.mock('../../src/services/portfolioService', () => ({
  _getDailySeries: jest.fn(async () => [])
}));
jest.mock('../../src/utils/positionGrouping', () => ({
  POSITION_GROUP_KEY: 'group_key_sql',
  isPositionGroupingEnabled: jest.fn(async () => false)
}));
jest.mock('../../src/utils/displayCurrency', () => ({
  resolveDisplayCurrency: jest.fn(async () => 'USD'),
  getRatesToDisplay: jest.fn(async () => ({})),
  currencySymbolFor: code => ({ USD: '$', EUR: '\u20AC' })[code] || code,
  scaleMoneyInPayload: jest.fn(payload => payload)
}));

const db = require('../../src/config/database');
const TradeQueries = require('../../src/services/tradeQueries');
const finnhub = require('../../src/utils/finnhubClient');
const displayCurrency = require('../../src/utils/displayCurrency');
const positionGrouping = require('../../src/utils/positionGrouping');
const AIChatContext = require('../../src/services/aiChatContext');
const AICurrency = require('../../src/services/aiCurrency');
const AITraderContext = require('../../src/services/aiTraderContext');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// Route db.query by SQL pattern; unmatched queries return no rows.
const routeDb = handlers => db.query.mockImplementation(async (sql, params) => {
  for (const [pattern, result] of handlers) {
    if (pattern.test(sql)) return typeof result === 'function' ? result(sql, params) : result;
  }
  return { rows: [] };
});
const callsMatching = pattern => db.query.mock.calls.filter(([sql]) => pattern.test(sql));

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
    routeDb([[/UNION ALL/, {
      rows: [{ symbol: 'NOW', side: 'long', quantity: 10, entry_price: '900', exit_price: null, entry_time: '2026-09-01T14:00:00Z', instrument_type: 'stock' }]
    }]]);
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
    routeDb([
      [/UNION ALL/, { rows: [{ symbol: 'NOW', side: 'long', quantity: 5, entry_price: '900', exit_price: '950', pnl: '250' }] }],
      [/WITH closed/, { rows: [{ trades: 12, total_pnl: '1250', win_rate: '50', avg_r: null, r_trades: 0, first_traded: '2025-01-02T15:00:00Z', last_traded: '2026-09-01T15:00:00Z' }] }]
    ]);
    finnhub.getQuote.mockRejectedValue(new Error('rate limited'));
    finnhub.getCompanyProfile.mockRejectedValue(new Error('rate limited'));
    finnhub.getCompanyNews.mockRejectedValue(new Error('rate limited'));
    finnhub.getEarningsCalendar.mockRejectedValue(new Error('rate limited'));

    const context = await AIChatContext.buildSymbolContext('user-1', 'NOW');
    expect(context.trades).toHaveLength(1);
    const text = AIChatContext.formatSymbolContexts([context]);
    // Totals cover every closed trade on the symbol, not the shown sample.
    expect(text).toContain("User's closed trades in NOW (ALL closed trades in scope): 12 trades, total P&L $1250.00, win rate 50.00%, first traded 2025-01-02");
    expect(text).toContain('Most recent 1 closed trades in NOW:');
  });
});

describe('display currency', () => {
  test('journal amounts convert to the display currency while quotes keep their own', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    // Stored values are USD (trade_amount_usd); EUR display at 0.9 per USD.
    routeDb([[/UNION ALL/, {
      rows: [{ symbol: 'NOW', side: 'long', quantity: 100, entry_price: '100', exit_price: null, stop_loss: '90', instrument_type: 'stock' }]
    }]]);
    finnhub.getQuote.mockResolvedValue({ c: 120, d: -10, dp: -7.7, h: 125, l: 118, o: 124, pc: 130 });
    finnhub.getCompanyProfile.mockResolvedValue({ name: 'ServiceNow Inc', currency: 'USD' });
    finnhub.getCompanyNews.mockResolvedValue([]);
    finnhub.getEarningsCalendar.mockResolvedValue([{ symbol: 'NOW', date: '2026-10-28', quarter: 3, year: 2026, epsActual: 1, epsEstimate: 1.03, revenueActual: 4106000000 }]);

    const currency = new AICurrency('EUR', { USD: 0.9 });
    const context = await AIChatContext.buildSymbolContext('user-1', 'NOW', currency);
    const text = AIChatContext.formatSymbolContexts([context]);

    expect(callsMatching(/UNION ALL/)[0][0]).toContain('trade_amount_usd(entry_price) AS entry_price');
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


describe('best / worst trade details', () => {
  const usdCurrency = () => {
    const currency = new AICurrency('USD', { USD: 1 });
    currency.ensureRowRates = jest.fn(async () => {});
    return currency;
  };

  const bestRow = {
    anchor_id: 'trade-best', id: 'trade-best', symbol: 'NVDA', side: 'long', quantity: '100',
    entry_price: '120', exit_price: '135.2', entry_time: '2026-03-04T14:41:00Z', exit_time: '2026-03-04T16:02:00Z',
    pnl: '1519.85', pnl_percent: '12.67', commission: '1.5', fees: '0.6', r_value: '2.53',
    stop_loss: '118.5', take_profit: null, mae: '-150', mfe: '1700', strategy: 'momentum', setup: 'bull flag',
    tags: ['earnings'], notes: '<p>Waited for the <b>flag</b> to break</p>', original_currency: 'USD', confidence: 8,
    executions: [
      { action: 'buy', quantity: 100, price: 120, datetime: '2026-03-04T14:41:00Z' },
      { action: 'sell', quantity: 100, price: 135.2, datetime: '2026-03-04T16:02:00Z' }
    ]
  };

  test('loads one row per pointer and merges a trade that is best in two windows', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM users/.test(sql)) return { rows: [{ timezone: 'America/New_York' }] };
      if (/FROM diary_entries/.test(sql)) return { rows: [{ entry_date: '2026-03-04', title: 'NVDA flag', content: 'Patient entry', linked_trades: ['trade-best'] }] };
      return { rows: [bestRow] };
    });

    const extremes = await AIChatContext.buildExtremeTrades('user-1', [
      { label: 'All-time best trade', ref: { id: 'trade-best' }, stat: 1519.85 },
      { label: 'Last 30 days best trade', ref: { id: 'trade-best' }, stat: 1519.85 },
      { label: 'All-time worst trade', ref: null, stat: 0 }
    ], usdCurrency());

    const tradeCall = db.query.mock.calls.find(([sql]) => /FROM trades c/.test(sql));
    expect(tradeCall[1]).toEqual(['user-1', ['trade-best']]);
    expect(extremes.timezone).toBe('America/New_York');
    expect(extremes.trades).toHaveLength(1);
    expect(extremes.trades[0].labels).toEqual(['All-time best trade', 'Last 30 days best trade']);
    expect(extremes.trades[0].journal).toHaveLength(1);
  });

  test('whole-trade mode loads every leg of the position', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValueOnce(true);
    db.query.mockImplementation(async sql => {
      if (/FROM users/.test(sql)) return { rows: [{ timezone: 'UTC' }] };
      if (/FROM diary_entries/.test(sql)) return { rows: [] };
      return { rows: [{ ...bestRow, pnl: '100' }, { ...bestRow, id: 'leg-2', pnl: '-40' }] };
    });

    const extremes = await AIChatContext.buildExtremeTrades('user-1', [{ label: 'All-time best trade', ref: { id: 'trade-best' }, stat: 60 }], usdCurrency());
    const tradeCall = db.query.mock.calls.find(([sql]) => /WITH anchors/.test(sql));
    expect(tradeCall[0]).toContain('group_key_sql');
    expect(extremes.trades[0].legs).toHaveLength(2);

    extremes.trades[0].legs[0] = { ...extremes.trades[0].legs[0], strategy: 'day_trading', manual_override: false, classification_method: 'basic_import' };
    const text = AIChatContext.formatExtremeTrades(extremes, usdCurrency(), 'DETAIL');
    expect(text).toContain('strategy day_trading (auto-classified from hold time, not chosen by the trader)');
    expect(text).toContain('Multi-leg position, 2 legs, combined P&L $60.00');
    expect(text).toContain('Leg 2:');
  });

  test('account context shows setup, risk, fills, notes, and blank fields as not recorded', () => {
    const currency = usdCurrency();
    const text = AIChatContext.formatAccountContext({
      currency,
      all_time: { total_trades: 2, total_pnl: 1000, best_trade: 1519.85, worst_trade: -200 },
      extreme_trades: {
        timezone: 'America/New_York',
        trades: [
          { labels: ['All-time best trade'], stat: 1519.85, legs: [bestRow], journal: [{ entry_date: '2026-03-04', title: 'NVDA flag', content: 'Patient entry' }] },
          {
            labels: ['All-time worst trade'], stat: -200, journal: [],
            legs: [{
              id: 'trade-worst', symbol: 'AMD', side: 'short', quantity: '10', entry_price: '0.5', exit_price: '0.7',
              entry_time: '2026-02-01T15:00:00Z', exit_time: '2026-02-01T15:30:00Z', pnl: '-200', tags: [],
              notes: 'Round trip: 1 executions', confidence: 5,
              executions: [{ side: 'short', quantity: 10, entryPrice: 0.5, exitPrice: 0.7, entryTime: '2026-02-01T15:00:00Z', exitTime: '2026-02-01T15:30:00Z', pnl: -200 }]
            }]
          }
        ]
      },
      open_positions: [],
      symbol_stats: [],
      strategy_stats: [],
      recent_trades: [{ symbol: 'NVDA', side: 'long', quantity: 100, entry_price: 120, exit_price: 135.2, exit_time: '2026-03-04T16:02:00Z', pnl: 1519.85, setup: 'bull flag', notes: 'Waited for the flag' }],
      journal_entries: []
    });

    expect(text).toContain('TRADES BEHIND THE BEST / WORST FIGURES ABOVE (times in America/New_York;');
    expect(text).toContain('- All-time best trade (+$1519.85):');
    expect(text).toContain('NVDA stock long 100 @ $120.00 -> $135.20; entry 2026-03-04 09:41, exit 2026-03-04 11:02 (held 1h 21m); P&L $1519.85 (12.67%); commission+fees $2.10');
    expect(text).toContain('Plan: strategy momentum; setup bull flag; tags earnings; confidence 8/10');
    expect(text).toContain('Risk: stop $118.50; target not recorded; 2.53R; MAE -$150.00; MFE $1700.00');
    expect(text).toContain('Fills (2): 2026-03-04 09:41 buy 100 @ $120.00; 2026-03-04 11:02 sell 100 @ $135.20');
    expect(text).toContain('Notes: Waited for the flag to break');
    expect(text).toContain('Linked journal entry 2026-03-04: "NVDA flag" | Patient entry');
    expect(text).toContain('- All-time worst trade (-$200.00):');
    expect(text).toContain('Plan: strategy not recorded; setup not recorded; tags none\n');
    expect(text).toContain('Risk: stop not recorded; target not recorded');
    expect(text).toContain('short 10 @ $0.50 (2026-02-01 10:00) -> $0.70 (2026-02-01 10:30), P&L -$200.00');
    expect(text).toContain('Notes: none recorded');
    expect(text).toContain('P&L $1519.85, setup: bull flag notes: Waited for the flag');
    expect(text).not.toContain('Round trip');
  });
});

describe('account scope and excluded accounts', () => {
  const analytics = { summary: { totalTrades: 3, totalPnL: 30 } };

  const routeAccount = (extra = []) => routeDb([
    ...extra,
    [/FROM user_accounts/, { rows: [
      { account_identifier: 'acct-1', account_name: 'Roth IRA', include_in_reports: true },
      { account_identifier: 'acct-old', account_name: 'Closed margin', include_in_reports: false }
    ] }],
    [/FROM users/, { rows: [{ timezone: 'America/Chicago' }] }]
  ]);

  test('every raw trades query uses the analytics WHERE clause and the account scope', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    TradeQueries.getAnalytics.mockResolvedValue(analytics);
    // The shared dossier is built by AITraderContext (journal-wide by design).
    jest.spyOn(AITraderContext, 'build').mockResolvedValue(null);
    routeAccount();

    const context = await AIChatContext.buildAccountContext('user-1', new AICurrency('USD', { USD: 1 }), { accounts: ['acct-1'], timezone: 'UTC' });

    expect(TradeQueries._buildWhereClause).toHaveBeenCalledWith('user-1', { accounts: ['acct-1'] });
    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', { accounts: ['acct-1'] });
    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', expect.objectContaining({ accounts: ['acct-1'], startDate: expect.any(String) }));

    const tradeQueries = callsMatching(/FROM trades/);
    // open positions, symbol stats, breakdowns, tags, recent trades
    expect(tradeQueries.length).toBeGreaterThanOrEqual(5);
    tradeQueries.forEach(([sql, params]) => {
      expect(sql).toContain('REPORTING_SCOPE');
      expect(sql).toContain('t.account_identifier IN ($2)');
      expect(params.slice(0, 2)).toEqual(['user-1', 'acct-1']);
    });
    // closed-trade aggregates match the headline population
    callsMatching(/WITH closed/).forEach(([sql]) => expect(sql).toContain('AND exit_price IS NOT NULL AND pnl IS NOT NULL'));

    const text = AIChatContext.formatAccountContext(context);
    expect(text).toContain('ACCOUNT SCOPE: account acct-1 (Roth IRA) only.');
    expect(text).toContain('the trader dossier above is journal-wide');
    expect(text.indexOf('ACCOUNT SCOPE')).toBeLessThan(text.indexOf('PERFORMANCE OVERVIEW'));
    expect(text).toContain('EXCLUDED ACCOUNTS: acct-old (Closed margin) is set to be left out of reports by the trader; no figure from here on includes it.');
  });

  test('no scope means no account filter and no scope line', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    TradeQueries.getAnalytics.mockResolvedValue(analytics);
    routeDb([]);

    const context = await AIChatContext.buildAccountContext('user-1', new AICurrency('USD', { USD: 1 }));
    expect(TradeQueries._buildWhereClause).toHaveBeenCalledWith('user-1', {});
    expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', {});
    expect(AIChatContext.formatAccountContext(context)).not.toContain('ACCOUNT SCOPE');
  });

  test('unsorted scope is labeled', () => {
    expect(AIChatContext.scopeLabel(['__unsorted__'])).toBe('trades with no account assigned only');
    expect(AIChatContext.scopeLabel(['a', 'b'])).toBe('accounts a, b only');
    expect(AIChatContext.scopeLabel(null)).toBeNull();
  });

  test('symbol focus is scoped, known-symbol vocabulary is not', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    routeDb([[/UNION ALL/, { rows: [{ symbol: 'NOW', side: 'long', quantity: 1, entry_price: '1', exit_price: '2', pnl: '1' }] }]]);

    const contexts = await AIChatContext.buildSymbolContexts('user-1', ['now'], new AICurrency('USD', { USD: 1 }), { accounts: ['acct-1'], timezone: 'UTC' });
    expect(contexts).toHaveLength(1);
    const [sql, params] = callsMatching(/UNION ALL/)[0];
    expect(sql).toContain('REPORTING_SCOPE');
    expect(params).toEqual(['user-1', 'acct-1', 'NOW']);
    expect(sql).toContain('UPPER(symbol) = $3');
    callsMatching(/diary_entries/).forEach(([journalSql]) => expect(journalSql).toContain('REPORTING_SCOPE'));
    expect(AIChatContext.formatSymbolContexts(contexts)).toContain('SYMBOL FOCUS: NOW [account acct-1 only]');

    db.query.mockClear();
    db.query.mockResolvedValue({ rows: [] });
    await AIChatContext.getKnownSymbols('user-1');
    expect(db.query.mock.calls[0][0]).not.toContain('REPORTING_SCOPE');
  });
});

describe('timezone', () => {
  test('todayIn uses the zone and falls back to UTC', () => {
    const now = new Date('2026-11-18T03:00:00Z');
    expect(AIChatContext.todayIn('America/New_York', now)).toBe('2026-11-17');
    expect(AIChatContext.todayIn('UTC', now)).toBe('2026-11-18');
    expect(AIChatContext.todayIn('Not/AZone', now)).toBe('2026-11-18');
    expect(AIChatContext.todayIn(undefined, now)).toBe('2026-11-18');
  });

  test('30-day window starts from the local date; user timezone is the fallback', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-18T03:00:00Z'), doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      finnhub.isConfigured.mockReturnValue(false);
      TradeQueries.getAnalytics.mockResolvedValue({ summary: {} });
      routeDb([[/FROM users/, { rows: [{ timezone: 'America/New_York' }] }]]);

      await AIChatContext.buildAccountContext('user-1', new AICurrency('USD', { USD: 1 }));
      expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', { startDate: '2026-10-18' });
      const [breakdownSql, breakdownParams] = callsMatching(/GROUPING SETS/)[0];
      expect(breakdownSql).toContain('AT TIME ZONE $2');
      expect(breakdownParams).toEqual(['user-1', 'America/New_York']);

      TradeQueries.getAnalytics.mockClear();
      await AIChatContext.buildAccountContext('user-1', new AICurrency('USD', { USD: 1 }), { timezone: 'Asia/Tokyo' });
      expect(TradeQueries.getAnalytics).toHaveBeenCalledWith('user-1', { startDate: '2026-10-19' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('performance breakdowns', () => {
  const row = (dimension, value, trades, extra = {}) => ({ dimension, value, trades, total_pnl: trades * 10, win_rate: 50, avg_r: null, r_trades: 0, ...extra });

  test('formats each dimension, skips single-group ones, flags small samples', () => {
    const currency = new AICurrency('USD', { USD: 1 });
    const hours = Array.from({ length: 10 }, (_, i) => row('entry_hour', String(i + 9), 20 - i));
    const text = AIChatContext.formatBreakdowns({
      timezone: 'America/New_York',
      rows: [
        row('total', null, 120, { tagged_trades: 30 }),
        row('setup', 'breakout', 40, { avg_r: 0.5, r_trades: 30 }),
        row('setup', 'vwap reclaim', 3),
        row('setup', null, 77),
        ...hours,
        row('weekday', '5', 50), row('weekday', '1', 70),
        row('hold_bucket', '2', 60), row('hold_bucket', '1', 60),
        row('side', 'long', 120),
        row('instrument_type', 'stock', 100), row('instrument_type', 'option', 20)
      ],
      tags: [row('tag', 'fomo', 12, { total_pnl: -300 }), row('tag', 'a+', 25)]
    }, currency).join('\n');

    expect(text).toContain('PERFORMANCE BREAKDOWNS (120 closed trades in scope;');
    expect(text).toContain('- By setup (43 of 120 have one): breakout: 40 trades, P&L $400.00, win 50.0%, avg 0.50R (30 with R) | vwap reclaim: 3 trades, P&L $30.00, win 50.0% [small sample]');
    expect(text).toContain('- By tag (30 of 120 tagged; a trade with several tags counts under each): a+: 25 trades');
    expect(text).toContain('fomo: 12 trades, P&L -$300.00');
    // capped to 8 busiest hours, then shown in clock order
    expect(text).toContain('- By entry hour (America/New_York) (top 8 of 10 by trade count): 09:00-09:59: 20 trades');
    expect(text).not.toContain('17:00-17:59');
    expect(text).toContain('- By entry weekday (America/New_York): Mon: 70 trades');
    expect(text.indexOf('Mon: 70')).toBeLessThan(text.indexOf('Fri: 50'));
    expect(text).toContain('- By hold time: under 5m: 60 trades, P&L $600.00, win 50.0% | 5-30m: 60 trades');
    expect(text).not.toContain('By side');
    expect(text).toContain('- By instrument type: stock: 100 trades');
  });

  test('states missing setups and tags instead of skipping silently', () => {
    const text = AIChatContext.formatBreakdowns({ rows: [row('total', null, 10, { tagged_trades: 0 }), row('setup', null, 10)], tags: [] }, new AICurrency('USD', { USD: 1 })).join('\n');
    expect(text).toContain('- Setups: none recorded on any closed trade in scope');
    expect(text).toContain('- Tags: none recorded on any closed trade in scope');
  });

  test('grouping sets query and whole-position CTE', async () => {
    routeDb([]);
    await AIChatContext.getBreakdowns('user-1', { accounts: null, timezone: 'UTC', position_grouping: true });
    const [sql] = callsMatching(/GROUPING SETS/)[0];
    expect(sql).toContain('GROUP BY GROUPING SETS ((setup), (strategy), (entry_hour), (weekday), (hold_bucket), (side), (instrument_type), ())');
    expect(sql).toContain('GROUP BY group_key_sql');
    expect(sql).toContain('CASE WHEN COUNT(*) = 1 THEN MAX(r_value) END AS r_value');
    expect(callsMatching(/UNNEST\(tags\)/)).toHaveLength(1);
  });

  test('strategy section reports the auto-classified share', () => {
    const text = AIChatContext.formatAccountContext({
      currency: new AICurrency('USD', { USD: 1 }),
      strategy_stats: [
        { strategy: 'scalper', trades: 10, total_pnl: -5, win_rate: 20, auto_trades: 10 },
        { strategy: 'breakout', trades: 4, total_pnl: 50, win_rate: 75, auto_trades: 1 },
        { strategy: 'unlabeled', trades: 2, total_pnl: 1, win_rate: 50, auto_trades: 0 }
      ]
    });
    expect(text).toContain('PERFORMANCE BY STRATEGY (11 of 14 labeled trades were auto-classified from hold time');
    expect(text).toContain('- scalper: 10 trades, P&L -$5.00, win rate 20.00%, auto-classified');
    expect(text).toContain('- breakout: 4 trades, P&L $50.00, win rate 75.00%, 1 of these auto-classified');
    expect(text).toContain('- unlabeled: 2 trades, P&L $1.00, win rate 50.00%\n');
  });
});

describe('symbol focus details', () => {
  test('shows setup, R, stop flag, notes, true totals and linked journal entries', () => {
    const currency = new AICurrency('USD', { USD: 1 });
    const closed = Array.from({ length: 20 }, (_, i) => ({
      symbol: 'NVDA', side: 'long', quantity: 10, entry_price: 100, exit_price: 101, pnl: 10, exit_time: `2026-09-${String(28 - i).padStart(2, '0')}T15:00:00Z`
    }));
    closed[0] = { ...closed[0], r_value: '1.5', setup: 'bull flag', strategy: 'day_trading', manual_override: false, classification_method: 'basic_import', had_stop: false, notes: '<p>Chased the open</p>' };
    const text = AIChatContext.formatSymbolContexts([{
      symbol: 'NVDA', currency, market_data_available: false, trades: closed,
      totals: { trades: 57, total_pnl: -420.5, win_rate: '41.2', avg_r: '0.3', r_trades: 12, first_traded: '2024-01-03T15:00:00Z', last_traded: '2026-09-28T15:00:00Z' },
      journal: [{ entry_date: '2026-09-28', title: 'NVDA chase', content: 'Should have waited', lessons_learned: 'Wait for the pullback' }]
    }]);
    expect(text).toContain("- User's closed trades in NVDA (ALL closed trades in scope): 57 trades, total P&L -$420.50, win rate 41.20%, avg 0.30R over 12 trades with R, first traded 2024-01-03, last traded 2026-09-28");
    expect(text).toContain('- Most recent 20 closed trades in NVDA:');
    expect(text).toContain('  - 2026-09-28 long 10 @ $100.00 -> $101.00, P&L $10.00, 1.50R, setup: bull flag, day_trading (auto), no stop, notes: Chased the open');
    expect(text).toContain('- Journal entries linked to NVDA trades:\n  - 2026-09-28: "NVDA chase" | Should have waited | Lessons: Wait for the pullback');
    expect(text).not.toContain('combined P&L');
  });

  test('loads open trades and up to 20 closed trades in one query', async () => {
    routeDb([]);
    await AIChatContext.getUserSymbolTrades('user-1', 'NVDA', {});
    const [sql] = callsMatching(/UNION ALL/)[0];
    expect(sql).toContain('AND exit_price IS NULL');
    expect(sql).toContain(`LIMIT ${AIChatContext.SYMBOL_CLOSED_ROWS}`);
    expect(AIChatContext.SYMBOL_CLOSED_ROWS).toBe(20);
    expect(sql).toContain('stop_loss IS NOT NULL AS had_stop');
  });
});

describe('unrealized P&L for open positions', () => {
  const positions = [
    { symbol: 'AAPL', side: 'long', quantity: '10', entry_price: '100', instrument_type: 'stock', listing_currency: 'USD' },
    { symbol: 'TSLA', side: 'short', quantity: '5', entry_price: '200', instrument_type: 'stock', listing_currency: 'USD' },
    { symbol: 'SPY 250117C500', underlying_symbol: 'SPY', side: 'long', quantity: '1', entry_price: '5', instrument_type: 'option', listing_currency: 'USD' },
    { symbol: 'ESZ6', side: 'long', quantity: '1', entry_price: '5000', instrument_type: 'future', listing_currency: 'USD' }
  ];

  test('uses fresh cached prices first, then one Finnhub batch for the rest; skips options and futures', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    routeDb([[/FROM price_monitoring/, { rows: [{ symbol: 'AAPL', current_price: '110' }] }]]);
    finnhub.getBatchQuotes.mockResolvedValue({ TSLA: { c: 180 } });

    const prices = await AIChatContext.getOpenPositionQuotes('user-1', positions);
    expect(prices).toEqual({ AAPL: 110, TSLA: 180 });
    expect(callsMatching(/FROM price_monitoring/)[0][1]).toEqual([['AAPL', 'TSLA']]);
    expect(finnhub.getBatchQuotes).toHaveBeenCalledWith(['TSLA'], expect.objectContaining({ userId: 'user-1', source: 'ai_chat' }));
  });

  test('caps symbols, prefers the largest positions, and skips when Finnhub is off', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    routeDb([]);
    finnhub.getBatchQuotes.mockResolvedValue({});
    const many = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${String.fromCharCode(65 + i)}`, side: 'long', quantity: '1', entry_price: String(i + 1), instrument_type: 'stock' }));
    many.push({ symbol: 'SHOP', side: 'long', quantity: '1000', entry_price: '100', instrument_type: 'stock', listing_currency: 'CAD' });
    await AIChatContext.getOpenPositionQuotes('user-1', many);
    const requested = finnhub.getBatchQuotes.mock.calls[0][0];
    expect(requested).toHaveLength(AIChatContext.MAX_QUOTE_SYMBOLS);
    expect(requested[0]).toBe('SO');
    expect(requested).not.toContain('SA');
    // non-USD listings are not priced from a bare-ticker quote
    expect(requested).not.toContain('SHOP');

    finnhub.isConfigured.mockReturnValue(false);
    finnhub.getBatchQuotes.mockClear();
    await expect(AIChatContext.getOpenPositionQuotes('user-1', positions)).resolves.toEqual({});
    expect(finnhub.getBatchQuotes).not.toHaveBeenCalled();
  });

  test('a slow quote batch is abandoned at the time box', async () => {
    finnhub.isConfigured.mockReturnValue(true);
    routeDb([]);
    finnhub.getBatchQuotes.mockImplementation(() => new Promise(() => {}));
    const original = AIChatContext.QUOTE_BATCH_TIMEOUT_MS;
    AIChatContext.QUOTE_BATCH_TIMEOUT_MS = 20;
    try {
      await expect(AIChatContext.getOpenPositionQuotes('user-1', positions)).resolves.toEqual({});
    } finally {
      AIChatContext.QUOTE_BATCH_TIMEOUT_MS = original;
    }
  });

  test('converts the listing-currency quote and words gain/loss explicitly', async () => {
    // EUR display: 0.9 per USD; entries arrive already converted.
    const currency = new AICurrency('EUR', { USD: 0.9 });
    const display = AIChatContext.rowsToDisplay(positions, ['entry_price'], currency);
    const withPnl = await AIChatContext.applyUnrealized(display, { AAPL: 110, TSLA: 180 }, currency);
    expect(withPnl[0].unrealized_pnl).toBeCloseTo(90); // (99 - 90) * 10
    expect(withPnl[1].unrealized_pnl).toBeCloseTo(90); // (180 - 162) * 5 short
    expect(withPnl[2].unrealized_pnl).toBeUndefined();

    const text = AIChatContext.formatAccountContext({ currency, open_positions: withPnl });
    expect(text).toContain('- AAPL: long 10 @ €90.00 since N/A, approx. unrealized P&L +€90.00 (GAIN: last price €99.00 is above the €90.00 entry on a long position)');
    expect(text).toContain('approx. unrealized P&L +€90.00 (GAIN: last price €162.00 is below the €180.00 entry on a short position)');
    expect(text).toContain('- Approx. combined unrealized P&L across the 2 quoted positions: +€180.00 (GAIN)');
    expect(text).toContain('not options or futures');
  });

  test('open quantity follows executions for partly exited positions', () => {
    expect(AIChatContext.openQuantity({ side: 'long', quantity: '11', executions: [{ action: 'buy', quantity: 11 }, { action: 'sell', quantity: 8 }] })).toBe(3);
    expect(AIChatContext.openQuantity({ side: 'short', quantity: '5', executions: [] })).toBe(5);
    const line = AIChatContext.formatPosition({ symbol: 'CRM', side: 'long', quantity: '11', open_quantity: 3, entry_price: 250 }, new AICurrency('USD', { USD: 1 }));
    expect(line).toContain('long 3 open (11 originally) @ $250.00');
  });
});

describe('trade detail extras', () => {
  const currency = new AICurrency('USD', { USD: 1 });
  const base = {
    symbol: 'NVDA', side: 'long', quantity: '100', entry_price: '120', exit_price: '125', pnl: '500',
    entry_time: '2026-03-04T14:41:00Z', exit_time: '2026-03-04T16:02:00Z', tags: [], instrument_type: 'stock'
  };

  test('post-exit excursion is labeled as entry-through-window and shows what was left', () => {
    const lines = AIChatContext.formatTradeDetail({ ...base, post_exit_mae: '150', post_exit_mfe: '900', post_exit_window_minutes: 60 }, currency, 'UTC').join('\n');
    // captured move = (125 - 120) * 100 = 500; best favorable 900
    expect(lines).toContain('Excursion incl. post-exit window: max adverse $150.00, max favorable $900.00 (from entry through 60 min after exit, measured from the entry price, whole position); best price in that span was worth $400.00 more than the exit captured');
  });

  test('a losing exit does not claim money was left on the table', () => {
    const lines = AIChatContext.formatTradeDetail({ ...base, exit_price: '118', pnl: '-200', post_exit_mae: '300', post_exit_mfe: '80', post_exit_window_minutes: 30 }, currency, 'UTC').join('\n');
    expect(lines).toContain('max adverse $300.00, max favorable $80.00 (from entry through 30 min after exit, measured from the entry price, whole position)\n');
    expect(lines).not.toContain('more than the exit captured');
  });

  test('targets, management R, news and charts render when present', () => {
    const lines = AIChatContext.formatTradeDetail({
      ...base,
      take_profit_targets: [{ order: 1, price: 124, shares: 50, status: 'hit' }, { order: 2, price: 130, shares: 50, status: 'pending' }],
      target_hit_first: 'take_profit', target_hit_label: 'TP1', target_hit_time: '2026-03-04T15:30:00Z', target_hit_inferred: 'false',
      management_r: '-0.75',
      news_count: 3, news_sentiment: 'positive',
      news_headlines: [{ headline: 'Nvidia beats estimates', datetime: '2026-03-04T12:00:00Z' }],
      chart_count: 2
    }, currency, 'America/New_York').join('\n');
    expect(lines).toContain('Targets: target ladder TP1 $124.00 x50, hit, TP2 $130.00 x50; chart analysis: TP1 hit first at 2026-03-04 10:30; management R -0.75R (actual R minus the planned R for whichever level was hit first; positive means managed better than the plan)');
    expect(lines).toContain('News: 3 articles linked to the trade, overall sentiment positive; latest: "Nvidia beats estimates" (2026-03-04)');
    expect(lines).toContain('Charts attached by the trader: 2 (images are not available to you)');
  });

  test('manual target-hit choice wins over the chart analysis', () => {
    const lines = AIChatContext.formatTradeDetail({ ...base, manual_target_hit_first: 'stop_loss', target_hit_first: 'take_profit' }, currency, 'UTC').join('\n');
    expect(lines).toContain('Targets: trader marked stop loss as hit first');
    expect(lines).not.toContain('chart analysis');
  });

  test('no extra lines when the fields are empty', () => {
    const lines = AIChatContext.formatTradeDetail({ ...base, news_count: 0, chart_count: 0, take_profit_targets: [] }, currency, 'UTC').join('\n');
    expect(lines).not.toMatch(/Excursion|Targets:|News:|Charts attached/);
  });

  test('detail query selects the reduced JSON fields; open anchors return in whole-trade mode', async () => {
    positionGrouping.isPositionGroupingEnabled.mockResolvedValueOnce(true);
    routeDb([[/FROM users/, { rows: [{ timezone: 'UTC' }] }]]);
    const usd = new AICurrency('USD', { USD: 1 });
    usd.ensureRowRates = jest.fn(async () => {});
    await AIChatContext.getTradeDetails('user-1', ['open-trade'], usd);
    const [sql] = callsMatching(/WITH anchors/)[0];
    expect(sql).toContain('AS chart_count');
    expect(sql).toContain('AS news_headlines');
    expect(sql).toContain("target_hit_analysis->'analysis_result'->>'first_target_hit' AS target_hit_first");
    expect(sql).toContain('c.post_exit_mfe');
    expect(sql).toContain('(c.id = a.anchor_id OR NOT a.anchor_closed OR (c.exit_price IS NOT NULL AND c.pnl IS NOT NULL))');
    expect(sql).not.toMatch(/candidates AS \([^)]*exit_price IS NOT NULL/);
  });

  test('a passed timezone skips the users lookup', async () => {
    routeDb([]);
    const usd = new AICurrency('USD', { USD: 1 });
    usd.ensureRowRates = jest.fn(async () => {});
    const result = await AIChatContext.getTradeDetails('user-1', ['t-1'], usd, 'Europe/Berlin');
    expect(result.timezone).toBe('Europe/Berlin');
    expect(callsMatching(/FROM users/)).toHaveLength(0);
  });
});

describe('price history (performance over time)', () => {
  const PortfolioService = require('../../src/services/portfolioService');
  const day = iso => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
  // Weekday candles from start to end (inclusive) with a close chosen per date.
  const series = (start, end, closeFor, extra = {}) => {
    const out = [];
    for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      const close = closeFor(iso);
      out.push({ time: day(iso), open: close, high: close, low: close, close, volume: 1, ...extra });
    }
    return out;
  };

  test('computes multi-period returns, range, and averages anchored on the live quote', () => {
    const candles = series('2025-11-03', '2026-11-19', iso => (iso >= '2026-11-01' ? 110 : 100));
    // A Saturday row repeating Friday and today's intraday row must not count.
    candles.push({ time: day('2026-11-14'), close: 500, high: 500, low: 500 });
    const stats = AIChatContext.computePriceHistory(candles, { anchorPrice: 121, anchorDate: '2026-11-19' });

    const byLabel = Object.fromEntries(stats.returns.map(r => [r.label, r.pct]));
    expect(stats.anchored_on_quote).toBe(true);
    expect(stats.last_close_date).toBe('2026-11-18');
    expect(byLabel['1W']).toBeCloseTo(10, 5);
    expect(byLabel['1Y']).toBeCloseTo(21, 5);
    expect(byLabel.YTD).toBeCloseTo(21, 5);
    expect(stats.range).toMatchObject({ high: 121, high_date: '2026-11-19', low: 100, full_year: true });
    expect(stats.sma50).toBeGreaterThan(100);
    expect(stats.sma200).not.toBeNull();
    expect(stats.month_ends.at(-1)).toEqual({ month: '2026-10', close: 100 });
  });

  test('skips periods whose base close is too far from the target date (stale tail)', () => {
    const candles = series('2026-01-02', '2026-10-01', () => 50);
    const stats = AIChatContext.computePriceHistory(candles, { anchorPrice: 60, anchorDate: '2026-11-19' });
    const labels = stats.returns.map(r => r.label);
    expect(labels).not.toContain('1W');
    expect(labels).not.toContain('1M');
    expect(labels).toContain('3M');
    expect(stats.range.full_year).toBe(false);
  });

  test('cuts the series at an apparent split so no return spans it, and tolerates missing highs/lows', () => {
    const candles = series('2025-11-03', '2026-11-18', iso => (iso < '2026-06-01' ? 200 : 100), { high: null, low: null });
    const stats = AIChatContext.computePriceHistory(candles);
    expect(stats.break_date).toBe('2026-06-01');
    expect(stats.returns.map(r => r.label)).not.toContain('1Y');
    expect(stats.returns.find(r => r.label === '1M').pct).toBeCloseTo(0, 5);
    expect(stats.range.high).toBe(100);
    expect(Number.isNaN(stats.range.low)).toBe(false);
  });

  test('formats levels in the display currency and compares against SPY', () => {
    const currency = new AICurrency('EUR', { USD: 0.5 });
    const text = AIChatContext.formatSymbolContexts([{
      symbol: 'NVDA', currency, trades: [], market_data_available: true,
      quote: { price: 120, change: 1, change_percent: 1, low: 118, high: 121, previous_close: 119, currency: 'USD', as_of: '2026-11-19T20:00:00Z' },
      price_history: AIChatContext.computePriceHistory(series('2025-11-03', '2026-11-18', () => 100), { anchorPrice: 120, anchorDate: '2026-11-19' }),
      benchmark: { symbol: 'SPY', returns: [{ label: '1M', pct: 5 }, { label: '1Y', pct: 10 }] }
    }]);
    expect(text).toContain('- Price performance (daily closes from 2025-11-');
    expect(text).toContain('now = live quote as of 2026-11-19): 1W +20.0%, 1M +20.0%');
    expect(text).toContain('S&P 500 (SPY) over the same periods: 1M +5.0% (NVDA ahead by 15.0 pts), 1Y +10.0% (NVDA ahead by 10.0 pts)');
    expect(text).toContain('52-week: low €50.00');
    expect(text).toContain('high €60.00 (2026-11-19)');
    expect(text).toContain('Moving averages of daily closes: the current price is 20.0% ABOVE its 50-day average of €50.00');
  });

  test('falls back to provider metrics, then to an explicit "not available" line', () => {
    const currency = new AICurrency('USD', { USD: 1 });
    const metrics = AIChatContext.summarizePriceMetrics({ metric: {
      '5DayPriceReturnDaily': -0.68, '13WeekPriceReturnDaily': 11.24, yearToDatePriceReturnDaily: 29.64, '52WeekPriceReturnDaily': 31.79,
      'priceRelativeToS&P50052Week': 21.16, '52WeekHigh': 360.83, '52WeekHighDate': '2026-11-13', '52WeekLow': 243.42, '52WeekLowDate': '2026-01-20', beta: 1.07
    } });
    const base = { symbol: 'AAPL', currency, trades: [], market_data_available: true };
    const withMetrics = AIChatContext.formatSymbolContexts([{ ...base, price_metrics: metrics }]);
    expect(withMetrics).toContain('Price performance (computed by the market data provider): 5-day -0.7%, 13-week +11.2%, YTD +29.6%, 52-week +31.8%');
    expect(withMetrics).toContain('Relative to the S&P 500 (percentage points): 52-week +21.2 pts');
    expect(withMetrics).toContain('52-week range: low $243.42 (2026-01-20), high $360.83 (2026-11-13); beta 1.07');

    const none = AIChatContext.formatSymbolContexts([base]);
    expect(none).toContain('Price history: not available right now');
  });

  test('loads the SPY benchmark once for several focus symbols, without the user id', async () => {
    finnhub.isConfigured.mockReturnValue(false);
    db.query.mockResolvedValue({ rows: [] });
    PortfolioService._getDailySeries.mockImplementation(async () => series('2025-11-03', '2026-11-18', () => 100));

    const contexts = await AIChatContext.buildSymbolContexts('user-1', ['AAA', 'BBB', 'CCC'], new AICurrency('USD', { USD: 1 }));

    const spyCalls = PortfolioService._getDailySeries.mock.calls.filter(([symbol]) => symbol === 'SPY');
    expect(spyCalls).toHaveLength(1);
    expect(PortfolioService._getDailySeries.mock.calls.every(([, , , userId]) => userId === null)).toBe(true);
    expect(contexts).toHaveLength(3);
    expect(contexts.every(context => context.benchmark?.symbol === 'SPY' && context.price_history?.returns.length > 0)).toBe(true);
  });
});
