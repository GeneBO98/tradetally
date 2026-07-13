const { parseIBKRTradeConfirmationInstrumentData } = require('./parsers/ibkr');
const { parseLightspeedDateTime, parseLightspeedSide, calculateLightspeedFees } = require('./parsers/lightspeed');
const { parseDate, parseTimeOnly, parseDateTime, parseSide, parseTradervueSide, cleanString, parseTagList, parseInstrumentData, parseNumeric, parseInteger } = require('./shared');


const brokerParsers = {
  generic: (row, options = {}) => {
    // Enhanced generic parser with flexible column mapping
    // Support various column naming conventions

    // Symbol mapping
    const symbol = row.Symbol || row.symbol || row.Ticker || row.ticker || row.Stock || row.stock ||
      row['Underlying Symbol'] || row['underlying symbol'] ||
      row.Instrument || row.instrument;

    const rawTradeDateValue =
      row['Trade Date'] || row['T/D'] || row.Date || row.date ||
      row.trade_date || row['trade_date'] || row['Entry Date'] ||
      row['Transaction Date'] || row['Activity Date'] || row['Exec Date'] || row['Execution Date'] ||
      row['Date and time'] || row.Time || row.time ||
      row['Close time'] || row['Close Time'] || row['close time'] ||
      row['Entry Time'] || row['Entry time'] || row['entry time'] ||
      row['Exit Time'] || row['Exit time'] || row['exit time'] ||
      row['Opening time (UTC-4)'] || row['Opening Time'] || row['Open Time'] ||
      row['Opened Time'] ||
      row.opening_time_utc || row['opening_time_utc'];

    const rawEntryTimeValue =
      row['Entry Time'] || row['Exec Time'] || row['Execution Time'] ||
      row['Fill Time'] || row['Trade Time'] || row.Timestamp ||
      row.order_execution_time || row['order_execution_time'] ||
      row['Date and time'] || row.Time || row.time ||
      row['Close time'] || row['Close Time'] || row['close time'] ||
      row['Opening time (UTC-4)'] || row['Opening Time'] || row['Open Time'] ||
      row['Opened Time'] ||
      row.opening_time_utc || row['opening_time_utc'] ||
      row['Trade Date'] || row.trade_date || row['Entry Date'] || row.Date ||
      row['Activity Date'];

    // Date/Time mapping - support more formats
    let tradeDate = parseDate(rawTradeDateValue);
    let entryTime = parseDateTime(rawEntryTimeValue) || tradeDate;

    const timeOnlyEntry = parseTimeOnly(rawEntryTimeValue);
    if (timeOnlyEntry) {
      const resolvedTradeDate = tradeDate || options.importDate || null;
      if (resolvedTradeDate) {
        tradeDate = tradeDate || resolvedTradeDate;
        entryTime = `${resolvedTradeDate}T${timeOnlyEntry}`;
      }
    }

    const exitTime = parseDateTime(
      row['Exit Time'] || row['Close Time'] || row['Exit Date'] ||
      row['Closed Date'] || row['Sell Time'] ||
      row['Closing time (UTC-4)'] || row['Closing Time'] ||
      row.closing_time_utc || row['closing_time_utc']
    );

    // Price mapping - support more variations
    const entryPrice = parseNumeric(
      row['Entry Price'] || row['Buy Price'] || row.Price || row.price ||
      row['Price / share'] || row.TradePrice || row['TradePrice'] || row['Trade Price'] ||
      row['Fill Price'] || row['Avg Price'] || row['Average Price'] ||
      row['Avg fill price'] || row['Avg Fill Price'] || row['Average fill price'] ||
      row['Open Price'] || row['Opening Price'] || row['Purchase Price'] ||
      row['Entry price'] ||
      row.opening_price || row['opening_price']
    );

    const exitPrice = parseNumeric(
      row['Exit Price'] || row['Sell Price'] || row['Close Price'] ||
      row['Sale Price'] || row['Closing Price'] || row['Closing price'] ||
      row.closing_price || row['closing_price']
    );

    // Quantity mapping
    // Note: MetaTrader uses `lots` (lot size) — for forex 1 lot ≈ 100,000 units,
    // but for trade-journal purposes we record `lots` directly as the quantity
    // since `original_position_size` is also available and represents units.
    const quantity = Math.abs(parseNumeric(
      row.Quantity || row.quantity || row.Qty || row.qty ||
      row.Shares || row.shares || row['No. of shares'] || row.Size || row.size ||
      row.Volume || row.volume || row.Amount || row.amount ||
      row['Fill Qty'] || row['Filled Qty'] || row['Filled quantity'] || row['Filled Quantity'] ||
      row['Quantity filled'] || row['Quantity Filled'] || row['Closing Quantity'] ||
      row.original_position_size || row['original_position_size'] ||
      row.lots || row.Lots
    ));

    // Side mapping - handle more variations
    // MetaTrader uses `type` with values like "buy"/"sell" or "0"/"1" — parseSide
    // already handles the text values; the numeric values fall through to long.
    // Robinhood uses `Trans Code` with values "Buy"/"Sell".
    const side = parseSide(
      row.Side || row.side || row.Direction || row.direction ||
      // Explicit buy/sell columns must win over the ambiguous `Type` column:
      // some brokers (e.g. Tiger) use Type for the instrument class ("EQUITY")
      // and carry the real direction in Buy/Sell.
      row['B/S'] || row['Buy/Sell'] || row.BS ||
      row.Type || row.type || row.trade_type || row['trade_type'] || row.Action || row.action ||
      row['Trans Code'] || row['trans code'] ||
      row['Opening direction'] || row['Opening Direction'] ||
      row['Market pos.'] || row['Market Pos.'] || row['Market Position']
    );

    // Commission and fees mapping
    const commission = parseNumeric(
      row.Commission || row.commission || row.Comm || row.comm ||
      row.Commissions || row.commissions || row['Commission Amount'] ||
      row['Commission fee'] || row['Commission Fee'] ||
      row['Comm']
    ) || 0;

    const fees = parseNumeric(
      row.Fees || row.fees || row.Fee || row.fee ||
      row['Total Fees'] || row['Fee Amount'] ||
      row['Route fee'] || row['Route Fee'] ||
      row.SEC || row.TAF || row.NSCC
    ) || 0;

    // Currency mapping
    const currency = (
      row.Currency || row.currency || row.Curr || row.curr ||
      row.CCY || row.ccy || 'USD'
    ).toUpperCase();

    // Stop loss and take profit
    const stopLoss = parseNumeric(
      row['Stop Loss'] || row['Stop Loss Price'] || row.Stop || row.stop ||
      row.SL || row.sl || row.stopLoss || row.stop_loss
    );

    const takeProfit = parseNumeric(
      row['Take Profit'] || row['Take Profit Price'] || row.Target || row.target ||
      row.TP || row.tp || row.takeProfit || row.take_profit
    );

    // Notes/description
    const notes = cleanString(
      row.Notes || row.notes || row.Note || row.note ||
      row.Description || row.description || row.Comment || row.comment
    );

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      side: side,
      commission: commission,
      fees: fees,
      currency: currency,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      notes: notes,
      pnl: parseNumeric(row['Net $'] || row.Net || row.PnL || row.pnl || row['P&L'] || row.Profit, null),
      broker: cleanString(row.Broker || row.broker) || 'generic'
    };
  },

  lightspeed: (row) => ({
    symbol: cleanString(row.Symbol),
    tradeDate: parseDate(row['Trade Date']),
    entryTime: parseLightspeedDateTime(row['Trade Date'] + ' ' + (row['Execution Time'] || row['Raw Exec. Time'] || '09:30')),
    entryPrice: parseNumeric(row.Price),
    quantity: parseInteger(row.Qty),
    side: parseLightspeedSide(row.Side, row['Buy/Sell'], row['Principal Amount'], row['NET Amount']),
    commission: parseNumeric(row['Commission Amount']),
    fees: calculateLightspeedFees(row),
    broker: 'lightspeed',
    notes: `Trade #${row['Trade Number']} - ${row['Security Type']}`
  }),

  thinkorswim: (row) => {
    // Parse the DESCRIPTION field to extract trade details
    const description = row.DESCRIPTION || row.Description || '';
    const type = row.TYPE || row.Type || '';

    // Skip non-trade rows
    if (type !== 'TRD') {
      return null;
    }

    // Parse trade details from description
    // Stock format:  "BOT +1,000 82655M107 @.77"
    // Option format: "BOT +5 CRM 100 (Weeklys) 2 APR 26 175 PUT @1.44 CBOE"
    const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(.+?)\s+@([\d.]+)/);
    if (!tradeMatch) {
      return null;
    }

    const [_, action, quantityStr, symbolPart, priceStr] = tradeMatch;
    const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
    const price = parseFloat(priceStr);
    const side = action === 'BOT' ? 'long' : 'short';

    // Multi-leg spreads (VERTICAL, IRON CONDOR, etc.) are not representable as a
    // single trade - signal to caller to skip by returning null.
    if (/^(VERTICAL|DIAGONAL|CALENDAR|BUTTERFLY|CONDOR|IRON\s+CONDOR|IRON\s+BUTTERFLY|STRADDLE|STRANGLE|COVERED|COLLAR|RATIO|BACK\s+RATIO)\b/i.test(symbolPart)) {
      return null;
    }

    // Detect options: "CRM 100 (Weeklys) 2 APR 26 175 PUT"
    let symbol;
    let optionData = {};
    const optionMatch = symbolPart.match(/^(\S+)\s+\d+\s+(?:\(.*?\)\s+)?(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})\s+([\d.]+)\s+(PUT|CALL)$/i);
    if (optionMatch) {
      const [, underlying, day, monthStr, yearStr, strike, optType] = optionMatch;
      const months = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
        'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };
      const month = months[monthStr.toUpperCase()];
      const fullYear = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
      symbol = underlying;
      optionData = {
        instrumentType: 'option',
        underlyingSymbol: underlying,
        strikePrice: parseFloat(strike),
        expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
        optionType: optType.toLowerCase(),
        contractSize: 100
      };
    } else {
      symbol = symbolPart.trim();
      if (symbol.length > 30) return null;
    }

    // Parse date and time
    const date = row.DATE || row.Date || '';
    const time = row.TIME || row.Time || '';
    const dateTime = `${date} ${time}`;

    // Parse fees
    const miscFees = parseFloat((row['Misc Fees'] || '0').replace(/[$,]/g, '')) || 0;
    const commissionsFees = parseFloat((row['Commissions & Fees'] || '0').replace(/[$,]/g, '')) || 0;

    return {
      symbol: symbol,
      tradeDate: parseDate(date),
      entryTime: parseDateTime(dateTime),
      entryPrice: price,
      quantity: quantity,
      side: side,
      commission: commissionsFees,
      fees: miscFees,
      broker: 'thinkorswim',
      ...optionData
    };
  },

  ibkr: (row) => {
    // IBKR uses signed quantities: positive = buy, negative = sell
    const quantity = parseNumeric(row.Quantity, NaN);
    const absQuantity = Math.abs(quantity);
    const price = parseNumeric(row.Price, NaN);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseNumeric(row.Commission || 0, 0));
    const symbol = cleanString(row.Symbol);

    // Parse instrument data (options/futures detection)
    const instrumentData = parseInstrumentData(symbol);

    // Handle both "DateTime" and "Date/Time" column names
    const dateTimeValue = row.DateTime || row['Date/Time'];

    // For options, IBKR Activity Statement already reports quantity in contracts
    // No conversion needed - the quantity is already in contracts
    let finalQuantity = absQuantity;
    if (instrumentData.instrumentType === 'option') {
      // Ensure quantity is an integer for options contracts
      finalQuantity = Math.round(absQuantity);
      console.log(`[IBKR] Options contract quantity: ${finalQuantity}`);
    }

    return {
      symbol: instrumentData.underlyingSymbol || symbol,
      tradeDate: parseDate(dateTimeValue),
      entryTime: parseDateTime(dateTimeValue),
      entryPrice: price,
      quantity: finalQuantity,
      side: quantity > 0 ? 'buy' : 'sell',
      commission: commission,
      fees: parseNumeric(row.Fees || 0, 0),
      broker: 'ibkr',
      ...instrumentData
    };
  },

  ibkr_trade_confirmation: (row) => {
    // IBKR Trade Confirmation format with separate columns for options data
    // Columns: Symbol, UnderlyingSymbol, Strike, Expiry, Date/Time, Put/Call, Quantity, Multiplier, Buy/Sell, Price, Commission

    const symbol = cleanString(row.Symbol);
    const quantity = parseNumeric(row.Quantity, NaN);
    const buySell = cleanString(row['Buy/Sell']).toUpperCase();
    const price = parseNumeric(row.Price, NaN);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseNumeric(row.Commission || 0, 0));

    // Parse date/time - format is YYYYMMDD;HHMMSS
    const dateTimeParts = (row['Date/Time'] || '').split(';');
    const dateStr = dateTimeParts[0]; // YYYYMMDD
    const timeStr = dateTimeParts[1] || '093000'; // HHMMSS

    // Convert YYYYMMDD to YYYY-MM-DD
    const tradeDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : null;

    // Convert HHMMSS to HH:MM:SS
    const time = timeStr ? `${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}` : '09:30:00';
    const entryTime = tradeDate ? `${tradeDate}T${time}` : null;

    const instrumentData = parseIBKRTradeConfirmationInstrumentData(row, symbol);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: price,
      quantity: Math.abs(quantity),
      side: buySell === 'BUY' ? 'buy' : 'sell',
      commission: commission,
      fees: 0,
      broker: 'ibkr',
      ...instrumentData
    };
  },

  etrade: (row) => ({
    symbol: row.Symbol,
    tradeDate: parseDate(row['Transaction Date']),
    entryTime: parseDateTime(row['Transaction Date']),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Quantity),
    side: row['Transaction Type'].includes('Buy') ? 'long' : 'short',
    commission: parseFloat(row.Commission || 0),
    fees: parseFloat(row.Fees || 0),
    broker: 'etrade'
  }),

  firstrade: (row) => ({
    symbol: cleanString(row.Symbol),
    tradeDate: parseDate(row.TradeDate || row['Trade Date']),
    entryTime: parseDateTime(row.TradeDate || row['Trade Date']),
    entryPrice: parseNumeric(row.Price),
    quantity: Math.abs(parseNumeric(row.Quantity, 0)),
    side: cleanString(row.Action).toUpperCase() === 'BUY' ? 'buy' : 'sell',
    commission: Math.abs(parseNumeric(row.Commission, 0)),
    fees: Math.abs(parseNumeric(row.Fee, 0)),
    broker: 'firstrade'
  }),

  schwab: (row) => {
    // Schwab provides completed trades with entry and exit data
    const quantity = Math.abs(parseFloat(row.Quantity || 0));
    const isShort = parseFloat(row['Cost Per Share'] || 0) > parseFloat(row['Proceeds Per Share'] || 0) &&
                    parseFloat(row['Gain/Loss ($)'] || 0) > 0;

    return {
      symbol: cleanString(row.Symbol),
      tradeDate: parseDate(row['Opened Date']),
      entryTime: parseDateTime(row['Opened Date'] + ' 09:30'), // Default time since not provided
      exitTime: parseDateTime(row['Closed Date'] + ' 16:00'), // Default time since not provided
      entryPrice: isShort ? parseFloat(row['Proceeds Per Share'] || 0) : parseFloat(row['Cost Per Share'] || 0),
      exitPrice: isShort ? parseFloat(row['Cost Per Share'] || 0) : parseFloat(row['Proceeds Per Share'] || 0),
      quantity: quantity,
      side: isShort ? 'short' : 'long',
      // Schwab doesn't provide commission/fees data separately
      commission: 0, // Not provided by Schwab
      fees: 0, // Not provided by Schwab
      broker: 'schwab',
      notes: `${row.Term || 'Unknown'} - ${row['Wash Sale?'] === 'Yes' ? 'Wash Sale' : 'Normal'}`
    };
  },

  papermoney: (row) => {
    // PaperMoney provides individual executions that need to be grouped into trades
    const symbol = cleanString(row.Symbol);
    const side = row.Side ? row.Side.toLowerCase() : '';
    const quantity = Math.abs(parseInt(row.Qty || 0));
    const price = parseFloat(row.Price || row['Net Price'] || 0);
    const execTime = row['Exec Time'] || '';

    // Parse the execution time (format: "9/19/25 13:24:32")
    let tradeDate = null;
    let entryTime = null;
    if (execTime) {
      // Convert MM/DD/YY format to full date
      const dateMatch = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(.+)$/);
      if (dateMatch) {
        const [_, month, day, year, time] = dateMatch;
        // Smart year conversion: assume 00-49 is 2000-2049, 50-99 is 1950-1999
        const yearNum = parseInt(year);
        const fullYear = year.length === 4
          ? yearNum
          : (yearNum < 50 ? 2000 + yearNum : 1900 + yearNum);
        const fullDate = `${month}/${day}/${fullYear} ${time}`;
        tradeDate = parseDate(fullDate);
        entryTime = parseDateTime(fullDate);
      }
    }

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: price,
      quantity: quantity,
      side: side === 'buy' ? 'buy' : 'sell',
      commission: 0, // PaperMoney doesn't show commissions in this format
      fees: 0,
      broker: 'papermoney',
      notes: `${row['Pos Effect'] || ''} - ${row.Type || 'STOCK'}`
    };
  },

  tradingview: (row) => {
    // TradingView provides individual orders that need to be grouped into trades
    const symbol = cleanString(row.Symbol);
    const side = row.Side ? row.Side.toLowerCase() : '';
    const status = row.Status || '';
    const quantity = Math.abs(parseInteger(row['Filled Qty'] || row.Qty));
    const fillPrice = parseNumeric(row['Fill Price'] || row['Avg Fill Price']);
    const commission = parseNumeric(row.Commission);
    const placingTime = row['Placing Time'] || '';
    const closingTime = row['Closing Time'] || row['Update Time'] || '';
    const orderId = row['Order ID'] || '';
    const orderType = row.Type || '';
    const leverage = row.Leverage || '';

    // Only process filled orders - if no Status column exists, treat all rows as filled
    if (status && status !== 'Filled') {
      return null;
    }

    // Parse the datetime (format: "2025-10-02 21:28:16")
    const tradeDate = parseDate(closingTime || placingTime);
    const entryTime = parseDateTime(closingTime || placingTime);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      entryPrice: fillPrice,
      quantity: quantity,
      side: side === 'buy' ? 'buy' : side === 'sell' ? 'sell' : side,
      commission: commission,
      fees: 0,
      broker: 'tradingview',
      orderId: orderId,
      orderType: orderType,
      leverage: leverage,
      notes: `${orderType} order ${leverage ? `with ${leverage} leverage` : ''}`
    };
  },

  projectx: (row) => {
    // ProjectX provides completed trades with entry and exit times
    // Format: Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions

    // Get Id field - handle BOM character that may be present
    const tradeId = row.Id || row['﻿Id'] || row['\uFEFFId'] || '';
    const contractName = cleanString(row.ContractName);
    const enteredAt = row.EnteredAt || '';
    const exitedAt = row.ExitedAt || '';
    const type = row.Type || '';
    const quantity = Math.abs(parseInteger(row.Size));
    const entryPrice = parseNumeric(row.EntryPrice);
    const exitPrice = parseNumeric(row.ExitPrice);
    const fees = parseNumeric(row.Fees);
    const commissions = parseNumeric(row.Commissions);
    const pnl = parseNumeric(row.PnL);
    const tradeDuration = row.TradeDuration || '';

    // Parse timestamps (format: "10/01/2025 21:13:23 +02:00")
    const tradeDate = parseDate(enteredAt);
    const entryTime = parseDateTime(enteredAt);
    const exitTime = parseDateTime(exitedAt);

    // Determine side from Type field (Long/Short)
    // Database expects 'long' or 'short', not 'buy' or 'sell'
    const side = type.toLowerCase() === 'long' ? 'long' : 'short';

    // Parse instrument data for futures/options
    const instrumentData = parseInstrumentData(contractName);

    return {
      symbol: contractName,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      side: side,
      commission: commissions,  // Commissions map to commission field
      fees: fees,               // Fees map to fees field
      profitLoss: pnl,
      broker: 'projectx',
      notes: `Trade #${tradeId} - Duration: ${tradeDuration}`,
      ...instrumentData  // Add futures/options metadata
    };
  },

  tradervue: (row) => {
    const openDateTime = row['Open Datetime'] || row.OpenDatetime || row['Open Date/Time'] || '';
    const closeDateTime = row['Close Datetime'] || row.CloseDatetime || row['Close Date/Time'] || '';
    const pnl = parseNumeric(row['Gross P&L']);
    const pnlPercent = parseNumeric(row['Gross P&L (%)']);

    return {
      symbol: cleanString(row.Symbol),
      tradeDate: parseDate(openDateTime || closeDateTime),
      entryTime: parseDateTime(openDateTime),
      exitTime: parseDateTime(closeDateTime),
      entryPrice: parseNumeric(row['Entry Price']),
      exitPrice: parseNumeric(row['Exit Price']),
      quantity: Math.abs(parseNumeric(row.Volume)),
      side: parseTradervueSide(row.Side),
      commission: 0,
      fees: 0,
      pnl: pnl,
      profitLoss: pnl,
      pnlPercent: pnlPercent,
      broker: 'tradervue',
      notes: cleanString(row.Notes),
      tags: parseTagList(row.Tags || row.tags)
    };
  },

  tradestation: (row) => {
    // TradeStation/TradeNote format
    // Headers: Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note

    const symbol = cleanString(row.Symbol);
    const tradeDate = parseDate(row['T/D']); // Trade date
    const execTime = row['Exec Time'] || '';
    const entryTime = parseDateTime(`${row['T/D']} ${execTime}`);
    const side = parseSide(row.Side);
    let quantity = Math.abs(parseNumeric(row.Qty));
    const price = parseNumeric(row.Price);

    // TradeStation exports commission separately from regulatory/venue fees.
    // Keep them split so the UI does not double count total transaction costs.
    const commission = parseNumeric(row.Comm) || 0;
    const sec = parseNumeric(row.SEC) || 0;
    const taf = parseNumeric(row.TAF) || 0;
    const nscc = parseNumeric(row.NSCC) || 0;
    const nasdaq = parseNumeric(row.Nasdaq) || 0;
    const ecnRemove = parseNumeric(row['ECN Remove']) || 0;
    const ecnAdd = parseNumeric(row['ECN Add']) || 0;
    const fees = sec + taf + nscc + nasdaq + ecnRemove + ecnAdd;

    const currency = (row.Currency || 'USD').toUpperCase();
    const type = cleanString(row.Type); // E, O for equity/option
    const note = cleanString(row.Note);

    // Check if this is an option based on Type field or parseable OCC symbol metadata.
    const parsedInstrumentData = parseInstrumentData(symbol);
    let instrumentData = {};
    if (type === 'O' || type === 'Option' || parsedInstrumentData.instrumentType === 'option') {
      instrumentData = parsedInstrumentData;
      quantity = Math.round(quantity);
    }

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: null, // TradeStation exports are transactions, not completed trades
      entryPrice: price,
      exitPrice: null,
      quantity: quantity,
      side: side,
      commission: commission,
      fees: fees,
      currency: currency,
      broker: 'tradestation',
      notes: note || `TradeStation ${type} trade`,
      ...instrumentData
    };
  },

  tradingview_performance: (row) => {
    // TradingView Performance export - contains completed trades with entry/exit
    // Headers: symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration

    const symbol = cleanString(row.symbol);
    const quantity = Math.abs(parseInteger(row.qty));
    const buyPrice = parseNumeric(row.buyPrice);
    const sellPrice = parseNumeric(row.sellPrice);
    const pnl = parseNumeric(row.pnl);

    // Parse timestamps - can be Unix timestamps in milliseconds or local date strings like "02/26/2026 09:12:07"
    const parseTradingViewPerformanceTimestamp = (value) => {
      if (!value) return null;

      const ts = Number(value);
      if (Number.isFinite(ts) && Math.abs(ts) > 1e10) {
        const parsed = new Date(ts);
        return isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }

      return parseDateTime(value);
    };

    let entryTime = null;
    let exitTime = null;

    if (row.boughtTimestamp) {
      entryTime = parseTradingViewPerformanceTimestamp(row.boughtTimestamp);
    }
    if (row.soldTimestamp) {
      exitTime = parseTradingViewPerformanceTimestamp(row.soldTimestamp);
    }
    const tradeDate = parseDate(row.boughtTimestamp) || (entryTime ? entryTime.split('T')[0] : null);

    // Determine side based on P&L and prices
    // If sellPrice > buyPrice and PnL > 0, it was a long trade
    // If sellPrice < buyPrice and PnL > 0, it was a short trade
    const side = pnl >= 0
      ? (sellPrice >= buyPrice ? 'long' : 'short')
      : (sellPrice >= buyPrice ? 'short' : 'long');

    // Parse instrument data for futures/options
    const instrumentData = parseInstrumentData(symbol);

    return {
      symbol: symbol,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: side === 'long' ? buyPrice : sellPrice,
      exitPrice: side === 'long' ? sellPrice : buyPrice,
      quantity: quantity,
      side: side,
      commission: 0, // No commission data in this format
      fees: 0,
      broker: 'tradingview',
      profitLoss: pnl,
      notes: `Duration: ${row.duration || 'N/A'}`,
      ...instrumentData
    };
  }
};

module.exports = {
  brokerParsers
};
