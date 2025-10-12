const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const finnhub = require('./finnhub');
const cache = require('./cache');
const cusipQueue = require('./cusipQueue');
const currencyConverter = require('./currencyConverter');

// CUSIP resolution is now handled by the cusipQueue module

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
 * Detects the broker format based on CSV headers
 * @param {Buffer} fileBuffer - The CSV file buffer
 * @returns {string} - Detected broker format
 */
function detectBrokerFormat(fileBuffer) {
  try {
    const csvString = fileBuffer.toString('utf-8');
    const lines = csvString.split('\n');

    // Get the first non-empty line (should be headers)
    let headerLine = '';
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (lines[i].trim()) {
        headerLine = lines[i].trim();
        break;
      }
    }

    if (!headerLine) {
      return 'generic';
    }

    const headers = headerLine.toLowerCase();
    console.log(`[AUTO-DETECT] Analyzing headers: ${headerLine.substring(0, 200)}...`);

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

    // ThinkorSwim detection - look for DATE, TIME, TYPE, DESCRIPTION pattern
    if (headers.includes('date,time,type') && headers.includes('description') &&
        headers.includes('commissions & fees')) {
      console.log('[AUTO-DETECT] Detected: ThinkorSwim');
      return 'thinkorswim';
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

    // ProjectX detection - look for ContractName, EnteredAt, ExitedAt, PnL columns
    if (headers.includes('contractname') &&
        headers.includes('enteredat') &&
        headers.includes('exitedat') &&
        headers.includes('pnl') &&
        headers.includes('tradeduration')) {
      console.log('[AUTO-DETECT] Detected: ProjectX');
      return 'projectx';
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
    const commission = Math.abs(parseFloat(row.Commission || 0)); // Commission is negative in IBKR CSVs
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
    const commission = Math.abs(parseFloat(row.Commission || 0));

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

    // ProjectX uses "Fees" field for total commissions/fees
    // Commissions field is usually empty
    const totalCommission = commissions || fees || 0;

    return {
      symbol: contractName,
      tradeDate: tradeDate,
      entryTime: entryTime,
      exitTime: exitTime,
      entryPrice: entryPrice,
      exitPrice: exitPrice,
      quantity: quantity,
      side: side,
      commission: totalCommission,
      fees: 0, // Already included in commission
      profitLoss: pnl,
      broker: 'projectx',
      notes: `Trade #${tradeId} - Duration: ${tradeDuration}`
    };
  }
};

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
      
      // Find the actual header line (contains "DATE,TIME,TYPE")
      let headerIndex = -1;
      for (let i = 0; i < lines.length && i < 10; i++) {
        if (lines[i].includes('DATE,TIME,TYPE')) {
          headerIndex = i;
          break;
        }
      }
      
      if (headerIndex >= 0) {
        // Keep only the header line and data rows
        csvString = lines.slice(headerIndex).join('\n');
        console.log(`Skipped ${headerIndex} header rows in thinkorswim CSV`);
      }
      
      // Thinkorswim CSVs have quoted fields with commas inside
      parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ',',
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
    
    let records;
    try {
      records = parse(csvString, parseOptions);
    } catch (parseError) {
      console.error('CSV parsing error:', parseError.message);
      
      // If thinkorswim parsing fails, try alternative approach
      if (broker === 'thinkorswim') {
        console.log('Trying alternative parsing approach for thinkorswim');
        
        // Try with different options
        parseOptions = {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ',',
          relax: true, // Relax parsing rules
          relax_column_count: true,
          skip_records_with_error: true,
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

    if (broker === 'lightspeed') {
      console.log('Starting Lightspeed transaction parsing');
      const result = await parseLightspeedTransactions(records, existingPositions);
      console.log('Finished Lightspeed transaction parsing');
      return result;
    }

    if (broker === 'schwab') {
      console.log('Starting Schwab trade parsing');
      const result = await parseSchwabTrades(records, existingPositions);
      console.log('Finished Schwab trade parsing');
      return result;
    }

    if (broker === 'thinkorswim') {
      console.log('Starting thinkorswim transaction parsing');
      const result = await parseThinkorswimTransactions(records, existingPositions);
      console.log('Finished thinkorswim transaction parsing');
      return result;
    }

    if (broker === 'papermoney') {
      // console.log('Starting PaperMoney transaction parsing');
      const result = await parsePaperMoneyTransactions(records, existingPositions);
      console.log('Finished PaperMoney transaction parsing');
      return result;
    }

    if (broker === 'tradingview') {
      console.log('Starting TradingView transaction parsing');
      const result = await parseTradingViewTransactions(records, existingPositions);
      console.log('Finished TradingView transaction parsing');
      return result;
    }

    if (broker === 'ibkr' || broker === 'ibkr_trade_confirmation') {
      console.log(`Starting IBKR transaction parsing (${broker} format)`);
      const result = await parseIBKRTransactions(records, existingPositions);
      console.log('Finished IBKR transaction parsing');
      return result;
    }

    // Generic parser
    const parser = brokerParsers[broker] || brokerParsers.generic;
    const trades = [];

    for (const record of records) {
      try {
        let trade = parser(record);
        if (isValidTrade(trade)) {
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

          trades.push(trade);
        }
      } catch (error) {
        console.error('Error parsing row:', error, record);
      }
    }

    return trades;
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === '') return null;

  const cleanDateStr = dateStr.toString().trim();

  // Try to parse IBKR format MM-DD-YY first
  const mmddyyMatch = cleanDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})/);
  if (mmddyyMatch) {
    const [_, month, day, shortYear] = mmddyyMatch;
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    const yearNum = 2000 + parseInt(shortYear);

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
    
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
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

  const cleanDateTimeStr = dateTimeStr.toString().trim();

  try {
    // Check for IBKR format "MM-DD-YY H:MM" or "MM-DD-YY HH:MM"
    const ibkrDateTimeMatch = cleanDateTimeStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (ibkrDateTimeMatch) {
      const [, month, day, shortYear, hour, minute] = ibkrDateTimeMatch;
      const year = 2000 + parseInt(shortYear); // Convert YY to YYYY
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
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

    // Otherwise use Date parsing
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

  const normalizedSymbol = symbol.replace(/\s+/g, ' ').trim();

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
  const compactReadableOptionMatch = normalizedSymbol.match(/^([A-Z]+)(\d{1,2})([A-Z]{3})(\d{2})(\d+(?:\.\d+)?)(PUT|CALL)$/i);
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
  const ibkrOptionMatch = normalizedSymbol.match(/^([A-Z]+)\s+(\d{6})([CP])(\d{8})$/);
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
  const compactOptionMatch = normalizedSymbol.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
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
        if (year < 100) {
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

// Get point value for futures contracts
function getFuturesPointValue(underlying) {
  const pointValues = {
    'ES': 50,      // E-mini S&P 500
    'NQ': 20,      // E-mini NASDAQ-100
    'YM': 5,       // E-mini Dow
    'RTY': 50,     // E-mini Russell 2000
    'CL': 1000,    // Crude Oil
    'GC': 100,     // Gold
    'SI': 5000,    // Silver
    'NG': 10000,   // Natural Gas
    'ZB': 1000,    // 30-Year Treasury Bond
    'ZN': 1000,    // 10-Year Treasury Note
    'QG': 2500     // Mini Natural Gas
  };

  return pointValues[underlying] || 50; // Default to $50 multiplier
}

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



async function parseLightspeedTransactions(records, existingPositions = {}) {
  console.log(`Processing ${records.length} Lightspeed records`);
  
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
  
  // Only check cache during import, schedule background CUSIP resolution
  let cusipToTickerMap = {};
  const unresolvedCusips = [];
  
  if (cusipsToResolve.size > 0) {
    console.log(`Found ${cusipsToResolve.size} unique CUSIPs to resolve`);
    
    // Only check cache during import
    for (const cusip of cusipsToResolve) {
      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      try {
        const cached = await cache.get('cusip_resolution', cleanCusip);
        
        if (cached) {
          cusipToTickerMap[cleanCusip] = cached;
          console.log(`CUSIP ${cleanCusip} found in cache: ${cached}`);
        } else {
          unresolvedCusips.push(cleanCusip);
          console.log(`CUSIP ${cleanCusip} not in cache, will resolve in background`);
        }
      } catch (error) {
        console.warn(`Failed to check cache for CUSIP ${cleanCusip}:`, error.message);
        unresolvedCusips.push(cleanCusip);
      }
    }
    
    console.log(`Using cached results for ${Object.keys(cusipToTickerMap).length} of ${cusipsToResolve.size} CUSIPs. ${unresolvedCusips.length} will be queued for background processing.`);
    
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
        notes: `Trade #${record['Trade Number']} - ${record['Security Type'] || ''}`
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
      entryValue: existingPosition.quantity * existingPosition.entryPrice,
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
          broker: 'lightspeed'
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
        
        // Use Trade Number for duplicate check - it's unique per execution in Lightspeed
        const executionExists = currentTrade.executions.some(exec => {
          // If both have trade numbers, use that for comparison (most reliable)
          if (exec.tradeNumber && newExecution.tradeNumber) {
            return exec.tradeNumber === newExecution.tradeNumber;
          }
          // Fallback to timestamp comparison for older data without trade numbers
          const existingTime = new Date(exec.datetime).toISOString();
          const newTime = new Date(newExecution.datetime).toISOString();
          return existingTime === newTime;
        });
        
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
          currentTrade.entryValue += qty * transaction.entryPrice;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.entryPrice;
          // Don't add to totalQuantity for covering short position
        }
        
      } else if (transaction.side === 'sell') {
        currentPosition -= qty;
        
        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.entryPrice;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.entryPrice;
          // Don't modify totalQuantity when selling from long position
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
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;
        // FIXED: Calculate proper entry and exit times from all executions
        const executionTimes = currentTrade.executions.map(e => new Date(e.datetime));
        const sortedTimes = executionTimes.sort((a, b) => a - b);
        currentTrade.entryTime = sortedTimes[0].toISOString();
        currentTrade.exitTime = sortedTimes[sortedTimes.length - 1].toISOString();
        
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
        
        // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
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
      
      // Add open position as incomplete trade
      // For open positions, use the net position, not the accumulated totalQuantity
      const netQuantity = Math.abs(currentPosition);
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
      currentTrade.exitPrice = null;
      currentTrade.quantity = netQuantity; // Use actual net position
      
      // ALSO fix totalQuantity for display consistency
      currentTrade.totalQuantity = netQuantity;
      currentTrade.commission = currentTrade.totalFees;
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

async function parseSchwabTrades(records, existingPositions = {}) {
  console.log(`Processing ${records.length} Schwab trade records`);
  
  // Check if this is the new transaction format: Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
  if (records.length > 0 && !Array.isArray(records[0])) {
    const columns = Object.keys(records[0]);
    console.log('Available columns:', columns);
    
    // Check for the new transaction format
    if (columns.includes('Date') && columns.includes('Action') && columns.includes('Symbol') && columns.includes('Price')) {
      console.log('Detected new Schwab transaction format - processing buy/sell transactions');
      return await parseSchwabTransactions(records, existingPositions);
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
        notes: `${term} - ${washSale ? 'Wash Sale' : 'Normal'}`
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

async function parseSchwabTransactions(records, existingPositions = {}) {
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
      
      // Detect short sales - check both action and description
      const isShort = action.includes('sell short') || 
                     description.toLowerCase().includes('short') ||
                     action.includes('short');
      
      let transactionType;
      if (action.includes('buy')) {
        transactionType = isShort ? 'cover' : 'buy';  // Buy to cover vs regular buy
      } else {
        transactionType = isShort ? 'short' : 'sell'; // Short sell vs regular sell
      }
      
      transactions.push({
        symbol,
        date: parseDate(date),
        datetime: parseDateTime(date + ' 09:30'),
        action: transactionType,
        quantity,
        price,
        amount,
        fees,
        description,
        isShort,
        raw: record
      });
      
      console.log(`Parsed transaction: ${transactionType} ${quantity} ${symbol} @ $${price} ${isShort ? '(SHORT)' : ''}`);
    } catch (error) {
      console.error('Error parsing Schwab transaction:', error, record);
    }
  }
  
  // Sort transactions by symbol and date
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });
  
  console.log(`Parsed ${transactions.length} valid transactions`);
  
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
    
    // Track position and round-trip trades
    let currentPosition = 0;
    let currentTrade = null; // Active round-trip trade being built
    const openLots = []; // FIFO queue of position lots
    
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
          broker: 'schwab'
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
        
        // Check if this execution already exists (prevent duplicates on re-import)
        const executionExists = currentTrade.executions.some(exec => 
          new Date(exec.datetime).toISOString() === new Date(newExecution.datetime).toISOString()
        );
        
        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += (transaction.fees || 0);
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
      }
      
      // Process the transaction
      if (transaction.action === 'buy') {
        currentPosition += qty;
        
        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += qty * transaction.price;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += qty * transaction.price;
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
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.price;
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
        currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
        currentTrade.exitPrice = currentTrade.exitValue / currentTrade.totalQuantity;
        
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
        currentTrade.exitTime = transaction.datetime;
        currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
        // Store executions for display in trade details
        currentTrade.executionData = currentTrade.executions;
        // Store executions for display in trade details
        currentTrade.executionData = currentTrade.executions;
        
        // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
        console.log(`  [SUCCESS] Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        
        currentTrade = null;
        openLots.length = 0; // Clear lots when trade completes
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
    }
  }
  
  console.log(`Created ${completedTrades.length} completed trades from transaction pairing`);
  
  return completedTrades;
}

async function parseThinkorswimTransactions(records, existingPositions = {}) {
  console.log(`Processing ${records.length} thinkorswim transaction records`);

  // Thinkorswim is stock trading, so contract multiplier is always 1
  const contractMultiplier = 1;
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
      
      transactions.push({
        symbol,
        date: parseDate(date),
        datetime: parseDateTime(`${date} ${time}`),
        action: action.toLowerCase() === 'bot' ? 'buy' : 'sell',
        quantity,
        price,
        fees: totalFees,
        description,
        raw: record
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
          broker: 'thinkorswim'
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
        
        // Check if this execution already exists (prevent duplicates on re-import)
        const executionExists = currentTrade.executions.some(exec => 
          new Date(exec.datetime).toISOString() === new Date(newExecution.datetime).toISOString()
        );
        
        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
      }
      
      // Update position and values
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
        currentTrade.exitTime = transaction.datetime;
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
        
        // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
      
      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
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

async function parsePaperMoneyTransactions(records, existingPositions = {}) {
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
        raw: record
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
          broker: 'papermoney'
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
        
        // Check if this execution already exists (prevent duplicates on re-import)
        const executionExists = currentTrade.executions.some(exec =>
          new Date(exec.datetime).toISOString() === new Date(newExecution.datetime).toISOString()
        );
        
        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
      }
      
      // Update position and values
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
        currentTrade.exitTime = transaction.datetime;
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
        
        // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
        currentTrade = null;
      }
    }
    
    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);
      
      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
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

async function parseTradingViewTransactions(records, existingPositions = {}) {
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
        raw: record
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
          broker: 'tradingview'
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

        // Check if this execution already exists using order ID
        const executionExists = currentTrade.executions.some(exec => {
          if (exec.orderId && newExecution.orderId) {
            return exec.orderId === newExecution.orderId;
          }
          // Fallback to timestamp comparison
          return new Date(exec.datetime).toISOString() === new Date(newExecution.datetime).toISOString();
        });

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
      }

      // Update position and values
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
        currentTrade.exitTime = transaction.datetime;
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
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
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

async function parseIBKRTransactions(records, existingPositions = {}) {
  console.log(`Processing ${records.length} IBKR transaction records`);

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records to see structure
  console.log('Sample IBKR records:');
  records.slice(0, 5).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Detect format: Trade Confirmation vs Activity Statement
  const isTradeConfirmation = records.length > 0 && records[0].hasOwnProperty('Buy/Sell');

  // First, parse all transactions
  for (const record of records) {
    try {
      let symbol, quantity, absQuantity, price, commission, dateTime, action;

      if (isTradeConfirmation) {
        // Trade Confirmation format
        symbol = cleanString(record.Symbol);
        quantity = parseFloat(record.Quantity);
        absQuantity = Math.abs(quantity);
        price = parseFloat(record.Price);
        commission = Math.abs(parseFloat(record.Commission || 0));

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
      } else {
        // Activity Statement format (original)
        symbol = cleanString(record.Symbol);
        quantity = parseFloat(record.Quantity);
        absQuantity = Math.abs(quantity);
        price = parseFloat(record.Price);
        commission = Math.abs(parseFloat(record.Commission || 0));
        // Handle both "DateTime" and "Date/Time" column names
        // Clean DateTime - remove leading apostrophe if present
        dateTime = (record.DateTime || record['Date/Time'] || '').toString().replace(/^'/, '').trim();
        action = quantity > 0 ? 'buy' : 'sell';
      }


      // Skip if missing essential data
      if (!symbol || absQuantity === 0 || price === 0 || !dateTime) {
        console.log(`Skipping IBKR record missing data:`, { symbol, quantity, price, dateTime });
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

      transactions.push({
        symbol,
        date: tradeDate,
        datetime: entryTime,
        action: action,
        quantity: processedQuantity,
        price: price,
        fees: commission,
        description: `IBKR transaction`,
        raw: record
      });

      console.log(`Parsed IBKR transaction: ${action} ${processedQuantity} ${symbol} @ $${price}`);
    } catch (error) {
      console.error('Error parsing IBKR transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid IBKR trade transactions`);

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

    console.log(`\n=== Processing ${symbolTransactions.length} IBKR transactions for ${symbol} ===`);

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

    // For IBKR options, quantity is already converted to contracts, so multiplier is 1
    // For other instruments, use the standard contract multiplier
    const contractMultiplier = instrumentData.instrumentType === 'option' ? 1 :
                                instrumentData.instrumentType === 'future' ? (instrumentData.pointValue || 1) : 1;

    console.log(`Instrument type: ${instrumentData.instrumentType}, contract multiplier: ${contractMultiplier}`);

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
      broker: existingPosition.broker || 'ibkr',
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
          broker: 'ibkr'
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

        // Check if this execution already exists (prevent duplicates on re-import)
        // Include fees in duplicate check to handle multiple partial fills at same time/price
        const executionExists = currentTrade.executions.some(exec =>
          new Date(exec.datetime).toISOString() === new Date(newExecution.datetime).toISOString() &&
          exec.quantity === newExecution.quantity &&
          exec.price === newExecution.price &&
          exec.fees === newExecution.fees
        );

        if (!executionExists) {
          currentTrade.executions.push(newExecution);
          currentTrade.totalFees += transaction.fees;
          if (currentTrade.isExistingPosition) {
            currentTrade.newExecutionsAdded++;
          }
        } else {
          console.log(`  → Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        }
      }

      // Update position and values
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
        currentTrade.exitTime = transaction.datetime;
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
        currentTrade = null;
      }
    }

    console.log(`\n${symbol} Final Position: ${currentPosition} shares`);
    if (currentTrade) {
      console.log(`Active trade: ${currentTrade.side} ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions`);

      // Add open position as incomplete trade
      currentTrade.entryPrice = currentTrade.entryValue / currentTrade.totalQuantity;
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

  console.log(`Created ${completedTrades.length} IBKR trades from ${transactions.length} transactions`);
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