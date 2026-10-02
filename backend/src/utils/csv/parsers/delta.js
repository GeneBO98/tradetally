const { parse } = require('csv-parse/sync');
const { parseDateTime, parseNumeric, cleanString } = require('../shared');
const { parseGenericTransactions } = require('./generic');

// Delta linear perpetual sizes are contract counts. Store underlying units
// so the canonical crypto P&L engine uses the same quantity as the parser.
// https://www.delta.exchange/support/solutions?articleId=80001177912
const CONTRACT_UNITS = { BTCUSD: 0.001, ETHUSD: 0.01 };

function hasDeltaOrderHistoryHeaders(headers = []) {
  return ['Time', 'Contract', 'Qty', 'Side', 'Filled/Remaining', 'Exec.Price', 'Order Value', 'Trading Fees', 'Realised P&L', 'Status']
    .every(header => headers.includes(header));
}

async function parseDeltaOrderHistory(csvString, context = {}) {
  const records = parse(csvString, { columns: true, skip_empty_lines: true, trim: true });
  const diagnostics = context.diagnostics;
  diagnostics.totalRows = records.length;
  diagnostics.headerAnalysis.foundHeaders = Object.keys(records[0] || {});
  diagnostics.warnings.push('Delta order history uses contract counts. BTCUSD and ETHUSD quantities were converted to underlying units; per-order realized P&L was matched through executions.');
  const normalized = [];

  const reject = (row, reason, expected = false) => {
    if (expected) {
      diagnostics.skippedRows++;
      diagnostics.expected_skipped_rows++;
    } else diagnostics.invalidRows++;
    diagnostics.skippedReasons.push({ row, reason });
  };

  records.forEach((record, index) => {
    const row = index + 1;
    const fill = cleanString(record['Filled/Remaining']).match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!fill) return reject(row, 'Invalid Delta filled/remaining quantity');
    const filled = Number(fill[1]);
    const remaining = Number(fill[2]);
    if (filled === 0) return reject(row, 'Unfilled Delta order (not executed)', true);

    // A partially filled order only has an order-level average and timestamp.
    // Require the Trade History export to recover its individual executions.
    if (remaining !== 0 || filled !== parseNumeric(record.Qty, NaN)) {
      return reject(row, 'Partial Delta order: export Trade History for individual fills');
    }
    const symbol = cleanString(record.Contract).toUpperCase();
    const unitSize = CONTRACT_UNITS[symbol];
    if (!unitSize) return reject(row, `Unsupported Delta contract size for ${symbol}: BTCUSD and ETHUSD linear orders are supported`);

    const price = parseNumeric(record['Exec.Price'], NaN);
    const orderValue = parseNumeric(record['Order Value'], NaN);
    const quantity = Number((filled * unitSize).toPrecision(12));
    const expectedValue = price * quantity;
    if (!(price > 0) || !Number.isFinite(orderValue) || Math.abs(Math.abs(orderValue) - expectedValue) > Math.max(0.000001, expectedValue * 0.000001)) {
      return reject(row, 'Delta order value does not match its linear contract size');
    }

    // The export appends a zone name after its explicit numeric offset:
    // "2026-09-29 21:25:49.252513+05:30 IST Asia/Kolkata".
    const timestamp = cleanString(record.Time).match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))(?:\s+[A-Za-z_]+(?:\s+[A-Za-z_/]+)?)?$/);
    const parsedTime = timestamp ? parseDateTime(timestamp[1]) : null;
    const time = parsedTime ? new Date(parsedTime) : null;
    const side = cleanString(record.Side).toLowerCase();
    const fees = parseNumeric(record['Trading Fees'], NaN);
    if (!time || Number.isNaN(time.getTime()) || !['buy', 'sell'].includes(side) || !Number.isFinite(fees)) {
      return reject(row, 'Invalid Delta execution time, side, or trading fees');
    }

    normalized.push({
      Symbol: symbol, Side: side, Quantity: quantity, Price: price,
      'Trade Date': time.toISOString().replace('.000Z', 'Z'),
      Fees: Math.abs(fees), 'Order ID': record['Order ID'], Broker: 'delta'
    });
  });

  const trades = await parseGenericTransactions(normalized, context.existingPositions || {}, null, context);
  for (const trade of trades) {
    trade.instrumentType = 'crypto';
    trade.notes = `${trade.notes}; Delta quantity in underlying units`;
  }
  return trades;
}

module.exports = { hasDeltaOrderHistoryHeaders, parseDeltaOrderHistory };
