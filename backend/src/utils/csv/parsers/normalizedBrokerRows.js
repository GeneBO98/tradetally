const { cleanString, parseNumeric } = require('../shared');

function buildOccOptionSymbol(underlying, expiry, optionType, strike) {
  const cleanUnderlying = cleanString(underlying).replace(/[^A-Z0-9.]/gi, '').toUpperCase();
  const cleanExpiry = cleanString(expiry).replace(/\D/g, '');
  const typeCode = cleanString(optionType).toUpperCase().startsWith('C') ? 'C' : 'P';
  const strikeValue = parseNumeric(strike, NaN);

  if (!cleanUnderlying || cleanExpiry.length !== 6 || !Number.isFinite(strikeValue)) {
    return null;
  }

  const strikeCode = String(Math.round(strikeValue * 1000)).padStart(8, '0');
  return `${cleanUnderlying}${cleanExpiry}${typeCode}${strikeCode}`;
}

function normalizeEtradeSymbol(record) {
  const description = cleanString(record.Description || record.description);
  const optionMatch = description.match(
    /^(PUT|CALL)\s+([A-Z0-9.]+)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+([\d.]+)/i
  );

  if (!optionMatch) {
    return cleanString(record.Symbol || record.symbol);
  }

  const [, optionType, underlying, month, day, rawYear, strike] = optionMatch;
  const year = rawYear.length === 2 ? rawYear : rawYear.slice(-2);
  const expiry = `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
  return buildOccOptionSymbol(underlying, expiry, optionType, strike) || underlying;
}

function normalizeFidelitySymbol(record) {
  const rawSymbol = cleanString(record.Symbol || record.symbol).replace(/^[-+\s]+/, '');
  const compactOptionMatch = rawSymbol.match(/^([A-Z0-9.]+)(\d{6})([CP])(\d+(?:\.\d+)?)$/i);

  if (!compactOptionMatch) {
    return rawSymbol;
  }

  const [, underlying, expiry, optionType, strike] = compactOptionMatch;
  return buildOccOptionSymbol(underlying, expiry, optionType, strike) || rawSymbol;
}

function normalizeFidelityRunDate(value) {
  const rawDate = cleanString(value);
  const usDateMatch = rawDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!usDateMatch) return rawDate;

  const [, month, day, year] = usDateMatch;
  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
}

function normalizeEtradeRecord(record) {
  const activityType = cleanString(
    record['Activity Type'] || record['Transaction Type'] || record.action || record.Action
  );
  const rawQuantity = parseNumeric(record['Quantity #'] ?? record.Quantity ?? record.quantity, 0);
  const activityLower = activityType.toLowerCase();
  let side = null;

  if (activityLower.includes('bought') || activityLower.includes('buy')) {
    side = 'Buy';
  } else if (activityLower.includes('sold') || activityLower.includes('sell')) {
    side = 'Sell';
  } else if (activityLower.includes('expired')) {
    side = rawQuantity < 0 ? 'Sell' : 'Buy';
  }

  if (!side) return null;

  const isExpiration = activityLower.includes('expired');
  return {
    Symbol: normalizeEtradeSymbol(record),
    'Trade Date': record['Activity/Trade Date'] || record['Transaction Date'],
    Side: side,
    Quantity: Math.abs(rawQuantity),
    Price: parseNumeric(record['Price $'] ?? record.Price ?? record.price, 0),
    Commission: Math.abs(parseNumeric(record.Commission, 0)),
    Fees: Math.abs(parseNumeric(record.Fees, 0)),
    Description: record.Description || activityType,
    Broker: 'etrade',
    _allow_zero_price: isExpiration
  };
}

function normalizeFidelityRecord(record) {
  const action = cleanString(record.Action || record.action);
  const actionLower = action.toLowerCase();
  const side = actionLower.includes('you bought') || actionLower.includes('bought')
    ? 'Buy'
    : actionLower.includes('you sold') || actionLower.includes('sold')
      ? 'Sell'
      : null;

  if (!side) return null;

  return {
    Symbol: normalizeFidelitySymbol(record),
    'Trade Date': normalizeFidelityRunDate(record['Run Date']),
    Side: side,
    Quantity: Math.abs(parseNumeric(record.Quantity, 0)),
    Price: parseNumeric(record['Price ($)'], 0),
    Commission: Math.abs(parseNumeric(record['Commission ($)'], 0)),
    Fees: Math.abs(parseNumeric(record['Fees ($)'], 0)),
    Description: record.Description || action,
    Account: record['Account Number'] || record.Account,
    Broker: 'fidelity'
  };
}

function normalizeProjectXOrderRecord(record) {
  const isOrderHistoryExport = record.ContractName !== undefined || record.ExecutePrice !== undefined;
  const status = cleanString(record.Status).toLowerCase();

  if (isOrderHistoryExport && status !== 'filled') return null;

  const rawQuantity = parseNumeric(isOrderHistoryExport ? record.Size : record.qty_done, 0);
  const price = parseNumeric(isOrderHistoryExport ? record.ExecutePrice : record.price_done, NaN);
  const rawSymbol = cleanString(
    isOrderHistoryExport ? record.ContractName : (record.trading_symbol || record.symbol)
  );
  const filledAt = isOrderHistoryExport
    ? record.FilledAt
    : (record.last_time || record.order_date || record.formattedDate);
  const rawSide = cleanString(record.Side).toLowerCase();
  const side = isOrderHistoryExport
    ? (rawSide === 'bid' || rawSide === 'buy'
        ? 'Buy'
        : rawSide === 'ask' || rawSide === 'sell'
          ? 'Sell'
          : null)
    : (rawQuantity < 0 ? 'Sell' : 'Buy');

  if (!rawQuantity || !Number.isFinite(price) || price <= 0 || !rawSymbol || !filledAt || !side) {
    return null;
  }

  const symbol = rawSymbol.includes('.') ? rawSymbol.split('.').pop() : rawSymbol;

  return {
    Symbol: symbol,
    'Trade Date': filledAt,
    Side: side,
    Quantity: Math.abs(rawQuantity),
    Price: price,
    Account: isOrderHistoryExport ? record.AccountName : (record.account || record.account_id),
    'Order ID': isOrderHistoryExport
      ? (record.PlatformOrderId || record.ExchangeOrderId || record.Id)
      : record.order_id,
    Description: isOrderHistoryExport
      ? [record.PositionDisposition, record.Type].filter(Boolean).join(' ')
      : '',
    Broker: 'projectx',
    _position_disposition: isOrderHistoryExport ? record.PositionDisposition : null
  };
}

function getIgnoredProjectXOrderReason(record) {
  const status = cleanString(record.Status).toLowerCase();
  if (!status) return 'Non-trade or unfilled account activity row';
  if (status === 'rejected') return 'Rejected order';
  if (status === 'cancelled' || status === 'canceled') return 'Cancelled order (not executed)';
  if (status !== 'filled') return `Order not filled (status: ${record.Status})`;
  return 'Missing executed symbol, side, quantity, price, or fill time';
}

function normalizeSupportedBrokerRows(records, broker) {
  const normalizers = {
    etrade: normalizeEtradeRecord,
    fidelity: normalizeFidelityRecord,
    projectx_orders: normalizeProjectXOrderRecord
  };
  const normalizer = normalizers[broker];
  if (!normalizer) return { records, ignored: [] };

  const normalized = [];
  const ignored = [];
  records.forEach((record, index) => {
    const row = normalizer(record);
    if (row && row.Symbol && row.Quantity > 0) {
      normalized.push(row);
    } else {
      const reason = broker === 'projectx_orders'
        ? getIgnoredProjectXOrderReason(record)
        : 'Non-trade or unfilled account activity row';
      ignored.push({ row: index + 1, reason });
    }
  });

  return { records: normalized, ignored };
}

module.exports = {
  buildOccOptionSymbol,
  normalizeEtradeRecord,
  normalizeFidelityRecord,
  normalizeFidelityRunDate,
  normalizeProjectXOrderRecord,
  normalizeSupportedBrokerRows
};
