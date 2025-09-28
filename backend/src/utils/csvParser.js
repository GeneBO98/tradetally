const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const finnhub = require('./finnhub');
const cache = require('./cache');
const cusipQueue = require('./cusipQueue');

// CUSIP resolution is now handled by the cusipQueue module

const brokerParsers = {
  generic: (row) => ({
    symbol: row.Symbol || row.symbol,
    tradeDate: parseDate(row['Trade Date'] || row.Date || row.date),
    entryTime: parseDateTime(row['Entry Time'] || row['Trade Date'] || row.Date),
    exitTime: parseDateTime(row['Exit Time'] || row['Close Time']),
    entryPrice: parseFloat(row['Entry Price'] || row['Buy Price'] || row.Price),
    exitPrice: parseFloat(row['Exit Price'] || row['Sell Price']),
    quantity: parseInt(row.Quantity || row.Shares || row.Size),
    side: parseSide(row.Side || row.Direction || row.Type),
    commission: parseFloat(row.Commission || row.Fees || 0),
    fees: parseFloat(row.Fees || 0),
    broker: 'generic'
  }),

  lightspeed: (row) => ({
    symbol: cleanString(row.Symbol),
    tradeDate: parseDate(row['Trade Date']),
    entryTime: parseLightspeedDateTime(row['Trade Date'] + ' ' + (row['Execution Time'] || row['Raw Exec. Time'] || '09:30')),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Qty),
    side: parseLightspeedSide(row.Side, row['Buy/Sell'], row['Principal Amount'], row['NET Amount']),
    commission: parseFloat(row['Commission Amount'] || 0),
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

  ibkr: (row) => ({
    symbol: row.Symbol,
    tradeDate: parseDate(row.DateTime),
    entryTime: parseDateTime(row.DateTime),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Quantity),
    side: parseFloat(row.Quantity) > 0 ? 'long' : 'short',
    commission: parseFloat(row.Commission || 0),
    fees: parseFloat(row.Fees || 0),
    broker: 'ibkr'
  }),

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
  }
};

async function parseCSV(fileBuffer, broker = 'generic', context = {}) {
  try {
    const existingPositions = context.existingPositions || {};
    console.log(`\n=== IMPORT CONTEXT ===`);
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

    const parser = brokerParsers[broker] || brokerParsers.generic;
    const trades = [];

    for (const record of records) {
      try {
        const trade = parser(record);
        if (isValidTrade(trade)) {
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
  if (!dateStr) return null;
  
  // Try to parse MM/DD/YYYY format first
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    const [_, month, day, year] = mmddyyyyMatch;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }
  
  // Fall back to default date parsing
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  const date = new Date(dateTimeStr);
  return isNaN(date.getTime()) ? null : date.toISOString();
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

function calculateLightspeedFees(row) {
  const fees = [
    'FeeSEC', 'FeeMF', 'Fee1', 'Fee2', 'Fee3', 
    'FeeStamp', 'FeeTAF', 'Fee4'
  ];
  
  let totalFees = 0;
  fees.forEach(feeField => {
    const fee = parseFloat(row[feeField] || 0);
    if (!isNaN(fee)) {
      totalFees += fee;
    }
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
        entryPrice: parseFloat(record.Price),
        quantity: Math.abs(parseInt(record.Qty)),
        side: side,
        commission: parseFloat(record['Commission Amount'] || 0),
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
      executions: [],
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
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;
        currentTrade.exitTime = transaction.datetime;
        currentTrade.executionData = currentTrade.executions;
        
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
      executions: [],
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
        currentTrade.quantity = currentTrade.totalQuantity;
        currentTrade.commission = currentTrade.totalFees;
        currentTrade.fees = 0;
        currentTrade.exitTime = transaction.datetime;
        currentTrade.executionData = currentTrade.executions;
        
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
      
      // Map executions to executionData for Trade.create
      currentTrade.executionData = currentTrade.executions;
      completedTrades.push(currentTrade);
    }
  }
  
  console.log(`Created ${completedTrades.length} PaperMoney trades from ${transactions.length} transactions`);
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
  brokerParsers,
  parseDate,
  parseDateTime,
  parseSide,
  cleanString
};