jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/utils/csvParser', () => ({
  parseCSV: jest.fn(),
  parseInstrumentData: jest.fn(() => ({ instrumentType: 'stock' }))
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  updateSyncLog: jest.fn(),
  updateSchwabTokens: jest.fn(),
  updateStatus: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidateUserCache: jest.fn(),
  invalidate: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  data: {},
  del: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const Trade = require('../../src/models/Trade');
const db = require('../../src/config/database');
const { parseCSV } = require('../../src/utils/csvParser');
const ibkrService = require('../../src/services/brokerSync/ibkrService');
const schwabService = require('../../src/services/brokerSync/schwabService');
const alpacaService = require('../../src/services/brokerSync/alpacaService');

describe('broker sync duplicate protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('IBKR importTrades skips a duplicate trade repeated within the same sync batch', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    Trade.create.mockResolvedValue({ id: 'trade-1' });

    const trade = {
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      entryPrice: 100,
      entryTime: '2026-03-06T15:00:00Z',
      tradeDate: '2026-03-06',
      executionData: [
        {
          datetime: '2026-03-06T15:00:00Z',
          quantity: 10,
          type: 'entry'
        }
      ]
    };

    const result = await ibkrService.importTrades('user-1', [trade, { ...trade }], {});

    expect(Trade.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      imported: 1,
      duplicates: 1,
      failed: 0
    });
  });

  test('IBKR existing trade lookup is scoped to the incoming sync date range', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await ibkrService.getExistingTradesForDuplicateCheck('user-1', [
      { tradeDate: '2026-03-05' },
      { entryTime: '2026-03-07T12:30:00Z' }
    ]);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('trade_date >= $2');
    expect(query).toContain('trade_date <= $3');
    expect(query).not.toContain('LIMIT 1000');
    expect(params).toEqual(['user-1', '2026-03-05', '2026-03-07']);
  });

  test('IBKR duplicate detection falls back to closed-trade fields when executions do not match', () => {
    const isDuplicate = ibkrService.isDuplicateTrade(
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 10,
        entryPrice: 100,
        exitPrice: 104,
        pnl: 40,
        entryTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06',
        executionData: [
          { datetime: '2026-03-06T15:00:05Z', quantity: 10, price: 100, action: 'buy' }
        ]
      },
      [
        {
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          entry_price: 100,
          exit_price: 104,
          pnl: 40,
          entry_time: '2026-03-06T15:00:00Z',
          trade_date: '2026-03-06',
          instrument_type: 'stock',
          executions: [
            { datetime: '2026-03-06T15:10:00Z', quantity: 10, price: 104, action: 'sell' }
          ]
        }
      ],
      {}
    );

    expect(isDuplicate).toBe(true);
  });

  test('IBKR execution matching uses order IDs when they are present', () => {
    expect(
      ibkrService.executionsMatch(
        { orderId: 'abc123', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 },
        { orderId: 'abc123', datetime: '2026-03-06T15:30:00Z', quantity: 5, price: 101 }
      )
    ).toBe(true);
  });

  test('IBKR Flex request never sends fd/td date overrides', () => {
    const params = ibkrService.buildReportRequestParams('token-1', 'query-1', {
      syncType: 'manual',
      startDate: '2025-01-01',
      endDate: '2026-01-01'
    });

    expect(params).toEqual({
      t: 'token-1',
      q: 'query-1',
      v: '3'
    });
    expect(params).not.toHaveProperty('fd');
    expect(params).not.toHaveProperty('td');
  });

  test('IBKR sync adds transferred Open Positions rows before import', async () => {
    const csv = [
      'Statement,Header,Field Name,Field Value',
      'Statement,Data,Title,Activity Statement',
      'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,CostBasisPrice,CostBasisMoney,Account,Conid',
      'Open Positions,Data,Summary,Stocks,USD,AMC,10,5.50,55,U123,265598'
    ].join('\n');

    parseCSV.mockResolvedValueOnce({ trades: [] });
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport').mockResolvedValue({ referenceCode: 'ref-1' });
    const fetchSpy = jest.spyOn(ibkrService, 'fetchFlexReport').mockResolvedValue(csv);
    const context = { existingPositions: {}, existingExecutions: {}, userId: 'user-1' };
    const contextSpy = jest.spyOn(ibkrService, 'getExistingContext').mockResolvedValue(context);
    const importSpy = jest.spyOn(ibkrService, 'importTrades').mockResolvedValue({
      imported: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0
    });

    try {
      const result = await ibkrService.syncTrades({
        id: 'conn-1',
        userId: 'user-1',
        brokerType: 'ibkr',
        ibkrFlexToken: 'token',
        ibkrFlexQueryId: 'query'
      }, { endDate: '2026-06-19' });

      expect(importSpy).toHaveBeenCalledWith(
        'user-1',
        [
          expect.objectContaining({
            symbol: 'AMC',
            side: 'long',
            quantity: 10,
            entryPrice: 5.5,
            brokerConnectionId: 'conn-1',
            accountIdentifier: 'U123',
            conid: '265598',
            isSyntheticOpenPosition: true
          })
        ],
        context
      );
      expect(result).toMatchObject({
        imported: 1,
        openPositionsParsed: 1
      });
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      contextSpy.mockRestore();
      importSpy.mockRestore();
    }
  });

  test('IBKR Open Positions rows without usable basis are skipped with a warning', () => {
    const csv = [
      'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,CostBasisPrice,CostBasisMoney,Account,Conid',
      'Open Positions,Data,Summary,Stocks,USD,NVDA,3,,,U123,4815747'
    ].join('\n');

    const result = ibkrService.extractOpenPositionTrades(
      csv,
      { id: 'conn-1', brokerType: 'ibkr' },
      { existingPositions: {}, existingExecutions: {} },
      { endDate: '2026-06-19' }
    );

    expect(result.trades).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('missing usable cost basis for NVDA');
  });

  test('IBKR self-describing Open Positions sections derive entry price from total cost basis', () => {
    const csv = [
      'ClientAccountID,AssetClass,Symbol,Quantity,CostBasisMoney,Conid',
      'U123,STK,NVDA,4,1000,4815747'
    ].join('\n');

    const result = ibkrService.extractOpenPositionTrades(
      csv,
      { id: 'conn-1', brokerType: 'ibkr' },
      { existingPositions: {}, existingExecutions: {} },
      { endDate: '2026-06-19' }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'NVDA',
      quantity: 4,
      entryPrice: 250,
      accountIdentifier: 'U123',
      conid: '4815747',
      isSyntheticOpenPosition: true
    }));
  });

  test('IBKR Open Positions rows are skipped when an existing open position matches by conid', () => {
    const csv = [
      'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,CostBasisPrice,CostBasisMoney,Account,Conid',
      'Open Positions,Data,Summary,Stocks,USD,AMC,10,5.50,55,U123,265598'
    ].join('\n');

    const result = ibkrService.extractOpenPositionTrades(
      csv,
      { id: 'conn-1', brokerType: 'ibkr' },
      {
        existingPositions: {
          conid_265598: {
            symbol: 'AMC',
            conid: '265598',
            instrumentType: 'stock',
            accountIdentifier: 'U123'
          }
        },
        existingExecutions: {}
      },
      { endDate: '2026-06-19' }
    );

    expect(result.trades).toHaveLength(0);
    expect(result.warnings).toEqual([]);
  });

  test('Schwab importTrades skips a trade already imported by a previous sync', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          symbol: 'AAPL',
          side: 'long',
          quantity: 5,
          entry_price: 100,
          exit_price: 105,
          entry_time: '2026-03-06T14:30:00Z',
          exit_time: '2026-03-06T15:00:00Z',
          trade_date: '2026-03-06',
          pnl: 25,
          instrument_type: 'stock',
          executions: [
            {
              datetime: '2026-03-06T15:00:00Z',
              type: 'exit',
              orderId: 'exit-123'
            }
          ]
        }
      ]
    });

    const result = await schwabService.importTrades('user-1', 'conn-1', [
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 5,
        entryPrice: 100,
        exitPrice: 105,
        entryTime: '2026-03-06T14:30:00Z',
        exitTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06',
        pnl: 25,
        instrumentType: 'stock',
        executionData: [
          {
            datetime: '2026-03-06T15:00:00Z',
            type: 'exit',
            orderId: 'exit-123'
          }
        ]
      }
    ]);

    expect(Trade.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      imported: 0,
      duplicates: 1,
      failed: 0
    });
  });

  test('Schwab existing trade lookup is scoped to the incoming sync date range', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await schwabService.getExistingTrades('user-1', [
      { tradeDate: '2026-03-05' },
      { exitTime: '2026-03-08T09:15:00Z' }
    ]);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('trade_date >= $2');
    expect(query).toContain('trade_date <= $3');
    expect(query).not.toContain('LIMIT 5000');
    expect(params).toEqual(['user-1', '2026-03-05', '2026-03-08']);
  });

  test('Schwab parseTransactions uses intraday time for same-day partial exits', () => {
    const schwabTrade = ({ orderId, tradeDate, time, price, amount, positionEffect, netAmount }) => ({
      type: 'TRADE',
      orderId,
      tradeDate,
      time,
      netAmount,
      transferItems: [
        {
          instrument: {
            assetType: 'EQUITY',
            symbol: 'AUUD'
          },
          price,
          amount,
          positionEffect
        }
      ]
    });

    const trades = schwabService.parseTransactions([
      // Deliberately first in API order. With date-only tradeDate ordering this
      // was treated as an unmatched short close and used netAmount as P&L.
      schwabTrade({
        orderId: '1006105171805',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:31:40Z',
        price: 7.47,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 373.5
      }),
      schwabTrade({
        orderId: '1006105171703',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:05:48Z',
        price: 6.84,
        amount: 100,
        positionEffect: 'OPENING',
        netAmount: -684
      }),
      schwabTrade({
        orderId: '1006105171794',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:30:45Z',
        price: 7.00,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 350
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'AUUD',
      side: 'long',
      quantity: 100,
      entryPrice: 6.84,
      exitPrice: 7.235,
      pnl: 39.5
    });
  });

  test('Schwab option transactions save the underlying ticker and option metadata', () => {
    const parsed = schwabService.parseTransactionDetails({
      type: 'TRADE',
      orderId: 'option-buy-1',
      tradeDate: '2026-05-27',
      time: '2026-05-27T14:30:00Z',
      transferItems: [
        {
          instrument: {
            assetType: 'OPTION',
            symbol: 'SPY 260527C00753000'
          },
          price: 1.25,
          amount: 1,
          positionEffect: 'OPENING'
        }
      ]
    });

    expect(parsed).toMatchObject({
      symbol: 'SPY',
      matchingSymbol: 'SPY 260527C00753000',
      instrumentType: 'option',
      underlyingSymbol: 'SPY',
      optionType: 'call',
      strikePrice: 753,
      expirationDate: '2026-05-27'
    });
  });

  test('Schwab option grouping keeps different contracts separate after symbol normalization', () => {
    const schwabOptionTrade = ({ orderId, symbol, time, price, amount, positionEffect }) => ({
      type: 'TRADE',
      orderId,
      tradeDate: time.split('T')[0],
      time,
      transferItems: [
        {
          instrument: {
            assetType: 'OPTION',
            symbol
          },
          price,
          amount,
          positionEffect
        }
      ]
    });

    const trades = schwabService.parseTransactions([
      schwabOptionTrade({
        orderId: 'open-753',
        symbol: 'SPY 260527C00753000',
        time: '2026-05-27T14:30:00Z',
        price: 1.25,
        amount: 1,
        positionEffect: 'OPENING'
      }),
      schwabOptionTrade({
        orderId: 'close-753',
        symbol: 'SPY 260527C00753000',
        time: '2026-05-27T15:00:00Z',
        price: 1.5,
        amount: -1,
        positionEffect: 'CLOSING'
      }),
      schwabOptionTrade({
        orderId: 'open-754',
        symbol: 'SPY 260527C00754000',
        time: '2026-05-27T15:30:00Z',
        price: 1.1,
        amount: 1,
        positionEffect: 'OPENING'
      }),
      schwabOptionTrade({
        orderId: 'close-754',
        symbol: 'SPY 260527C00754000',
        time: '2026-05-27T16:00:00Z',
        price: 1.35,
        amount: -1,
        positionEffect: 'CLOSING'
      })
    ]);

    expect(trades).toHaveLength(2);
    expect(trades.map(trade => trade.symbol)).toEqual(['SPY', 'SPY']);
    expect(trades.map(trade => trade.strikePrice).sort((a, b) => a - b)).toEqual([753, 754]);
    expect(trades.every(trade => trade.instrumentType === 'option')).toBe(true);
  });

  test('Schwab duplicate detection recognizes previously synced full option symbols', () => {
    const isDuplicate = schwabService.isDuplicateTrade(
      {
        symbol: 'SPY',
        matchingSymbol: 'SPY 260527C00753000',
        side: 'long',
        quantity: 1,
        entryPrice: 1.25,
        exitPrice: 1.5,
        pnl: 25,
        tradeDate: '2026-05-27',
        instrumentType: 'option',
        underlyingSymbol: 'SPY',
        optionType: 'call',
        strikePrice: 753,
        expirationDate: '2026-05-27'
      },
      [
        {
          symbol: 'SPY 260527C00753000',
          side: 'long',
          quantity: 1,
          entry_price: 1.25,
          exit_price: 1.5,
          pnl: 25,
          trade_date: '2026-05-27',
          instrument_type: 'option',
          option_type: 'call',
          strike_price: 753,
          expiration_date: '2026-05-27'
        }
      ]
    );

    expect(isDuplicate).toBe(true);
  });

  test('generic OAuth broker fill pairing closes long trades instead of marking sells as shorts', () => {
    const trades = alpacaService.mapExecutionsToTrades([
      {
        symbol: 'AAPL',
        qty: '5',
        filled_avg_price: '100',
        filled_at: '2026-03-06T14:30:00Z',
        side: 'buy',
        id: 'buy-1'
      },
      {
        symbol: 'AAPL',
        qty: '5',
        filled_avg_price: '105',
        filled_at: '2026-03-06T15:00:00Z',
        side: 'sell',
        id: 'sell-1'
      }
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'AAPL',
      side: 'long',
      quantity: 5,
      entryPrice: 100,
      exitPrice: 105,
      pnl: 25
    });
  });
});

describe('IBKR transient error handling', () => {
  const axios = require('axios');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(ibkrService, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fetchFlexReport keeps polling when IBKR returns an unknown code with a "try again" message', async () => {
    // First poll: unknown error code with retry-hint wording. Second poll: CSV.
    axios.get
      .mockResolvedValueOnce({
        data: '<?xml version="1.0"?><FlexStatementResponse><Status>Warn</Status><ErrorCode>9999</ErrorCode><ErrorMessage>Statement could not be generated at this time. Please try again shortly.</ErrorMessage></FlexStatementResponse>'
      })
      .mockResolvedValueOnce({
        data: 'Symbol,Quantity,Price\nAAPL,10,150.50\n'
      });

    const csv = await ibkrService.fetchFlexReport('REF-123', 'token', { maxWait: 60000 });
    expect(csv).toContain('AAPL');
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test('fetchFlexReport throws a transient timeout error when poll window is exhausted', async () => {
    // Every poll returns the "being generated" message — never returns CSV.
    axios.get.mockResolvedValue({
      data: '<?xml version="1.0"?><FlexStatementResponse><ErrorCode>1019</ErrorCode><ErrorMessage>Statement is being generated</ErrorMessage></FlexStatementResponse>'
    });

    // 1ms window guarantees timeout on the first iteration check.
    await expect(ibkrService.fetchFlexReport('REF-123', 'token', { maxWait: 1 }))
      .rejects.toMatchObject({
        message: 'Timeout waiting for IBKR report generation',
        errorCode: 'TIMEOUT',
        transient: true
      });
  });

  test('fetchFlexReport throws a non-transient error on a known fatal IBKR code', async () => {
    axios.get.mockResolvedValueOnce({
      data: '<?xml version="1.0"?><FlexStatementResponse><ErrorCode>1015</ErrorCode><ErrorMessage>Token is invalid</ErrorMessage></FlexStatementResponse>'
    });

    await expect(ibkrService.fetchFlexReport('REF-123', 'token', { maxWait: 60000 }))
      .rejects.toMatchObject({
        errorCode: '1015',
        transient: false
      });
  });
});
