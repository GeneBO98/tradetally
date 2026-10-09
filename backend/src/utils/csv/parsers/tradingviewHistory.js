const { brokerParsers } = require('../brokerParsers');
const { parseDateTime, parseNumeric, isValidTrade } = require('../shared');
const { extractAccountFromRecord } = require('../detect');

function hasTradingViewHistoryHeaders(headers) {
  const fields = new Set(headers.map(value => String(value).trim().toLowerCase()));
  return ['symbol', 'trade number', 'type', 'date and time', 'price', 'size (qty)']
    .every(field => fields.has(field));
}

// Trade-history rows describe each completed trade twice (entry and exit).
// Pair by account, symbol and trade number, never by the order of CSV rows.
function parseTradingViewHistory(records, context) {
  const groups = new Map();
  const trades = [];
  const diagnostics = context.diagnostics;
  const reject = (rows, reason) => {
    diagnostics.invalidRows += rows.length;
    for (const { row_number } of rows) diagnostics.skippedReasons.push({ row: row_number, reason });
  };

  records.forEach((record, index) => {
    const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
    const source_account = extractAccountFromRecord(record, context.accountColumnName) || '';
    const account_identifier = context.selectedAccountId || source_account;
    const key = JSON.stringify([source_account, fields.symbol, fields['trade number']]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ fields, account_identifier, row_number: index + 1 });
  });

  for (const rows of groups.values()) {
    const entries = rows.filter(row => /^entry (long|short)$/i.test(row.fields.type));
    const exits = rows.filter(row => /^exit (long|short)$/i.test(row.fields.type));
    if (rows.length !== 2 || entries.length !== 1 || exits.length !== 1) {
      reject(rows, 'TradingView trade history needs one entry and one exit per trade number. Export the complete trade history; split or open trades require review.');
      continue;
    }
    const entry = entries[0].fields;
    const exit = exits[0].fields;
    const side = entry.type.toLowerCase().replace('entry ', '');
    const quantity = parseNumeric(entry['size (qty)']);
    const entry_time = parseDateTime(entry['date and time']);
    const exit_time = parseDateTime(exit['date and time']);
    if (!entry['trade number'] || !entry_time || !exit_time ||
        exit.type.toLowerCase() !== `exit ${side}` ||
        quantity <= 0 || Math.abs(quantity - parseNumeric(exit['size (qty)'])) > 1e-8 ||
        Date.parse(exit_time) < Date.parse(entry_time)) {
      reject(rows, 'TradingView entry and exit have inconsistent direction, quantity, or timestamps.');
      continue;
    }
    const pnl_header = Object.keys(exit).find(key => /^net pnl [a-z]{3}$/.test(key));
    const currency = pnl_header?.slice(-3).toUpperCase();
    const commission_header = currency ? `commission ${currency.toLowerCase()}` : null;
    const pnl = parseNumeric(exit[pnl_header], null);
    // PnL and commission are repeated on both rows; take the exit values once.
    const trade = brokerParsers.generic({
      symbol: entry.symbol,
      entry_time,
      entry_price: entry.price,
      exit_time,
      exit_price: exit.price,
      quantity,
      side,
      pnl,
      currency,
      commission: Math.abs(parseNumeric(exit[commission_header])),
      broker: 'tradingview',
      notes: `TradingView trade ${entry['trade number']}`
    });
    if (!isValidTrade(trade) || !(trade.exitPrice > 0) || pnl === null || !currency) {
      reject(rows, 'TradingView trade history is missing valid prices or a currency-denominated Net PnL column.');
      continue;
    }
    trade.pnl = pnl;
    trade.account_identifier = entries[0].account_identifier || null;
    trades.push(trade);
  }
  return trades;
}

module.exports = { hasTradingViewHistoryHeaders, parseTradingViewHistory };
