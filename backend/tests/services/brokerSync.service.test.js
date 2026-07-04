jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/utils/csvParser', () => ({
  parseCSV: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  claimForSync: jest.fn(),
  releaseSyncClaim: jest.fn(),
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
const axios = require('axios');
const { parseCSV } = require('../../src/utils/csvParser');
const ibkrService = require('../../src/services/brokerSync/ibkrService');
const schwabService = require('../../src/services/brokerSync/schwabService');

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

  test('IBKR duplicate detection keeps fractional quantities distinct', () => {
    const isDuplicate = ibkrService.isDuplicateTrade(
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 10.75,
        entryPrice: 100,
        entryTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06'
      },
      [
        {
          symbol: 'AAPL',
          side: 'long',
          quantity: 10.25,
          entry_price: 100,
          entry_time: '2026-03-06T15:00:00Z',
          trade_date: '2026-03-06',
          instrument_type: 'stock',
          executions: null
        }
      ],
      {}
    );

    expect(isDuplicate).toBe(false);
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

  test('IBKR Flex report requests use current endpoint and TradeTally user agent', async () => {
    axios.get.mockResolvedValueOnce({
      data: '<FlexStatementResponse><ReferenceCode>ref-123</ReferenceCode></FlexStatementResponse>'
    });

    await expect(ibkrService.requestFlexReport('token-1', 'query-1')).resolves.toEqual({
      referenceCode: 'ref-123'
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest',
      expect.objectContaining({
        params: { t: 'token-1', q: 'query-1', v: '3' },
        headers: { 'User-Agent': expect.stringMatching(/^TradeTally\//) }
      })
    );
  });

  test('IBKR sync adds transferred stock Open Positions rows before import', async () => {
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

    parseCSV.mockResolvedValueOnce({
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
      });

      expect(parseCSV).toHaveBeenCalledWith(
        Buffer.from(csv, 'utf8'),
        'ibkr',
        expect.objectContaining({
          brokerConnectionId: 'conn-1',
          brokerType: 'ibkr'
        })
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
});
