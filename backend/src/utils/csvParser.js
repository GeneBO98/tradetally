const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const finnhub = require('./finnhub');
const cache = require('./cache');
const cusipQueue = require('./cusipQueue');
const currencyConverter = require('./currencyConverter');
const db = require('../config/database');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('./futuresUtils');

// CUSIP resolution is now handled by the cusipQueue module

/**
 * Check if an execution already exists in any existing trade
 * @param {Object} execution - The execution to check
 * @param {String} symbol - The symbol
 * @param {Object} context - Context object containing existingExecutions
 * @returns {boolean} - True if execution already exists
 */
function isExecutionDuplicate(execution, symbol, context) {
  // Safety checks
  if (!context || !context.existingExecutions || !context.existingExecutions[symbol]) {
    return false;
  }

  // Check if execution has required fields
  if (!execution || !execution.datetime) {
    return false;
  }

  const symbolExecutions = context.existingExecutions[symbol];

  return symbolExecutions.some(existingExec => {
    // Skip if existingExec is invalid
    if (!existingExec) {
      return false;
    }

    // Check by trade number if available (most reliable for Lightspeed)
    if (execution.tradeNumber && existingExec.tradeNumber) {
      return existingExec.tradeNumber === execution.tradeNumber;
    }

    // Check by order ID if available (for Interactive Brokers)
    if (execution.orderId && existingExec.orderId) {
      return existingExec.orderId === execution.orderId;
    }

    // Fallback to timestamp + quantity + price matching
    // Handle both naming conventions: datetime/price OR entryTime/entryPrice
    const existingDatetime = existingExec.datetime || existingExec.entryTime;
    const existingPrice = existingExec.price ?? existingExec.entryPrice;

    // Skip if datetime is missing
    if (!existingDatetime) {
      return false;
    }

    const existingTime = new Date(existingDatetime).getTime();
    const newTime = new Date(execution.datetime).getTime();

    // Skip if dates are invalid
    if (isNaN(existingTime) || isNaN(newTime)) {
      return false;
    }

    const timeDiff = Math.abs(existingTime - newTime);

    // Allow up to 1 second difference in timestamps (some brokers round differently)
    return timeDiff <= 1000 &&
           existingExec.quantity === execution.quantity &&
           Math.abs((existingPrice || 0) - (execution.price || 0)) < 0.01;
  });
}

/**
 * Detects if CSV contains a currency column
 * @param {Array} records - Parsed CSV records
 * @returns {boolean} - True if currency column is detected
 */
function detectCurrencyColumn(records) {
  if (!records || records.length === 0) {
    console.log('[CURRENCY] No records to check for currency column');
    return false;
  }

  console.log(`[CURRENCY] Checking ${records.length} records for currency column`);

  // Get all field names from the first record (case-insensitive)
  const firstRecord = records[0];
  const fieldNames = Object.keys(firstRecord);
  console.log(`[CURRENCY] Available fields: ${fieldNames.join(', ')}`);

  // Check if any record has a currency field (case-insensitive)
  const currencyFieldPatterns = ['currency', 'curr', 'ccy', 'currency_code', 'currencycode'];

  for (const record of records) {
    for (const fieldName of Object.keys(record)) {
      const lowerFieldName = fieldName.toLowerCase().trim();

      // Check if this field name matches any currency pattern
      if (currencyFieldPatterns.some(pattern => lowerFieldName.includes(pattern))) {
        const value = record[fieldName];
        if (value && value.toString().trim() !== '') {
          const currencyValue = value.toString().toUpperCase().trim();
          console.log(`[CURRENCY] Found currency field '${fieldName}' with value '${currencyValue}'`);

          // Detect non-USD currency
          if (currencyValue !== 'USD' && currencyValue !== '') {
            console.log(`[CURRENCY] Detected non-USD currency: ${currencyValue}`);
            return true;
          }
        }
      }
    }
  }

  console.log('[CURRENCY] No non-USD currency column detected');
  return false;
}

/**
 * Account column name patterns for flexible matching (case-insensitive)
 */
const ACCOUNT_FIELD_PATTERNS = [
  'account', 'account_id', 'accountid', 'account_number', 'accountnumber',
  'acctid', 'acct_id', 'acct', 'account_identifier', 'brokerage_account',
  'trading_account', 'portfolio'
];

/**
 * Redacts an account ID to show only the last 4 characters for privacy
 * @param {string} accountId - The full account ID
 * @returns {string|null} - Redacted account ID (e.g., "****1234") or null
 */
function redactAccountId(accountId) {
  if (!accountId) return null;
  const str = String(accountId).trim();
  if (str === '') return null;
  if (str.length <= 4) return str;
  return '****' + str.slice(-4);
}

/**
 * Detects if CSV contains an account column and returns the column name
 * @param {Array} records - Parsed CSV records
 * @returns {string|null} - The account column name if found, null otherwise
 */
function detectAccountColumn(records) {
  if (!records || records.length === 0) {
    console.log('[ACCOUNT] No records to check for account column');
    return null;
  }

  // Get all field names from the first record
  const firstRecord = records[0];
  const fieldNames = Object.keys(firstRecord);

  // Normalize field names for comparison
  for (const fieldName of fieldNames) {
    const normalizedField = fieldName.toLowerCase().replace(/[\s_-]/g, '');

    for (const pattern of ACCOUNT_FIELD_PATTERNS) {
      const normalizedPattern = pattern.replace(/[\s_-]/g, '');
      if (normalizedField === normalizedPattern || normalizedField.includes(normalizedPattern)) {
        // Verify the column has actual data
        const hasData = records.some(record => {
          const value = record[fieldName];
          return value && String(value).trim() !== '';
        });

        if (hasData) {
          console.log(`[ACCOUNT] Detected account column: "${fieldName}"`);
          return fieldName;
        }
      }
    }
  }

  console.log('[ACCOUNT] No account column detected');
  return null;
}

/**
 * Extracts account identifier from a record using the detected column name
 * @param {Object} record - CSV record
 * @param {string} accountColumnName - The detected account column name
 * @returns {string|null} - Full account identifier (not redacted - redaction is for display only)
 */
function extractAccountFromRecord(record, accountColumnName) {
  if (!accountColumnName || !record) return null;
  const value = record[accountColumnName];
  if (!value) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

/**
 * Detects the broker format based on CSV headers
 * @param {Buffer} fileBuffer - The CSV file buffer
 * @returns {string} - Detected broker format
 */
function detectBrokerFormat(fileBuffer) {
  try {
    let csvString = fileBuffer.toString('utf-8');
    // Remove BOM if present
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
    }
    const lines = csvString.split('\n');

    // Get the first non-empty line (should be headers)
    // For ThinkorSwim, skip over title lines and section headers
    let headerLine = '';
    let headerLineIndex = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      if (line && line.includes(',')) {
        // Check if this looks like a header line with column names
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('date') && lowerLine.includes('time') && lowerLine.includes('type')) {
          headerLine = line;
          headerLineIndex = i;
          break;
        }
        // If no specific match yet, use first line with commas as fallback
        if (!headerLine) {
          headerLine = line;
          headerLineIndex = i;
        }
      }
    }

    if (!headerLine) {
      return 'generic';
    }

    const headers = headerLine.toLowerCase();
    console.log(`[AUTO-DETECT] Analyzing headers (line ${headerLineIndex + 1}): ${headerLine.substring(0, 200)}...`);

    // ThinkorSwim detection - look for DATE, TIME, TYPE, REF #, DESCRIPTION pattern
    if (headers.includes('date') && headers.includes('time') && headers.includes('type') &&
        headers.includes('ref #') && headers.includes('description')) {
      console.log('[AUTO-DETECT] Detected: ThinkorSwim');
      return 'thinkorswim';
    }

    // TradingView detection - look for specific column combination
    if (headers.includes('symbol') &&
        headers.includes('side') &&
        headers.includes('fill price') &&
        headers.includes('status') &&
        headers.includes('order id') &&
        headers.includes('leverage')) {
      console.log('[AUTO-DETECT] Detected: TradingView (futures trading format)');
      return 'tradingview';
    }

    // Lightspeed detection - look for Trade Number, Execution Time, Buy/Sell columns
    if ((headers.includes('trade number') || headers.includes('sequence number')) &&
        (headers.includes('execution time') || headers.includes('raw exec')) &&
        (headers.includes('commission amount') || headers.includes('feesec'))) {
      console.log('[AUTO-DETECT] Detected: Lightspeed Trader');
      return 'lightspeed';
    }

    // PaperMoney detection - look for Exec Time, Pos Effect, Spread columns
    if (headers.includes('exec time') &&
        headers.includes('pos effect') &&
        headers.includes('spread')) {
      console.log('[AUTO-DETECT] Detected: PaperMoney');
      return 'papermoney';
    }

    // Schwab detection - two formats
    // Format 1: Completed trades with Gain/Loss
    if ((headers.includes('opened date') && headers.includes('closed date') && headers.includes('gain/loss')) ||
        (headers.includes('symbol') && headers.includes('quantity') && headers.includes('cost per share') && headers.includes('proceeds per share'))) {
      console.log('[AUTO-DETECT] Detected: Charles Schwab (completed trades)');
      return 'schwab';
    }
    // Format 2: Transaction history
    if (headers.includes('action') && headers.includes('fees & comm') &&
        (headers.includes('date') && headers.includes('symbol') && headers.includes('description'))) {
      console.log('[AUTO-DETECT] Detected: Charles Schwab (transactions)');
      return 'schwab';
    }

    // IBKR detection - two formats
    // Format 1: Trade Confirmation (with UnderlyingSymbol, Strike, Expiry, Put/Call, Multiplier, Buy/Sell)
    if (headers.includes('underlyingsymbol') && headers.includes('strike') &&
        headers.includes('expiry') && headers.includes('put/call') &&
        headers.includes('multiplier') && headers.includes('buy/sell')) {
      console.log('[AUTO-DETECT] Detected: Interactive Brokers Trade Confirmation');
      return 'ibkr_trade_confirmation';
    }
    // Format 2: Activity Statement (Symbol, Date/Time or DateTime, Quantity, Price)
    if (headers.includes('symbol') &&
        (headers.includes('date/time') || headers.includes('datetime')) &&
        headers.includes('quantity') && headers.includes('price') &&
        !headers.includes('action')) { // Distinguish from Schwab
      console.log('[AUTO-DETECT] Detected: Interactive Brokers Activity Statement');
      return 'ibkr';
    }

    // E*TRADE detection
    if (headers.includes('transaction date') && headers.includes('transaction type') &&
        (headers.includes('buy') || headers.includes('sell'))) {
      console.log('[AUTO-DETECT] Detected: E*TRADE');
      return 'etrade';
    }

    // Webull detection - look for Name, Symbol, Side, Status, Filled, Price, Time-in-Force, Placed Time, Filled Time
    if (headers.includes('name') && headers.includes('symbol') && headers.includes('side') &&
        headers.includes('status') && headers.includes('filled') && headers.includes('time-in-force') &&
        headers.includes('placed time') && headers.includes('filled time')) {
      console.log('[AUTO-DETECT] Detected: Webull (options)');
      return 'webull';
    }

    // ProjectX detection - look for ContractName, EnteredAt, ExitedAt, PnL columns
    if (headers.includes('contractname') &&
        headers.includes('enteredat') &&
        headers.includes('exitedat') &&
        headers.includes('pnl') &&
        headers.includes('tradeduration')) {
      console.log('[AUTO-DETECT] Detected: ProjectX');
      return 'projectx';
    }

    // Tradovate detection - look for B/S, Contract, Product, Fill Time, avgPrice, filledQty columns
    // Note: Don't rely on first column (orderId) due to potential BOM issues
    if (headers.includes('b/s') &&
        headers.includes('contract') &&
        headers.includes('product') &&
        headers.includes('fill time') &&
        (headers.includes('avgprice') || headers.includes('avg fill price')) &&
        (headers.includes('filledqty') || headers.includes('filled qty'))) {
      console.log('[AUTO-DETECT] Detected: Tradovate');
      return 'tradovate';
    }

    // Questrade detection - look for Fill qty, Fill price, Exec time, Option, Strategy columns
    // Questrade Edge export has unique column names like "Fill qty" and "Exec time"
    if (headers.includes('fill qty') &&
        headers.includes('fill price') &&
        headers.includes('exec time') &&
        headers.includes('option') &&
        headers.includes('strategy')) {
      console.log('[AUTO-DETECT] Detected: Questrade');
      return 'questrade';
    }

    // Default to generic if no specific format detected
    console.log('[AUTO-DETECT] No specific format detected, using generic parser');
    return 'generic';

  } catch (error) {
    console.error('[AUTO-DETECT] Error detecting broker format:', error);
    return 'generic';
  }
}

const brokerParsers = {
  generic: (row) => ({
    symbol: row.Symbol || row.symbol,
    tradeDate: parseDate(row['Trade Date'] || row.Date || row.date),
    entryTime: parseDateTime(row['Entry Time'] || row['Trade Date'] || row.Date),
    exitTime: parseDateTime(row['Exit Time'] || row['Close Time']),
    entryPrice: parseNumeric(row['Entry Price'] || row['Buy Price'] || row.Price),
    exitPrice: parseNumeric(row['Exit Price'] || row['Sell Price']),
    quantity: parseInteger(row.Quantity || row.Shares || row.Size),
    side: parseSide(row.Side || row.Direction || row.Type),
    commission: parseNumeric(row.Commission || row.Fees),
    fees: parseNumeric(row.Fees),
    broker: 'generic'
  }),

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
    
    // Parse trade details from description (e.g., "BOT +1,000 82655M107 @.77")
    const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(\S+)\s+@([\d.]+)/);
    if (!tradeMatch) {
      return null;
    }
    
    const [_, action, quantityStr, symbol, priceStr] = tradeMatch;
    const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
    const price = parseFloat(priceStr);
    const side = action === 'BOT' ? 'long' : 'short';
    
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
      broker: 'thinkorswim'
    };
  },

  ibkr: (row) => {
    // IBKR uses signed quantities: positive = buy, negative = sell
    const quantity = parseFloat(row.Quantity);
    const absQuantity = Math.abs(quantity);
    const price = parseFloat(row.Price);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseFloat(row.Commission || 0));
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
      fees: parseFloat(row.Fees || 0),
      broker: 'ibkr',
      ...instrumentData
    };
  },

  ibkr_trade_confirmation: (row) => {
    // IBKR Trade Confirmation format with separate columns for options data
    // Columns: Symbol, UnderlyingSymbol, Strike, Expiry, Date/Time, Put/Call, Quantity, Multiplier, Buy/Sell, Price, Commission

    const symbol = cleanString(row.Symbol);
    const underlyingSymbol = cleanString(row.UnderlyingSymbol);
    const strike = parseFloat(row.Strike);
    const expiry = row.Expiry; // Format: YYYYMMDD
    const putCall = cleanString(row['Put/Call']);
    const quantity = parseFloat(row.Quantity);
    const multiplier = parseFloat(row.Multiplier || 100);
    const buySell = cleanString(row['Buy/Sell']).toUpperCase();
    const price = parseFloat(row.Price);
    // IBKR commission: negative = fee paid, positive = rebate received
    // Convert to our convention: positive = fee paid, negative = rebate (credit)
    const commission = -(parseFloat(row.Commission || 0));

    // Parse date/time - format is YYYYMMDD;HHMMSS
    const dateTimeParts = (row['Date/Time'] || '').split(';');
    const dateStr = dateTimeParts[0]; // YYYYMMDD
    const timeStr = dateTimeParts[1] || '093000'; // HHMMSS

    // Convert YYYYMMDD to YYYY-MM-DD
    const tradeDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : null;

    // Convert HHMMSS to HH:MM:SS
    const time = timeStr ? `${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}` : '09:30:00';
    const entryTime = tradeDate ? `${tradeDate}T${time}` : null;

    // Parse expiry date from YYYYMMDD to YYYY-MM-DD
    const expirationDate = expiry ? `${expiry.substring(0,4)}-${expiry.substring(4,6)}-${expiry.substring(6,8)}` : null;

    // Determine instrument type and build instrument data
    let instrumentData = {};

    if (underlyingSymbol && strike && expiry && putCall) {
      // This is an option
      instrumentData = {
        instrumentType: 'option',
        underlyingSymbol: underlyingSymbol,
        strikePrice: strike,
        expirationDate: expirationDate,
        optionType: putCall.toLowerCase() === 'c' ? 'call' : 'put',
        contractSize: multiplier
      };
    } else {
      // Stock or other
      instrumentData = {
        instrumentType: 'stock'
      };
    }

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

  schwab: (row) => {
    // Schwab provides completed trades with entry and exit data
    const quantity = Math.abs(parseInt(row.Quantity || 0));
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
      const dateMatch = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(.+)$/);
      if (dateMatch) {
        const [_, month, day, year, time] = dateMatch;
        // Smart year conversion: assume 00-49 is 2000-2049, 50-99 is 1950-1999
        const yearNum = parseInt(year);
        const fullYear = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
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
    const quantity = Math.abs(parseInteger(row.Qty));
    const fillPrice = parseNumeric(row['Fill Price']);
    const commission = parseNumeric(row.Commission);
    const placingTime = row['Placing Time'] || '';
    const closingTime = row['Closing Time'] || '';
    const orderId = row['Order ID'] || '';
    const orderType = row.Type || '';
    const leverage = row.Leverage || '';

    // Only process filled orders
    if (status !== 'Filled') {
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
  }
};

/**
 * Groups completed trades based on entry time proximity
 * Applies to all broker formats - merges trades for same symbol within time gap
 * @param {Array} trades - Array of parsed trades
 * @param {Object} settings - Grouping settings {enabled, timeGapMinutes}
 * @returns {Array} - Array of grouped trades
 */
function applyTradeGrouping(trades, settings) {
  if (!trades || trades.length === 0) return trades;

  console.log(`\n=== APPLYING TRADE GROUPING ===`);
  console.log(`Grouping ${trades.length} trades with ${settings.timeGapMinutes} minute time gap`);

  // Group by grouping key - for options, include strike/expiry/type to keep different contracts separate
  const tradesByGroupKey = {};
  trades.forEach(trade => {
    let groupKey;
    if (trade.instrumentType === 'option' && trade.strikePrice && trade.expirationDate && trade.optionType) {
      // For options: group by underlying + strike + expiration + call/put
      // This ensures different contracts on the same underlying are kept separate
      groupKey = `${trade.symbol}_${trade.strikePrice}_${trade.expirationDate}_${trade.optionType}`;
    } else {
      // For stocks and other instruments: group by symbol only
      groupKey = trade.symbol;
    }
    if (!tradesByGroupKey[groupKey]) {
      tradesByGroupKey[groupKey] = [];
    }
    tradesByGroupKey[groupKey].push(trade);
  });

  const groupedTrades = [];

  // Process each group separately
  for (const [groupKey, symbolTrades] of Object.entries(tradesByGroupKey)) {
    console.log(`\n[GROUPING] Processing ${symbolTrades.length} trades for ${groupKey}`);

    // Sort by entry time
    symbolTrades.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    let currentGroup = null;
    let lastEntryTime = null;

    for (const trade of symbolTrades) {
      const entryTime = new Date(trade.entryTime);

      if (!currentGroup) {
        // Start new group - initialize with executionData array (matches Trade model)
        // For grouped trades, each execution represents a complete round-trip sub-trade
        // Handle both 'pnl' and 'profitLoss' field names (different parsers use different names)
        const tradePnlValue = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
        currentGroup = {
          ...trade,
          pnl: tradePnlValue, // Ensure pnl field is set
          profitLoss: tradePnlValue, // Set both for compatibility
          groupedTrades: 1,
          executionData: trade.executionData || trade.executions || [{
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: tradePnlValue
          }]
        };
        lastEntryTime = entryTime;
        console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
      } else {
        // Check time gap
        const timeSinceLastEntry = (entryTime - lastEntryTime) / (1000 * 60); // minutes

        // Only group if same side and within time gap
        if (timeSinceLastEntry <= settings.timeGapMinutes && trade.side === currentGroup.side) {
          // Merge into current group
          console.log(`  [GROUPING] Merging trade: ${timeSinceLastEntry.toFixed(1)}min gap (${trade.side} ${trade.quantity}@${trade.entryPrice})`);

          // Add this trade's execution to the executionData array
          // For grouped trades, each execution represents a complete round-trip sub-trade
          // Handle both 'pnl' and 'profitLoss' field names
          const executionPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          const newExecution = {
            entryTime: trade.entryTime,
            entryPrice: trade.entryPrice,
            exitTime: trade.exitTime,
            exitPrice: trade.exitPrice,
            quantity: trade.quantity,
            side: trade.side,
            commission: trade.commission || 0,
            fees: trade.fees || 0,
            pnl: executionPnl
          };

          // If trade has its own executionData/executions array, merge those; otherwise add as single execution
          if ((trade.executionData || trade.executions) && Array.isArray(trade.executionData || trade.executions)) {
            currentGroup.executionData.push(...(trade.executionData || trade.executions));
          } else {
            currentGroup.executionData.push(newExecution);
          }

          // Calculate weighted average entry price
          const totalQuantity = currentGroup.quantity + trade.quantity;
          const totalEntryValue = (currentGroup.entryPrice * currentGroup.quantity) + (trade.entryPrice * trade.quantity);
          currentGroup.entryPrice = totalEntryValue / totalQuantity;

          // Combine quantities
          currentGroup.quantity = totalQuantity;

          // Combine costs
          currentGroup.commission = (currentGroup.commission || 0) + (trade.commission || 0);
          currentGroup.fees = (currentGroup.fees || 0) + (trade.fees || 0);
          currentGroup.entryCommission = (currentGroup.entryCommission || 0) + (trade.entryCommission || 0);
          currentGroup.exitCommission = (currentGroup.exitCommission || 0) + (trade.exitCommission || 0);
          const totalFees = (currentGroup.commission || 0) + (currentGroup.fees || 0);

          // Track grouped count
          currentGroup.groupedTrades = (currentGroup.groupedTrades || 1) + 1;

          // Calculate weighted average exit price if both have exit prices (do this before P&L calculation)
          if (trade.exitTime) {
            currentGroup.exitTime = trade.exitTime;
            if (currentGroup.exitPrice && trade.exitPrice) {
              const prevQuantity = currentGroup.quantity - trade.quantity;
              currentGroup.exitPrice = ((currentGroup.exitPrice * prevQuantity) + (trade.exitPrice * trade.quantity)) / totalQuantity;
            } else if (trade.exitPrice) {
              currentGroup.exitPrice = trade.exitPrice;
            }
          }

          // Preserve instrument type from trade if not already set in group
          if (!currentGroup.instrumentType && trade.instrumentType) {
            currentGroup.instrumentType = trade.instrumentType;
            if (trade.pointValue) {
              currentGroup.pointValue = trade.pointValue;
            }
            if (trade.contractSize !== undefined) {
              currentGroup.contractSize = trade.contractSize;
            }
          }

          // Recalculate P&L from combined entry/exit prices and total fees
          // This ensures consistency with the weighted average prices
          // Use the same calculation method as Trade.calculatePnL to ensure exact match
          if (currentGroup.exitPrice && currentGroup.side && currentGroup.entryPrice && currentGroup.quantity > 0) {
            // Determine multiplier using same logic as Trade.calculatePnL
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }

            // Calculate P&L using exact same formula as Trade.calculatePnL
            let pnl;
            if (currentGroup.side === 'long') {
              pnl = (currentGroup.exitPrice - currentGroup.entryPrice) * currentGroup.quantity * multiplier;
            } else {
              pnl = (currentGroup.entryPrice - currentGroup.exitPrice) * currentGroup.quantity * multiplier;
            }

            // Subtract commission and fees (matches Trade.calculatePnL: totalPnL = pnl - commission - fees)
            currentGroup.pnl = pnl - (currentGroup.commission || 0) - (currentGroup.fees || 0);
            currentGroup.profitLoss = currentGroup.pnl; // Set both for compatibility

            // Recalculate PL% based on the recalculated P&L and entry value
            const entryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;
            if (entryValue > 0) {
              currentGroup.pnlPercent = (currentGroup.pnl / entryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          } else {
            // If exit price not available, fall back to summing P&L (for open positions)
            const tradePnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
            const groupPnl = currentGroup.pnl !== undefined ? currentGroup.pnl : (currentGroup.profitLoss || 0);
            const totalPnl = groupPnl + tradePnl;
            currentGroup.pnl = totalPnl;
            currentGroup.profitLoss = totalPnl;

            // Recalculate PL% for open positions by summing entry values
            // Calculate entry value from the grouped trade
            let multiplier;
            if (currentGroup.instrumentType === 'future') {
              multiplier = currentGroup.pointValue || 1;
            } else if (currentGroup.instrumentType === 'option') {
              multiplier = currentGroup.contractSize || 100;
            } else {
              multiplier = 1;
            }
            const groupEntryValue = currentGroup.entryPrice * currentGroup.quantity * multiplier;
            
            // Calculate entry value for the trade being added
            let tradeMultiplier;
            if (trade.instrumentType === 'future') {
              tradeMultiplier = trade.pointValue || 1;
            } else if (trade.instrumentType === 'option') {
              tradeMultiplier = trade.contractSize || 100;
            } else {
              tradeMultiplier = 1;
            }
            const tradeEntryValue = trade.entryPrice * trade.quantity * tradeMultiplier;
            
            const totalEntryValue = groupEntryValue + tradeEntryValue;
            if (totalEntryValue > 0) {
              currentGroup.pnlPercent = (totalPnl / totalEntryValue) * 100;
            } else {
              currentGroup.pnlPercent = 0;
            }
          }

          // Keep original notes without merging
          if (!currentGroup.originalNotes) {
            currentGroup.originalNotes = currentGroup.notes;
          }
        } else {
          // Time gap exceeded or different side, save current group and start new one
          const reason = trade.side !== currentGroup.side ? 'different side' : `gap exceeded (${timeSinceLastEntry.toFixed(1)}min)`;
          console.log(`  [GROUPING] ${reason}, starting new group`);
          groupedTrades.push(currentGroup);
          // Handle both 'pnl' and 'profitLoss' field names
          const newGroupPnl = trade.pnl !== undefined ? trade.pnl : (trade.profitLoss || 0);
          currentGroup = {
            ...trade,
            pnl: newGroupPnl, // Ensure pnl field is set
            profitLoss: newGroupPnl, // Set both for compatibility
            groupedTrades: 1,
            executionData: trade.executionData || trade.executions || [{
              entryTime: trade.entryTime,
              entryPrice: trade.entryPrice,
              exitTime: trade.exitTime,
              exitPrice: trade.exitPrice,
              quantity: trade.quantity,
              side: trade.side,
              commission: trade.commission || 0,
              fees: trade.fees || 0,
              pnl: newGroupPnl
            }]
          };
          lastEntryTime = entryTime;
          console.log(`  [GROUPING] Started new group at ${trade.entryTime}`);
        }
      }
    }

    // Add final group for this symbol
    if (currentGroup) {
      groupedTrades.push(currentGroup);
    }
  }

  console.log(`[SUCCESS] Grouped ${trades.length} trades into ${groupedTrades.length} trades`);
  return groupedTrades;
}

async function parseCSV(fileBuffer, broker = 'generic', context = {}) {
  try {
    console.log(`[CURRENCY DEBUG] parseCSV called with broker: ${broker}, userId: ${context.userId}`);

    // Handle auto-detection
    if (broker === 'auto') {
      const detectedBroker = detectBrokerFormat(fileBuffer);
      console.log(`[AUTO-DETECT] Using detected broker format: ${detectedBroker}`);
      broker = detectedBroker;
    }

    const existingPositions = context.existingPositions || {};
    console.log(`\n=== IMPORT CONTEXT ===`);
    console.log(`Broker format: ${broker}`);
    console.log(`User ID: ${context.userId || 'NOT PROVIDED'}`);
    console.log(`Existing open positions: ${Object.keys(existingPositions).length}`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} shares @ $${position.entryPrice}`);
    });
    console.log(`=====================\n`);
    
    let csvString = fileBuffer.toString('utf-8');

    // Remove BOM (Byte Order Mark) if present - this can cause parsing issues
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.slice(1);
      console.log('Removed BOM from CSV file');
    }
    // Also handle UTF-8 BOM (EF BB BF)
    if (csvString.startsWith('\uFEFF')) {
      csvString = csvString.slice(1);
      console.log('Removed UTF-8 BOM from CSV file');
    }

    // Handle Lightspeed CSV files that start with a title row
    if (broker === 'lightspeed') {
      const lines = csvString.split('\n');
      // Skip the first line if it doesn't contain commas (likely a title row)
      if (lines.length > 1 && !lines[0].includes(',') && lines[1].includes(',')) {
        csvString = lines.slice(1).join('\n');
        console.log('Skipped title row in Lightspeed CSV');
      }
    }
    
    // Handle PaperMoney CSV files that have multiple sections
    if (broker === 'papermoney') {
      const lines = csvString.split('\n');
      
      // Find the "Filled Orders" section
      let filledOrdersStart = -1;
      let filledOrdersEnd = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Filled Orders')) {
          filledOrdersStart = i + 1; // Skip the "Filled Orders" title line
          break;
        }
      }
      
      if (filledOrdersStart >= 0) {
        // Find the header line (contains "Exec Time,Spread,Side,Qty")
        for (let i = filledOrdersStart; i < lines.length; i++) {
          if (lines[i].includes('Exec Time') && lines[i].includes('Side') && lines[i].includes('Qty')) {
            filledOrdersStart = i;
            break;
          }
        }
        
        // Find the end of the filled orders section (next empty line or section)
        for (let i = filledOrdersStart + 1; i < lines.length; i++) {
          if (lines[i].trim() === '' || lines[i].includes('Canceled Orders') || lines[i].includes('Rolling Strategies')) {
            filledOrdersEnd = i;
            break;
          }
        }
        
        if (filledOrdersEnd === -1) {
          filledOrdersEnd = lines.length;
        }
        
        // Extract only the filled orders section
        csvString = lines.slice(filledOrdersStart, filledOrdersEnd).join('\n');
        console.log(`Extracted PaperMoney filled orders section: lines ${filledOrdersStart} to ${filledOrdersEnd}`);
      } else {
        throw new Error('Could not find "Filled Orders" section in PaperMoney CSV');
      }
    }
    
    // Detect delimiter - check if it's tab-separated (common for Schwab)
    let delimiter = ',';
    let parseOptions = {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter
    };
    
    if (broker === 'schwab') {
      const firstLine = csvString.split('\n')[0];
      if (firstLine.includes('\t') && !firstLine.includes(',')) {
        delimiter = '\t';
        console.log('Detected tab-separated Schwab file');
        parseOptions.delimiter = delimiter;
      }
      
      // Check if the first line is missing headers (starts with actual data)
      const firstFields = firstLine.split(delimiter);
      if (firstFields.length > 20 && !firstLine.toLowerCase().includes('symbol')) {
        console.log('Schwab file appears to be missing headers, using column indices');
        parseOptions.columns = false; // Parse as arrays instead
      }
    }
    
    // Special handling for thinkorswim CSV format
    if (broker === 'thinkorswim') {
      // Thinkorswim CSVs have account statement header rows that need to be removed
      const lines = csvString.split('\n');

      // Extract account number from header rows before skipping them
      // Thinkorswim headers often contain: "Account Statement for 123456789" or "Account: 123456789"
      let tosAccountNumber = null;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        // Match patterns like "Account Statement for 123456789" or "Account: 123456789" or "Account,123456789"
        const accountMatch = line.match(/Account(?:\s+Statement\s+for|:|,)\s*(\d{6,12})/i);
        if (accountMatch) {
          tosAccountNumber = redactAccountId(accountMatch[1]);
          console.log(`[ACCOUNT] Extracted thinkorswim account from header: ${tosAccountNumber}`);
          break;
        }
        // Also check for standalone account number pattern in the line
        const standaloneMatch = line.match(/^\s*(\d{9,12})\s*$/);
        if (standaloneMatch) {
          tosAccountNumber = redactAccountId(standaloneMatch[1]);
          console.log(`[ACCOUNT] Found thinkorswim account number in header: ${tosAccountNumber}`);
          break;
        }
      }

      // Store the account number in context for use during parsing
      if (tosAccountNumber) {
        context.tosAccountNumber = tosAccountNumber;
        console.log(`[ACCOUNT] Will use thinkorswim account: ${tosAccountNumber}`);
      }

      // Find the actual header line - check multiple possible patterns
      let headerIndex = -1;
      const headerPatterns = [
        'DATE,TIME,TYPE',
        'Date,Time,Type',
        'DATE,TIME,TRANSACTION',
        'Date,Time,Transaction',
        'DATE,TYPE',
        'Date,Type'
      ];

      for (let i = 0; i < lines.length && i < 15; i++) {
        const lineUpper = lines[i].toUpperCase();
        for (const pattern of headerPatterns) {
          if (lineUpper.includes(pattern.toUpperCase())) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex >= 0) break;
      }

      if (headerIndex >= 0) {
        // Keep only the header line and data rows
        csvString = lines.slice(headerIndex).join('\n');
        console.log(`Skipped ${headerIndex} header rows in thinkorswim CSV`);
      } else {
        console.log('Warning: Could not find thinkorswim header pattern, trying to parse as-is');
      }

      // Thinkorswim CSVs have quoted fields with commas inside
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true, // Relax parsing rules for more permissive parsing
        relax_column_count: true, // Allow variable column counts
        quote: '"', // Handle quoted fields
        escape: '"', // Handle escaped quotes
        skip_records_with_empty_values: false,
        skip_records_with_error: true // Skip problematic records
      };
      console.log('Using special parsing options for thinkorswim CSV');

      // Log first few lines for debugging
      const debugLines = csvString.split('\n').slice(0, 5);
      console.log('First few lines after cleanup:');
      debugLines.forEach((line, i) => console.log(`Line ${i}: ${line}`));
    }
    
    // Special handling for IBKR CSV formats
    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
      // IBKR CSVs can have quoted fields with commas inside and variable column counts
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
        relax: true, // Relax parsing rules for more permissive parsing
        relax_column_count: true, // Allow variable column counts
        quote: '"', // Handle quoted fields
        escape: '"', // Handle escaped quotes
        skip_records_with_empty_values: false,
        skip_records_with_error: true // Skip problematic records instead of failing
      };
      console.log('Using special parsing options for IBKR CSV');
      
      // Log first few lines for debugging
      const debugLines = csvString.split('\n').slice(0, 5);
      console.log('First few lines of IBKR CSV:');
      debugLines.forEach((line, i) => console.log(`Line ${i}: ${line.substring(0, 200)}`));
    }
    
    let records;
    try {
      records = parse(csvString, parseOptions);
    } catch (parseError) {
      console.error('CSV parsing error:', parseError.message);
      
      // If IBKR parsing fails, try alternative approach
      if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
        console.log('Trying alternative parsing approach for IBKR');
        
        // Try with even more relaxed options
        parseOptions = {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ',',
          relax: true, // Relax parsing rules
          relax_column_count: true,
          skip_records_with_error: true,
          quote: '"',
          escape: '"',
          on_record: (record, context) => {
            // Log problematic records
            if (context.error) {
              console.log(`Error on line ${context.lines}: ${context.error.message}`);
            }
            return record;
          }
        };
        
        try {
          records = parse(csvString, parseOptions);
        } catch (retryError) {
          console.error('Alternative parsing also failed:', retryError.message);
          throw new Error(`CSV parsing failed: ${retryError.message}`);
        }
      }
      // If thinkorswim parsing fails, try alternative approach
      else if (broker === 'thinkorswim') {
        console.log('Trying alternative parsing approach for thinkorswim');
        console.log('Original error:', parseError.message);

        // Try to find the header line again with more aggressive pattern matching
        const lines = csvString.split('\n');
        let headerFound = false;

        for (let i = 0; i < Math.min(lines.length, 20); i++) {
          // Look for any line that looks like a CSV header (has multiple commas and common column names)
          const line = lines[i];
          const commaCount = (line.match(/,/g) || []).length;
          const hasDateWord = /date/i.test(line);
          const hasTypeWord = /type|transaction|description/i.test(line);

          if (commaCount >= 3 && hasDateWord && hasTypeWord) {
            console.log(`Found potential header at line ${i}: ${line.substring(0, 100)}`);
            csvString = lines.slice(i).join('\n');
            headerFound = true;
            break;
          }
        }

        if (!headerFound) {
          console.log('Could not find header, trying to parse raw CSV');
        }

        // Try with even more relaxed options
        parseOptions = {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ',',
          relax: true, // Relax parsing rules
          relax_quotes: true, // Be lenient with quotes
          relax_column_count: true,
          skip_records_with_error: true,
          quote: '"',
          escape: '"',
          on_record: (record, context) => {
            // Log problematic records
            if (context.error) {
              console.log(`Error on line ${context.lines}: ${context.error.message}`);
            }
            return record;
          }
        };

        try {
          records = parse(csvString, parseOptions);
        } catch (retryError) {
          console.error('Alternative parsing also failed:', retryError.message);
          throw new Error(`CSV parsing failed for thinkorswim: ${retryError.message}`);
        }
      } else {
        throw parseError;
      }
    }
    
    console.log(`Parsing ${records.length} records with ${broker} parser`);

    // Check if CSV contains a currency column BEFORE broker-specific parsing
    const hasCurrencyColumn = detectCurrencyColumn(records);

    if (hasCurrencyColumn) {
      console.log(`[CURRENCY] Currency column detected in CSV import`);

      // Check if user has pro tier access
      const userId = context.userId;
      if (!userId) {
        throw new Error('CURRENCY_REQUIRES_PRO:User authentication required for currency conversion');
      }

      const hasProAccess = await currencyConverter.userHasProAccess(userId);
      if (!hasProAccess) {
        throw new Error('CURRENCY_REQUIRES_PRO:Currency conversion is a Pro feature. Please upgrade to Pro to import trades with non-USD currencies.');
      }

      console.log(`[CURRENCY] User ${userId} has Pro access, currency conversion enabled`);

      // Store currency column info in context for broker parsers to use
      context.hasCurrencyColumn = true;
      context.currencyRecords = records; // Store original records with currency data
    }

    // Check if CSV contains an account column for automatic account detection
    const accountColumnName = detectAccountColumn(records);
    if (accountColumnName) {
      console.log(`[ACCOUNT] Account column "${accountColumnName}" detected - will extract account IDs from CSV`);
      context.accountColumnName = accountColumnName;
      context.hasAccountColumn = true;
    } else if (context.selectedAccountId) {
      // User manually selected an account during import
      console.log(`[ACCOUNT] Using manually selected account: ${context.selectedAccountId}`);
    }

    if (broker === 'lightspeed') {
      console.log('Starting Lightspeed transaction parsing');
      const result = await parseLightspeedTransactions(records, existingPositions, context.userId, context);
      console.log('Finished Lightspeed transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    if (broker === 'schwab') {
      console.log('Starting Schwab trade parsing');
      const result = await parseSchwabTrades(records, existingPositions, context);
      console.log('Finished Schwab trade parsing');

      // IMPORTANT: Do NOT apply trade grouping for Schwab transactions
      // Schwab parser already uses round-trip position tracking to create properly separated trades
      // Trade grouping would incorrectly merge multiple round trips on the same day
      console.log('[INFO] Skipping trade grouping for Schwab (already grouped by round-trip logic)');

      return result;
    }

    if (broker === 'thinkorswim') {
      console.log('Starting thinkorswim transaction parsing');
      const result = await parseThinkorswimTransactions(records, existingPositions, context);
      console.log('Finished thinkorswim transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    if (broker === 'papermoney') {
      // console.log('Starting PaperMoney transaction parsing');
      const result = await parsePaperMoneyTransactions(records, existingPositions, context);
      console.log('Finished PaperMoney transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    if (broker === 'tradingview') {
      console.log('Starting TradingView transaction parsing');
      const result = await parseTradingViewTransactions(records, existingPositions, context);
      console.log('Finished TradingView transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
      console.log(`Starting IBKR transaction parsing (${broker} format)`);
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      const result = await parseIBKRTransactions(records, existingPositions, tradeGroupingSettings, context);
      console.log('Finished IBKR transaction parsing');
      return result;
    }

    if (broker === 'webull') {
      console.log('Starting Webull transaction parsing');
      const result = await parseWebullTransactions(records, existingPositions, context);
      console.log('Finished Webull transaction parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    if (broker === 'tradovate') {
      console.log('Starting Tradovate transaction parsing');
      const result = await parseTradovateTransactions(records, existingPositions, context);
      console.log('Finished Tradovate transaction parsing');

      // IMPORTANT: Do NOT apply trade grouping for Tradovate transactions
      // Tradovate parser uses round-trip position tracking to create properly separated trades
      // Trade grouping would incorrectly merge multiple round trips when exit and new entry have same timestamp
      console.log('[INFO] Skipping trade grouping for Tradovate (already grouped by round-trip logic)');

      return result;
    }

    if (broker === 'questrade') {
      console.log('Starting Questrade transaction parsing');
      const result = await parseQuestradeTransactions(records, existingPositions, context);
      console.log('Finished Questrade transaction parsing');

      // Skip trade grouping for Questrade - the parser already handles position tracking
      // and trade grouping would incorrectly merge partial close trades back together
      console.log('[INFO] Skipping trade grouping for Questrade (already grouped by round-trip logic)');

      return result;
    }

    // ProjectX provides completed trades (not transactions), use simple parsing
    if (broker === 'projectx') {
      console.log('Starting ProjectX completed trade parsing');
      const parser = brokerParsers.projectx;
      const trades = [];

      for (const record of records) {
        try {
          let trade = parser(record);
          if (isValidTrade(trade)) {
            // Currency conversion if needed
            if (context.hasCurrencyColumn && trade.symbol) {
              const currencyRecord = context.currencyRecords?.find(r =>
                (r.Symbol || r.symbol) === trade.symbol &&
                (r.DateTime || r['Date/Time'] || r.Date) === (record.DateTime || record['Date/Time'] || record.Date)
              );

              if (currencyRecord && currencyRecord.Currency) {
                const currency = currencyRecord.Currency.trim().toUpperCase();
                if (currency && currency !== 'USD') {
                  trade.currency = currency;
                }
              }
            }

            trades.push(trade);
          }
        } catch (error) {
          console.error(`Error parsing ProjectX record:`, error.message);
        }
      }

      console.log(`[SUCCESS] Parsed ${trades.length} ProjectX completed trades`);

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && trades.length > 0) {
        return applyTradeGrouping(trades, tradeGroupingSettings);
      }

      return trades;
    }

    // Generic parser - Use transaction-based processing for better position tracking
    // Check for user preference or use enhanced mode by default when context is available
    // Custom mappings now support position tracking!
    const useEnhancedMode = context.usePositionTracking !== false; // Default to true

    if (useEnhancedMode && existingPositions && Object.keys(existingPositions).length >= 0) {
      console.log('Using enhanced generic parser with position tracking');
      const result = await parseGenericTransactions(records, existingPositions, context.customMapping, context);
      console.log('Finished generic transaction-based parsing');

      // Apply trade grouping if enabled
      const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
      if (tradeGroupingSettings.enabled && result.length > 0) {
        return applyTradeGrouping(result, tradeGroupingSettings);
      }

      return result;
    }

    // Fallback to simple row-by-row parsing (legacy mode)
    // Used when position tracking is disabled, no context available, OR custom mapping is used
    console.log('Using simple generic parser (legacy mode - no position tracking)');
    // Create custom parser if custom mapping is provided
    let parser;
    if (context.customMapping) {
      const mapping = context.customMapping;
      console.log(`[CUSTOM MAPPING] Using custom mapping: ${mapping.mapping_name}`);
      console.log(`[CUSTOM MAPPING] Column mappings:`, {
        symbol: mapping.symbol_column,
        side: mapping.side_column,
        quantity: mapping.quantity_column,
        entryPrice: mapping.entry_price_column,
        exitPrice: mapping.exit_price_column,
        date: mapping.entry_date_column
      });

      parser = (row) => {
        const quantity = parseInteger(row[mapping.quantity_column]);

        // Infer side from quantity if no side column specified
        let side;
        if (mapping.side_column && row[mapping.side_column]) {
          side = parseSide(row[mapping.side_column]);
        } else {
          // Infer from quantity sign: positive = long, negative = short
          side = quantity >= 0 ? 'long' : 'short';
        }

        return {
          symbol: row[mapping.symbol_column] || '',
          tradeDate: mapping.entry_date_column ? parseDate(row[mapping.entry_date_column]) : new Date(),
          entryTime: mapping.entry_date_column ? parseDateTime(row[mapping.entry_date_column]) : new Date(),
          exitTime: mapping.exit_date_column ? parseDateTime(row[mapping.exit_date_column]) : null,
          entryPrice: parseNumeric(row[mapping.entry_price_column]),
          exitPrice: mapping.exit_price_column ? parseNumeric(row[mapping.exit_price_column]) : null,
          quantity: Math.abs(quantity), // Use absolute value
          side: side,
          commission: mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0,
          fees: mapping.fees_column ? parseNumeric(row[mapping.fees_column]) : 0,
          pnl: mapping.pnl_column ? parseNumeric(row[mapping.pnl_column]) : null,
          notes: mapping.notes_column ? row[mapping.notes_column] : '',
          broker: 'custom'
        };
      };
    } else {
      parser = brokerParsers[broker] || brokerParsers.generic;
    }

    const trades = [];

    for (const record of records) {
      try {
        let trade = parser(record);
        if (isValidTrade(trade)) {
          // Parse instrument data for futures/options detection
          if (trade.symbol) {
            const instrumentData = parseInstrumentData(trade.symbol);
            if (instrumentData.instrumentType === 'future' || instrumentData.instrumentType === 'option') {
              // Add instrument data to trade
              Object.assign(trade, instrumentData);
            }
          }

          // Check if this trade has a currency that needs conversion
          if (hasCurrencyColumn) {
            const currencyFieldPatterns = ['currency', 'curr', 'ccy', 'currency_code', 'currencycode'];
            let currency = null;

            // Find the currency field in the record
            for (const fieldName of Object.keys(record)) {
              const lowerFieldName = fieldName.toLowerCase().trim();
              if (currencyFieldPatterns.some(pattern => lowerFieldName.includes(pattern))) {
                currency = record[fieldName];
                break;
              }
            }

            // Convert trade if currency is not USD
            if (currency && currency.toString().toUpperCase().trim() !== 'USD') {
              const tradeDate = trade.tradeDate || trade.date;
              if (!tradeDate) {
                console.warn(`[CURRENCY] Cannot convert trade without date: ${JSON.stringify(trade)}`);
              } else {
                try {
                  console.log(`[CURRENCY] Converting trade from ${currency} to USD on ${tradeDate}`);
                  trade = await currencyConverter.convertTradeToUSD(trade, currency, tradeDate);
                } catch (conversionError) {
                  console.error(`[CURRENCY] Failed to convert trade: ${conversionError.message}`);
                  throw new Error(`Currency conversion failed for ${currency}: ${conversionError.message}`);
                }
              }
            }
          }

          // Add account identifier - user selection takes priority over CSV column
          const accountIdentifier = context.selectedAccountId
            ? context.selectedAccountId
            : context.accountColumnName
              ? extractAccountFromRecord(record, context.accountColumnName)
              : null;

          if (accountIdentifier) {
            trade.accountIdentifier = accountIdentifier;
          }

          trades.push(trade);
        }
      } catch (error) {
        console.error('Error parsing row:', error, record);
      }
    }

    console.log(`[SUCCESS] Parsed ${trades.length} trades (legacy mode)`);

    // Apply trade grouping if enabled
    const tradeGroupingSettings = context.tradeGroupingSettings || { enabled: true, timeGapMinutes: 60 };
    if (tradeGroupingSettings.enabled && trades.length > 0) {
      return applyTradeGrouping(trades, tradeGroupingSettings);
    }

    return trades;
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateStr = dateStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();

  // Try to parse IBKR format XX-XX-YY (could be MM-DD-YY or DD-MM-YY)
  const xxyyMatch = cleanDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})/);
  if (xxyyMatch) {
    const [_, first, second, shortYear] = xxyyMatch;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    const yearNum = 2000 + parseInt(shortYear);

    // Determine if this is MM-DD-YY or DD-MM-YY format
    // If first > 12, it must be DD-MM-YY (day first)
    // If second > 12, it must be MM-DD-YY (month first)
    // If both <= 12, assume DD-MM-YY (more common internationally and in IBKR Activity Statements)
    let monthNum, dayNum;
    if (firstNum > 12) {
      // First number is too large to be a month, so it's DD-MM-YY
      dayNum = firstNum;
      monthNum = secondNum;
    } else if (secondNum > 12) {
      // Second number is too large to be a month, so it's MM-DD-YY
      monthNum = firstNum;
      dayNum = secondNum;
    } else {
      // Ambiguous - default to DD-MM-YY (IBKR Activity Statement format)
      dayNum = firstNum;
      monthNum = secondNum;
    }

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2099) return null;

    // Create date in YYYY-MM-DD format
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');

    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }

  // Try to parse MM/DD/YYYY format
  const mmddyyyyMatch = cleanDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    const [_, month, day, year] = mmddyyyyMatch;
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = parseInt(year);

    // Validate date components for PostgreSQL 16 compatibility
    if (monthNum < 1 || monthNum > 12) return null;
    if (dayNum < 1 || dayNum > 31) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;
    
    // Validate the date is actually valid (e.g., not Feb 30)
    const date = new Date(yearNum, monthNum - 1, dayNum);
    if (date.getFullYear() !== yearNum || date.getMonth() !== monthNum - 1 || date.getDate() !== dayNum) {
      return null; // Invalid date (e.g., Feb 30)
    }
    
    // Create date in YYYY-MM-DD format directly to avoid timezone issues
    const monthPadded = monthNum.toString().padStart(2, '0');
    const dayPadded = dayNum.toString().padStart(2, '0');
    return `${yearNum}-${monthPadded}-${dayPadded}`;
  }
  
  // Fall back to default date parsing with validation
  try {
    const date = new Date(cleanDateStr);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Use local date components to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (error) {
    console.warn(`Invalid date format: ${cleanDateStr}`);
    return null;
  }
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr || dateTimeStr.toString().trim() === '') return null;

  // Remove leading and trailing quotes/apostrophes (including Unicode curly quotes), then trim
  const cleanDateTimeStr = dateTimeStr.toString().replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();

  try {
    // Check for MM/DD/YYYY HH:MM:SS +TZ format (ProjectX with timezone)
    const mmddyyyyTimeWithTzMatch = cleanDateTimeStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+[+-]\d{2}:\d{2}$/);
    if (mmddyyyyTimeWithTzMatch) {
      const [, month, day, year, hour, minute, second] = mmddyyyyTimeWithTzMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`;
    }

    // Check for MM/DD/YYYY HH:MM:SS format (common in many CSVs)
    const mmddyyyyTimeMatch = cleanDateTimeStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (mmddyyyyTimeMatch) {
      const [, month, day, year, hour, minute, second] = mmddyyyyTimeMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`;
    }

    // Check for MM/DD/YYYY HH:MM format (without seconds)
    const mmddyyyyTimeNoSecMatch = cleanDateTimeStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (mmddyyyyTimeNoSecMatch) {
      const [, month, day, year, hour, minute] = mmddyyyyTimeNoSecMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`;
    }

    // Check for IBKR format "XX-XX-YY H:MM" or "XX-XX-YY HH:MM" (could be MM-DD-YY or DD-MM-YY)
    const ibkrDateTimeMatch = cleanDateTimeStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (ibkrDateTimeMatch) {
      const [, first, second, shortYear, hour, minute] = ibkrDateTimeMatch;
      const year = 2000 + parseInt(shortYear); // Convert YY to YYYY
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);

      // Determine if this is MM-DD-YY or DD-MM-YY format
      // If first > 12, it must be DD-MM-YY (day first)
      // If second > 12, it must be MM-DD-YY (month first)
      // If both <= 12, assume DD-MM-YY (IBKR Activity Statement format)
      let monthNum, dayNum;
      if (firstNum > 12) {
        dayNum = firstNum;
        monthNum = secondNum;
      } else if (secondNum > 12) {
        monthNum = firstNum;
        dayNum = secondNum;
      } else {
        // Ambiguous - default to DD-MM-YY
        dayNum = firstNum;
        monthNum = secondNum;
      }

      const monthPadded = monthNum.toString().padStart(2, '0');
      const dayPadded = dayNum.toString().padStart(2, '0');
      const hourPadded = hour.padStart(2, '0');
      return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:00`;
    }

    // Check if the string is in format "YYYY-MM-DD HH:MM:SS" (local time without timezone)
    const localDateTimeMatch = cleanDateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (localDateTimeMatch) {
      const [, year, month, day, hour, minute, second] = localDateTimeMatch;
      // Return as-is without timezone conversion
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    }

    // Check if just a date is provided (no time component)
    const dateOnlyMatch = cleanDateTimeStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateOnlyMatch) {
      const [, month, day, year] = dateOnlyMatch;
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      // Default to 09:30 (market open) if no time provided
      return `${year}-${monthPadded}-${dayPadded}T09:30:00`;
    }

    // Otherwise, parse manually to avoid timezone issues
    // Try to extract date and time components without Date object conversion
    const spaceSplit = cleanDateTimeStr.split(' ');
    if (spaceSplit.length >= 2) {
      const datePart = spaceSplit[0];
      const timePart = spaceSplit[1];

      // Parse date part
      let year, month, day;
      if (datePart.includes('/')) {
        const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          [, month, day, year] = dateMatch;
        }
      } else if (datePart.includes('-')) {
        const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
          [, year, month, day] = dateMatch;
        }
      }

      // Parse time part
      const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (year && month && day && timeMatch) {
        const [, hour, minute, second = '00'] = timeMatch;
        const monthPadded = month.padStart(2, '0');
        const dayPadded = day.padStart(2, '0');
        const hourPadded = hour.padStart(2, '0');
        return `${year}-${monthPadded}-${dayPadded}T${hourPadded}:${minute}:${second}`;
      }
    }

    // Last resort: use Date parsing but extract components carefully
    const date = new Date(cleanDateTimeStr);
    if (isNaN(date.getTime())) return null;

    // Additional validation for PostgreSQL 16
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) return null;

    // Format as ISO string in local time to avoid timezone shifting
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  } catch (error) {
    console.warn(`Invalid datetime format: ${cleanDateTimeStr}`);
    return null;
  }
}

// Lightspeed-specific datetime parser that handles Central Time
function parseLightspeedDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  
  try {
    // Lightspeed exports times in Central Time (America/Chicago)
    // We need to parse the datetime and convert it to UTC properly
    
    // Parse the datetime string components manually to avoid timezone interpretation
    // Expected formats: "2025-04-09 16:33" or "04/09/2025 16:33:00"
    const parts = dateTimeStr.trim().split(' ');
    if (parts.length < 2) return null;
    
    const [datePart, timePart] = parts;
    let year, month, day;
    
    // Check if date is in MM/DD/YYYY format
    if (datePart.includes('/')) {
      const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        [_, month, day, year] = dateMatch.map(Number);
      } else {
        return null;
      }
    } else {
      // Assume YYYY-MM-DD format
      [year, month, day] = datePart.split('-').map(Number);
    }
    
    // Parse time part (HH:MM or HH:MM:SS)
    const timeParts = timePart.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    
    if (!year || !month || !day || hours === undefined || minutes === undefined) return null;
    
    // Create UTC date object with explicit values (treating input as literal time)
    // Month is 0-indexed in JavaScript Date
    const literalDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    
    // Now adjust for Lightspeed timezone
    // Based on your requirement: 16:33 should become 20:33 UTC
    // This means we need to add 4 hours to the literal time
    const offsetHours = 4; // Fixed 4-hour offset to get 16:33 -> 20:33 conversion
    
    // Add offset hours to convert from Lightspeed time to UTC
    const utcDate = new Date(literalDate.getTime() + (offsetHours * 60 * 60 * 1000));
    
    console.log(`Lightspeed time conversion: ${dateTimeStr} (Central) -> ${utcDate.toISOString()} (UTC)`);
    
    return utcDate.toISOString();
  } catch (error) {
    console.warn('Error parsing Lightspeed datetime:', dateTimeStr, error.message);
    return null;
  }
}

// Helper function to determine if a date is in daylight saving time
function isDaylightSavingTime(date) {
  // DST in US typically runs from second Sunday in March to first Sunday in November
  const year = date.getFullYear();
  
  // Second Sunday in March
  const marchSecondSunday = new Date(year, 2, 1); // March 1st
  marchSecondSunday.setDate(marchSecondSunday.getDate() + (7 - marchSecondSunday.getDay()) + 7);
  
  // First Sunday in November  
  const novemberFirstSunday = new Date(year, 10, 1); // November 1st
  novemberFirstSunday.setDate(novemberFirstSunday.getDate() + (7 - novemberFirstSunday.getDay()));
  
  return date >= marchSecondSunday && date < novemberFirstSunday;
}

function parseSide(sideStr) {
  if (!sideStr) return 'long';
  const normalized = sideStr.toLowerCase();
  if (normalized.includes('short') || normalized.includes('sell')) return 'short';
  return 'long';
}

function parseLightspeedSide(sideCode, buySell, principalAmount, netAmount, quantity) {
  
  // PRIORITY 1: Check Side column (B/S indicator) - this is most reliable
  if (sideCode) {
    const cleanSide = sideCode.toString().trim().toUpperCase();
    
    if (cleanSide === 'S' || cleanSide === 'SELL') {
      return 'sell';
    }
    if (cleanSide === 'B' || cleanSide === 'BUY') {
      return 'buy';
    }
  }
  
  // PRIORITY 2: Check quantity sign (negative = sell, positive = buy)
  if (quantity !== undefined && quantity !== null) {
    const qty = parseFloat(quantity);
    if (qty < 0) {
      return 'sell';
    }
    if (qty > 0) {
      return 'buy';
    }
  }
  
  // PRIORITY 3: Check Buy/Sell column (Long Buy/Long Sell)
  if (buySell) {
    const cleanBuySell = buySell.toString().toLowerCase().trim();
    
    if (cleanBuySell.includes('sell') || cleanBuySell === 'long sell' || cleanBuySell === 'short sell') {
      return 'sell';
    }
    if (cleanBuySell.includes('buy') || cleanBuySell === 'long buy' || cleanBuySell === 'short buy') {
      return 'buy';
    }
  }
  
  // Default to buy if we can't determine
  return 'buy';
}

function cleanString(str) {
  if (!str) return '';
  return str.toString().trim();
}

// Parse options/futures instrument data from symbol
function parseInstrumentData(symbol) {
  if (!symbol) {
    return { instrumentType: 'stock' };
  }

  // Normalize: uppercase and standardize spaces
  const normalizedSymbol = symbol.toString().toUpperCase().replace(/\s+/g, ' ').trim();

  // Compact options with space: "Cl 251024C00322500" -> "CL251024C00322500" for pattern matching
  const symbolNoSpaces = normalizedSymbol.replace(/\s+/g, '');

  // Readable IBKR options format: "DIA 10OCT25 466 PUT" (underlying + date + strike + type)
  const readableOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{1,2})([A-Z]{3})(\d{2})\s+(\d+(?:\.\d+)?)\s+(PUT|CALL)$/i);
  if (readableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = readableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // Compact IBKR options format: "DIA10OCT25466PUT" (underlying + date + strike + type, no spaces)
  const compactReadableOptionMatch = symbolNoSpaces.match(/^([A-Z]+)(\d{1,2})([A-Z]{3})(\d{2})(\d+(?:\.\d+)?)(PUT|CALL)$/i);
  if (compactReadableOptionMatch) {
    const [, underlying, day, monthStr, year, strike, type] = compactReadableOptionMatch;

    // Convert month abbreviation to number
    const months = {
      'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
      'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = months[monthStr.toUpperCase()];
    const fullYear = 2000 + parseInt(year);

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: parseFloat(strike),
      expirationDate: `${fullYear}-${month}-${day.padStart(2, '0')}`,
      optionType: type.toLowerCase(),
      contractSize: 100
    };
  }

  // IBKR Options format: "SEDG  250801P00025000" or "AMD   251010C00240000" (underlying + spaces + YYMMDD + C/P + strike)
  // This format has the underlying padded with spaces, then date, call/put indicator, and strike*1000
  // Try with spaces first (original format), then without spaces (e.g., "Cl 251024C00322500" -> "Cl251024C00322500")
  const ibkrOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{6})([CP])(\d{8})$/) ||
                          symbolNoSpaces.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (ibkrOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = ibkrOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Standard compact options format: "AAPL230120C00150000" (6-char underlying + YYMMDD + C/P + 8-digit strike)
  // Also handles format with spaces like "Cl 251024C00322500" by using symbolNoSpaces
  const compactOptionMatch = symbolNoSpaces.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (compactOptionMatch) {
    const [, underlying, expiry, type, strikeStr] = compactOptionMatch;
    const year = 2000 + parseInt(expiry.substr(0, 2));
    const month = parseInt(expiry.substr(2, 2));
    const day = parseInt(expiry.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;

    return {
      instrumentType: 'option',
      underlyingSymbol: underlying,
      strikePrice: strike,
      expirationDate: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: type.toLowerCase() === 'c' ? 'call' : 'put',
      contractSize: 100
    };
  }

  // Futures format detection: "ESM4", "NQU24", "CLZ23", "NYMEX_MINI:QG1!", etc.
  const futuresPatterns = [
    /^([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{1,2})$/,  // Standard: ESM4, NQU24, CLZ23
    /^([A-Z_]+):([A-Z0-9]+)!?$/,                 // TradingView: NYMEX_MINI:QG1!
    /^\/([A-Z]{1,3})([FGHJKMNQUVXZ])(\d{2})$/    // Slash notation: /ESM24
  ];

  for (const pattern of futuresPatterns) {
    const match = normalizedSymbol.match(pattern);
    if (match) {
      let underlying, monthCode, year;

      if (pattern.source.includes(':')) {
        // TradingView format
        [, underlying] = match;
        // Extract month/year from symbol if present
        const tvMatch = underlying.match(/([A-Z]+)(\d+)/);
        if (tvMatch) {
          underlying = tvMatch[1];
          year = parseInt(tvMatch[2]);
          if (year < 100) year += 2000;
        }
      } else {
        [, underlying, monthCode, year] = match;
        year = parseInt(year);
        if (year < 10) {
          // Single digit year: interpret as last digit of current decade (e.g., 5 = 2025, 9 = 2029, 0 = 2020)
          const currentYear = new Date().getFullYear();
          const currentDecade = Math.floor(currentYear / 10) * 10;
          year = currentDecade + year;
        } else if (year < 100) {
          // Two digit year: use standard logic (00-49 = 2000s, 50-99 = 1900s)
          year += year < 50 ? 2000 : 1900;
        }
      }

      const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
      const month = monthCode ? monthCodes[monthCode] : null;

      return {
        instrumentType: 'future',
        underlyingAsset: underlying,
        contractMonth: month,
        contractYear: year || null,
        pointValue: getFuturesPointValue(underlying)
      };
    }
  }

  return { instrumentType: 'stock' };
}

// getFuturesPointValue is now imported from futuresUtils

// PostgreSQL 16 compatible numeric parsing
function parseNumeric(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;
  
  const cleanValue = value.toString().trim().replace(/[$,]/g, '');
  if (cleanValue === '') return defaultValue;
  
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  
  // PostgreSQL 16 has stricter limits on numeric precision
  if (Math.abs(parsed) > 1e15) return defaultValue;
  
  return parsed;
}

function parseInteger(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') return defaultValue;
  
  const cleanValue = value.toString().trim().replace(/[,]/g, '');
  if (cleanValue === '') return defaultValue;
  
  const parsed = parseInt(cleanValue);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  
  // PostgreSQL 16 integer limits
  if (parsed < -2147483648 || parsed > 2147483647) return defaultValue;
  
  return Math.abs(parsed); // Ensure positive for quantities
}

function calculateLightspeedFees(row) {
  const fees = [
    'FeeSEC', 'FeeMF', 'Fee1', 'Fee2', 'Fee3', 
    'FeeStamp', 'FeeTAF', 'Fee4'
  ];
  
  let totalFees = 0;
  fees.forEach(feeField => {
    totalFees += parseNumeric(row[feeField]);
  });
  
  return totalFees;
}



async function parseLightspeedTransactions(records, existingPositions = {}, userId = null, context = {}) {
  console.log(`Processing ${records.length} Lightspeed records for user ${userId}`);

  if (records.length === 0) {
    return [];
  }

  // First, collect all unique CUSIPs for batch lookup
  const cusipsToResolve = new Set();
  records.forEach(record => {
    const symbol = cleanString(record.Symbol);
    const cusip = cleanString(record.CUSIP);

    // Check if symbol looks like CUSIP
    if (symbol && symbol.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(symbol)) {
      cusipsToResolve.add(symbol);
    }
    // Check if CUSIP column has value
    if (cusip && cusip.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(cusip)) {
      cusipsToResolve.add(cusip);
    }
  });

  // Check database first, then cache, then schedule background resolution
  let cusipToTickerMap = {};
  const unresolvedCusips = [];

  if (cusipsToResolve.size > 0) {
    console.log(`[CUSIP] Found ${cusipsToResolve.size} unique CUSIPs to resolve`);

    // Check database mappings first (both user-specific and global)
    for (const cusip of cusipsToResolve) {
      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      let resolved = false;

      try {
        // Check database using get_cusip_mapping function
        const query = `SELECT * FROM get_cusip_mapping($1, $2)`;
        const result = await db.query(query, [cleanCusip, userId]);

        if (result.rows.length > 0) {
          const mapping = result.rows[0];
          cusipToTickerMap[cleanCusip] = mapping.ticker;
          console.log(`[CUSIP] ${cleanCusip} found in database: ${mapping.ticker} (${mapping.resolution_source}${mapping.is_user_override ? ', user override' : ', global'})`);
          resolved = true;
        }
      } catch (error) {
        console.warn(`[CUSIP] Failed to check database for ${cleanCusip}:`, error.message);
      }

      // If not in database, check cache
      if (!resolved) {
        try {
          const cached = await cache.get('cusip_resolution', cleanCusip);

          if (cached) {
            cusipToTickerMap[cleanCusip] = cached;
            console.log(`[CUSIP] ${cleanCusip} found in cache: ${cached}`);
            resolved = true;
          }
        } catch (error) {
          console.warn(`[CUSIP] Failed to check cache for ${cleanCusip}:`, error.message);
        }
      }

      // If still not resolved, add to queue
      if (!resolved) {
        unresolvedCusips.push(cleanCusip);
        console.log(`[CUSIP] ${cleanCusip} not resolved, will process in background`);
      }
    }
    
    console.log(`[CUSIP] Resolved ${Object.keys(cusipToTickerMap).length} of ${cusipsToResolve.size} CUSIPs from database/cache. ${unresolvedCusips.length} will be queued for background processing.`);
    
    // Add unresolved CUSIPs to the processing queue
    if (unresolvedCusips.length > 0) {
      await cusipQueue.addToQueue(unresolvedCusips, 2); // High priority for import
      console.log(`Added ${unresolvedCusips.length} CUSIPs to background processing queue`);
    }
  }
  
  // Parse all transactions
  const transactions = [];
  
  for (const record of records) {
    try {
      // Resolve symbol (convert CUSIP if needed) using batch results
      const rawSymbol = cleanString(record.Symbol);
      const rawCusip = cleanString(record.CUSIP);
      
      let resolvedSymbol = rawSymbol;
      
      // Check if symbol is a CUSIP and we have it in our batch results
      if (rawSymbol && rawSymbol.length === 9 && /^[0-9A-Z]{8}[0-9]$/.test(rawSymbol) && cusipToTickerMap[rawSymbol]) {
        resolvedSymbol = cusipToTickerMap[rawSymbol];
      }
      // Otherwise check if we have a separate CUSIP column
      else if (rawCusip && cusipToTickerMap[rawCusip]) {
        resolvedSymbol = cusipToTickerMap[rawCusip];
      }
      // Otherwise keep the symbol as-is if it's a normal ticker
      else if (/^[A-Z]{1,5}$/.test(rawSymbol)) {
        resolvedSymbol = rawSymbol;
      }

      const sideValue = record.Side || record.side || record.SIDE;
      const buySellValue = record['Buy/Sell'] || record['Buy Sell'] || record.BuySell || record['Long/Short'];
      const side = parseLightspeedSide(sideValue, buySellValue, record['Principal Amount'], record['NET Amount'], record.Qty);
      
      // DEBUG: Log the raw CSV data and parsed side for ALL transactions
      console.log(`[PROCESS] CSV TRANSACTION DEBUG: ${resolvedSymbol}`);
      console.log(`  Side: "${record.Side}"`);
      console.log(`  Buy/Sell: "${record['Buy/Sell']}"`);
      console.log(`  Qty: "${record.Qty}"`);
      console.log(`  PARSED side: "${side}"`);
      console.log(`  Raw Symbol: "${record.Symbol}"`);
      console.log(`  Resolved Symbol: "${resolvedSymbol}"`);
      console.log(`---`);
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      const transaction = {
        symbol: resolvedSymbol,
        tradeDate: parseDate(record['Trade Date']),
        entryTime: parseLightspeedDateTime(record['Trade Date'] + ' ' + (record['Execution Time'] || record['Raw Exec. Time'] || '09:30')),
        entryPrice: parseNumeric(record.Price),
        quantity: parseInteger(record.Qty),
        side: side,
        commission: parseNumeric(record['Commission Amount']),
        fees: calculateLightspeedFees(record),
        broker: 'lightspeed',
        tradeNumber: record['Trade Number'],  // Add unique trade number
        sequenceNumber: record['Sequence Number'],  // Add unique sequence number
        notes: `Trade #${record['Trade Number']} - ${record['Security Type'] || ''}`,
        accountIdentifier: accountIdentifier
      };

      if (transaction.symbol && transaction.entryPrice > 0 && transaction.quantity > 0) {
        transactions.push(transaction);
      }
    } catch (error) {
      console.error('Error parsing transaction:', error);
    }
  }

  console.log(`Parsed ${transactions.length} valid transactions`);
  
  // Calculate total commissions from all CSV transactions
  const totalCSVCommissions = transactions.reduce((sum, tx) => sum + tx.commission, 0);
  const totalCSVFees = transactions.reduce((sum, tx) => sum + tx.fees, 0);
  console.log(`Total commissions from CSV: $${totalCSVCommissions.toFixed(2)}`);
  console.log(`Total fees from CSV: $${totalCSVFees.toFixed(2)}`);

  // Group transactions by symbol
  const symbolGroups = {};
  transactions.forEach(transaction => {
    if (!symbolGroups[transaction.symbol]) {
      symbolGroups[transaction.symbol] = [];
    }
    symbolGroups[transaction.symbol].push(transaction);
  });

  const completedTrades = [];
  
  // Process transactions using round-trip trade grouping (like TradersVue and updated Schwab parser)
  Object.keys(symbolGroups).forEach(symbol => {
    const symbolTransactions = symbolGroups[symbol];

    // Calculate total commissions and fees for this symbol from CSV
    const totalCommissions = symbolTransactions.reduce((sum, tx) => sum + tx.commission, 0);
    const totalFees = symbolTransactions.reduce((sum, tx) => sum + tx.fees, 0);

    console.log(`\n=== Processing ${symbolTransactions.length} Lightspeed transactions for ${symbol} ===`);
    console.log(`Symbol ${symbol}: CSV commissions: $${totalCommissions.toFixed(2)}, fees: $${totalFees.toFixed(2)}`);

    // Detect instrument type to apply correct multiplier
    const instrumentData = parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`Instrument type: ${instrumentData.instrumentType}, value multiplier: ${valueMultiplier}`);

    // Sort by execution time for FIFO matching
    symbolTransactions.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));

    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: null,  // Will be set from first CSV transaction
      tradeDate: null,  // Will be set from first CSV transaction
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),  // Parse JSON executions
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'lightspeed',
      isExistingPosition: true, // Flag to identify this came from database
      existingTradeId: existingPosition.id, // Store original trade ID for updates
      newExecutionsAdded: 0 // Track how many new executions are actually added
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.side} ${qty} @ $${transaction.entryPrice} | Position: ${currentPosition}`);
      
      // DEBUG: Extra logging for PYXS
      if (symbol === 'PYXS') {
        console.log(`🐛 PYXS DEBUG: transaction.side="${transaction.side}", qty=${qty}, currentPosition before=${currentPosition}`);
      }
      
      // Set entry time from first CSV transaction for existing position
      if (currentTrade && currentTrade.entryTime === null) {
        currentTrade.entryTime = transaction.entryTime;
        currentTrade.tradeDate = transaction.tradeDate;
      }
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.entryTime,
          tradeDate: transaction.tradeDate,
          side: transaction.side === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0, // Accumulate fees for this specific trade
          totalFeesForSymbol: totalCommissions + totalFees, // Include all fees/commissions for the symbol
          entryValue: 0,
          exitValue: 0,
          broker: 'lightspeed',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }
      
      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.side,
          quantity: qty,
          price: transaction.entryPrice,
          datetime: transaction.entryTime,
          fees: transaction.commission + transaction.fees,
          tradeNumber: transaction.tradeNumber,  // Include unique trade number
          sequenceNumber: transaction.sequenceNumber  // Include unique sequence number
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers (tradeNumber/sequenceNumber)
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have trade numbers, use that for comparison (most reliable)
          if (exec.tradeNumber && newExecution.tradeNumber) {
            return exec.tradeNumber === newExecution.tradeNumber;
          }
          // If both have sequence numbers, use that
          if (exec.sequenceNumber && newExecution.sequenceNumber) {
            return exec.sequenceNumber === newExecution.sequenceNumber;
          }
          // Without unique identifiers, don't deduplicate within the current import
          // This allows multiple identical executions from the same CSV (legitimate fills)
          // The global check (existsGlobally) still prevents re-importing existing trades
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
          if (symbol === 'PYXS' || symbol === 'CURR') {
            console.log(`  [SUCCESS] Added new execution (${currentTrade.newExecutionsAdded} new total)`);
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
        
        // Accumulate total fees for this trade
        currentTrade.totalFees += (transaction.commission || 0) + (transaction.fees || 0);
      }
      
      // Process the transaction
      if (transaction.side === 'buy') {
        currentPosition += qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.entryPrice * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.entryPrice * valueMultiplier;
          // Don't add to totalQuantity for covering short position
        }

      } else if (transaction.side === 'sell') {
        currentPosition -= qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.entryPrice * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.entryPrice * valueMultiplier;
          // Don't modify totalQuantity when selling from long position
        }
      }
      
      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        // This ensures fees are attributed to the correct date for cashflow calculations
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees || 0;
          } else {
            exitCommission += exec.fees || 0;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;
        // FIXED: Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        // Executions are stored in the executions field (no need for executionData)

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }
        
        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          // Map executions to executionData for Trade.create
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    
    // DEBUG: Extra logging for PYXS  
    if (symbol === 'PYXS') {
      console.log(`🐛 PYXS FINAL DEBUG: currentPosition=${currentPosition}, Math.abs(currentPosition)=${Math.abs(currentPosition)}`);
      if (currentTrade) {
        console.log(`🐛 PYXS FINAL DEBUG: currentTrade.totalQuantity=${currentTrade.totalQuantity}, currentTrade.side=${currentTrade.side}`);
      }
    }
    
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // For open positions, use the net position, not the accumulated totalQuantity
      const netQuantity = Math.abs(currentPosition);
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = netQuantity; // Use actual net position

      // ALSO fix totalQuantity for display consistency
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;

      // Calculate split commissions based on entry vs exit executions
      // For open positions, all fees are entry fees (no exit yet)
      let entryCommission = 0;
      let exitCommission = 0;
      currentTrade.executions.forEach(exec => {
        if ((currentTrade.side === 'long' && exec.action === 'buy') ||
            (currentTrade.side === 'short' && exec.action === 'sell')) {
          entryCommission += exec.fees || 0;
        } else {
          exitCommission += exec.fees || 0;
        }
      });
      currentTrade.entryCommission = entryCommission;
      currentTrade.exitCommission = exitCommission;

      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      
      // Mark as update if this was an existing position (partial or full)
      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated existing position: ${currentTrade.executions.length} executions, remaining ${Math.abs(currentPosition)} shares`;
        console.log(`  → Updated existing ${currentTrade.side} position: ${existingPosition.quantity} → ${currentTrade.quantity} shares`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  → Added open ${currentTrade.side} position: ${currentTrade.quantity} shares`);
      }
      
      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  });

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return { trades: completedTrades };
}

async function parseSchwabTrades(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Schwab trade records`);
  
  // Check if this is the new transaction format: Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
  if (records.length > 0 && !Array.isArray(records[0])) {
    const columns = Object.keys(records[0]);
    console.log('Available columns:', columns);
    
    // Check for the new transaction format
    if (columns.includes('Date') && columns.includes('Action') && columns.includes('Symbol') && columns.includes('Price')) {
      console.log('Detected new Schwab transaction format - processing buy/sell transactions');
      return await parseSchwabTransactions(records, existingPositions, context);
    }
  }
  
  // Fall back to original format processing
  const completedTrades = [];
  let totalCommissions = 0;
  let totalFees = 0;
  let totalPnL = 0;
  
  for (const record of records) {
    try {
      let symbol, quantity, costPerShare, proceedsPerShare, gainLoss, openedDate, closedDate, costBasis, term, washSale;
      
      // Handle array format (positional data without headers)
      if (Array.isArray(record)) {
        symbol = record[0];
        openedDate = record[3];
        closedDate = record[2];
        quantity = Math.abs(parseInt(record[4]?.replace(/,/g, '') || 0));
        proceedsPerShare = parseFloat(record[5]?.replace(/[$,]/g, '') || 0);
        costPerShare = parseFloat(record[6]?.replace(/[$,]/g, '') || 0);
        costBasis = parseFloat(record[8]?.replace(/[$,]/g, '') || 0);
        gainLoss = parseFloat(record[9]?.replace(/[$,]/g, '') || 0);
        term = record[13] || 'Unknown';
        washSale = record[15] === 'Yes';
      } else {
        // Handle original named columns format
        symbol = record['Symbol'];
        quantity = Math.abs(parseInt(record['Quantity']?.replace(/,/g, '') || 0));
        costPerShare = parseFloat(record['Cost Per Share']?.replace(/[$,]/g, '') || 0);
        proceedsPerShare = parseFloat(record['Proceeds Per Share']?.replace(/[$,]/g, '') || 0);
        gainLoss = parseFloat(record['Gain/Loss ($)']?.replace(/[$,]/g, '') || 0);
        openedDate = record['Opened Date'];
        closedDate = record['Closed Date'];
        costBasis = parseFloat(record['Cost Basis (CB)']?.replace(/[$,]/g, '') || 0);
        term = record['Term'] || 'Unknown';
        washSale = record['Wash Sale?'] === 'Yes';
      }
      
      const estimatedCommission = 0;
      let gainLossPercent = 0;
      if (Array.isArray(record)) {
        gainLossPercent = parseFloat(record[10]?.replace(/[%,]/g, '') || 0);
      } else {
        gainLossPercent = parseFloat(record['Gain/Loss (%)']?.replace(/[%,]/g, '') || 0);
      }
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      const trade = {
        symbol: cleanString(symbol),
        tradeDate: parseDate(openedDate),
        entryTime: parseDateTime(openedDate + ' 09:30'),
        exitTime: parseDateTime(closedDate + ' 16:00'),
        entryPrice: costPerShare,
        exitPrice: proceedsPerShare,
        quantity: quantity,
        side: 'long',
        commission: estimatedCommission,
        fees: 0,
        pnl: gainLoss,
        pnlPercent: gainLossPercent,
        broker: 'schwab',
        notes: `${term} - ${washSale ? 'Wash Sale' : 'Normal'}`,
        accountIdentifier
      };
      
      if (trade.symbol && trade.entryPrice > 0 && trade.exitPrice > 0 && trade.quantity > 0) {
        completedTrades.push(trade);
        totalCommissions += estimatedCommission;
        totalPnL += gainLoss;
        console.log(`Valid trade added: ${trade.symbol} - P&L: $${gainLoss.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Error parsing Schwab trade:', error, record);
    }
  }
  
  console.log(`Created ${completedTrades.length} Schwab trades`);
  return completedTrades;
}

async function parseSchwabTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Schwab transaction records`);
  
  const transactions = [];
  const completedTrades = [];
  
  // First, parse all transactions - only process Buy and Sell actions
  for (const record of records) {
    try {
      const action = (record['Action'] || '').toLowerCase();
      const symbol = cleanString(record['Symbol'] || '');
      const quantityStr = (record['Quantity'] || '').toString().replace(/,/g, '');
      const priceStr = (record['Price'] || '').toString().replace(/[$,]/g, '');
      const amountStr = (record['Amount'] || '').toString().replace(/[$,]/g, '');
      const feesStr = (record['Fees & Comm'] || '').toString().replace(/[$,]/g, '');
      const date = record['Date'] || '';
      const description = record['Description'] || '';
      
      // Only process buy and sell transactions
      if (!action.includes('buy') && !action.includes('sell')) {
        console.log(`Skipping non-trade action: ${action}`);
        continue;
      }
      
      // Skip if missing essential data
      if (!symbol || !quantityStr || !priceStr) {
        console.log(`Skipping transaction missing data:`, { symbol, quantityStr, priceStr, action });
        continue;
      }
      
      const quantity = Math.abs(parseFloat(quantityStr));
      const price = parseFloat(priceStr);
      const amount = Math.abs(parseFloat(amountStr));
      const fees = parseFloat(feesStr) || 0;
      
      if (quantity === 0 || price === 0) {
        console.log(`Skipping transaction with zero values:`, { symbol, quantity, price });
        continue;
      }
      
      // Detect short sales - only check action field to avoid false positives
      // from security names containing "short" (e.g., "PROSHARES SHORT QQQ ETF")
      const isShort = action.includes('sell short');
      
      let transactionType;
      if (action.includes('buy')) {
        transactionType = isShort ? 'cover' : 'buy';  // Buy to cover vs regular buy
      } else {
        transactionType = isShort ? 'short' : 'sell'; // Short sell vs regular sell
      }
      
      // Parse date and skip if invalid
      const parsedDate = parseDate(date);
      if (!parsedDate) {
        console.log(`Skipping transaction with invalid date:`, { symbol, date, action });
        continue;
      }
      
      const parsedDateTime = parseDateTime(date + ' 09:30');
      if (!parsedDateTime) {
        console.log(`Skipping transaction with invalid datetime:`, { symbol, date, action });
        continue;
      }
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: parsedDate,
        datetime: parsedDateTime,
        action: transactionType,
        quantity,
        price,
        amount,
        fees,
        description,
        isShort,
        raw: record,
        accountIdentifier
      });
      
      console.log(`Parsed transaction: ${transactionType} ${quantity} ${symbol} @ $${price} ${isShort ? '(SHORT)' : ''}`);
    } catch (error) {
      console.error('Error parsing Schwab transaction:', error, record);
    }
  }
  
  // Assign unique times to transactions on the same date+symbol to preserve CSV order
  // This prevents issues with duplicate detection when multiple round trips occur on the same day
  const transactionsByDateSymbol = {};
  for (const txn of transactions) {
    // txn.date is a string in YYYY-MM-DD format from parseDate()
    // Ensure date is valid (not null) before using it
    if (!txn.date) {
      console.warn(`[WARNING] Transaction missing date field:`, txn);
      continue;
    }
    const key = `${txn.symbol}_${txn.date}`;
    if (!transactionsByDateSymbol[key]) {
      transactionsByDateSymbol[key] = [];
    }
    transactionsByDateSymbol[key].push(txn);
  }

  // Assign incremental times (1 millisecond apart) to transactions with the same date+symbol
  for (const key in transactionsByDateSymbol) {
    const group = transactionsByDateSymbol[key];
    if (group.length > 1) {
      console.log(`[DEBUG] Found ${group.length} transactions for ${key}:`);
      group.forEach((txn, index) => {
        const originalTime = txn.datetime;
        // Keep the same time but add milliseconds to make each unique
        const baseTime = new Date(txn.datetime);
        baseTime.setMilliseconds(index);
        txn.datetime = baseTime.toISOString();
        console.log(`[DEBUG]   [${index}] ${txn.action} ${txn.quantity} @ $${txn.price} - Time: ${originalTime} → ${txn.datetime}`);
      });
      console.log(`[INFO] Assigned unique times to ${group.length} transactions for ${key} to preserve order`);
    }
  }

  // Sort transactions by symbol and date
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid transactions`);

  // Track the last trade end time for each symbol (for time-gap-based grouping)
  const lastTradeEndTime = {};

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping (like TradersVue)
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} transactions for ${symbol} ===`);

    // Detect instrument type to apply correct multiplier
    const instrumentData = parseInstrumentData(symbol);
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`Instrument type: ${instrumentData.instrumentType}, value multiplier: ${valueMultiplier}`);

    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'schwab',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    const openLots = []; // FIFO queue of position lots

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}, entryValue: $${currentTrade.entryValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          weightedEntryPrice: 0,
          weightedExitPrice: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'schwab',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees || 0
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += (transaction.fees || 0);
          console.log(`  → Added execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price} at ${newExecution.datetime}`);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price} at ${newExecution.datetime}`);
        }
      }
      
      // Process the transaction
      if (transaction.action === 'buy') {
        currentPosition += qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'long') {
          const beforeEntry = currentTrade.entryValue;
          const beforeQty = currentTrade.totalQuantity;
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
          console.log(`  → [LONG BUY] Added to entry: ${beforeEntry} + ${qty * transaction.price} = ${currentTrade.entryValue}, Qty: ${beforeQty} + ${qty} = ${currentTrade.totalQuantity}`);
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
          console.log(`  → [SHORT BUY] Added to exit: ${currentTrade.exitValue}`);
        }
        
        openLots.push({
          type: 'long',
          quantity: qty,
          price: transaction.price,
          date: transaction.date,
          datetime: transaction.datetime
        });
        
      } else if (transaction.action === 'short' || transaction.action === 'sell') {
        currentPosition -= qty;

        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
          console.log(`  → [SHORT SELL] Added to entry: ${currentTrade.entryValue}, Qty: ${currentTrade.totalQuantity}`);
        } else if (currentTrade && currentTrade.side === 'long') {
          const beforeExit = currentTrade.exitValue;
          currentTrade.exitValue += qty * transaction.price;
          console.log(`  → [LONG SELL] Added to exit: ${beforeExit} + ${qty * transaction.price} = ${currentTrade.exitValue}`);
        }
        
        if (transaction.action === 'short') {
          openLots.push({
            type: 'short',
            quantity: qty,
            price: transaction.price,
            date: transaction.date,
            datetime: transaction.datetime
          });
        }
      }
      
      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.shouldUpdate = true;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} total executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
        openLots.length = 0; // Clear lots when trade completes
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade && currentPosition !== 0) {
      // Add open position as incomplete trade
      // Check if this is an update to existing position or new position
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        // Updated existing position - mark for update
        currentTrade.shouldUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      } else if (!currentTrade.isExistingPosition) {
        // New open position
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  → Added open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares`);
      }

      // Calculate weighted average entry price for display
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.executionData = currentTrade.executions;

      completedTrades.push(currentTrade);
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
    }
  }

  console.log(`Created ${completedTrades.length} completed trades (including open positions) from transaction pairing`);
  console.log(`\n[DEBUG] Schwab trades summary:`);
  completedTrades.forEach((trade, index) => {
    console.log(`  Trade #${index + 1}: ${trade.symbol} ${trade.side} ${trade.quantity} shares, Entry: $${trade.entryPrice?.toFixed(2)}, Exit: $${trade.exitPrice?.toFixed(2)}, P&L: $${trade.pnl?.toFixed(2)}`);
  });

  return completedTrades;
}

async function parseThinkorswimTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} thinkorswim transaction records`);

  // Thinkorswim is stock trading, so contract multiplier is always 1
  const contractMultiplier = 1;
  const valueMultiplier = 1; // For stocks, value multiplier is 1
  const instrumentData = {
    instrumentType: 'stock'
  };

  const transactions = [];
  const completedTrades = [];
  
  // Debug: Log first few records to see structure
  console.log('Sample records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });
  
  // Count record types
  const typeCounts = {};
  records.forEach(record => {
    const type = record.TYPE || record.Type || 'UNKNOWN';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  console.log('Record type counts:', typeCounts);
  
  // First, parse all trade transactions
  for (const record of records) {
    try {
      const type = record.TYPE || record.Type || '';
      
      // Only process TRD (trade) rows
      if (type !== 'TRD') {
        continue;
      }
      
      const description = record.DESCRIPTION || record.Description || '';
      const date = record.DATE || record.Date || '';
      const time = record.TIME || record.Time || '';
      const refNum = record['REF #'] || record['Ref #'] || record.REF || '';

      // Parse trade details from description (e.g., "BOT +1,000 82655M107 @.77")
      const tradeMatch = description.match(/(BOT|SOLD)\s+([\+\-]?[\d,]+)\s+(\S+)\s+@([\d.]+)/);
      if (!tradeMatch) {
        console.log(`Skipping unparseable trade description: ${description}`);
        continue;
      }

      const [_, action, quantityStr, symbol, priceStr] = tradeMatch;
      const quantity = Math.abs(parseFloat(quantityStr.replace(/,/g, '')));
      const price = parseFloat(priceStr);

      // Parse fees
      const miscFees = parseFloat((record['Misc Fees'] || '0').replace(/[$,]/g, '')) || 0;
      const commissionsFees = parseFloat((record['Commissions & Fees'] || '0').replace(/[$,]/g, '')) || 0;
      const totalFees = miscFees + commissionsFees;

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (context.tosAccountNumber || null);

      transactions.push({
        symbol,
        date: parseDate(date),
        datetime: parseDateTime(`${date} ${time}`),
        action: action.toLowerCase() === 'bot' ? 'buy' : 'sell',
        quantity,
        price,
        fees: totalFees,
        description,
        refNum,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed transaction: ${action} ${quantity} ${symbol} @ $${price}`);
    } catch (error) {
      console.error('Error parsing thinkorswim transaction:', error, record);
    }
  }
  
  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid trade transactions`);

  // Group transactions by REF # first, then merge them
  const transactionsByRef = {};
  for (const transaction of transactions) {
    if (transaction.refNum) {
      if (!transactionsByRef[transaction.refNum]) {
        transactionsByRef[transaction.refNum] = [];
      }
      transactionsByRef[transaction.refNum].push(transaction);
    }
  }

  // Merge transactions with the same REF # into single transactions
  const mergedTransactions = [];
  const processedRefs = new Set();

  for (const transaction of transactions) {
    // If this transaction has a REF # and we haven't processed it yet
    if (transaction.refNum && !processedRefs.has(transaction.refNum)) {
      const refTransactions = transactionsByRef[transaction.refNum];

      if (refTransactions.length > 1) {
        // Multiple transactions with same REF # - merge them
        console.log(`Merging ${refTransactions.length} transactions with REF # ${transaction.refNum}`);

        // Sum quantities and fees, weighted average for price
        let totalQuantity = 0;
        let totalValue = 0;
        let totalFees = 0;

        for (const refTx of refTransactions) {
          totalQuantity += refTx.quantity;
          totalValue += refTx.quantity * refTx.price;
          totalFees += refTx.fees;
        }

        const avgPrice = totalValue / totalQuantity;

        // Create merged transaction using first transaction as template
        const mergedTransaction = {
          ...refTransactions[0],
          quantity: totalQuantity,
          price: avgPrice,
          fees: totalFees
        };

        console.log(`  → Merged into: ${mergedTransaction.action} ${totalQuantity} ${mergedTransaction.symbol} @ $${avgPrice.toFixed(4)}`);
        mergedTransactions.push(mergedTransaction);
      } else {
        // Single transaction with this REF #
        mergedTransactions.push(transaction);
      }

      processedRefs.add(transaction.refNum);
    } else if (!transaction.refNum) {
      // No REF #, keep as-is
      mergedTransactions.push(transaction);
    }
    // Skip if already processed
  }

  console.log(`After REF # grouping: ${mergedTransactions.length} transactions (from ${transactions.length})`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of mergedTransactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }
  
  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];
    
    console.log(`\n=== Processing ${symbolTransactions.length} transactions for ${symbol} ===`);
    
    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ? 
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'thinkorswim',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'thinkorswim',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);
      
      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;
        
        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }
        
        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }
        
        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }
        
        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          // Map executions to executionData for Trade.create
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
      
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      }

      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parsePaperMoneyTransactions(records, existingPositions = {}, context = {}) {
  const DEBUG = process.env.DEBUG_IMPORT === 'true';
  if (DEBUG) console.log(`Processing ${records.length} PaperMoney transaction records`);
  
  const transactions = [];
  const completedTrades = [];
  
  // Debug: Log first few records to see structure
  console.log('Sample PaperMoney records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });
  
  // First, parse all trade transactions from the filled orders
  for (const record of records) {
    try {
      const symbol = cleanString(record.Symbol);
      const side = record.Side ? record.Side.toLowerCase() : '';
      const quantity = Math.abs(parseInt(record.Qty || 0));
      const price = parseFloat(record.Price || record['Net Price'] || 0);
      const execTime = record['Exec Time'] || '';
      const posEffect = record['Pos Effect'] || '';
      const type = record.Type || 'STOCK';
      
      // Skip if missing essential data
      if (!symbol || !side || quantity === 0 || price === 0 || !execTime) {
        console.log(`Skipping PaperMoney record missing data:`, { symbol, side, quantity, price, execTime });
        continue;
      }
      
      // Parse the execution time (format: "9/19/25 13:24:32")
      let tradeDate = null;
      let entryTime = null;
      if (execTime) {
        // Convert MM/DD/YY format to full date
        const dateMatch = execTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(.+)$/);
        if (dateMatch) {
          const [_, month, day, year, time] = dateMatch;
          // Smart year conversion: assume 00-49 is 2000-2049, 50-99 is 1950-1999
          const yearNum = parseInt(year);
          const fullYear = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
          const fullDate = `${month}/${day}/${fullYear} ${time}`;
          tradeDate = parseDate(fullDate);
          entryTime = parseDateTime(fullDate);
        }
      }
      
      if (!tradeDate || !entryTime) {
        console.log(`Skipping PaperMoney record with invalid date: ${execTime}`);
        continue;
      }
      
      // Validate date is reasonable (not in future, not too old)
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Allow 1 day in future for timezone issues
      const minPastDate = new Date('2000-01-01');
      
      if (entryTime > maxFutureDate) {
        console.log(`Skipping PaperMoney record with future date: ${execTime}`);
        continue;
      }
      
      if (entryTime < minPastDate) {
        console.log(`Skipping PaperMoney record with date too far in past: ${execTime}`);
        continue;
      }
      
      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price,
        fees: 0, // PaperMoney doesn't show fees in this format
        posEffect,
        type,
        description: `${posEffect} - ${type}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed PaperMoney transaction: ${side} ${quantity} ${symbol} @ $${price} (${posEffect})`);
    } catch (error) {
      console.error('Error parsing PaperMoney transaction:', error, record);
    }
  }
  
  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });
  
  console.log(`Parsed ${transactions.length} valid PaperMoney trade transactions`);
  
  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }
  
  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];
    
    console.log(`\n=== Processing ${symbolTransactions.length} PaperMoney transactions for ${symbol} ===`);
    
    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'papermoney',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;
    
    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);
      
      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'papermoney',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;
        
        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }
        
        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }
        
        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }
        
        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          // Map executions to executionData for Trade.create
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
      
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      }

      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} PaperMoney trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parseTradingViewTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} TradingView transaction records`);

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('Sample TradingView records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // First, parse all filled orders
  for (const record of records) {
    try {
      const symbol = cleanString(record.Symbol);
      const side = record.Side ? record.Side.toLowerCase() : '';
      const status = record.Status || '';
      const quantity = Math.abs(parseInteger(record.Qty));
      const fillPrice = parseNumeric(record['Fill Price']);
      const commission = parseNumeric(record.Commission);
      const placingTime = record['Placing Time'] || '';
      const closingTime = record['Closing Time'] || '';
      const orderId = record['Order ID'] || '';
      const orderType = record.Type || '';
      const leverage = record.Leverage || '';

      // Only process filled orders
      if (status !== 'Filled') {
        console.log(`Skipping non-filled order: ${status}`);
        continue;
      }

      // Skip if missing essential data
      if (!symbol || !side || quantity === 0 || fillPrice === 0 || !closingTime) {
        console.log(`Skipping TradingView record missing data:`, { symbol, side, quantity, fillPrice, closingTime });
        continue;
      }

      // Parse the datetime (format: "2025-10-02 21:28:16")
      const tradeDate = parseDate(closingTime);
      const entryTime = parseDateTime(closingTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping TradingView record with invalid date: ${closingTime}`);
        continue;
      }

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price: fillPrice,
        fees: commission,
        orderId,
        orderType,
        leverage,
        description: `${orderType} order ${leverage ? `with ${leverage}` : ''}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed TradingView transaction: ${side} ${quantity} ${symbol} @ $${fillPrice} (${orderType})`);
    } catch (error) {
      console.error('Error parsing TradingView transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid TradingView trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} TradingView transactions for ${symbol} ===`);

    // TradingView is stock trading, so contract multiplier is always 1
    const contractMultiplier = 1;
    const instrumentData = {
      instrumentType: 'stock',
      contractSize: null,
      underlyingSymbol: null,
      optionType: null,
      strikePrice: null,
      expirationDate: null,
      underlyingAsset: null,
      contractMonth: null,
      contractYear: null,
      tickSize: null,
      pointValue: null
    };

    // Track position and round-trip trades
    // Start with existing position if we have one for this symbol
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'tradingview',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'tradingview',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees,
          orderId: transaction.orderId
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, ${currentTrade.newExecutionsAdded} new executions`);
      }

      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} TradingView trades from ${transactions.length} transactions`);
  return completedTrades;
}

async function parseIBKRTransactions(records, existingPositions = {}, tradeGroupingSettings = { enabled: true, timeGapMinutes: 60 }, context = {}) {
  console.log(`\n=== IBKR TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} IBKR transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);
  console.log(`Trade grouping: ${tradeGroupingSettings.enabled ? `enabled (${tradeGroupingSettings.timeGapMinutes} minute time gap)` : 'disabled'}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample IBKR records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Detect format: Trade Confirmation vs Activity Statement
  const isTradeConfirmation = records.length > 0 && records[0].hasOwnProperty('Buy/Sell');

  // First, parse all transactions
  for (const record of records) {
    try {
      let symbol, quantity, absQuantity, price, commission, dateTime, action, multiplierFromCSV;

      // Capture Code column if present (O = Open, P = Partial, C = Close)
      let code = null;
      if (record.Code || record.code) {
        code = cleanString(record.Code || record.code).toUpperCase();
        console.log(`[IBKR] Transaction code: ${code}`);
      }

      if (isTradeConfirmation) {
        // Trade Confirmation format
        symbol = cleanString(record.Symbol);
        quantity = parseFloat(record.Quantity);
        absQuantity = Math.abs(quantity);
        price = parseFloat(record.Price);
        // IBKR commission: negative = fee paid, positive = rebate received
        // Convert to our convention: positive = fee paid, negative = rebate (credit)
        commission = -(parseFloat(record.Commission || 0));

        // Parse date/time - format is YYYYMMDD;HHMMSS
        const dateTimeParts = (record['Date/Time'] || '').split(';');
        const dateStr = dateTimeParts[0]; // YYYYMMDD
        const timeStr = dateTimeParts[1] || '093000'; // HHMMSS

        // Convert YYYYMMDD to YYYY-MM-DD
        const tradeDate = dateStr ? `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` : null;

        // Convert HHMMSS to HH:MM:SS
        const time = timeStr ? `${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}` : '09:30:00';
        dateTime = tradeDate ? `${tradeDate} ${time}` : '';

        // Determine action from Buy/Sell column
        const buySell = cleanString(record['Buy/Sell']).toUpperCase();
        action = buySell === 'BUY' ? 'buy' : 'sell';
        // Read Multiplier column for Trade Confirmation format
        multiplierFromCSV = record.Multiplier ? parseFloat(record.Multiplier) : null;
      } else {
        // Activity Statement format (original)
        symbol = cleanString(record.Symbol);
        quantity = parseFloat(record.Quantity);
        absQuantity = Math.abs(quantity);
        price = parseFloat(record.Price);
        // IBKR commission: negative = fee paid, positive = rebate received
        // Convert to our convention: positive = fee paid, negative = rebate (credit)
        commission = -(parseFloat(record.Commission || 0));
        // Handle both "DateTime" and "Date/Time" column names
        // Clean DateTime - remove leading and trailing apostrophes/quotes if present
        const rawDateTime = (record.DateTime || record['Date/Time'] || '').toString();
        dateTime = rawDateTime.replace(/^[\x27\x22\u2018\u2019\u201C\u201D]|[\x27\x22\u2018\u2019\u201C\u201D]$/g, '').trim();
        action = quantity > 0 ? 'buy' : 'sell';
        // Check for Multiplier column (some IBKR Activity Statement exports include this)
        multiplierFromCSV = record.Multiplier ? parseFloat(record.Multiplier) : null;
      }


      // Skip if missing essential data
      // Note: price === 0 is valid for expired options (Code contains "Ep" or "Ex" or "A" or "C")
      // Also valid when Code is 'C' (close) for options with price=0 (worthless expiration)
      const isOptionSymbol = symbol && (symbol.includes(' ') || /\d{6}[PC]\d{8}/.test(symbol));
      const isExpirationCode = code && (code.includes('EP') || code.includes('EX') || code.includes('A'));
      const isOptionClose = code && code.includes('C') && isOptionSymbol;
      const isExpiration = isExpirationCode || (price === 0 && isOptionClose);
      if (!symbol || absQuantity === 0 || (price === 0 && !isExpiration) || !dateTime) {
        console.log(`Skipping IBKR record missing data:`, { symbol, quantity, price, dateTime, code });
        continue;
      }

      // Parse the datetime
      const tradeDate = parseDate(dateTime);
      const entryTime = parseDateTime(dateTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping IBKR record with invalid date: ${dateTime}`);
        continue;
      }

      // For options, IBKR Activity Statement already reports quantity in contracts
      let processedQuantity = absQuantity;
      const instrumentData = parseInstrumentData(symbol);
      if (instrumentData.instrumentType === 'option') {
        // IBKR reports options quantity in contracts already (not shares)
        // So we don't need to divide by 100
        processedQuantity = Math.round(absQuantity); // Ensure whole number
        console.log(`[IBKR] Options contract quantity: ${processedQuantity} contracts`);
      } else {
        // For stocks, use the quantity as-is
        processedQuantity = absQuantity;
        console.log(`[IBKR] Stock quantity: ${processedQuantity} shares`);
      }

      // Detect if this is an expiration transaction
      // Include EP (expired), EX (exercised), A (assigned), or option close with price=0
      const isExpirationTx = isExpiration || (price === 0 && instrumentData.instrumentType === 'option');

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      // Extract Conid (Contract ID) for options grouping - this is the most reliable way to group
      // options trades for the same contract regardless of symbol parsing issues
      const conid = cleanString(record.Conid || record.conid || record.ConId || record.ConID || '');
      if (conid) {
        console.log(`[IBKR] Contract ID (Conid): ${conid} for symbol ${symbol}`);
      }

      transactions.push({
        symbol,
        conid, // Contract ID for reliable options grouping
        date: tradeDate,
        datetime: entryTime,
        action: action,
        quantity: processedQuantity,
        price: price,
        fees: commission,
        code: code, // O = Open, P = Partial, C = Close, Ep = Expired, Ex = Exercised, A = Assigned
        isExpiration: isExpirationTx,
        multiplier: multiplierFromCSV, // Contract multiplier from CSV (if available)
        description: isExpirationTx ? `IBKR option expiration/assignment` : `IBKR transaction`,
        raw: record,
        accountIdentifier
      });

      if (isExpirationTx) {
        console.log(`[IBKR] Parsed EXPIRATION/ASSIGNMENT: ${action} ${processedQuantity} ${symbol} @ $${price} [${code || 'no code'}] (options expired/assigned)`);
      } else {
        console.log(`Parsed IBKR transaction: ${action} ${processedQuantity} ${symbol} @ $${price}${code ? ` [${code}]` : ''}${commission < 0 ? ` (rebate: $${Math.abs(commission).toFixed(2)})` : ''}`);
      }
    } catch (error) {
      console.error('Error parsing IBKR transaction:', error, record);
    }
  }

  // Sort transactions by grouping key (conid if available, otherwise symbol) and datetime
  // Using Conid ensures options contracts are grouped correctly even if symbol parsing has issues
  transactions.sort((a, b) => {
    const keyA = a.conid || a.symbol;
    const keyB = b.conid || b.symbol;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid IBKR trade transactions`);

  // Track the last trade end time for each grouping key (for time-gap-based grouping)
  const lastTradeEndTime = {};

  // Group transactions by Conid when available, otherwise by symbol
  // Conid is the most reliable way to group options trades for the same contract
  const transactionsByGroupKey = {};
  for (const transaction of transactions) {
    // Use Conid as primary grouping key for options, fall back to symbol
    const groupKey = transaction.conid || transaction.symbol;
    if (!transactionsByGroupKey[groupKey]) {
      transactionsByGroupKey[groupKey] = [];
    }
    transactionsByGroupKey[groupKey].push(transaction);
  }

  // Log grouping info
  const conidGroupCount = Object.keys(transactionsByGroupKey).filter(k => /^\d+$/.test(k)).length;
  const symbolGroupCount = Object.keys(transactionsByGroupKey).length - conidGroupCount;
  console.log(`[IBKR] Grouped into ${Object.keys(transactionsByGroupKey).length} groups (${conidGroupCount} by Conid, ${symbolGroupCount} by symbol)`);

  // For backwards compatibility, create transactionsBySymbol as an alias
  const transactionsBySymbol = transactionsByGroupKey;

  // Log all available existing positions for debugging
  console.log(`\n[IBKR] Available existing positions:`);
  if (Object.keys(existingPositions).length === 0) {
    console.log(`  → No existing positions found`);
  } else {
    Object.entries(existingPositions).forEach(([sym, pos]) => {
      console.log(`  → ${sym}: ${pos.side} ${pos.quantity} @ $${pos.entryPrice} (ID: ${pos.id})`);
    });
  }

  // Process transactions using round-trip trade grouping
  for (const groupKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[groupKey];

    // Get the actual symbol from the first transaction (groupKey might be a Conid)
    const symbol = symbolTransactions[0].symbol;
    const conid = symbolTransactions[0].conid;

    if (conid) {
      console.log(`\n=== Processing ${symbolTransactions.length} IBKR transactions for Conid ${conid} (${symbol}) ===`);
    } else {
      console.log(`\n=== Processing ${symbolTransactions.length} IBKR transactions for ${symbol} ===`);
    }

    // Parse instrument data to check if this is an option/future
    let instrumentData;

    // Check if Trade Confirmation format with separate columns
    if (isTradeConfirmation && symbolTransactions[0].raw) {
      const firstRecord = symbolTransactions[0].raw;
      const underlyingSymbol = cleanString(firstRecord.UnderlyingSymbol);
      const strike = parseFloat(firstRecord.Strike);
      const expiry = firstRecord.Expiry; // Format: YYYYMMDD
      const putCall = cleanString(firstRecord['Put/Call']);
      const multiplier = parseFloat(firstRecord.Multiplier || 100);

      if (underlyingSymbol && strike && expiry && putCall) {
        // This is an option - use the columns directly
        const expirationDate = expiry ? `${expiry.substring(0,4)}-${expiry.substring(4,6)}-${expiry.substring(6,8)}` : null;

        instrumentData = {
          instrumentType: 'option',
          underlyingSymbol: underlyingSymbol,
          strikePrice: strike,
          expirationDate: expirationDate,
          optionType: putCall.toLowerCase() === 'c' ? 'call' : 'put',
          contractSize: multiplier
        };
      } else {
        instrumentData = { instrumentType: 'stock' };
      }
    } else {
      // Activity Statement format - parse from symbol
      instrumentData = parseInstrumentData(symbol);
    }

    // Note: For IBKR, quantity is in contracts for options
    // Price interpretation varies:
    //   - Standard options: prices are per-share, multiply by 100 for dollar value
    //   - Mini options: prices are per-share, multiply by 10 for dollar value
    //   - Some exports: prices may be per-contract, multiply by 1 for dollar value
    // We read the Multiplier column from CSV if available to handle all cases correctly
    const contractMultiplier = 1; // Quantity is already in contracts

    console.log(`Instrument type: ${instrumentData.instrumentType}, contract multiplier: ${contractMultiplier}`);

    // For dollar value calculations (entryValue/exitValue), we need to apply appropriate multipliers
    // Priority: CSV Multiplier > Trade Confirmation contractSize > default (100)
    const csvMultiplier = symbolTransactions[0]?.multiplier;
    const valueMultiplier = instrumentData.instrumentType === 'option' ?
                            (csvMultiplier || instrumentData.contractSize || 100) :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    if (csvMultiplier && instrumentData.instrumentType === 'option') {
      console.log(`[IBKR] Using multiplier from CSV: ${csvMultiplier} (option price is per-${csvMultiplier === 1 ? 'contract' : csvMultiplier === 10 ? 'share (mini)' : 'share'})`);
    } else if (instrumentData.instrumentType === 'option') {
      console.log(`[IBKR] Using default multiplier: ${valueMultiplier} (standard options pricing)`);
    }

    // Track position and round-trip trades
    // For options, build composite key (underlying_strike_expiration_type) to match specific contracts
    // This prevents different option contracts (same underlying, different strikes/expirations) from being merged
    // Also try Conid lookup if available (most reliable for IBKR)
    let existingPosition = null;
    let positionLookupKey = symbol;

    // First try Conid lookup if available (most reliable)
    if (conid && existingPositions[`conid_${conid}`]) {
      positionLookupKey = `conid_${conid}`;
      console.log(`  → Looking up position by Conid: ${conid}`);
      existingPosition = existingPositions[positionLookupKey];
    } else if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol &&
        instrumentData.strikePrice && instrumentData.expirationDate && instrumentData.optionType) {
      // Build composite key for options: underlying_strike_expiration_type
      positionLookupKey = `${instrumentData.underlyingSymbol}_${instrumentData.strikePrice}_${instrumentData.expirationDate}_${instrumentData.optionType}`;
      console.log(`  → Looking up option position with key: ${positionLookupKey}`);
      existingPosition = existingPositions[positionLookupKey];
    } else {
      // For stocks/futures or options without full metadata, use symbol directly
      existingPosition = existingPositions[symbol];
    }

    if (!existingPosition) {
      console.log(`  → No existing position found for key: ${positionLookupKey}`);
    }

    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      conid: existingPosition.conid || conid, // Preserve conid from existing position or use current transaction's conid
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'ibkr',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}, entryValue: $${currentTrade.entryValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      const transactionCode = transaction.code;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}${transactionCode ? ` | Code: ${transactionCode}` : ''}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0 && !currentTrade) {
        // Check if this is a close-only transaction (Code contains 'C' but not 'O' or standalone 'P')
        // IBKR codes: O=Open, C=Close, P=Partial, EP=Expired, EX=Exercised, A=Assigned
        // We check for ';P' or standalone 'P' to distinguish from 'EP' (Expired)
        // This is just a HINT - we'll still process the transaction even if we can't find the position
        const hasPartialCode = transactionCode && (transactionCode.includes(';P') || transactionCode === 'P' || transactionCode.startsWith('P;'));
        const isCloseOnly = transactionCode && transactionCode.includes('C') &&
                           !transactionCode.includes('O') && !hasPartialCode;

        if (isCloseOnly) {
          // Code='C' indicates this should close an existing position, but we don't have one loaded
          // This could mean:
          // 1. The opening position wasn't found due to symbol mismatch
          // 2. The position was closed in a previous import
          // 3. The CSV is being imported out of order
          console.log(`  → [WARNING] Code='${transactionCode}' indicates closing transaction, but no open position found`);
          console.log(`  → Will treat this as a new opening position (${transaction.action === 'buy' ? 'long' : 'short'})`);
          console.log(`  → If this should close an existing position, check symbol matching in database`);
        }

        // Start a new trade regardless of Code
        // Check time gap if grouping is enabled
        let shouldStartNewTrade = true;

        if (tradeGroupingSettings.enabled && lastTradeEndTime[symbol]) {
          const timeSinceLastTrade = (new Date(transaction.datetime) - new Date(lastTradeEndTime[symbol])) / (1000 * 60); // minutes

          if (timeSinceLastTrade <= tradeGroupingSettings.timeGapMinutes) {
            // Within time gap - continue previous trade
            shouldStartNewTrade = false;
            console.log(`  → [GROUPING] Within ${tradeGroupingSettings.timeGapMinutes}min gap (${timeSinceLastTrade.toFixed(1)}min) - continuing previous trade`);
          } else {
            console.log(`  → [GROUPING] Beyond ${tradeGroupingSettings.timeGapMinutes}min gap (${timeSinceLastTrade.toFixed(1)}min) - starting new trade`);
          }
        }

        if (shouldStartNewTrade) {
          // Determine trade side - for sell-to-open, this is a short position
          const tradeSide = transaction.action === 'buy' ? 'long' : 'short';

          currentTrade = {
            symbol: symbol,
            conid: conid, // IBKR Contract ID for reliable options tracking
            entryTime: transaction.datetime,
            tradeDate: transaction.date,
            side: tradeSide,
            executions: [],
            totalQuantity: 0,
            totalFees: 0,
            entryValue: 0,
            exitValue: 0,
            broker: 'ibkr',
            accountIdentifier: transaction.accountIdentifier
          };

          // Log with extra detail for short option positions
          if (tradeSide === 'short' && instrumentData.instrumentType === 'option') {
            console.log(`  → Started new SHORT OPTION trade (sell-to-open)${transactionCode ? ` [Code: ${transactionCode}]` : ''}`);
          } else {
            console.log(`  → Started new ${currentTrade.side} trade${transactionCode ? ` [Code: ${transactionCode}]` : ''}`);
          }
        }
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees,
          conid: transaction.conid // Include Conid for duplicate detection
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        // Use positionLookupKey for options to match the composite key format in existingExecutions
        const existsGlobally = isExecutionDuplicate(newExecution, positionLookupKey, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers (orderId)
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison (most reliable)
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          // This allows multiple identical executions from the same CSV (legitimate fills)
          // The global check (existsGlobally) still prevents re-importing existing trades
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          // For short positions, entry value is what we receive from selling
          const saleProceeds = qty * transaction.price * valueMultiplier;
          currentTrade.entryValue += saleProceeds;
          currentTrade.totalQuantity += qty;

          // For short options, log detailed information about proceeds and commission rebates
          if (instrumentData.instrumentType === 'option') {
            // Commission rebates show as negative fees, so net proceeds = sale - fees (adds rebate)
            const netProceeds = saleProceeds - transaction.fees;
            console.log(`  [SHORT OPTION ENTRY] Sold ${qty} contracts @ $${transaction.price}/share`);
            console.log(`    Sale proceeds: $${saleProceeds.toFixed(2)} (${qty} × $${transaction.price} × ${valueMultiplier})`);
            console.log(`    Commission/rebate: $${transaction.fees.toFixed(2)} ${transaction.fees < 0 ? '(REBATE - credit)' : '(fee - debit)'}`);
            console.log(`    Net proceeds: $${netProceeds.toFixed(2)}`);
          }
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices
        // Divide by multiplier to get per-contract/per-share price
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        // For short positions: P/L = what you received (entry) - what you paid (exit) - fees
        // For long positions: P/L = what you received (exit) - what you paid (entry) - fees
        // Commission rebates (negative fees) increase profit when subtracted
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;

          // Log P&L calculation for short options to help debugging
          if (instrumentData.instrumentType === 'option') {
            console.log(`  [SHORT OPTION P&L] Entry: $${currentTrade.entryValue.toFixed(2)}, Exit: $${currentTrade.exitValue.toFixed(2)}, Fees: $${currentTrade.totalFees.toFixed(2)}, P&L: $${currentTrade.pnl.toFixed(2)}`);
          }
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * (typeof contractMultiplier !== 'undefined' ? contractMultiplier : 1);
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions based on entry vs exit executions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;

        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);
        
        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} shares, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Skip if no executions (all were duplicates)
      if (currentTrade.executions.length === 0) {
        console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        currentTrade = null;
      }
    }

    if (currentTrade) {
      // Add open position as incomplete trade
      // Divide by multiplier to get per-contract/per-share price
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      // IMPORTANT: Store the REMAINING position quantity, not total entry quantity
      // This ensures correct position tracking when importing additional closing transactions later
      const remainingQuantity = Math.abs(currentPosition);
      currentTrade.quantity = remainingQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;

      console.log(`  [OPEN POSITION] Storing remaining quantity: ${remainingQuantity} (currentPosition: ${currentPosition}, totalEntry: ${currentTrade.totalQuantity})`);

      // Calculate entry commission for open positions (all fees are entry fees since no exit yet)
      let entryCommission = 0;
      currentTrade.executions.forEach(exec => {
        if ((currentTrade.side === 'long' && exec.action === 'buy') ||
            (currentTrade.side === 'short' && exec.action === 'sell')) {
          entryCommission += exec.fees || 0;
        }
      });
      currentTrade.entryCommission = entryCommission;
      currentTrade.exitCommission = 0;

      // For open positions, P&L should be null (not yet realized)
      // This prevents showing incorrect "loss" for open short positions
      currentTrade.pnl = null;
      currentTrade.pnlPercent = null;

      // Create descriptive notes for open positions
      if (currentTrade.side === 'short' && instrumentData.instrumentType === 'option') {
        // For short options, calculate and show the net proceeds received
        const netProceeds = currentTrade.entryValue - currentTrade.totalFees;
        currentTrade.notes = `Open SHORT option position: ${remainingQuantity} contracts remaining (sold ${currentTrade.totalQuantity} @ $${currentTrade.entryPrice.toFixed(2)}/share), net proceeds: $${netProceeds.toFixed(2)} (${currentTrade.totalFees < 0 ? 'includes rebate' : 'after commission'})`;
        console.log(`  [OPEN SHORT OPTION] Entry price: $${currentTrade.entryPrice.toFixed(2)}/share, Net proceeds: $${netProceeds.toFixed(2)}, Remaining: ${remainingQuantity} contracts`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      }

      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position with new executions
      if (currentTrade.isExistingPosition && currentTrade.newExecutionsAdded > 0) {
        currentTrade.isUpdate = true;

        // Create more descriptive notes for short option updates
        if (currentTrade.side === 'short' && instrumentData.instrumentType === 'option') {
          const netProceeds = currentTrade.entryValue - currentTrade.totalFees;
          currentTrade.notes = `Updated open SHORT option position: ${currentTrade.newExecutionsAdded} new executions added, net proceeds: $${netProceeds.toFixed(2)}`;
        } else {
          currentTrade.notes = `Updated open position: ${currentTrade.newExecutionsAdded} new executions added`;
        }

        console.log(`  [SUCCESS] UPDATED open ${currentTrade.side} position: ${currentTrade.totalQuantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}, ${currentTrade.newExecutionsAdded} new executions`);
      }

      completedTrades.push(currentTrade);
    }
  }

  console.log(`Created ${completedTrades.length} IBKR trades (including open positions) from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse Webull options CSV transactions with position tracking
 * Webull format: Name, Symbol, Side, Status, Filled, Total Qty, Price, Avg Price, Time-in-Force, Placed Time, Filled Time
 * Options symbol format: SPY251114C00672000 (underlying + YYMMDD + C/P + strike*1000)
 * @param {Array} records - CSV records to parse
 * @param {Object} existingPositions - Map of existing open positions by symbol
 * @param {Object} context - Context object containing existingExecutions
 * @returns {Array} - Array of completed and open trades
 */
async function parseWebullTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== WEBULL TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Webull transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample Webull records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // First, parse all transactions
  for (const record of records) {
    try {
      // Get symbol from Symbol column (full option symbol like SPY251114C00672000)
      const symbol = cleanString(record.Symbol || record.symbol);
      const side = cleanString(record.Side || record.side).toLowerCase();
      const status = cleanString(record.Status || record.status);
      const filled = parseInt(record.Filled || record.filled || 0);
      const price = parseFloat(record['Avg Price'] || record['avg price'] || record.Price || record.price || 0);
      const filledTime = record['Filled Time'] || record['filled time'] || '';

      // Only process filled orders
      if (status.toLowerCase() !== 'filled' || filled === 0) {
        console.log(`Skipping Webull record - not filled or zero quantity:`, { symbol, status, filled });
        continue;
      }

      // Skip if missing essential data
      if (!symbol || !side || price === 0 || !filledTime) {
        console.log(`Skipping Webull record missing data:`, { symbol, side, filled, price, filledTime });
        continue;
      }

      // Parse the filled time (format: "11/14/2025 11:31:56 EST")
      let tradeDate = null;
      let entryTime = null;
      if (filledTime) {
        // Remove timezone abbreviation and parse
        const cleanedTime = filledTime.replace(/\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT)$/, '').trim();
        tradeDate = parseDate(cleanedTime);
        entryTime = parseDateTime(cleanedTime);
      }

      if (!tradeDate || !entryTime) {
        console.log(`Skipping Webull record with invalid date: ${filledTime}`);
        continue;
      }

      // Validate date is reasonable (not in future, not too old)
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Allow 1 day in future for timezone issues
      const minPastDate = new Date('2000-01-01');

      if (entryTime > maxFutureDate) {
        console.log(`Skipping Webull record with future date: ${filledTime}`);
        continue;
      }

      if (entryTime < minPastDate) {
        console.log(`Skipping Webull record with date too far in past: ${filledTime}`);
        continue;
      }

      // Determine action from side
      const action = side === 'buy' ? 'buy' : 'sell';

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: action,
        quantity: filled,
        price: price,
        fees: 0, // Webull doesn't show fees separately in this format
        description: `Webull ${action}`,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed Webull transaction: ${action} ${filled} ${symbol} @ $${price.toFixed(2)}`);
    } catch (error) {
      console.error('Error parsing Webull transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Webull trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Log all available existing positions for debugging
  console.log(`\n[WEBULL] Available existing positions:`);
  if (Object.keys(existingPositions).length === 0) {
    console.log(`  → No existing positions found`);
  } else {
    Object.entries(existingPositions).forEach(([sym, pos]) => {
      console.log(`  → ${sym}: ${pos.side} ${pos.quantity} @ $${pos.entryPrice} (ID: ${pos.id})`);
    });
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} Webull transactions for ${symbol} ===`);

    // Parse instrument data from symbol (options format: SPY251114C00672000)
    const instrumentData = parseInstrumentData(symbol);

    console.log(`Instrument type: ${instrumentData.instrumentType}`);
    if (instrumentData.instrumentType === 'option') {
      console.log(`  Underlying: ${instrumentData.underlyingSymbol}`);
      console.log(`  Strike: $${instrumentData.strikePrice}`);
      console.log(`  Expiration: ${instrumentData.expirationDate}`);
      console.log(`  Type: ${instrumentData.optionType}`);
    }

    // For options, quantity is in contracts but prices are per-share
    // We need to apply a multiplier when calculating dollar values (entryValue/exitValue)
    const contractMultiplier = 1; // Quantity is already in contracts
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 :
                            instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    // Track position and round-trip trades
    // For options, try looking up by underlying symbol since that's what gets saved to database
    let existingPosition = existingPositions[symbol];
    if (!existingPosition && instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
      existingPosition = existingPositions[instrumentData.underlyingSymbol];
      if (existingPosition) {
        console.log(`  → Found existing position using underlying symbol: ${instrumentData.underlyingSymbol}`);
      }
    }

    if (!existingPosition) {
      console.log(`  → No existing position found for symbol: ${symbol}`);
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        console.log(`  → Also checked underlying symbol: ${instrumentData.underlyingSymbol}`);
      }
    }

    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'webull',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'} @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}, entryValue: $${currentTrade.entryValue.toFixed(2)}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'webull',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade (check for duplicates first)
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check if it exists in the current trade being built
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices (divide by valueMultiplier to get per-share/per-contract price)
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity * contractMultiplier;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        // Add instrument data for options/futures
        Object.assign(currentTrade, instrumentData);

        // For options, update symbol to use underlying symbol instead of the full option symbol
        if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
          currentTrade.symbol = instrumentData.underlyingSymbol;
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} closing executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} contracts, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        // Only add trade if it has executions (skip if all were duplicates)
        if (currentTrade.executions.length > 0) {
          currentTrade.executionData = currentTrade.executions;
          completedTrades.push(currentTrade);
        } else {
          console.log(`  [SKIP] Trade has no executions (all were duplicates), not creating trade`);
        }
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} ${instrumentData.instrumentType === 'option' ? 'contracts' : 'shares'}, ${currentTrade.executions.length} executions`);

      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
      currentTrade.exitPrice = null;
      currentTrade.quantity = currentTrade.totalQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.exitTime = null;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;
      currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      currentTrade.executionData = currentTrade.executions;

      // Add instrument data for options/futures
      Object.assign(currentTrade, instrumentData);

      // For options, update symbol to use underlying symbol instead of the full option symbol
      if (instrumentData.instrumentType === 'option' && instrumentData.underlyingSymbol) {
        currentTrade.symbol = instrumentData.underlyingSymbol;
      }

      // Mark as update if this was an existing position
      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
        console.log(`  → Updated existing position with ${currentTrade.newExecutionsAdded} new executions`);
      } else {
        console.log(`  → Creating new open position`);
      }

      // Only add if it has executions (skip if all were duplicates)
      if (currentTrade.executions.length > 0) {
        completedTrades.push(currentTrade);
      } else {
        console.log(`  [SKIP] Open position has no executions (all were duplicates), not creating trade`);
      }
    }
  }

  console.log(`\nCreated ${completedTrades.length} Webull trades (including open positions) from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse generic CSV transactions with position tracking
 * This function properly matches opening and closing trades across imports
 * @param {Array} records - CSV records to parse
 * @param {Object} existingPositions - Map of existing open positions by symbol
 * @returns {Array} - Array of completed and open trades
 */
async function parseGenericTransactions(records, existingPositions = {}, customMapping = null, context = {}) {
  console.log(`Processing ${records.length} generic CSV records with position tracking`);
  if (customMapping) {
    console.log(`[CUSTOM MAPPING] Using custom mapping in position tracking mode: ${customMapping.mapping_name}`);
  }

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {}; // Track last trade end time for each symbol

  // First, parse all records into transactions
  for (const record of records) {
    try {
      // Use custom mapping parser if provided, otherwise use generic parser
      let parser;
      if (customMapping) {
        const mapping = customMapping;
        parser = (row) => {
          // Parse quantity preserving sign (don't use parseInteger as it returns absolute value)
          const rawQuantityStr = (row[mapping.quantity_column] || '0').toString().trim().replace(/[,]/g, '');
          const rawQuantity = parseInt(rawQuantityStr) || 0;
          const rawPrice = parseNumeric(row[mapping.entry_price_column]);

          // Infer side from quantity sign if no side column specified
          // Positive quantity = buy, Negative quantity = sell
          let side;
          if (mapping.side_column && row[mapping.side_column]) {
            side = parseSide(row[mapping.side_column]);
          } else {
            // Infer from quantity sign: negative quantity = sell, positive = buy
            side = rawQuantity < 0 ? 'short' : 'long';
          }

          return {
            symbol: row[mapping.symbol_column] || '',
            tradeDate: mapping.entry_date_column ? parseDate(row[mapping.entry_date_column]) : new Date(),
            entryTime: mapping.entry_date_column ? parseDateTime(row[mapping.entry_date_column]) : new Date(),
            entryPrice: Math.abs(rawPrice), // Use absolute value for price
            quantity: Math.abs(rawQuantity), // Use absolute value for quantity
            side: side,
            commission: mapping.fees_column ? Math.abs(parseNumeric(row[mapping.fees_column])) : 0,
            fees: mapping.fees_column ? Math.abs(parseNumeric(row[mapping.fees_column])) : 0,
            broker: 'custom'
          };
        };
      } else {
        parser = brokerParsers.generic;
      }

      const trade = parser(record);

      if (!isValidTrade(trade)) {
        continue;
      }

      // Determine transaction type based on the parsed side
      // The generic parser returns 'long' or 'short' as the side
      // We need to convert this to buy/sell transactions
      let transactionSide;

      // If custom mapping was used with a side column, check that first
      if (customMapping && customMapping.side_column && record[customMapping.side_column]) {
        const sideValue = record[customMapping.side_column].toString().toLowerCase();
        if (sideValue.includes('buy') || sideValue.includes('purchase') || sideValue.includes('bot') || sideValue.includes('long')) {
          transactionSide = 'buy';
        } else if (sideValue.includes('sell') || sideValue.includes('sold') || sideValue.includes('sld') || sideValue.includes('short')) {
          transactionSide = 'sell';
        } else {
          // Fallback based on parsed side
          transactionSide = trade.side === 'short' ? 'sell' : 'buy';
        }
      } else {
        // Check if there's an explicit action/type field in the CSV
        const action = (record.Action || record.Type || record.Side || '').toLowerCase();

        if (action.includes('buy') || action.includes('purchase') || action.includes('bot')) {
          transactionSide = 'buy';
        } else if (action.includes('sell') || action.includes('sold') || action.includes('sld')) {
          transactionSide = 'sell';
        } else {
          // Fallback: use the parsed side from generic parser
          // If side is 'long', assume it's a buy; if 'short', assume it's a sell
          transactionSide = trade.side === 'short' ? 'sell' : 'buy';
        }
      }

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol: trade.symbol.toUpperCase(),
        datetime: trade.entryTime,
        tradeDate: trade.tradeDate,
        side: transactionSide,
        quantity: Math.abs(trade.quantity),
        price: trade.entryPrice,
        commission: trade.commission || 0,
        fees: trade.fees || 0,
        broker: trade.broker || 'generic',
        originalRecord: record,
        accountIdentifier
      });
    } catch (error) {
      console.error('Error parsing generic transaction:', error, record);
    }
  }

  // Sort transactions by datetime
  transactions.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  console.log(`Parsed ${transactions.length} valid transactions from ${records.length} records`);

  // Group transactions by symbol
  const symbolGroups = {};
  for (const transaction of transactions) {
    if (!symbolGroups[transaction.symbol]) {
      symbolGroups[transaction.symbol] = [];
    }
    symbolGroups[transaction.symbol].push(transaction);
  }

  console.log(`Processing ${Object.keys(symbolGroups).length} symbols`);

  // Process each symbol's transactions
  for (const [symbol, symbolTransactions] of Object.entries(symbolGroups)) {
    console.log(`\nProcessing ${symbol}: ${symbolTransactions.length} transactions`);

    // Initialize position tracking
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;

    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: Array.isArray(existingPosition.executions)
        ? existingPosition.executions
        : (existingPosition.executions ? JSON.parse(existingPosition.executions) : []),
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
      exitValue: 0,
      broker: existingPosition.broker || 'generic',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} shares @ $${existingPosition.entryPrice}`);
      console.log(`  → Initial position: ${currentPosition}`);
    }

    // Process each transaction chronologically
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n  ${transaction.side.toUpperCase()} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.tradeDate,
          side: transaction.side === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: transaction.broker,
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  → Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade
      if (currentTrade) {
        const newExecution = {
          action: transaction.side,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.commission + transaction.fees
        };

        // First, check if this execution exists in ANY existing trade (complete or open)
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);

        // Then check for duplicate executions in current trade
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (existsGlobally) {
          console.log(`  [SKIP] Execution already exists in a completed or open trade: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        }

        currentTrade.totalFees += transaction.commission + transaction.fees;
      }

      // Process the transaction and update position
      if (transaction.side === 'buy') {
        currentPosition += qty;

        if (currentTrade) {
          if (currentTrade.side === 'long') {
            // Adding to long position
            currentTrade.entryValue += qty * transaction.price;
            currentTrade.totalQuantity += qty;
          } else if (currentTrade.side === 'short') {
            // Covering short position
            currentTrade.exitValue += qty * transaction.price;
          }
        }
      } else if (transaction.side === 'sell') {
        currentPosition -= qty;

        if (currentTrade) {
          if (currentTrade.side === 'short') {
            // Adding to short position
            currentTrade.entryValue += qty * transaction.price;
            currentTrade.totalQuantity += qty;
          } else if (currentTrade.side === 'long') {
            // Selling long position
            currentTrade.exitValue += qty * transaction.price;
          }
        }
      }

      console.log(`  Position: ${prevPosition} → ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate final values
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;

        // Calculate P&L
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;

        // Set proper entry and exit times
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        // Mark as update if this was an existing position
        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed position via generic import: ${currentTrade.executions.length} executions`;
          console.log(`  [CHECK] CLOSED existing ${currentTrade.side} position: P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip trade: ${currentTrade.executions.length} executions`;
          console.log(`  [CHECK] Completed ${currentTrade.side} trade: P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        currentTrade.executionData = currentTrade.executions;
        completedTrades.push(currentTrade);

        // Record the end time for time-gap-based grouping
        lastTradeEndTime[symbol] = transaction.datetime;

        currentTrade = null;
      }
    }

    // Handle remaining open position
    if (currentTrade && Math.abs(currentPosition) > 0) {
      const netQuantity = Math.abs(currentPosition);

      // For open positions
      currentTrade.entryPrice = currentTrade.totalQuantity > 0 ?
        currentTrade.entryValue / currentTrade.totalQuantity : 0;
      currentTrade.exitPrice = null;
      currentTrade.exitTime = null;
      currentTrade.quantity = netQuantity;
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;

      // Update side based on final position
      currentTrade.side = currentPosition > 0 ? 'long' : 'short';

      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated position via generic import: ${currentTrade.executions.length} executions`;
        console.log(`  [CHECK] UPDATED ${currentTrade.side} position: ${netQuantity} shares`);
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        console.log(`  [CHECK] Created open ${currentTrade.side} position: ${netQuantity} shares`);
      }

      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  return completedTrades;
}

/**
 * Parse Tradovate futures transactions
 * Tradovate exports orders with columns: orderId, B/S, Contract, Product, avgPrice, filledQty, Fill Time, Status, Text
 * This parser matches entry orders with exit orders to create complete trades
 */
async function parseTradovateTransactions(records, existingPositions = {}, context = {}) {
  console.log(`Processing ${records.length} Tradovate order records`);

  const transactions = [];
  const completedTrades = [];
  const lastTradeEndTime = {};

  // Debug: Log first few records to see structure
  console.log('Sample Tradovate records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // First, parse all filled orders
  for (const record of records) {
    try {
      // Handle column names with potential leading spaces
      const status = (record.Status || record.status || '').trim();

      // Only process filled orders
      if (status !== 'Filled') {
        continue;
      }

      const contract = cleanString(record.Contract || record.contract);
      const product = cleanString(record.Product || record.product);
      const productDesc = record['Product Description'] || record.productDescription || '';
      const side = (record['B/S'] || record.bs || '').trim().toLowerCase();
      const quantity = Math.abs(parseInteger(record.filledQty || record['Filled Qty'] || record.Quantity));
      const fillPrice = parseNumeric(record.avgPrice || record['Avg Fill Price'] || record.decimalFillAvg);
      const fillTime = record['Fill Time'] || record.Timestamp || '';
      const orderId = record.orderId || record['Order ID'] || '';
      const orderText = (record.Text || '').trim();

      // Skip if missing essential data
      if (!contract || !side || quantity === 0 || fillPrice === 0 || !fillTime) {
        console.log(`Skipping Tradovate record missing data:`, { contract, side, quantity, fillPrice, fillTime });
        continue;
      }

      // Parse the datetime (format: "11/25/2025 04:38:24")
      const tradeDate = parseDate(fillTime);
      const entryTime = parseDateTime(fillTime);

      if (!tradeDate || !entryTime) {
        console.log(`Skipping Tradovate record with invalid date: ${fillTime}`);
        continue;
      }

      // Determine if this is an entry or exit order
      const isExit = orderText.toLowerCase().includes('exit');

      // Determine account identifier - user selection takes priority over CSV column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      transactions.push({
        symbol: contract,        // Full contract symbol (e.g., MESZ5)
        product: product,        // Base product (e.g., MES)
        productDesc: productDesc,
        date: tradeDate,
        datetime: entryTime,
        action: side === 'buy' ? 'buy' : 'sell',
        quantity,
        price: fillPrice,
        fees: 0, // Tradovate doesn't include fees in this export
        orderId,
        isExit,
        orderText,
        raw: record,
        accountIdentifier
      });

      console.log(`Parsed Tradovate transaction: ${side} ${quantity} ${contract} @ $${fillPrice} (${isExit ? 'EXIT' : 'ENTRY'})`);
    } catch (error) {
      console.error('Error parsing Tradovate transaction:', error, record);
    }
  }

  // Sort transactions by symbol, datetime, and orderId
  // IMPORTANT: orderId is used as tiebreaker for same-timestamp transactions
  // This ensures correct trade pairing when exit and new entry happen at same timestamp
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    const timeDiff = new Date(a.datetime) - new Date(b.datetime);
    if (timeDiff !== 0) return timeDiff;
    // Use orderId as tiebreaker - lower orderId means earlier execution
    const orderIdA = parseInt(a.orderId) || 0;
    const orderIdB = parseInt(b.orderId) || 0;
    return orderIdA - orderIdB;
  });

  console.log(`Parsed ${transactions.length} valid Tradovate filled orders`);

  // Group transactions by symbol (full contract symbol)
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    if (!transactionsBySymbol[transaction.symbol]) {
      transactionsBySymbol[transaction.symbol] = [];
    }
    transactionsBySymbol[transaction.symbol].push(transaction);
  }

  // Process transactions using round-trip trade grouping
  for (const symbol in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbol];

    console.log(`\n=== Processing ${symbolTransactions.length} Tradovate transactions for ${symbol} ===`);

    // Get the base product for point value lookup
    const baseProduct = symbolTransactions[0]?.product || symbol.replace(/[A-Z]?\d+$/, '');
    const pointValue = getFuturesPointValue(baseProduct);

    // For futures, the value multiplier is the point value
    const valueMultiplier = pointValue;

    console.log(`  Product: ${baseProduct}, Point Value: $${pointValue}`);

    const instrumentData = {
      instrumentType: 'future',
      underlyingAsset: baseProduct,
      contractSize: null,
      pointValue: pointValue,
      optionType: null,
      strikePrice: null,
      expirationDate: null,
      contractMonth: null,
      contractYear: null,
      tickSize: null
    };

    // Parse contract month/year from symbol (e.g., MESZ5 -> Z = December, 5 = 2025)
    const contractMatch = symbol.match(/^([A-Z]+)([FGHJKMNQUVXZ])(\d{1,2})$/);
    if (contractMatch) {
      const [, , monthCode, yearDigit] = contractMatch;
      const monthCodes = { F: '01', G: '02', H: '03', J: '04', K: '05', M: '06', N: '07', Q: '08', U: '09', V: '10', X: '11', Z: '12' };
      instrumentData.contractMonth = monthCodes[monthCode];

      // Handle year - single digit means current decade
      let year = parseInt(yearDigit);
      if (year < 10) {
        const currentYear = new Date().getFullYear();
        const currentDecade = Math.floor(currentYear / 10) * 10;
        year = currentDecade + year;
      } else if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      instrumentData.contractYear = year;
    }

    // Track position and round-trip trades
    const existingPosition = existingPositions[symbol];
    let currentPosition = existingPosition ?
      (existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity) : 0;
    let currentTrade = existingPosition ? {
      symbol: symbol,
      entryTime: existingPosition.entryTime,
      tradeDate: existingPosition.tradeDate,
      side: existingPosition.side,
      executions: existingPosition.executions || [],
      totalQuantity: existingPosition.quantity,
      totalFees: existingPosition.commission || 0,
      entryValue: existingPosition.quantity * existingPosition.entryPrice * valueMultiplier,
      exitValue: 0,
      broker: existingPosition.broker || 'tradovate',
      isExistingPosition: true,
      existingTradeId: existingPosition.id,
      newExecutionsAdded: 0
    } : null;

    if (existingPosition) {
      console.log(`  Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} contracts @ $${existingPosition.entryPrice}`);
    }

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      // Start new trade if going from flat to position
      if (currentPosition === 0) {
        currentTrade = {
          symbol: symbol,
          entryTime: transaction.datetime,
          tradeDate: transaction.date,
          side: transaction.action === 'buy' ? 'long' : 'short',
          executions: [],
          totalQuantity: 0,
          totalFees: 0,
          entryValue: 0,
          exitValue: 0,
          broker: 'tradovate',
          accountIdentifier: transaction.accountIdentifier
        };
        console.log(`  Started new ${currentTrade.side} trade`);
      }

      // Add execution to current trade
      if (currentTrade) {
        const newExecution = {
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees,
          orderId: transaction.orderId
        };

        // Check for duplicate executions
        // For fresh imports, we trust each CSV row is a unique execution
        // Only deduplicate if we have unique identifiers
        const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);
        const executionExists = existsGlobally || currentTrade.executions.some(exec => {
          // If both have order IDs, use that for comparison
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Without unique identifiers, don't deduplicate within the current import
          return false;
        });

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
          // Skip position and value updates for duplicate transactions
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          continue;
        }
      }

      // Update position and values (only for non-duplicate transactions)
      if (transaction.action === 'buy') {
        currentPosition += qty;

        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= qty;

        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.price * valueMultiplier;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price * valueMultiplier;
        }
      }

      console.log(`  Position: ${prevPosition} -> ${currentPosition}`);

      // Close trade if position goes to zero
      if (currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0) {
        // Calculate weighted average prices (divide by multiplier to get per-contract price)
        currentTrade.entryPrice = currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier);
        currentTrade.exitPrice = currentTrade.exitValue / (currentTrade.totalQuantity * valueMultiplier);

        // Calculate P/L (values already include multiplier)
        if (currentTrade.side === 'long') {
          currentTrade.pnl = currentTrade.exitValue - currentTrade.entryValue - currentTrade.totalFees;
        } else {
          currentTrade.pnl = currentTrade.entryValue - currentTrade.exitValue - currentTrade.totalFees;
        }

        currentTrade.pnlPercent = (currentTrade.pnl / currentTrade.entryValue) * 100;
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;

        // Calculate split commissions
        let entryCommission = 0;
        let exitCommission = 0;
        currentTrade.executions.forEach(exec => {
          if ((currentTrade.side === 'long' && exec.action === 'buy') ||
              (currentTrade.side === 'short' && exec.action === 'sell')) {
            entryCommission += exec.fees;
          } else {
            exitCommission += exec.fees;
          }
        });
        currentTrade.entryCommission = entryCommission;
        currentTrade.exitCommission = exitCommission;
        currentTrade.fees = 0;

        // Calculate proper entry and exit times
        const executionTimes = currentTrade.executions
          .filter(e => e.datetime)
          .map(e => new Date(e.datetime))
          .filter(d => !isNaN(d.getTime()));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        if (sortedTimes.length > 0) {
          currentTrade.entryTime = sortedTimes[0].toISOString();
          currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        }

        currentTrade.executionData = currentTrade.executions;
        Object.assign(currentTrade, instrumentData);

        if (currentTrade.isExistingPosition) {
          currentTrade.isUpdate = currentTrade.newExecutionsAdded > 0;
          currentTrade.notes = `Closed existing position: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] CLOSED existing ${currentTrade.side} position: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        } else {
          currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
          console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} contracts, P/L: $${currentTrade.pnl.toFixed(2)}`);
        }

        completedTrades.push(currentTrade);
        lastTradeEndTime[symbol] = transaction.datetime;
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} contracts`);

    // Handle remaining open position
    if (currentTrade && Math.abs(currentPosition) > 0) {
      const netQuantity = Math.abs(currentPosition);

      currentTrade.entryPrice = currentTrade.totalQuantity > 0 ?
        currentTrade.entryValue / (currentTrade.totalQuantity * valueMultiplier) : 0;
      currentTrade.exitPrice = null;
      currentTrade.exitTime = null;
      currentTrade.quantity = netQuantity;
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;
      currentTrade.fees = 0;
      currentTrade.pnl = 0;
      currentTrade.pnlPercent = 0;

      currentTrade.side = currentPosition > 0 ? 'long' : 'short';

      if (currentTrade.isExistingPosition) {
        currentTrade.isUpdate = true;
        currentTrade.notes = `Updated position: ${currentTrade.executions.length} executions`;
      } else {
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
      }

      currentTrade.executionData = currentTrade.executions;
      Object.assign(currentTrade, instrumentData);

      console.log(`  [CHECK] Open ${currentTrade.side} position: ${netQuantity} contracts`);
      completedTrades.push(currentTrade);
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Tradovate transactions`);
  return completedTrades;
}

/**
 * Parse Questrade Edge CSV export
 *
 * Questrade CSV format:
 * - Headers: Symbol, Action, Fill qty, Fill price, Currency, Exec time, Total value, Time placed, Option, Strategy, Commission, Account
 * - Date format: "16 Dec 2025 11:15:58 AM"
 * - Actions: Buy, Sell (stocks), BTO (Buy to Open), STC (Sell to Close), BTC (Buy to Close), STO (Sell to Open) for options
 * - Options symbols: SLV20Feb26C55.00 (underlying + day + month + year + C/P + strike)
 * - Option column: "Call" or "Put" or empty for stocks
 */
async function parseQuestradeTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== QUESTRADE TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Questrade transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('\nSample Questrade records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Helper to parse Questrade date format: "16 Dec 2025 11:15:58 AM"
  function parseQuestradeDate(dateStr) {
    if (!dateStr) return null;

    // Parse format: "16 Dec 2025 11:15:58 AM"
    const months = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const match = dateStr.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) {
      console.log(`[QUESTRADE] Failed to parse date: ${dateStr}`);
      return null;
    }

    const [, day, monthStr, year, hours, minutes, seconds, ampm] = match;
    const month = months[monthStr.toLowerCase()];

    if (month === undefined) {
      console.log(`[QUESTRADE] Unknown month: ${monthStr}`);
      return null;
    }

    let hour = parseInt(hours);
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }

    return new Date(parseInt(year), month, parseInt(day), hour, parseInt(minutes), parseInt(seconds));
  }

  // Helper to parse Questrade options symbol format: SLV20Feb26C55.00
  function parseQuestradeOptionsSymbol(symbol, optionColumn) {
    if (!symbol) return { instrumentType: 'stock' };

    // Check if Option column indicates this is an option
    const isOption = optionColumn && (optionColumn.toLowerCase() === 'call' || optionColumn.toLowerCase() === 'put');

    // Try to parse options symbol format: SLV20Feb26C55.00 or SLV20Feb26P55.00
    // Format: UNDERLYING + DAY + MONTH + YEAR + C/P + STRIKE
    const optionMatch = symbol.match(/^([A-Z]+)(\d{1,2})([A-Za-z]{3})(\d{2})([CP])(\d+(?:\.\d+)?)$/i);

    if (optionMatch || isOption) {
      if (optionMatch) {
        const [, underlying, day, monthStr, year, callPut, strike] = optionMatch;

        const months = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
          'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };

        const month = months[monthStr.toLowerCase()];
        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
        const expirationDate = `${fullYear}-${month}-${day.padStart(2, '0')}`;
        const optionType = callPut.toUpperCase() === 'C' ? 'call' : 'put';

        return {
          instrumentType: 'option',
          underlyingSymbol: underlying,
          strikePrice: parseFloat(strike),
          expirationDate: expirationDate,
          optionType: optionType,
          contractSize: 100
        };
      } else if (isOption) {
        // Option column is set but symbol format doesn't match - use fallback
        // Try to extract underlying from symbol (remove any suffix)
        const underlying = symbol.replace(/\.[A-Z]+$/, ''); // Remove exchange suffix like .TO
        return {
          instrumentType: 'option',
          underlyingSymbol: underlying,
          optionType: optionColumn.toLowerCase(),
          contractSize: 100
        };
      }
    }

    // Stock - might have exchange suffix like .TO for Toronto
    return {
      instrumentType: 'stock',
      underlyingSymbol: symbol.replace(/\.[A-Z]+$/, '') // Remove exchange suffix for display
    };
  }

  // First, parse all transactions
  for (const record of records) {
    try {
      // Get fields from Questrade columns
      const symbol = cleanString(record.Symbol || record.symbol);
      const action = cleanString(record.Action || record.action).toUpperCase();
      const fillQty = parseInteger(record['Fill qty'] || record['fill qty'] || record.Filled || 0);
      const fillPrice = parseNumeric(record['Fill price'] || record['fill price'] || record.Price || 0);
      const currency = cleanString(record.Currency || record.currency || 'USD');
      const execTime = record['Exec time'] || record['exec time'] || '';
      const optionColumn = cleanString(record.Option || record.option || '');
      const commission = parseNumeric(record.Commission || record.commission || 0);
      const accountRaw = cleanString(record.Account || record.account || '');

      // Skip if missing essential data
      if (!symbol || fillQty === 0 || fillPrice === 0 || !execTime) {
        console.log(`Skipping Questrade record missing data:`, { symbol, action, fillQty, fillPrice, execTime });
        continue;
      }

      // Parse execution time
      const execDateTime = parseQuestradeDate(execTime);
      if (!execDateTime) {
        console.log(`Skipping Questrade record with invalid date: ${execTime}`);
        continue;
      }

      // Validate date is reasonable
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const minPastDate = new Date('2000-01-01');

      if (execDateTime > maxFutureDate || execDateTime < minPastDate) {
        console.log(`Skipping Questrade record with invalid date range: ${execTime}`);
        continue;
      }

      // Determine trade action from Questrade action codes
      // Stock: Buy, Sell
      // Options: BTO (Buy to Open), STC (Sell to Close), BTC (Buy to Close), STO (Sell to Open)
      let tradeAction;
      switch (action) {
        case 'BUY':
        case 'BTO': // Buy to Open (long options entry)
        case 'BTC': // Buy to Close (short options exit)
          tradeAction = 'buy';
          break;
        case 'SELL':
        case 'STC': // Sell to Close (long options exit)
        case 'STO': // Sell to Open (short options entry)
          tradeAction = 'sell';
          break;
        default:
          console.log(`Skipping Questrade record with unknown action: ${action}`);
          continue;
      }

      // Extract account identifier - user selection takes priority, otherwise extract from account column
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (accountRaw ? accountRaw.split(' - ')[0].trim() : null);

      // Parse instrument data
      const instrumentData = parseQuestradeOptionsSymbol(symbol, optionColumn);

      // Use underlying symbol for grouping if it's an option
      const groupingSymbol = instrumentData.instrumentType === 'option'
        ? (instrumentData.underlyingSymbol || symbol)
        : symbol;

      transactions.push({
        symbol: groupingSymbol,
        fullSymbol: symbol, // Keep original for options
        date: execDateTime.toISOString().split('T')[0],
        datetime: execDateTime,
        action: tradeAction,
        quantity: fillQty,
        price: fillPrice,
        commission: Math.abs(commission), // Ensure positive
        currency: currency.toUpperCase(),
        description: `Questrade ${action}`,
        raw: record,
        accountIdentifier,
        instrumentData
      });

      console.log(`Parsed Questrade transaction: ${action} ${fillQty} ${symbol} @ $${fillPrice.toFixed(2)} (${currency})`);
    } catch (error) {
      console.error('Error parsing Questrade transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Questrade trade transactions`);

  // Group transactions by symbol
  const transactionsBySymbol = {};
  for (const transaction of transactions) {
    const key = transaction.instrumentData.instrumentType === 'option'
      ? `${transaction.symbol}_${transaction.instrumentData.strikePrice}_${transaction.instrumentData.expirationDate}_${transaction.instrumentData.optionType}`
      : transaction.symbol;

    if (!transactionsBySymbol[key]) {
      transactionsBySymbol[key] = [];
    }
    transactionsBySymbol[key].push(transaction);
  }

  // Process transactions using round-trip trade grouping (FIFO)
  for (const symbolKey in transactionsBySymbol) {
    const symbolTransactions = transactionsBySymbol[symbolKey];
    const firstTx = symbolTransactions[0];
    const instrumentData = firstTx.instrumentData;

    console.log(`\n=== Processing ${symbolTransactions.length} Questrade transactions for ${symbolKey} ===`);
    console.log(`Instrument type: ${instrumentData.instrumentType}`);

    // Value multiplier for options
    const valueMultiplier = instrumentData.instrumentType === 'option' ? 100 : 1;

    // Track position using FIFO
    let currentPosition = 0;
    let currentTrade = null;

    // Check for existing position
    const existingPosition = existingPositions[firstTx.symbol] || existingPositions[symbolKey];
    if (existingPosition) {
      currentPosition = existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity;
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} @ $${existingPosition.entryPrice}`);

      // Initialize currentTrade from the existing position so we don't create duplicate trades
      currentTrade = {
        id: existingPosition.id, // Mark that this is an existing trade to update, not create
        symbol: existingPosition.symbol,
        tradeDate: existingPosition.tradeDate,
        entryTime: existingPosition.entryTime,
        entryPrice: existingPosition.entryPrice,
        quantity: existingPosition.quantity,
        side: existingPosition.side,
        commission: existingPosition.commission || 0,
        fees: 0,
        broker: existingPosition.broker || 'Questrade',
        currency: firstTx.currency,
        accountIdentifier: firstTx.accountIdentifier,
        executions: existingPosition.executions || [],
        instrumentType: existingPosition.instrumentType,
        strikePrice: existingPosition.strikePrice,
        expirationDate: existingPosition.expirationDate,
        optionType: existingPosition.optionType,
        ...instrumentData
      };
      console.log(`  → Initialized trade from existing position with ${currentTrade.executions.length} executions`);
    }

    // Debug: Log existing executions for this symbol
    console.log(`  → Existing executions for ${symbolKey}: ${context.existingExecutions?.[symbolKey]?.length || 0}`);
    if (context.existingExecutions?.[symbolKey]?.length > 0) {
      context.existingExecutions[symbolKey].forEach((exec, i) => {
        console.log(`    [${i}] ${exec.action || 'unknown'} ${exec.quantity} @ $${exec.price || exec.entryPrice} at ${exec.datetime || exec.entryTime}`);
      });
    }

    for (const transaction of symbolTransactions) {
      // Check for duplicate execution before processing
      const executionToCheck = {
        datetime: transaction.datetime,
        quantity: transaction.quantity,
        price: transaction.price,
        action: transaction.action
      };
      const isDuplicate = isExecutionDuplicate(executionToCheck, symbolKey, context);
      console.log(`  [DUPLICATE CHECK] ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} at ${transaction.datetime} → ${isDuplicate ? 'DUPLICATE' : 'NEW'}`);
      if (isDuplicate) {
        console.log(`  [SKIP] Duplicate execution: ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)}`);
        continue; // Skip this transaction entirely
      }

      const signedQty = transaction.action === 'buy' ? transaction.quantity : -transaction.quantity;
      const prevPosition = currentPosition;
      currentPosition += signedQty;

      console.log(`  ${transaction.action.toUpperCase()} ${transaction.quantity} @ $${transaction.price.toFixed(2)} → Position: ${prevPosition} → ${currentPosition}`);

      // Opening or adding to position
      if ((prevPosition >= 0 && signedQty > 0) || (prevPosition <= 0 && signedQty < 0)) {
        if (!currentTrade || (prevPosition === 0)) {
          // Start new trade
          const side = signedQty > 0 ? 'long' : 'short';
          currentTrade = {
            symbol: transaction.symbol,
            tradeDate: transaction.date,
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: side,
            commission: transaction.commission,
            fees: 0,
            broker: 'Questrade',
            currency: transaction.currency,
            accountIdentifier: transaction.accountIdentifier,
            executions: [{
              entryTime: transaction.datetime,
              entryPrice: transaction.price,
              quantity: Math.abs(signedQty),
              side: side,
              commission: transaction.commission,
              fees: 0
            }],
            ...instrumentData
          };
          console.log(`  [NEW] Started ${side} position: ${Math.abs(signedQty)} @ $${transaction.price.toFixed(2)}`);
        } else {
          // Adding to existing position - calculate weighted average entry
          const prevValue = currentTrade.entryPrice * currentTrade.quantity;
          const newValue = transaction.price * Math.abs(signedQty);
          const totalQty = currentTrade.quantity + Math.abs(signedQty);
          currentTrade.entryPrice = (prevValue + newValue) / totalQty;
          currentTrade.quantity = totalQty;
          currentTrade.commission += transaction.commission;
          currentTrade.executions.push({
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: currentTrade.side,
            commission: transaction.commission,
            fees: 0
          });
          console.log(`  [ADD] Added to position: now ${totalQty} @ avg $${currentTrade.entryPrice.toFixed(2)}`);
        }
      }
      // Closing position (fully or partially)
      else if ((prevPosition > 0 && signedQty < 0) || (prevPosition < 0 && signedQty > 0)) {
        if (currentTrade) {
          const closeQty = Math.min(Math.abs(signedQty), Math.abs(prevPosition));
          const remainingQty = Math.abs(prevPosition) - closeQty;
          const isPartialClose = remainingQty > 0;

          // Calculate P&L for the closed portion
          let pnl;
          if (currentTrade.side === 'long') {
            pnl = (transaction.price - currentTrade.entryPrice) * closeQty * valueMultiplier;
          } else {
            pnl = (currentTrade.entryPrice - transaction.price) * closeQty * valueMultiplier;
          }
          // Prorate commission for partial closes
          const closeCommission = isPartialClose
            ? (currentTrade.commission * closeQty / currentTrade.quantity) + transaction.commission
            : currentTrade.commission + transaction.commission;
          pnl -= closeCommission;

          // Handle partial close - keep as ONE trade with the sell recorded as an execution
          if (isPartialClose) {
            // Add the sell execution to the trade
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy', // Opposite action to close
              commission: transaction.commission,
              fees: 0,
              pnl: pnl
            });

            // Update trade to reflect remaining position
            currentTrade.quantity = remainingQty;
            currentTrade.commission += transaction.commission;
            // Track realized P&L from partial close (position still open)
            currentTrade.realizedPnl = (currentTrade.realizedPnl || 0) + pnl;

            console.log(`  [PARTIAL CLOSE] Sold ${closeQty} @ $${transaction.price.toFixed(2)}, realized P&L: $${pnl.toFixed(2)}, remaining: ${remainingQty} shares`);
          }
          // Handle full close (and possible reversal)
          else {
            // Add the closing execution
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: 0,
              pnl: pnl
            });

            currentTrade.exitTime = transaction.datetime;
            currentTrade.exitPrice = transaction.price;
            currentTrade.pnl = pnl;
            currentTrade.profitLoss = pnl;
            currentTrade.commission += transaction.commission;
            currentTrade.executionData = currentTrade.executions;

            console.log(`  [CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, P&L: $${pnl.toFixed(2)}`);
            completedTrades.push(currentTrade);

            // Handle reversal (closing more than position - start new position in opposite direction)
            if (Math.abs(signedQty) > Math.abs(prevPosition)) {
              const reversalQty = Math.abs(signedQty) - Math.abs(prevPosition);
              const newSide = signedQty > 0 ? 'long' : 'short';
              currentTrade = {
                symbol: transaction.symbol,
                tradeDate: transaction.date,
                entryTime: transaction.datetime,
                entryPrice: transaction.price,
                quantity: reversalQty,
                side: newSide,
                commission: 0,
                fees: 0,
                broker: 'Questrade',
                currency: transaction.currency,
                accountIdentifier: transaction.accountIdentifier,
                executions: [{
                  entryTime: transaction.datetime,
                  entryPrice: transaction.price,
                  quantity: reversalQty,
                  side: newSide,
                  commission: 0,
                  fees: 0
                }],
                ...instrumentData
              };
              console.log(`  [REVERSAL] Started new ${newSide} position: ${reversalQty} @ $${transaction.price.toFixed(2)}`);
            } else {
              currentTrade = null;
            }
          }
        }
      }
    }

    // Handle remaining open position
    if (currentTrade && currentPosition !== 0) {
      // Only update if not already set correctly (avoid double-counting)
      if (!currentTrade.exitTime) {
        currentTrade.quantity = Math.abs(currentPosition);
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        currentTrade.executionData = currentTrade.executions;
        // If this is from an existing position, mark it for update instead of create
        if (currentTrade.id) {
          currentTrade.isUpdate = true;
          currentTrade.existingTradeId = currentTrade.id;
        }
        console.log(`  [OPEN] Remaining open ${currentTrade.side} position: ${Math.abs(currentPosition)} @ $${currentTrade.entryPrice.toFixed(2)}${currentTrade.id ? ' (updating existing)' : ''}`);
        completedTrades.push(currentTrade);
      }
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Questrade transactions`);
  // Debug: Log all created trades
  completedTrades.forEach((trade, i) => {
    console.log(`  Trade ${i + 1}: ${trade.symbol} ${trade.side} ${trade.quantity} shares, entry $${trade.entryPrice?.toFixed(2)}, exit $${trade.exitPrice?.toFixed(2) || 'OPEN'}, P&L: $${trade.pnl?.toFixed(2) || 'N/A'}, executions: ${trade.executions?.length || 0}${trade.isUpdate ? ' (UPDATE)' : ''}`);
  });
  return completedTrades;
}

function isValidTrade(trade) {
  return trade.symbol &&
         trade.tradeDate &&
         trade.entryTime &&
         trade.entryPrice > 0 &&
         trade.quantity > 0;
}

module.exports = {
  parseCSV,
  detectBrokerFormat,
  brokerParsers,
  parseDate,
  parseDateTime,
  parseSide,
  cleanString,
  parseNumeric,
  parseInteger
};