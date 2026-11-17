/**
 * Tax report: realised gains and losses for one tax year, laid out the way
 * US returns ask for them.
 *
 *  - Stocks, options and crypto become Form 8949 lines (one per lot sold),
 *    split short-term / long-term, with wash sales adjusted.
 *  - Futures are summarised for Form 6781 (section 1256, 60% long-term and
 *    40% short-term whatever the holding period).
 *
 * The figures are an estimate built from the journal. The broker's 1099-B is
 * the record the IRS receives; this report exists to preview the year, to
 * check a 1099-B, and to catch wash sales across accounts that no single
 * broker can see.
 */

const db = require('../../config/database');
const { getUserTimezone } = require('../../utils/timezone');
const { tradeBaseCurrency } = require('../../utils/tradeFx');
const { buildTradeLots } = require('./taxLots');
const { applyWashSales } = require('./washSales');

// Wash-sale rules cover stock and securities. Crypto is reported on Form 8949
// but is not currently subject to them.
const WASH_SALE_TYPES = new Set(['stock', 'option']);
const SECTION_1256_TYPES = new Set(['future']);

const TRADE_COLUMNS = `
  id, symbol, side, quantity, entry_price, exit_price, entry_time, exit_time, trade_date,
  commission, fees, pnl, instrument_type, contract_size, point_value, strike_price,
  expiration_date, option_type, underlying_symbol, executions, account_identifier, broker,
  original_currency, original_entry_price_currency, original_exit_price_currency, original_pnl_currency
`;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const trimNumber = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
};

// Held more than one year: sold after the first anniversary of the purchase.
function isLongTerm(openedDate, closedDate) {
  if (!openedDate || !closedDate) return false;
  const [year, month, day] = openedDate.split('-').map(Number);
  const anniversary = `${String(year + 1).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return closedDate > anniversary;
}

function describe(trade, quantity) {
  const qty = trimNumber(quantity);
  if (trade.instrument_type === 'option') {
    const underlying = String(trade.underlying_symbol || trade.symbol || '').toUpperCase();
    const expiry = trade.expiration_date
      ? new Date(trade.expiration_date).toISOString().slice(0, 10)
      : '';
    const strike = trade.strike_price !== null && trade.strike_price !== undefined ? trimNumber(Number(trade.strike_price)) : '';
    const type = String(trade.option_type || '').toLowerCase().startsWith('p') ? 'PUT' : 'CALL';
    return `${qty} ${underlying} ${expiry} ${strike} ${type}`.replace(/\s+/g, ' ').trim();
  }
  const unit = trade.instrument_type === 'stock' ? ' sh' : '';
  return `${qty}${unit} ${String(trade.symbol || '').toUpperCase()}`;
}

function emptyBucket() {
  return { count: 0, proceeds: 0, costBasis: 0, adjustments: 0, gainLoss: 0 };
}

function addToBucket(bucket, row) {
  bucket.count += 1;
  bucket.proceeds += row.proceeds;
  bucket.costBasis += row.costBasis;
  bucket.adjustments += row.adjustmentAmount;
  bucket.gainLoss += row.gainLoss;
}

function roundBucket(bucket) {
  return {
    count: bucket.count,
    proceeds: round2(bucket.proceeds),
    costBasis: round2(bucket.costBasis),
    adjustments: round2(bucket.adjustments),
    gainLoss: round2(bucket.gainLoss)
  };
}

/**
 * Build the report from trade rows. Pure, so it can be tested without a database.
 *
 * @param {Array<object>} trades - every trade of the user (all years, all accounts)
 * @param {{year: number, timezone?: string, accounts?: string[]}} options
 */
function buildTaxReport(trades, { year, timezone = 'UTC', accounts = null } = {}) {
  const tradeById = new Map();
  const lots = [];
  const dispositions = [];
  const excluded = { otherCurrency: 0, missingMultiplier: 0, unusable: 0 };
  const approximatedTrades = new Set();

  for (const trade of trades) {
    if (tradeBaseCurrency(trade) !== 'USD') {
      if (trade.exit_time) excluded.otherCurrency += 1;
      continue;
    }
    const built = buildTradeLots(trade, timezone);
    if (built.issue === 'missing_multiplier') { excluded.missingMultiplier += 1; continue; }
    if (built.issue === 'unusable') { excluded.unusable += 1; continue; }
    if (built.issue === 'approximated') approximatedTrades.add(trade.id);
    tradeById.set(trade.id, trade);
    lots.push(...built.lots);
    dispositions.push(...built.dispositions);
  }

  // Wash sales look across every account and every year, before any filtering.
  const washLots = lots.filter((lot) => WASH_SALE_TYPES.has(tradeById.get(lot.tradeId).instrument_type));
  const washDispositions = dispositions.filter((d) => WASH_SALE_TYPES.has(tradeById.get(d.tradeId).instrument_type));
  applyWashSales(washLots, washDispositions);

  const accountFilter = Array.isArray(accounts) && accounts.length > 0 ? new Set(accounts) : null;
  const yearPrefix = `${year}-`;
  const years = new Set();
  const rows = [];
  // Only the net result: a futures contract's "proceeds" would be its full
  // notional value, which Form 6781 does not ask for and which reads as nonsense.
  const section1256 = { count: 0, gainLoss: 0 };
  const shortTerm = emptyBucket();
  const longTerm = emptyBucket();
  const washSales = { count: 0, disallowed: 0 };

  const ordered = [...dispositions].sort((a, b) => a.closedMs - b.closedMs || a.openedMs - b.openedMs);
  for (const disposition of ordered) {
    if (!disposition.closedDate) continue;
    const trade = tradeById.get(disposition.tradeId);
    if (accountFilter && !accountFilter.has(trade.account_identifier)) continue;
    years.add(Number(disposition.closedDate.slice(0, 4)));
    if (!disposition.closedDate.startsWith(yearPrefix)) continue;

    if (SECTION_1256_TYPES.has(trade.instrument_type)) {
      section1256.count += 1;
      section1256.gainLoss += disposition.proceeds - disposition.basis;
      continue;
    }

    const proceeds = round2(disposition.proceeds);
    const costBasis = round2(disposition.basis + (disposition.carriedBasis || 0));
    const adjustmentAmount = round2(disposition.washDisallowed || 0);
    const short = trade.side === 'short';
    const row = {
      tradeId: trade.id,
      symbol: String(trade.symbol || '').toUpperCase(),
      description: describe(trade, disposition.quantity),
      instrumentType: trade.instrument_type || 'stock',
      side: short ? 'short' : 'long',
      account: trade.account_identifier || null,
      quantity: Number(trimNumber(disposition.quantity)),
      // A short sale is reported with the date it was closed in both columns.
      dateAcquired: short ? disposition.closedDate : disposition.openedDate,
      dateSold: disposition.closedDate,
      proceeds,
      costBasis,
      adjustmentCode: adjustmentAmount > 0 ? 'W' : '',
      adjustmentAmount,
      gainLoss: round2(proceeds - costBasis + adjustmentAmount),
      term: !short && isLongTerm(disposition.openedDate, disposition.closedDate) ? 'long' : 'short',
      approximate: !!disposition.approximate
    };
    rows.push(row);
    addToBucket(row.term === 'long' ? longTerm : shortTerm, row);
    if (adjustmentAmount > 0) {
      washSales.count += 1;
      washSales.disallowed += adjustmentAmount;
    }
  }

  const net1256 = round2(section1256.gainLoss);
  const longPortion1256 = round2(net1256 * 0.6);
  const short8949 = roundBucket(shortTerm);
  const long8949 = roundBucket(longTerm);

  return {
    year,
    timezone,
    availableYears: [...years].sort((a, b) => b - a),
    summary: {
      shortTerm: short8949,
      longTerm: long8949,
      section1256: {
        count: section1256.count,
        gainLoss: net1256,
        longTermPortion: longPortion1256,
        shortTermPortion: round2(net1256 - longPortion1256)
      },
      washSales: { count: washSales.count, disallowed: round2(washSales.disallowed) },
      netGainLoss: round2(short8949.gainLoss + long8949.gainLoss + net1256)
    },
    excluded: {
      ...excluded,
      approximated: rows.filter((row) => row.approximate).length
    },
    rows
  };
}

class TaxReportService {
  static async loadTrades(userId) {
    const result = await db.query(
      `SELECT ${TRADE_COLUMNS}
       FROM trades
       WHERE user_id = $1 AND COALESCE(is_simulated, false) = false
       ORDER BY entry_time ASC NULLS LAST, id ASC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * @param {string} userId
   * @param {{year?: number, accounts?: string[]}} options
   */
  static async generate(userId, { year, accounts = null } = {}) {
    const [trades, timezone] = await Promise.all([
      this.loadTrades(userId),
      getUserTimezone(userId)
    ]);
    const report = buildTaxReport(trades, { year, timezone, accounts });
    // With no year asked for, show the most recent one that has anything in it.
    if (!year && report.availableYears.length > 0) {
      return buildTaxReport(trades, { year: report.availableYears[0], timezone, accounts });
    }
    return report;
  }
}

module.exports = TaxReportService;
module.exports.buildTaxReport = buildTaxReport;
module.exports.isLongTerm = isLongTerm;
