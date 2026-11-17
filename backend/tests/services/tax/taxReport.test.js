const { buildTradeLots } = require('../../../src/services/tax/taxLots');
const { buildTaxReport, isLongTerm } = require('../../../src/services/tax/taxReportService');
const { toCsv, toTxf } = require('../../../src/services/tax/taxExport');

let nextId = 1;
const fill = (action, quantity, price, datetime, fees = 0) => ({ action, quantity, price, datetime, fees });

// A stock trade built from fills; entry/exit/pnl are derived so fixtures stay consistent.
function trade(overrides = {}) {
  const executions = overrides.executions || [];
  const side = overrides.side || 'long';
  const multiplier = overrides.instrument_type === 'option' ? 100 : (overrides.point_value || 1);
  const opens = executions.filter((e) => (side === 'long' ? e.action === 'buy' : e.action === 'sell'));
  const closes = executions.filter((e) => (side === 'long' ? e.action === 'sell' : e.action === 'buy'));
  const sum = (list, f) => list.reduce((total, e) => total + f(e), 0);
  const openQty = sum(opens, (e) => e.quantity);
  const closeQty = sum(closes, (e) => e.quantity);
  const openValue = sum(opens, (e) => e.quantity * e.price) * multiplier;
  const closeValue = sum(closes, (e) => e.quantity * e.price) * multiplier;
  const fees = sum(executions, (e) => e.fees || 0);
  const closed = closeQty >= openQty && openQty > 0;
  return {
    id: `trade-${nextId++}`,
    symbol: 'AAPL',
    side,
    instrument_type: 'stock',
    quantity: openQty,
    entry_price: openQty ? openValue / multiplier / openQty : null,
    exit_price: closed ? closeValue / multiplier / closeQty : null,
    entry_time: opens[0]?.datetime || null,
    exit_time: closed ? closes[closes.length - 1].datetime : null,
    commission: 0,
    fees: 0,
    pnl: closed ? (side === 'long' ? closeValue - openValue : openValue - closeValue) - fees : null,
    original_currency: 'USD',
    account_identifier: 'ACC-1',
    ...overrides,
    executions
  };
}

const TZ = 'America/New_York';
const report = (trades, year, extra = {}) => buildTaxReport(trades, { year, timezone: TZ, ...extra });

describe('buildTradeLots', () => {
  it('matches sells to buys first in, first out, with fees on the right side', () => {
    const t = trade({
      executions: [
        fill('buy', 100, 10, '2025-01-06T15:00:00Z', 1),
        fill('buy', 100, 12, '2025-01-07T15:00:00Z', 1),
        fill('sell', 150, 15, '2025-02-03T15:00:00Z', 3),
        fill('sell', 50, 9, '2025-02-04T15:00:00Z', 1)
      ]
    });

    const { dispositions, issue } = buildTradeLots(t, TZ);

    expect(issue).toBeNull();
    expect(dispositions.map((d) => [d.quantity, d.openedDate, d.closedDate])).toEqual([
      [100, '2025-01-06', '2025-02-03'],
      [50, '2025-01-07', '2025-02-03'],
      [50, '2025-01-07', '2025-02-04']
    ]);
    // First lot: 100 x 10 + 1.00 fee; sold 100 of 150 at 15 less 2/3 of the 3.00 fee.
    expect(dispositions[0].basis).toBeCloseTo(1001);
    expect(dispositions[0].proceeds).toBeCloseTo(1498);
    expect(dispositions[1].basis).toBeCloseTo(600.5);
    expect(dispositions[1].proceeds).toBeCloseTo(749);
    expect(dispositions[2].basis).toBeCloseTo(600.5);
    expect(dispositions[2].proceeds).toBeCloseTo(449);
    const gain = dispositions.reduce((total, d) => total + d.proceeds - d.basis, 0);
    expect(gain).toBeCloseTo(t.pnl);
  });

  it('treats a short trade as sale proceeds first and cover cost as basis', () => {
    const t = trade({
      side: 'short',
      executions: [fill('sell', 100, 20, '2025-03-03T15:00:00Z', 2), fill('buy', 100, 18, '2025-03-05T15:00:00Z', 2)]
    });

    const [d] = buildTradeLots(t, TZ).dispositions;

    expect(d.proceeds).toBeCloseTo(1998);
    expect(d.basis).toBeCloseTo(1802);
    expect(d.closedDate).toBe('2025-03-05');
  });

  it('applies the option contract multiplier', () => {
    const t = trade({
      instrument_type: 'option',
      contract_size: 100,
      executions: [fill('buy', 2, 1.5, '2025-03-03T15:00:00Z'), fill('sell', 2, 2.25, '2025-03-04T15:00:00Z')]
    });

    const [d] = buildTradeLots(t, TZ).dispositions;

    expect(d.basis).toBeCloseTo(300);
    expect(d.proceeds).toBeCloseTo(450);
  });

  it('reads grouped round-trip legs', () => {
    const t = trade({
      quantity: 10, entry_price: 50, exit_price: 55, pnl: 49,
      entry_time: '2025-04-01T14:00:00Z', exit_time: '2025-04-01T18:00:00Z',
      executions: [{ entryPrice: 50, exitPrice: 55, quantity: 10, entryTime: '2025-04-01T14:00:00Z', exitTime: '2025-04-01T18:00:00Z', fees: 1, side: 'long' }]
    });

    const { dispositions, issue } = buildTradeLots(t, TZ);

    expect(issue).toBeNull();
    expect(dispositions[0].proceeds - dispositions[0].basis).toBeCloseTo(49);
  });

  it('falls back to the trade totals when the fills do not add up to the stored P&L', () => {
    const t = trade({
      executions: [fill('buy', 100, 10, '2025-01-06T15:00:00Z'), fill('sell', 100, 11, '2025-01-08T15:00:00Z')],
      pnl: 60 // the fills say 100
    });

    const { dispositions, issue } = buildTradeLots(t, TZ);

    expect(issue).toBe('approximated');
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0].approximate).toBe(true);
    expect(dispositions[0].proceeds - dispositions[0].basis).toBeCloseTo(60);
  });

  it('builds a trade with no fills from its own totals', () => {
    const t = trade({
      quantity: 10, entry_price: 100, exit_price: 90, commission: 2, pnl: -102,
      entry_time: '2025-05-01T14:00:00Z', exit_time: '2025-05-02T14:00:00Z'
    });

    const { dispositions, issue } = buildTradeLots(t, TZ);

    expect(issue).toBeNull();
    expect(dispositions[0].basis).toBeCloseTo(1000);
    expect(dispositions[0].proceeds).toBeCloseTo(898);
  });

  it('reports partial exits of a trade that is still open', () => {
    const t = trade({
      executions: [fill('buy', 100, 10, '2025-01-06T15:00:00Z'), fill('sell', 40, 12, '2025-01-09T15:00:00Z')]
    });

    const { dispositions, issue } = buildTradeLots(t, TZ);

    expect(issue).toBeNull();
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0].quantity).toBe(40);
  });

  it('reports a trade whose stored entry is later than its exit as a same-day, estimated sale', () => {
    const t = trade({
      quantity: 10, entry_price: 100, exit_price: 110, pnl: 100,
      entry_time: '2025-06-18T15:00:00Z', exit_time: '2025-06-15T15:00:00Z'
    });

    const [d] = buildTradeLots(t, TZ).dispositions;

    expect(d).toMatchObject({ openedDate: '2025-06-15', closedDate: '2025-06-15', approximate: true });
  });

  it('skips a futures trade whose point value is unknown', () => {
    const t = trade({ instrument_type: 'future', point_value: null, executions: [fill('buy', 1, 5000, '2025-01-06T15:00:00Z'), fill('sell', 1, 5010, '2025-01-06T16:00:00Z')] });

    expect(buildTradeLots(t, TZ).issue).toBe('missing_multiplier');
  });

  it('uses the tax date in the user timezone, not UTC', () => {
    // 01:30 UTC on Jan 1 is still Dec 31 in New York.
    const t = trade({ executions: [fill('buy', 10, 10, '2024-12-30T15:00:00Z'), fill('sell', 10, 11, '2025-01-01T01:30:00Z')] });

    expect(buildTradeLots(t, TZ).dispositions[0].closedDate).toBe('2024-12-31');
  });
});

describe('isLongTerm', () => {
  it('needs more than one year', () => {
    expect(isLongTerm('2024-03-01', '2025-03-01')).toBe(false);
    expect(isLongTerm('2024-03-01', '2025-03-02')).toBe(true);
    expect(isLongTerm('2024-02-29', '2025-03-01')).toBe(true);
  });
});

describe('wash sales', () => {
  const lossThenRebuy = (rebuyDate, rebuyQty = 100) => [
    trade({ executions: [fill('buy', 100, 50, '2025-03-03T15:00:00Z'), fill('sell', 100, 40, '2025-03-10T15:00:00Z')] }),
    trade({ executions: [fill('buy', rebuyQty, 41, `${rebuyDate}T15:00:00Z`), fill('sell', rebuyQty, 45, '2025-06-02T15:00:00Z')] })
  ];

  it('disallows a loss when the stock is bought back within 30 days and moves it into the new basis', () => {
    const { rows, summary } = report(lossThenRebuy('2025-03-20'), 2025);

    expect(rows[0]).toMatchObject({
      proceeds: 4000, costBasis: 5000, adjustmentCode: 'W', adjustmentAmount: 1000, gainLoss: 0
    });
    // Replacement: 4,100 paid + 1,000 deferred loss.
    expect(rows[1]).toMatchObject({ proceeds: 4500, costBasis: 5100, adjustmentCode: '', gainLoss: -600 });
    expect(summary.washSales).toEqual({ count: 1, disallowed: 1000 });
    // The loss is deferred, not lost: the year still nets to the real P&L.
    expect(summary.netGainLoss).toBe(-600);
  });

  it('counts a purchase exactly 30 days later but not 31', () => {
    expect(report(lossThenRebuy('2025-04-09'), 2025).rows[0].adjustmentCode).toBe('W');
    expect(report(lossThenRebuy('2025-04-10'), 2025).rows[0].adjustmentCode).toBe('');
  });

  it('disallows only the share of the loss that was replaced', () => {
    const { rows } = report(lossThenRebuy('2025-03-20', 40), 2025);

    expect(rows[0]).toMatchObject({ adjustmentAmount: 400, gainLoss: -600 });
    expect(rows[1].costBasis).toBe(40 * 41 + 400);
  });

  it('uses each replacement share once', () => {
    const trades = [
      trade({ executions: [fill('buy', 100, 50, '2025-03-03T15:00:00Z'), fill('sell', 100, 40, '2025-03-10T15:00:00Z')] }),
      trade({ executions: [fill('buy', 100, 50, '2025-03-04T15:00:00Z'), fill('sell', 100, 40, '2025-03-11T15:00:00Z')] }),
      trade({ executions: [fill('buy', 100, 41, '2025-03-20T15:00:00Z'), fill('sell', 100, 41, '2025-08-01T15:00:00Z')] })
    ];

    const { rows, summary } = report(trades, 2025);

    // The first loss is replaced by the second lot (still held on Mar 10),
    // the second loss by the Mar 20 purchase; nothing is matched twice.
    expect(summary.washSales.count).toBe(2);
    expect(summary.netGainLoss).toBe(-2000);
    expect(rows[rows.length - 1].gainLoss).toBeLessThan(0);
  });

  it('carries a December loss into the next tax year', () => {
    const trades = [
      trade({ executions: [fill('buy', 100, 50, '2024-12-02T15:00:00Z'), fill('sell', 100, 40, '2024-12-20T15:00:00Z')] }),
      trade({ executions: [fill('buy', 100, 41, '2025-01-06T15:00:00Z'), fill('sell', 100, 41, '2025-03-03T15:00:00Z')] })
    ];

    expect(report(trades, 2024).summary.netGainLoss).toBe(0);
    expect(report(trades, 2025).summary.netGainLoss).toBe(-1000);
  });

  it('catches a replacement bought in another account, even when the report is filtered to one', () => {
    const trades = lossThenRebuy('2025-03-20');
    trades[1].account_identifier = 'ACC-2';

    const { rows } = report(trades, 2025, { accounts: ['ACC-1'] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account: 'ACC-1', adjustmentCode: 'W', adjustmentAmount: 1000 });
  });

  it('does not match a different option contract or apply to crypto', () => {
    const option = (strike, buy, sell, buyDate, sellDate) => trade({
      instrument_type: 'option', contract_size: 100, underlying_symbol: 'AAPL', strike_price: strike,
      expiration_date: '2025-06-20', option_type: 'call',
      executions: [fill('buy', 1, buy, `${buyDate}T15:00:00Z`), fill('sell', 1, sell, `${sellDate}T15:00:00Z`)]
    });
    const crypto = (buy, sell, buyDate, sellDate) => trade({
      instrument_type: 'crypto', symbol: 'BTC',
      executions: [fill('buy', 1, buy, `${buyDate}T15:00:00Z`), fill('sell', 1, sell, `${sellDate}T15:00:00Z`)]
    });

    const { summary } = report([
      option(200, 5, 3, '2025-03-03', '2025-03-10'),
      option(210, 3, 4, '2025-03-12', '2025-04-01'),
      crypto(60000, 50000, '2025-03-03', '2025-03-10'),
      crypto(51000, 52000, '2025-03-12', '2025-04-01')
    ], 2025);

    expect(summary.washSales.count).toBe(0);
  });

  it('applies to short positions reopened after a loss', () => {
    const short = (sell, cover, openDate, closeDate) => trade({
      side: 'short',
      executions: [fill('sell', 100, sell, `${openDate}T15:00:00Z`), fill('buy', 100, cover, `${closeDate}T15:00:00Z`)]
    });

    const { rows } = report([short(40, 45, '2025-03-03', '2025-03-10'), short(46, 44, '2025-03-12', '2025-04-01')], 2025);

    expect(rows[0]).toMatchObject({ adjustmentCode: 'W', adjustmentAmount: 500, gainLoss: 0 });
    expect(rows[1].gainLoss).toBe(-300);
  });
});

describe('buildTaxReport', () => {
  it('splits short-term and long-term and lists the years with activity', () => {
    const trades = [
      trade({ executions: [fill('buy', 10, 100, '2023-01-10T15:00:00Z'), fill('sell', 10, 150, '2025-02-10T15:00:00Z')] }),
      trade({ symbol: 'MSFT', executions: [fill('buy', 10, 100, '2025-02-03T15:00:00Z'), fill('sell', 10, 90, '2025-02-10T15:00:00Z')] }),
      trade({ symbol: 'NVDA', executions: [fill('buy', 5, 100, '2024-02-03T15:00:00Z'), fill('sell', 5, 110, '2024-02-10T15:00:00Z')] })
    ];

    const result = report(trades, 2025);

    expect(result.availableYears).toEqual([2025, 2024]);
    expect(result.summary.longTerm).toMatchObject({ count: 1, proceeds: 1500, costBasis: 1000, gainLoss: 500 });
    expect(result.summary.shortTerm).toMatchObject({ count: 1, gainLoss: -100 });
    expect(result.summary.netGainLoss).toBe(400);
    expect(result.rows.map((row) => row.description)).toEqual(['10 sh AAPL', '10 sh MSFT']);
  });

  it('reports futures as a section 1256 total split 60/40, off Form 8949', () => {
    const future = trade({
      instrument_type: 'future', symbol: 'ESH5', point_value: 50,
      executions: [fill('buy', 1, 5000, '2025-01-06T15:00:00Z'), fill('sell', 1, 5020, '2025-01-06T16:00:00Z')]
    });

    const result = report([future], 2025);

    expect(result.rows).toEqual([]);
    expect(result.summary.section1256).toEqual({ count: 1, gainLoss: 1000, longTermPortion: 600, shortTermPortion: 400 });
    expect(result.summary.netGainLoss).toBe(1000);
  });

  it('describes option contracts and marks short sales as short-term', () => {
    const option = trade({
      side: 'short', instrument_type: 'option', contract_size: 100, underlying_symbol: 'TSLA', symbol: 'TSLA250620P00200000',
      strike_price: 200, expiration_date: '2025-06-20', option_type: 'put',
      executions: [fill('sell', 2, 3, '2023-01-10T15:00:00Z'), fill('buy', 2, 1, '2025-02-10T15:00:00Z')]
    });

    const [row] = report([option], 2025).rows;

    expect(row).toMatchObject({
      description: '2 TSLA 2025-06-20 200 PUT', term: 'short', dateAcquired: '2025-02-10', dateSold: '2025-02-10',
      proceeds: 600, costBasis: 200, gainLoss: 400
    });
  });

  it('leaves out trades stored in another currency and counts them', () => {
    const eur = trade({ original_currency: 'EUR', executions: [fill('buy', 10, 100, '2025-02-03T15:00:00Z'), fill('sell', 10, 90, '2025-02-10T15:00:00Z')] });

    const result = report([eur], 2025);

    expect(result.rows).toEqual([]);
    expect(result.excluded.otherCurrency).toBe(1);
  });

  it('nets to the stored P&L over a whole history, whatever the wash sales do', () => {
    const trades = [];
    let total = 0;
    // Forty overlapping round trips in one ticker with alternating results.
    for (let i = 0; i < 40; i++) {
      const day = String(1 + (i % 27)).padStart(2, '0');
      const month = String(1 + Math.floor(i / 14)).padStart(2, '0');
      const exit = i % 3 === 0 ? 48 - (i % 5) : 51 + (i % 4);
      const t = trade({ executions: [fill('buy', 10 + i, 50, `2025-${month}-${day}T15:00:00Z`, 0.5), fill('sell', 10 + i, exit, `2025-${month}-${day}T19:00:00Z`, 0.5)] });
      total += t.pnl;
      trades.push(t);
    }
    // Out of the ticker for the rest of the year, so every deferred loss is realised.
    const result = report(trades, 2025);

    expect(result.summary.washSales.count).toBeGreaterThan(0);
    expect(result.summary.netGainLoss).toBeCloseTo(total, 1);
  });
});

describe('exports', () => {
  const sample = () => report([
    trade({ executions: [fill('buy', 100, 50, '2025-03-03T15:00:00Z'), fill('sell', 100, 40, '2025-03-10T15:00:00Z')] }),
    trade({ executions: [fill('buy', 100, 41, '2025-03-20T15:00:00Z'), fill('sell', 100, 45, '2025-06-02T15:00:00Z')] }),
    trade({ symbol: '=CMD', executions: [fill('buy', 10, 100, '2023-01-10T15:00:00Z'), fill('sell', 10, 150, '2025-02-10T15:00:00Z')] })
  ], 2025);

  it('writes Form 8949 columns to CSV without mangling negative amounts', () => {
    const lines = toCsv(sample()).trim().split('\r\n');

    expect(lines[0]).toBe('Description of property,Date acquired,Date sold,Proceeds,Cost or other basis,Adjustment code,Adjustment amount,Gain or loss,Term,Symbol,Account');
    expect(lines[2]).toBe('100 sh AAPL,03/03/2025,03/10/2025,4000.00,5000.00,W,1000.00,0.00,Short-term,AAPL,ACC-1');
    expect(lines[3]).toBe('100 sh AAPL,03/20/2025,06/02/2025,4500.00,5100.00,,,-600.00,Short-term,AAPL,ACC-1');
    // A symbol that starts with "=" is neutralised, not executed by a spreadsheet.
    expect(lines[1]).toContain("'=CMD");
    expect(lines[1]).toContain('Long-term');
  });

  it('writes a TXF file TurboTax Desktop can import', () => {
    const txf = toTxf(sample(), { box: 'A', createdOn: new Date(2026, 1, 3) }).split('\r\n');

    expect(txf.slice(0, 4)).toEqual(['V042', 'ATradeTally', 'D02/03/2026', '^']);
    // Long-term, Copy A, no adjustment: record format 4.
    expect(txf.slice(4, 14)).toEqual(['TD', 'N323', 'C1', 'L1', 'P10 sh =CMD', 'D01/10/2023', 'D02/10/2025', '$1000.00', '$1500.00', '^']);
    // Short-term wash sale: record format 5 with the disallowed loss as a third amount.
    expect(txf.slice(14, 25)).toEqual(['TD', 'N321', 'C1', 'L1', 'P100 sh AAPL', 'D03/03/2025', 'D03/10/2025', '$5000.00', '$4000.00', '$1000.00', '^']);
  });

  it('uses the reference numbers for the chosen Form 8949 box', () => {
    const codes = (box) => [...new Set(toTxf(sample(), { box }).split('\r\n').filter((line) => /^N\d+$/.test(line)))];

    expect(codes('B')).toEqual(['N713', 'N711']);
    expect(codes('C')).toEqual(['N714', 'N712']);
  });
});
