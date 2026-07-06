const { parseDateTime, parseInstrumentData } = require('../shared');


// Parse a number written with European conventions: space (or non-breaking
// space) thousands separators and a decimal comma, e.g. "4 577,86" -> 4577.86,
// "1.234,56" -> 1234.56, "0,00" -> 0. Plain US-style numbers pass through.
function parseEuropeanNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  let str = value.toString().trim();
  if (str === '') return defaultValue;
  // Strip spaces used as thousands separators (regular, non-breaking, thin, narrow).
  str = str.replace(/[\s   ]/g, '');
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');
  if (hasComma && hasDot) {
    // Both present → '.' is the thousands separator, ',' is the decimal.
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Only a comma → it's the decimal separator.
    str = str.replace(',', '.');
  }
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// MetaTrader stamps timestamps as "YYYY.MM.DD HH:MM:SS". Normalize to an
// ISO-like local string the rest of the pipeline understands.
function parseMetaTraderDateTime(value) {
  if (!value) return null;
  const s = value.toString().trim();
  const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, se = '00'] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
  }
  return parseDateTime(s);
}

// MetaTrader 5 history/position report parser.
//
// These exports are semicolon-delimited with a localized title row above the
// header, localized column names, European decimal prices, and DUPLICATE column
// names ("Ora"/"Prezzo" appear twice — open and close). Each data row is a
// self-contained closed position (open + close + realized P&L), so we parse it
// positionally into a completed trade and trust the broker-provided "Profitto"
// for P&L (forex/CFD P&L can't be derived from price × volume without contract
// size). Run on the raw CSV string because csv-parse can't represent the
// duplicate column names.
async function parseMetaTrader5History(csvString, context = {}) {
  const diagnostics = context.diagnostics;
  const lines = csvString.split('\n');
  const completedTrades = [];

  // Locate the header row (semicolon-delimited, contains the position columns).
  let headerIndex = -1;
  let headerCells = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(';').map(c => c.trim().toLowerCase());
    if (cells.includes('simbolo') && cells.includes('tipo') && cells.includes('volume') &&
        cells.includes('prezzo') && cells.includes('profitto')) {
      headerIndex = i;
      headerCells = cells;
      break;
    }
  }
  if (headerIndex === -1) {
    if (diagnostics) diagnostics.warnings.push('Could not locate the MetaTrader 5 history header row.');
    return completedTrades;
  }

  // Map header tokens to column positions. Duplicate "ora"/"prezzo" tokens:
  // the first occurrence is the open value, the second is the close value.
  const col = {};
  const seen = {};
  headerCells.forEach((name, idx) => {
    if (!name) return;
    seen[name] = (seen[name] || 0) + 1;
    const key = seen[name] > 1 ? `${name}#${seen[name]}` : name;
    if (!(key in col)) col[key] = idx;
  });

  const openTimeIdx = col['ora'];
  const closeTimeIdx = col['ora#2'] ?? col['ora'];
  const openPriceIdx = col['prezzo'];
  const closePriceIdx = col['prezzo#2'] ?? col['prezzo'];
  const symbolIdx = col['simbolo'];
  const typeIdx = col['tipo'];
  const volumeIdx = col['volume'];
  const commissionIdx = col['commissioni'];
  const swapIdx = col['swap'];
  const profitIdx = col['profitto'];

  let rowIndex = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === '') continue;
    const cells = raw.split(';');
    rowIndex++;
    if (diagnostics) diagnostics.totalRows++;
    try {
      const symbolRaw = (cells[symbolIdx] || '').trim();
      const typeRaw = (cells[typeIdx] || '').trim().toLowerCase();

      // Skip footer/summary rows (totals, balance) that carry no buy/sell type.
      if (!symbolRaw || (typeRaw !== 'buy' && typeRaw !== 'sell')) {
        if (diagnostics) diagnostics.skippedRows++;
        continue;
      }

      // Strip broker-specific symbol suffixes (XAUUSD.x, EURUSD.m, ...).
      const symbol = symbolRaw.replace(/\.[A-Za-z0-9]+$/, '').toUpperCase();
      const side = typeRaw === 'buy' ? 'long' : 'short';
      const quantity = Math.abs(parseEuropeanNumber(cells[volumeIdx]));
      const entryPrice = parseEuropeanNumber(cells[openPriceIdx]);
      const exitPrice = parseEuropeanNumber(cells[closePriceIdx]);
      const entryTime = parseMetaTraderDateTime(cells[openTimeIdx]);
      const exitTime = parseMetaTraderDateTime(cells[closeTimeIdx]);
      const tradeDate = entryTime ? entryTime.slice(0, 10) : null;
      const commission = Math.abs(parseEuropeanNumber(cells[commissionIdx]));
      const swap = parseEuropeanNumber(cells[swapIdx]);
      const pnl = parseEuropeanNumber(cells[profitIdx]);

      if (!symbol || !tradeDate || !(quantity > 0) || !(entryPrice > 0)) {
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({
            row: rowIndex,
            reason: 'Could not import this MetaTrader row: missing or invalid symbol, price, quantity, or date.'
          });
        }
        continue;
      }

      const instrumentData = parseInstrumentData(symbol);
      const trade = {
        symbol,
        tradeDate,
        entryTime,
        exitTime,
        entryPrice,
        exitPrice,
        quantity,
        side,
        commission,
        fees: Math.abs(swap), // record swap/financing as a fee
        pnl,
        profitLoss: pnl,
        broker: 'metatrader5',
        currency: context.currency || 'USD',
        notes: ''
      };
      if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
        Object.assign(trade, instrumentData);
      }

      const accountIdentifier = context.selectedAccountId || null;
      if (accountIdentifier) trade.accountIdentifier = accountIdentifier;

      completedTrades.push(trade);
      if (diagnostics) diagnostics.parsedRows++;
    } catch (error) {
      if (diagnostics) {
        diagnostics.invalidRows++;
        diagnostics.skippedReasons.push({ row: rowIndex, reason: `Parse error: ${error.message}` });
      }
    }
  }

  console.log(`[METATRADER5] Parsed ${completedTrades.length} closed positions`);
  return completedTrades;
}

module.exports = {
  parseEuropeanNumber,
  parseMetaTraderDateTime,
  parseMetaTrader5History
};
