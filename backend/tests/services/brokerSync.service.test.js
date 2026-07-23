jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/utils/csvParser', () => ({
  parseCSV: jest.fn(),
  parseIBKRRecords: jest.fn()
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

jest.mock('../../src/utils/timezone', () => ({
  getUserTimezone: jest.fn().mockResolvedValue('UTC')
}));

const Trade = require('../../src/models/Trade');
const db = require('../../src/config/database');
const { parseCSV, parseIBKRRecords } = require('../../src/utils/csvParser');
const { getUserTimezone } = require('../../src/utils/timezone');
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

  test('IBKR importTrades preserves parsed trade currency as originalCurrency', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    Trade.create.mockResolvedValue({ id: 'trade-1' });

    const result = await ibkrService.importTrades('user-1', [
      {
        symbol: 'USO',
        side: 'long',
        quantity: 1,
        entryPrice: 125,
        entryTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06',
        currency: 'USD',
        executionData: [
          {
            datetime: '2026-03-06T15:00:00Z',
            quantity: 1,
            price: 125,
            action: 'buy'
          }
        ]
      }
    ], {});

    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(Trade.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        symbol: 'USO',
        originalCurrency: 'USD',
        exchangeRate: 1.0
      }),
      expect.any(Object)
    );
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

  test('IBKR execution matching never uses an order ID alone', () => {
    expect(
      ibkrService.executionsMatch(
        { orderId: 'abc123', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 },
        { orderId: 'abc123', datetime: '2026-03-06T15:30:00Z', quantity: 5, price: 101 }
      )
    ).toBe(false);
  });

  test('IBKR execution matching prioritizes execution IDs, trade IDs, then legacy fill details', () => {
    expect(ibkrService.executionsMatch(
      { execution_id: 'EXEC-1', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 },
      { executionId: 'EXEC-1', datetime: '2026-03-06T16:00:00Z', quantity: 7, price: 101 }
    )).toBe(true);
    expect(ibkrService.executionsMatch(
      { execution_id: 'EXEC-1', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 },
      { execution_id: 'EXEC-2', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 }
    )).toBe(false);
    expect(ibkrService.executionsMatch(
      { trade_id: 'TRADE-1' },
      { tradeId: 'TRADE-1' }
    )).toBe(true);
    expect(ibkrService.executionsMatch(
      { order_id: 'ORDER-1', datetime: '2026-03-06T15:00:00Z', action: 'buy', quantity: 5, price: 100, conid: '123' },
      { orderId: 'ORDER-1', datetime: '2026-03-06T15:00:00Z', action: 'buy', quantity: 5, price: 100, conid: '123' }
    )).toBe(true);
  });

  test('IBKR resync detects an identical execution set and updates when a new fill appears', () => {
    const existing = [{
      id: 'trade-1',
      symbol: 'AAPL',
      side: 'long',
      quantity: 103,
      entry_price: 300,
      entry_time: '2026-05-18T09:30:04Z',
      trade_date: '2026-05-18',
      instrument_type: 'stock',
      executions: [{ execution_id: 'EXEC-1', datetime: '2026-05-18T09:30:04Z', action: 'buy', quantity: 103, price: 300 }]
    }];
    const firstFill = { execution_id: 'EXEC-1', datetime: '2026-05-18T09:30:04Z', action: 'buy', quantity: 103, price: 300 };

    expect(ibkrService.isDuplicateTrade({
      symbol: 'AAPL', side: 'long', quantity: 103, entryPrice: 300, entryTime: '2026-05-18T09:30:04Z',
      executionData: [firstFill]
    }, existing, {})).toBe(true);

    const withNewFill = {
      symbol: 'AAPL', side: 'long', quantity: 240, entryPrice: 300, entryTime: '2026-05-18T09:30:04Z',
      executionData: [
        firstFill,
        { execution_id: 'EXEC-2', datetime: '2026-05-18T09:30:04Z', action: 'buy', quantity: 137, price: 300 }
      ]
    };
    expect(ibkrService.isDuplicateTrade(withNewFill, existing, {})).toBe(false);
    expect(withNewFill).toMatchObject({ isUpdate: true, existingTradeId: 'trade-1' });
  });

  test('IBKR credential validation request does not send date overrides', () => {
    const params = ibkrService.buildReportRequestParams('token-1', 'query-1');

    expect(params).toEqual({ t: 'token-1', q: 'query-1', v: '3' });
  });

  test('IBKR sync request sends an explicit date window capped at 365 days', () => {
    const params = ibkrService.buildReportRequestParams('token-1', 'query-1', {
      overrideDates: true,
      startDate: '2025-01-01',
      endDate: '2026-01-01'
    });

    expect(params).toEqual({
      t: 'token-1',
      q: 'query-1',
      v: '3',
      fd: '20250102',
      td: '20260101'
    });
  });

  test('IBKR sync adds transferred stock Open Positions rows before import', async () => {
    const csv = [
      'Statement,Header,Field Name,Field Value',
      'Statement,Data,Title,Activity Statement',
      'Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,CostBasisPrice,CostBasisMoney,Account,Conid',
      'Open Positions,Data,Summary,Stocks,USD,AMC,10,5.50,55,U123,265598'
    ].join('\n');

    parseIBKRRecords.mockResolvedValueOnce({ trades: [], diagnostics: { warnings: [] } });
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
      }, { startDate: '2026-06-19', endDate: '2026-06-19' });

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
            instrumentType: 'stock',
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

  test('IBKR sync returns manual review items from the parser', async () => {
    const csv = [
      'Symbol,Quantity,Buy/Sell,Price,Date/Time,Commission,LevelOfDetail,TradeID,Conid,AssetClass',
      'IBKR,0.0228,SELL,81.67,2026-04-20 10:25:08,-0.018663565,EXECUTION,9349469033,43645865,STK'
    ].join('\n');
    const reviewItem = {
      review_type: 'ambiguous_sell_only_stock',
      symbol: 'IBKR',
      quantity: 0.0228,
      price: 81.67,
      action: 'sell'
    };

    parseIBKRRecords.mockResolvedValueOnce({
      trades: [],
      manualReviewItems: [reviewItem],
      diagnostics: { warnings: ['1 sell-only stock execution requires manual review before importing.'] }
    });
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport').mockResolvedValue({ referenceCode: 'ref-1' });
    const fetchSpy = jest.spyOn(ibkrService, 'fetchFlexReport').mockResolvedValue(csv);
    const context = { existingPositions: {}, existingExecutions: {}, userId: 'user-1' };
    const contextSpy = jest.spyOn(ibkrService, 'getExistingContext').mockResolvedValue(context);
    const importSpy = jest.spyOn(ibkrService, 'importTrades').mockResolvedValue({
      imported: 0,
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
      }, { startDate: '2026-06-19', endDate: '2026-06-19' });

      expect(parseIBKRRecords).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ Symbol: 'IBKR' })]),
        expect.objectContaining({
          brokerConnectionId: 'conn-1',
          brokerType: 'ibkr'
        }),
        'ibkr'
      );
      expect(importSpy).toHaveBeenCalledWith('user-1', [], context);
      expect(result).toMatchObject({
        imported: 0,
        manualReviewCount: 1,
        manualReviewItems: [reviewItem]
      });
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      contextSpy.mockRestore();
      importSpy.mockRestore();
    }
  });

  test('IBKR sync passes the user timezone to the shared import parser', async () => {
    parseIBKRRecords.mockResolvedValueOnce({ trades: [], diagnostics: { warnings: [] } });
    getUserTimezone.mockResolvedValueOnce('America/New_York');
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport').mockResolvedValue({ referenceCode: 'ref-1' });
    const fetchSpy = jest.spyOn(ibkrService, 'fetchFlexReport').mockResolvedValue(
      'Account,Symbol,DateTime,Quantity,TradePrice,Buy/Sell\nU1,AAPL,20260714;093000,1,100,BUY'
    );
    const context = { existingPositions: {}, existingExecutions: {}, userId: 'user-1' };
    const contextSpy = jest.spyOn(ibkrService, 'getExistingContext').mockResolvedValue(context);
    const importSpy = jest.spyOn(ibkrService, 'importTrades').mockResolvedValue({
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0
    });

    try {
      await ibkrService.syncTrades({
        id: 'conn-1',
        userId: 'user-1',
        brokerType: 'ibkr',
        ibkrFlexToken: 'token',
        ibkrFlexQueryId: 'query'
      }, { startDate: '2026-07-14', endDate: '2026-07-14' });

      expect(getUserTimezone).toHaveBeenCalledWith('user-1');
      expect(parseIBKRRecords).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ DateTime: '20260714;093000' })]),
        expect.objectContaining({ userTimezone: 'America/New_York' }),
        'ibkr'
      );
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      contextSpy.mockRestore();
      importSpy.mockRestore();
    }
  });

  test('IBKR self-describing stock Open Positions derive entry price from total basis', () => {
    const csv = [
      'ClientAccountID,AssetClass,Symbol,Position,CostBasisMoney,Conid',
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
      instrumentType: 'stock',
      isSyntheticOpenPosition: true
    }));
  });

  test('IBKR self-describing Trades sections are not treated as Open Positions', () => {
    const tradesSectionCsv = [
      'ClientAccountID,AccountAlias,AssetClass,Symbol,Conid,TradeID,DateTime,Quantity,TradePrice,CostBasis,Buy/Sell,LevelOfDetail',
      'U123,Main,OPT,NVDA,111,trade-1,2026-06-19;093000,1,2.08,208,BUY,EXECUTION',
      'U123,Main,STK,QQQ,222,trade-2,2026-06-19;094500,100,450,45000,BUY,EXECUTION'
    ].join('\n');

    const result = ibkrService.extractOpenPositionTrades(
      tradesSectionCsv,
      { id: 'conn-1', brokerType: 'ibkr' },
      { existingPositions: {}, existingExecutions: {} },
      { endDate: '2026-06-19' }
    );

    expect(result.trades).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('did not include a recognized Open Positions stock section');
  });

  test('IBKR Open Positions skips option rows instead of importing them as underlying stocks', () => {
    const csv = [
      'ClientAccountID,AssetClass,Symbol,Position,CostBasisMoney,Conid',
      'U123,OPT,NVDA,1,208,111111'
    ].join('\n');

    const result = ibkrService.extractOpenPositionTrades(
      csv,
      { id: 'conn-1', brokerType: 'ibkr' },
      { existingPositions: {}, existingExecutions: {} },
      { endDate: '2026-06-19' }
    );

    expect(result.trades).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('unsupported asset class for NVDA');
  });

  test('IBKR Open Positions rows are skipped when an existing stock position matches by conid', () => {
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

  test('IBKR All Time builds chronological inclusive windows covering exactly ten years', () => {
    const windows = ibkrService.buildSyncWindows({}, { endDate: '2026-07-15', syncType: 'manual' });

    expect(windows[0].start_date).toBe('2016-07-15');
    expect(windows[windows.length - 1].end_date).toBe('2026-07-15');
    windows.forEach((window, index) => {
      const days = (new Date(`${window.end_date}T00:00:00Z`) - new Date(`${window.start_date}T00:00:00Z`)) / 86400000 + 1;
      expect(days).toBeLessThanOrEqual(365);
      if (index > 0) {
        const expectedStart = new Date(`${windows[index - 1].end_date}T00:00:00Z`);
        expectedStart.setUTCDate(expectedStart.getUTCDate() + 1);
        expect(window.start_date).toBe(expectedStart.toISOString().slice(0, 10));
      }
    });
  });

  test('IBKR All Time handles a leap-day end date without skipping February 28', () => {
    const windows = ibkrService.buildSyncWindows({}, { endDate: '2024-02-29', syncType: 'manual' });
    expect(windows[0].start_date).toBe('2014-02-28');
    expect(windows[windows.length - 1].end_date).toBe('2024-02-29');
  });

  test('IBKR scheduled sync uses a seven-day overlap bounded by the configured floor', () => {
    expect(ibkrService.buildSyncWindows({
      syncStartDate: '2026-07-05',
      lastSyncAt: '2026-07-10T15:00:00Z'
    }, {
      endDate: '2026-07-15',
      syncType: 'scheduled'
    })).toEqual([{ start_date: '2026-07-05', end_date: '2026-07-15' }]);

    expect(ibkrService.buildSyncWindows({
      syncStartDate: '2026-01-01',
      lastSyncAt: '2026-07-10T15:00:00Z'
    }, {
      endDate: '2026-07-15',
      syncType: 'retry'
    })[0].start_date).toBe('2026-07-03');
  });

  test('IBKR Open Positions synthesizes only a safe same-direction quantity delta', () => {
    const result = ibkrService.extractOpenPositionTradesFromRecords([
      { Account: 'U123', AssetClass: 'STK', Symbol: 'AAPL', Conid: '265598', Position: '340', CostBasisMoney: '102000' }
    ], { id: 'conn-1', brokerType: 'ibkr' }, {}, {
      endDate: '2026-07-15',
      parsedTrades: [{
        symbol: 'AAPL',
        side: 'long',
        quantity: 240,
        accountIdentifier: 'U123',
        conid: '265598',
        instrumentType: 'stock'
      }]
    });

    expect(result.warnings).toEqual([]);
    expect(result.trades).toEqual([
      expect.objectContaining({ symbol: 'AAPL', side: 'long', quantity: 100, entryPrice: 300 })
    ]);
  });

  test.each([
    ['exact', '240', '300', 0],
    ['zero cost', '340', '0', 0],
    ['reduced', '200', '300', 0],
    ['opposite direction', '-100', '300', 0]
  ])('IBKR Open Positions preserves execution data for %s reconciliation', (_label, summary, cost, expectedTrades) => {
    const result = ibkrService.extractOpenPositionTradesFromRecords([
      { Account: 'U123', AssetClass: 'STK', Symbol: 'AAPL', Conid: '265598', Position: summary, CostBasisPrice: cost }
    ], { id: 'conn-1', brokerType: 'ibkr' }, {}, {
      endDate: '2026-07-15',
      parsedTrades: [{
        symbol: 'AAPL', side: 'long', quantity: 240, accountIdentifier: 'U123', conid: '265598', instrumentType: 'stock'
      }]
    });

    expect(result.trades).toHaveLength(expectedTrades);
    if (_label === 'exact') expect(result.warnings).toEqual([]);
    else expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('IBKR treats an explicit-window 1003 as an empty completed window with warnings', async () => {
    const emptyWindowError = Object.assign(new Error('No statement'), { errorCode: '1003' });
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport').mockRejectedValue(emptyWindowError);
    const fetchSpy = jest.spyOn(ibkrService, 'fetchGeneratedReport');
    const contextSpy = jest.spyOn(ibkrService, 'getExistingContext').mockResolvedValue({ existingPositions: {}, existingExecutions: {} });
    const importSpy = jest.spyOn(ibkrService, 'importTrades').mockResolvedValue({ imported: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 });
    parseIBKRRecords.mockResolvedValueOnce({ trades: [], diagnostics: { warnings: [], skippedReasons: [] } });

    try {
      const result = await ibkrService.syncTrades({
        id: 'conn-1', userId: 'user-1', brokerType: 'ibkr', ibkrFlexToken: 'token', ibkrFlexQueryId: 'query'
      }, { startDate: '2026-07-15', endDate: '2026-07-15' });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ outcome: 'warning', windowsRequested: 1, windowsCompleted: 1, tradeRows: 0 });
      expect(result.warningDetails).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'EMPTY_WINDOW_1003' })
      ]));
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      contextSpy.mockRestore();
      importSpy.mockRestore();
    }
  });

  test('IBKR treats a genuinely empty report with matching metadata as an ordinary completion', async () => {
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport').mockResolvedValue({ referenceCode: 'ref-1' });
    const fetchSpy = jest.spyOn(ibkrService, 'fetchGeneratedReport').mockResolvedValue({
      content: '<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20260715" toDate="20260715"><OpenPositions /><Trades /></FlexStatement></FlexStatements></FlexQueryResponse>',
      format: 'xml'
    });
    const contextSpy = jest.spyOn(ibkrService, 'getExistingContext').mockResolvedValue({ existingPositions: {}, existingExecutions: {} });
    const importSpy = jest.spyOn(ibkrService, 'importTrades').mockResolvedValue({ imported: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 });
    parseIBKRRecords.mockResolvedValueOnce({ trades: [], diagnostics: { warnings: [], skippedReasons: [] } });

    try {
      const result = await ibkrService.syncTrades({
        id: 'conn-1', userId: 'user-1', brokerType: 'ibkr', ibkrFlexToken: 'token', ibkrFlexQueryId: 'query'
      }, { startDate: '2026-07-15', endDate: '2026-07-15' });

      expect(result).toMatchObject({ outcome: 'success', warnings: [], tradeRows: 0, openPositionRows: 0 });
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      contextSpy.mockRestore();
      importSpy.mockRestore();
    }
  });

  test('IBKR does not import any window when a later backfill window fails', async () => {
    const requestSpy = jest.spyOn(ibkrService, 'requestFlexReport')
      .mockResolvedValueOnce({ referenceCode: 'ref-1' })
      .mockResolvedValueOnce({ referenceCode: 'ref-2' });
    const fetchSpy = jest.spyOn(ibkrService, 'fetchGeneratedReport')
      .mockResolvedValueOnce({ content: 'Account,Symbol,DateTime,Quantity,TradePrice,Buy/Sell\nU1,AAPL,20250101;093000,1,100,BUY', format: 'csv' })
      .mockRejectedValueOnce(new Error('second window failed'));
    const importSpy = jest.spyOn(ibkrService, 'importTrades');

    try {
      await expect(ibkrService.syncTrades({
        id: 'conn-1', userId: 'user-1', brokerType: 'ibkr', ibkrFlexToken: 'token', ibkrFlexQueryId: 'query'
      }, { startDate: '2025-01-01', endDate: '2026-01-01' })).rejects.toThrow('second window failed');
      expect(parseIBKRRecords).not.toHaveBeenCalled();
      expect(importSpy).not.toHaveBeenCalled();
    } finally {
      requestSpy.mockRestore();
      fetchSpy.mockRestore();
      importSpy.mockRestore();
    }
  });
});

describe('IBKR transient error handling', () => {
  const axios = require('axios');

  beforeEach(() => {
    jest.clearAllMocks();
    ibkrService.sendRequestTimestamps = [];
    jest.spyOn(ibkrService, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('SendRequest pacing enforces both the one-second and rolling-minute limits', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    ibkrService.sendRequestTimestamps = [now - 500];
    await ibkrService.waitForSendRequestSlot();
    expect(ibkrService.sleep).toHaveBeenCalledWith(500);

    ibkrService.sleep.mockClear();
    ibkrService.sendRequestTimestamps = Array.from({ length: 10 }, (_, index) => now - 30000 + (index * 3000));
    await ibkrService.waitForSendRequestSlot();
    expect(ibkrService.sleep).toHaveBeenCalledWith(30000);
  });

  test('requestFlexReport ignores the legacy Url element supplied by IBKR', async () => {
    // IBKR's docs mark the <Url> response element as legacy and instruct
    // clients to ignore it; statements are always fetched from ndcdyn.
    axios.get.mockResolvedValueOnce({
      data: '<FlexStatementResponse><Status>Success</Status><ReferenceCode>REF-123</ReferenceCode><Url>https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement</Url></FlexStatementResponse>'
    });

    await expect(ibkrService.requestFlexReport('token', 'query')).resolves.toEqual({
      referenceCode: 'REF-123',
      statementUrl: 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement'
    });
  });

  test('requestFlexReport falls back to ndcdyn when the response omits Url', async () => {
    axios.get.mockResolvedValueOnce({
      data: '<FlexStatementResponse><Status>Success</Status><ReferenceCode>REF-123</ReferenceCode></FlexStatementResponse>'
    });

    await expect(ibkrService.requestFlexReport('token', 'query')).resolves.toMatchObject({
      statementUrl: 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement'
    });
  });

  test('requestFlexReport retries without date overrides when IBKR returns 1003', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1003</ErrorCode><ErrorMessage>Statement is not available.</ErrorMessage></FlexStatementResponse>'
      })
      .mockResolvedValueOnce({
        data: '<FlexStatementResponse><Status>Success</Status><ReferenceCode>REF-123</ReferenceCode></FlexStatementResponse>'
      });

    await ibkrService.requestFlexReport('token', 'query', {
      overrideDates: true,
      startDate: '2025-07-16',
      endDate: '2026-07-15'
    });

    expect(axios.get.mock.calls[0][1].params).toEqual(expect.objectContaining({
      fd: '20250716',
      td: '20260715'
    }));
    expect(axios.get.mock.calls[1][1].params).toEqual({ t: 'token', q: 'query', v: '3' });
    expect(ibkrService.sleep).toHaveBeenCalledWith(1000);
  });

  test('requestFlexReport does not use the saved query period for an explicit historical window', async () => {
    axios.get.mockResolvedValueOnce({
      data: '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1003</ErrorCode><ErrorMessage>Statement is not available.</ErrorMessage></FlexStatementResponse>'
    });

    await expect(ibkrService.requestFlexReport('token', 'query', {
      overrideDates: true,
      startDate: '2026-07-01',
      endDate: '2026-07-15',
      allowBareFallback: false
    })).rejects.toMatchObject({ errorCode: '1003' });

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('fetchFlexReport polls the statement URL returned by SendRequest', async () => {
    const statementUrl = 'https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement';
    axios.get.mockResolvedValueOnce({ data: 'Symbol,Quantity,Price\nAAPL,10,150.50\n' });

    const report = await ibkrService.fetchFlexReport('REF-123', 'token', {
      maxWait: 60000,
      statementUrl,
      sourceWindow: { start_date: '2026-07-15', end_date: '2026-07-15' }
    });

    expect(axios.get).toHaveBeenCalledWith(statementUrl, expect.objectContaining({
      params: { t: 'token', q: 'REF-123', v: '3' }
    }));
    expect(report).toMatchObject({
      format: 'csv',
      source_window: { start_date: '2026-07-15', end_date: '2026-07-15' },
      statement_metadata: []
    });
  });

  test('fetchFlexReport returns XML in a report envelope', async () => {
    axios.get.mockResolvedValueOnce({
      data: '<FlexQueryResponse queryName="TradeTally"><FlexStatements count="1"><FlexStatement><Trades /></FlexStatement></FlexStatements></FlexQueryResponse>'
    });

    await expect(ibkrService.fetchFlexReport('REF-123', 'token', { maxWait: 60000 }))
      .resolves.toMatchObject({
        format: 'xml',
        content: expect.stringContaining('<Trades />')
      });

    expect(axios.get).toHaveBeenCalledTimes(1);
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
    expect(csv.content).toContain('AAPL');
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
