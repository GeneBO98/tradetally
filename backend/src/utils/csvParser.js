const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const finnhub = require('./finnhub');
const cache = require('./cache');

// Module-level variable to store unresolved CUSIPs
let pendingCusips = [];

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
    entryTime: parseDateTime(row['Trade Date'] + ' ' + (row['Execution Time'] || '09:30')),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Qty),
    side: parseLightspeedSide(row.Side, row['Buy/Sell'], row['Principal Amount'], row['NET Amount']),
    commission: parseFloat(row['Commission Amount'] || 0),
    fees: calculateLightspeedFees(row),
    broker: 'lightspeed',
    notes: `Trade #${row['Trade Number']} - ${row['Security Type']}`
  }),

  thinkorswim: (row) => ({
    symbol: row.Symbol,
    tradeDate: parseDate(row['Exec Time']),
    entryTime: parseDateTime(row['Exec Time']),
    entryPrice: parseFloat(row.Price),
    quantity: parseInt(row.Qty),
    side: row.Side === 'BUY' ? 'long' : 'short',
    commission: parseFloat(row.Commission || 0),
    fees: parseFloat(row.Fees || 0),
    broker: 'thinkorswim'
  }),

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
  }
};

async function parseCSV(fileBuffer, broker = 'generic') {
  try {
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
    
    const records = parse(csvString, parseOptions);
    
    console.log(`Parsing ${records.length} records with ${broker} parser`);

    if (broker === 'lightspeed') {
      console.log('Starting Lightspeed transaction parsing');
      const result = await parseLightspeedTransactions(records);
      console.log('Finished Lightspeed transaction parsing');
      return result;
    }

    if (broker === 'schwab') {
      console.log('Starting Schwab trade parsing');
      const result = await parseSchwabTrades(records);
      console.log('Finished Schwab trade parsing');
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
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr) return null;
  const date = new Date(dateTimeStr);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function parseSide(sideStr) {
  if (!sideStr) return 'long';
  const normalized = sideStr.toLowerCase();
  if (normalized.includes('short') || normalized.includes('sell')) return 'short';
  return 'long';
}

function parseLightspeedSide(sideCode, buySell, principalAmount, netAmount, quantity) {
  
  // PRIORITY 1: Check quantity sign (negative = sell, positive = buy)
  if (quantity !== undefined && quantity !== null) {
    const qty = parseInt(quantity);
    if (qty < 0) {
      return 'sell';
    }
    if (qty > 0) {
      return 'buy';
    }
  }
  
  // PRIORITY 2: Check Side column (B/S indicator)
  if (sideCode) {
    const cleanSide = sideCode.toString().trim().toUpperCase();
    
    if (cleanSide === 'S') {
      return 'sell';
    }
    if (cleanSide === 'B') {
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



async function parseLightspeedTransactions(records) {
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
    
    console.log(`Using cached results for ${Object.keys(cusipToTickerMap).length} of ${cusipsToResolve.size} CUSIPs. ${unresolvedCusips.length} will be resolved in background.`);
    
    // Store unresolved CUSIPs for background processing
    if (unresolvedCusips.length > 0) {
      pendingCusips = unresolvedCusips;
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
      
      const transaction = {
        symbol: resolvedSymbol,
        tradeDate: parseDate(record['Trade Date']),
        entryTime: parseDateTime(record['Trade Date'] + ' ' + (record['Execution Time'] || '09:30')),
        entryPrice: parseFloat(record.Price),
        quantity: Math.abs(parseInt(record.Qty)),
        side: side,
        commission: parseFloat(record['Commission Amount'] || 0),
        fees: calculateLightspeedFees(record),
        broker: 'lightspeed',
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
    let currentPosition = 0;
    let currentTrade = null; // Active round-trip trade being built
    
    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const prevPosition = currentPosition;
      
      console.log(`\n${transaction.side} ${qty} @ $${transaction.entryPrice} | Position: ${currentPosition}`);
      
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
      
      // Add execution to current trade
      if (currentTrade) {
        currentTrade.executions.push({
          action: transaction.side,
          quantity: qty,
          price: transaction.entryPrice,
          datetime: transaction.entryTime,
          fees: transaction.commission + transaction.fees
        });
        
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
        }
        
      } else if (transaction.side === 'sell') {
        currentPosition -= qty;
        
        // Add to entry or exit value based on trade direction
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += qty * transaction.entryPrice;
          currentTrade.totalQuantity += qty;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += qty * transaction.entryPrice;
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
        currentTrade.exitTime = transaction.entryTime;
        currentTrade.notes = `Round trip: ${currentTrade.executions.length} executions`;
        // Store executions for display in trade details
        currentTrade.executionData = currentTrade.executions;
        
        completedTrades.push(currentTrade);
        console.log(`  ✓ Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        
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
      // Store executions for display in trade details
      currentTrade.executionData = currentTrade.executions;
      
      completedTrades.push(currentTrade);
      console.log(`  → Added open ${currentTrade.side} position: ${currentTrade.totalQuantity} shares`);
    }
  });

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  
  // Include unresolved CUSIPs in the result for background processing
  const result = { trades: completedTrades };
  if (pendingCusips.length > 0) {
    result.unresolvedCusips = [...pendingCusips];
    pendingCusips = []; // Clean up
  }
  
  return result;
}

async function parseSchwabTrades(records) {
  console.log(`Processing ${records.length} Schwab trade records`);
  
  // Check if this is the new transaction format: Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
  if (records.length > 0 && !Array.isArray(records[0])) {
    const columns = Object.keys(records[0]);
    console.log('Available columns:', columns);
    
    // Check for the new transaction format
    if (columns.includes('Date') && columns.includes('Action') && columns.includes('Symbol') && columns.includes('Price')) {
      console.log('Detected new Schwab transaction format - processing buy/sell transactions');
      return await parseSchwabTransactions(records);
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

async function parseSchwabTransactions(records) {
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
      
      const quantity = Math.abs(parseInt(quantityStr));
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
      
      // Add execution to current trade
      if (currentTrade) {
        currentTrade.executions.push({
          action: transaction.action,
          quantity: qty,
          price: transaction.price,
          datetime: transaction.datetime,
          fees: transaction.fees || 0
        });
        currentTrade.totalFees += (transaction.fees || 0);
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
        
        completedTrades.push(currentTrade);
        console.log(`  ✓ Completed ${currentTrade.side} trade: ${currentTrade.totalQuantity} shares, ${currentTrade.executions.length} executions, P/L: $${currentTrade.pnl.toFixed(2)}`);
        
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

function isValidTrade(trade) {
  return trade.symbol && 
         trade.tradeDate && 
         trade.entryTime && 
         trade.entryPrice > 0 && 
         trade.quantity > 0;
}

module.exports = { parseCSV };