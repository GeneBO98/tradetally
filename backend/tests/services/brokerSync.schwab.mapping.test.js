/**
 * Regression coverage for the Schwab API-payload -> TradeTally trade mapping layer.
 *
 * Pins the behavior of:
 *  - parseTransactionDetails (single transaction -> normalized fill)
 *  - parseTransactions / matchTransactions / groupTrades (fills -> complete trades)
 *  - _parseSchwabOptionSymbol (OCC-style option symbol parsing)
 *  - isDuplicateTrade dedupe key construction (exit orderId|datetime)
 */

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
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

const schwabService = require('../../src/services/brokerSync/schwabService');

/**
 * Builds a realistic Schwab /transactions payload entry.
 * Shape mirrors what parseTransactionDetails consumes: type, transferItems with
 * an instrument item plus fee items, orderId/activityId, time + tradeDate.
 */
function schwabEquityTx({
  orderId,
  time,
  tradeDate,
  symbol = 'AAPL',
  cusip = '037833100',
  price,
  amount,
  positionEffect,
  netAmount,
  commissionCost = 0,
  feeItems = [],
  accountIdentifier = '****1234'
}) {
  const transferItems = [
    {
      instrument: { assetType: 'EQUITY', symbol, cusip },
      price,
      amount,
      cost: -(price * amount),
      positionEffect
    }
  ];
  if (commissionCost) {
    transferItems.push({
      instrument: { assetType: 'CURRENCY', symbol: 'USD' },
      feeType: 'COMMISSION',
      cost: -Math.abs(commissionCost)
    });
  }
  for (const fee of feeItems) {
    transferItems.push({
      instrument: { assetType: 'CURRENCY', symbol: 'USD' },
      feeType: fee.feeType,
      cost: -Math.abs(fee.cost)
    });
  }

  return {
    activityId: Number(String(orderId).replace(/\D/g, '') || 1),
    type: 'TRADE',
    status: 'VALID',
    orderId,
    time,
    tradeDate: tradeDate || time,
    netAmount,
    _accountIdentifier: accountIdentifier,
    transferItems
  };
}

function schwabOptionTx({
  orderId,
  time,
  symbol,
  putCall,
  strikePrice,
  expirationDate,
  underlyingSymbol,
  price,
  amount,
  positionEffect,
  netAmount,
  commissionCost = 0,
  accountIdentifier = '****1234'
}) {
  const instrument = { assetType: 'OPTION', symbol };
  if (putCall !== undefined) instrument.putCall = putCall;
  if (strikePrice !== undefined) instrument.strikePrice = strikePrice;
  if (expirationDate !== undefined) instrument.expirationDate = expirationDate;
  if (underlyingSymbol !== undefined) instrument.underlyingSymbol = underlyingSymbol;

  const transferItems = [
    { instrument, price, amount, positionEffect }
  ];
  if (commissionCost) {
    transferItems.push({
      instrument: { assetType: 'CURRENCY', symbol: 'USD' },
      feeType: 'COMMISSION',
      cost: -Math.abs(commissionCost)
    });
  }

  return {
    type: 'TRADE',
    orderId,
    time,
    tradeDate: time,
    netAmount,
    _accountIdentifier: accountIdentifier,
    transferItems
  };
}

describe('Schwab parseTransactionDetails (single transaction mapping)', () => {
  test('maps an equity buy (OPENING, positive amount) field-by-field', () => {
    const parsed = schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 1006200000001,
      time: '2026-03-06T14:30:05Z',
      tradeDate: '2026-03-06T14:30:05+0000',
      symbol: 'AAPL',
      price: 100.25,
      amount: 10,
      positionEffect: 'OPENING',
      netAmount: -1004.04,
      commissionCost: 1.5,
      feeItems: [{ feeType: 'SEC_FEE', cost: 0.04 }]
    }));

    expect(parsed).toEqual({
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      price: 100.25,
      time: '2026-03-06T14:30:05Z',
      matchingSymbol: 'AAPL',
      positionEffect: 'OPENING',
      commission: 1.5,
      fees: 0.04,
      netAmount: -1004.04,
      instrumentType: 'stock',
      optionType: null,
      strikePrice: null,
      expirationDate: null,
      underlyingSymbol: null,
      cusip: '037833100',
      orderId: '1006200000001',
      accountIdentifier: '****1234'
    });
  });

  test('maps a short-sale entry (OPENING, negative amount) to side short with absolute quantity', () => {
    const parsed = schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 1006200000010,
      time: '2026-03-06T15:10:00Z',
      symbol: 'TSLA',
      price: 200,
      amount: -50,
      positionEffect: 'OPENING',
      netAmount: 10000
    }));

    expect(parsed).toMatchObject({
      symbol: 'TSLA',
      side: 'short',
      quantity: 50,
      price: 200,
      positionEffect: 'OPENING'
    });
  });

  test('sums multiple non-commission fee items separately from commission', () => {
    const parsed = schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 1006200000011,
      time: '2026-03-06T15:20:00Z',
      price: 10,
      amount: 100,
      positionEffect: 'OPENING',
      commissionCost: 0.65,
      feeItems: [
        { feeType: 'SEC_FEE', cost: 0.02 },
        { feeType: 'TAF_FEE', cost: 0.01 }
      ]
    }));

    expect(parsed.commission).toBeCloseTo(0.65, 10);
    expect(parsed.fees).toBeCloseTo(0.03, 10);
  });

  test('maps option fields from the instrument when Schwab provides them', () => {
    const parsed = schwabService.parseTransactionDetails(schwabOptionTx({
      orderId: 'opt-open-1',
      time: '2026-06-01T14:35:00Z',
      symbol: 'SPY   260618C00500000',
      putCall: 'CALL',
      strikePrice: 500,
      expirationDate: '2026-06-18',
      underlyingSymbol: 'SPY',
      price: 3.5,
      amount: 2,
      positionEffect: 'OPENING'
    }));

    expect(parsed).toMatchObject({
      symbol: 'SPY',
      matchingSymbol: 'SPY 260618C00500000',
      side: 'long',
      quantity: 2,
      price: 3.5,
      instrumentType: 'option',
      optionType: 'call',
      strikePrice: 500,
      expirationDate: '2026-06-18',
      underlyingSymbol: 'SPY'
    });
  });

  test('normalizes lowercase/padded underlying symbols from the instrument', () => {
    const parsed = schwabService.parseTransactionDetails(schwabOptionTx({
      orderId: 'opt-open-case',
      time: '2026-06-01T14:35:00Z',
      symbol: 'MRVL  260220P00065000',
      putCall: 'PUT',
      strikePrice: 65,
      expirationDate: '2026-02-20',
      underlyingSymbol: ' mrvl ',
      price: 1.5,
      amount: 1,
      positionEffect: 'OPENING'
    }));

    expect(parsed.underlyingSymbol).toBe('MRVL');
    expect(parsed.symbol).toBe('MRVL');
  });

  test('falls back to OCC symbol parsing when instrument lacks option metadata', () => {
    const parsed = schwabService.parseTransactionDetails(schwabOptionTx({
      orderId: 'opt-open-2',
      time: '2026-01-05T16:00:00Z',
      symbol: 'TSLA  260116P00200500',
      price: 4.1,
      amount: 1,
      positionEffect: 'OPENING'
    }));

    expect(parsed).toMatchObject({
      symbol: 'TSLA',
      instrumentType: 'option',
      optionType: 'put',
      strikePrice: 200.5,
      expirationDate: '2026-01-16',
      underlyingSymbol: 'TSLA'
    });
  });

  test('returns null for non-TRADE types, fee-only items, currency symbols, and zero price/amount', () => {
    expect(schwabService.parseTransactionDetails({
      type: 'DIVIDEND_OR_INTEREST',
      transferItems: [{ instrument: { assetType: 'EQUITY', symbol: 'AAPL' }, price: 1, amount: 1 }]
    })).toBeNull();

    expect(schwabService.parseTransactionDetails({
      type: 'TRADE',
      transferItems: [{ instrument: { assetType: 'CURRENCY', symbol: 'USD' }, feeType: 'COMMISSION', cost: -1 }]
    })).toBeNull();

    expect(schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 'x', time: '2026-03-06T15:00:00Z', symbol: 'USD', price: 1, amount: 1, positionEffect: 'OPENING'
    }))).toBeNull();

    expect(schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 'x', time: '2026-03-06T15:00:00Z', price: 0, amount: 10, positionEffect: 'OPENING'
    }))).toBeNull();

    expect(schwabService.parseTransactionDetails(schwabEquityTx({
      orderId: 'x', time: '2026-03-06T15:00:00Z', price: 10, amount: 0, positionEffect: 'OPENING'
    }))).toBeNull();
  });

  test('falls back to tradeDate when time is missing, preferring whichever has intraday precision', () => {
    const tx = schwabEquityTx({
      orderId: 'no-time-1',
      time: undefined,
      tradeDate: '2026-03-06T14:45:30+0000',
      price: 10,
      amount: 5,
      positionEffect: 'OPENING'
    });
    delete tx.time;

    const parsed = schwabService.parseTransactionDetails(tx);
    expect(parsed.time).toBe('2026-03-06T14:45:30+0000');
  });
});

describe('Schwab parseTransactions (full payload -> trades)', () => {
  test('stock round trip: buy then sell produces one long trade with exact fields', () => {
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 1006200000001,
        time: '2026-03-06T14:30:05Z',
        symbol: 'AAPL',
        price: 100.25,
        amount: 10,
        positionEffect: 'OPENING',
        netAmount: -1004.04,
        commissionCost: 1.5,
        feeItems: [{ feeType: 'SEC_FEE', cost: 0.04 }]
      }),
      schwabEquityTx({
        orderId: 1006200000002,
        time: '2026-03-06T19:45:30Z',
        symbol: 'AAPL',
        price: 103.75,
        amount: -10,
        positionEffect: 'CLOSING',
        netAmount: 1035.94,
        commissionCost: 1.5,
        feeItems: [{ feeType: 'SEC_FEE', cost: 0.06 }]
      })
    ]);

    expect(trades).toHaveLength(1);
    const trade = trades[0];

    expect(trade.symbol).toBe('AAPL');
    expect(trade.side).toBe('long');
    expect(trade.quantity).toBe(10);
    expect(trade.entryPrice).toBe(100.25);
    expect(trade.exitPrice).toBe(103.75);
    // Times and tradeDate are taken from the payload strings verbatim - no timezone shift.
    expect(trade.entryTime).toBe('2026-03-06T14:30:05Z');
    expect(trade.exitTime).toBe('2026-03-06T19:45:30Z');
    expect(trade.tradeDate).toBe('2026-03-06');
    expect(trade.commission).toBe(3); // 1.50 entry + 1.50 exit
    expect(trade.fees).toBeCloseTo(0.1, 10); // 0.04 entry + 0.06 exit
    expect(trade.pnl).toBe(35); // (103.75 - 100.25) * 10
    expect(trade.broker).toBe('schwab');
    expect(trade.instrumentType).toBe('stock');
    expect(trade.optionType).toBeNull();
    expect(trade.strikePrice).toBeNull();
    expect(trade.expirationDate).toBeNull();
    expect(trade.cusip).toBe('037833100');
    expect(trade.accountIdentifier).toBe('****1234');

    expect(trade.executionData).toEqual([
      {
        datetime: '2026-03-06T14:30:05Z',
        price: 100.25,
        quantity: 10,
        side: 'long',
        type: 'entry',
        orderId: '1006200000001'
      },
      {
        datetime: '2026-03-06T19:45:30Z',
        price: 103.75,
        quantity: 10,
        side: 'short', // CLOSING with negative amount maps to a sell-direction execution
        type: 'exit',
        orderId: '1006200000002'
      }
    ]);
  });

  test('partial exits split the entry commission pro rata without double counting', () => {
    // Regression: the entry commission was prorated against the lot's
    // REMAINING quantity without being consumed, so a 50/50 split of a
    // 100-share lot ($1.00 entry commission) attributed $0.50 + $1.00 = $1.50.
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 1006300000001,
        time: '2026-03-09T14:30:00Z',
        symbol: 'AAPL',
        price: 100,
        amount: 100,
        positionEffect: 'OPENING',
        netAmount: -10001,
        commissionCost: 1.0
      }),
      schwabEquityTx({
        orderId: 1006300000002,
        time: '2026-03-10T15:00:00Z',
        symbol: 'AAPL',
        price: 101,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 5050
      }),
      schwabEquityTx({
        orderId: 1006300000003,
        time: '2026-03-11T15:00:00Z',
        symbol: 'AAPL',
        price: 102,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 5100
      })
    ]);

    const closedTrades = trades.filter(t => t.exitPrice != null);
    expect(closedTrades).toHaveLength(2);
    expect(closedTrades[0].commission).toBeCloseTo(0.5, 10);
    expect(closedTrades[1].commission).toBeCloseTo(0.5, 10);
    const totalEntryCommission = closedTrades.reduce((sum, t) => sum + t.commission, 0);
    expect(totalEntryCommission).toBeCloseTo(1.0, 10);
  });

  test('short round trip: sell-to-open then buy-to-cover produces one short trade with inverted P&L', () => {
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 'short-open-1',
        time: '2026-03-09T14:00:00Z',
        symbol: 'TSLA',
        price: 200,
        amount: -50,
        positionEffect: 'OPENING',
        netAmount: 10000
      }),
      schwabEquityTx({
        orderId: 'short-close-1',
        time: '2026-03-09T18:30:00Z',
        symbol: 'TSLA',
        price: 195.5,
        amount: 50,
        positionEffect: 'CLOSING',
        netAmount: -9775
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'TSLA',
      side: 'short',
      quantity: 50,
      entryPrice: 200,
      exitPrice: 195.5,
      entryTime: '2026-03-09T14:00:00Z',
      exitTime: '2026-03-09T18:30:00Z',
      tradeDate: '2026-03-09',
      pnl: 225 // short: -(195.50 - 200) * 50
    });
  });

  test('option round trip: 100x contract multiplier and option metadata carried onto the trade', () => {
    const trades = schwabService.parseTransactions([
      schwabOptionTx({
        orderId: 'opt-open-1',
        time: '2026-06-01T14:35:00Z',
        symbol: 'SPY   260618C00500000',
        putCall: 'CALL',
        strikePrice: 500,
        expirationDate: '2026-06-18',
        underlyingSymbol: 'SPY',
        price: 3.5,
        amount: 2,
        positionEffect: 'OPENING',
        netAmount: -701.3,
        commissionCost: 1.3
      }),
      schwabOptionTx({
        orderId: 'opt-close-1',
        time: '2026-06-01T19:10:00Z',
        symbol: 'SPY   260618C00500000',
        putCall: 'CALL',
        strikePrice: 500,
        expirationDate: '2026-06-18',
        underlyingSymbol: 'SPY',
        price: 4.25,
        amount: -2,
        positionEffect: 'CLOSING',
        netAmount: 848.7,
        commissionCost: 1.3
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'SPY', // trade symbol is the underlying ticker
      side: 'long',
      quantity: 2,
      entryPrice: 3.5,
      exitPrice: 4.25,
      entryTime: '2026-06-01T14:35:00Z',
      exitTime: '2026-06-01T19:10:00Z',
      tradeDate: '2026-06-01',
      commission: 2.6,
      pnl: 150, // (4.25 - 3.50) * 2 contracts * 100
      instrumentType: 'option',
      optionType: 'call',
      strikePrice: 500,
      expirationDate: '2026-06-18',
      underlyingSymbol: 'SPY',
      accountIdentifier: '****1234'
    });
  });

  test('tradeDate is the exit timestamp date string verbatim, even just after midnight UTC', () => {
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 'late-open',
        time: '2026-07-03T20:00:00Z',
        symbol: 'AMD',
        price: 150,
        amount: 10,
        positionEffect: 'OPENING'
      }),
      schwabEquityTx({
        orderId: 'late-close',
        time: '2026-07-04T01:30:00Z',
        symbol: 'AMD',
        price: 151,
        amount: -10,
        positionEffect: 'CLOSING'
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].tradeDate).toBe('2026-07-04');
    expect(trades[0].entryTime).toBe('2026-07-03T20:00:00Z');
    expect(trades[0].exitTime).toBe('2026-07-04T01:30:00Z');
  });

  test('closing transaction with no open position becomes a trade with null entry and netAmount P&L', () => {
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 'orphan-close',
        time: '2026-03-10T15:00:00Z',
        symbol: 'NVDA',
        price: 900,
        amount: -5,
        positionEffect: 'CLOSING',
        netAmount: 4500
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'NVDA',
      quantity: 5,
      entryPrice: null,
      exitPrice: 900,
      entryTime: null,
      exitTime: '2026-03-10T15:00:00Z',
      tradeDate: '2026-03-10',
      pnl: 4500
    });
  });

  test('unclosed opening transaction maps to an open trade with null exit fields', () => {
    const trades = schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 'still-open',
        time: '2026-03-11T14:31:00Z',
        symbol: 'MSFT',
        price: 410,
        amount: 25,
        positionEffect: 'OPENING',
        commissionCost: 1
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'MSFT',
      side: 'long',
      quantity: 25,
      entryPrice: 410,
      exitPrice: null,
      entryTime: '2026-03-11T14:31:00Z',
      exitTime: null,
      tradeDate: '2026-03-11',
      commission: 1,
      // groupTrades coerces the open trade's null P&L to 0 (totalPnL starts at 0
      // and 0 !== null); pinning current behavior.
      pnl: 0
    });
  });
});

describe('Schwab option symbol parsing', () => {
  test('_parseSchwabOptionSymbol decodes underlying, expiration, type, and strike exactly', () => {
    expect(schwabService._parseSchwabOptionSymbol('SPY   260618C00500000')).toEqual({
      underlyingSymbol: 'SPY',
      expirationDate: '2026-06-18',
      optionType: 'call',
      strikePrice: 500,
      contractSize: 100
    });

    expect(schwabService._parseSchwabOptionSymbol('TSLA  260116P00200500')).toEqual({
      underlyingSymbol: 'TSLA',
      expirationDate: '2026-01-16',
      optionType: 'put',
      strikePrice: 200.5,
      contractSize: 100
    });

    expect(schwabService._parseSchwabOptionSymbol('AAPL')).toBeNull();
    expect(schwabService._parseSchwabOptionSymbol('SPY 261332C00500000')).toBeNull(); // month 13 invalid
  });
});

describe('Schwab dedupe key construction (exit orderId|datetime)', () => {
  function buildRoundTripTrade() {
    return schwabService.parseTransactions([
      schwabEquityTx({
        orderId: 1006200000001,
        time: '2026-03-06T14:30:05Z',
        symbol: 'AAPL',
        price: 100.25,
        amount: 10,
        positionEffect: 'OPENING'
      }),
      schwabEquityTx({
        orderId: 1006200000002,
        time: '2026-03-06T19:45:30Z',
        symbol: 'AAPL',
        price: 103.75,
        amount: -10,
        positionEffect: 'CLOSING'
      })
    ])[0];
  }

  function asExistingRow(trade) {
    return {
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      entry_time: trade.entryTime,
      exit_time: trade.exitTime,
      trade_date: trade.tradeDate,
      pnl: trade.pnl,
      instrument_type: trade.instrumentType,
      account_identifier: trade.accountIdentifier,
      executions: trade.executionData
    };
  }

  test('same input produces a stable dedupe decision (re-sync of identical payload is a duplicate)', () => {
    const trade = buildRoundTripTrade();
    const existing = [asExistingRow(buildRoundTripTrade())];

    expect(schwabService.isDuplicateTrade(trade, existing)).toBe(true);
    // Stability: same input evaluated again yields the same result
    expect(schwabService.isDuplicateTrade(trade, existing)).toBe(true);
  });

  test('a different fill (new exit orderId/datetime, different qty and price) is NOT a duplicate', () => {
    // Partial-exit scenario: buy 15, sell 5 (already imported), then sell 10 later.
    // The second exit shares the entry order but has a distinct exit order ID.
    const existing = [{
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
      account_identifier: '****1234',
      executions: [
        { datetime: '2026-03-06T14:30:00Z', price: 100, quantity: 5, side: 'long', type: 'entry', orderId: 'entry-1' },
        { datetime: '2026-03-06T15:00:00Z', price: 105, quantity: 5, side: 'short', type: 'exit', orderId: 'exit-1' }
      ]
    }];

    const laterPartialExit = {
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      entryPrice: 100,
      exitPrice: 106,
      entryTime: '2026-03-06T14:30:00Z',
      exitTime: '2026-03-06T16:30:00Z',
      tradeDate: '2026-03-06',
      pnl: 60,
      instrumentType: 'stock',
      accountIdentifier: '****1234',
      executionData: [
        { datetime: '2026-03-06T14:30:00Z', price: 100, quantity: 10, side: 'long', type: 'entry', orderId: 'entry-1' },
        { datetime: '2026-03-06T16:30:00Z', price: 106, quantity: 10, side: 'short', type: 'exit', orderId: 'exit-2' }
      ]
    };

    expect(schwabService.isDuplicateTrade(laterPartialExit, existing)).toBe(false);
  });

  test('same exit orderId at a different datetime is NOT matched (key includes both parts)', () => {
    const trade = buildRoundTripTrade();
    const shiftedExisting = asExistingRow(buildRoundTripTrade());
    // Same order ID, but different exit timestamp, quantity, prices, and P&L
    shiftedExisting.executions[1].datetime = '2026-03-06T19:59:59Z';
    shiftedExisting.exit_time = '2026-03-06T19:59:59Z';
    shiftedExisting.quantity = 7;
    shiftedExisting.entry_price = 95;
    shiftedExisting.exit_price = 99;
    shiftedExisting.pnl = 28;

    expect(schwabService.isDuplicateTrade(trade, shiftedExisting ? [shiftedExisting] : [])).toBe(false);
  });

  test('trades in different accounts are not considered duplicates of each other', () => {
    const trade = buildRoundTripTrade();
    const otherAccount = asExistingRow(buildRoundTripTrade());
    otherAccount.account_identifier = '****9999';

    expect(schwabService.isDuplicateTrade(trade, [otherAccount])).toBe(false);
  });
});
