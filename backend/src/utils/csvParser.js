const { parse } = require('csv-parse/sync');
const logger = require('./logger');
const cusipLookup = require('./cusipLookup');

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
      // Schwab doesn't separate commission/fees, estimate from proceeds vs cost basis difference
      commission: Math.abs(parseFloat(row['Cost Basis (CB)'] || 0) - (parseFloat(row['Cost Per Share'] || 0) * quantity)) || 0,
      fees: 0, // Not separately provided by Schwab
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
  
  // Batch lookup CUSIPs with API calls
  let cusipToTickerMap = {};
  if (cusipsToResolve.size > 0) {
    console.log(`Found ${cusipsToResolve.size} unique CUSIPs to resolve`);
    
    // First check cache
    const uncachedCusips = [];
    cusipsToResolve.forEach(cusip => {
      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      if (cusipLookup.cache[cleanCusip]) {
        cusipToTickerMap[cleanCusip] = cusipLookup.cache[cleanCusip];
        console.log(`CUSIP ${cleanCusip} found in cache: ${cusipLookup.cache[cleanCusip]}`);
      } else {
        uncachedCusips.push(cleanCusip);
      }
    });
    
    // Lookup uncached CUSIPs with rate limiting
    if (uncachedCusips.length > 0) {
      console.log(`Looking up ${uncachedCusips.length} uncached CUSIPs via API`);
      const batchSize = 5; // Process 5 at a time to avoid overwhelming APIs
      
      for (let i = 0; i < uncachedCusips.length; i += batchSize) {
        const batch = uncachedCusips.slice(i, i + batchSize);
        const lookupPromises = batch.map(async cusip => {
          try {
            const ticker = await cusipLookup.lookupTicker(cusip);
            if (ticker) {
              cusipToTickerMap[cusip] = ticker;
              console.log(`API resolved CUSIP ${cusip} to ticker ${ticker}`);
            }
          } catch (error) {
            console.warn(`Failed to lookup CUSIP ${cusip}: ${error.message}`);
          }
        });
        
        await Promise.all(lookupPromises);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < uncachedCusips.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    console.log(`Resolved ${Object.keys(cusipToTickerMap).length} of ${cusipsToResolve.size} CUSIPs total`);
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

  // Group transactions by symbol and match using simple FIFO
  const symbolGroups = {};
  transactions.forEach(transaction => {
    if (!symbolGroups[transaction.symbol]) {
      symbolGroups[transaction.symbol] = [];
    }
    symbolGroups[transaction.symbol].push(transaction);
  });

  const completedTrades = [];
  let totalDistributedCommissions = 0;
  let totalDistributedFees = 0;
  
  Object.keys(symbolGroups).forEach(symbol => {
    const symbolTransactions = symbolGroups[symbol];
    
    // Calculate total commissions and fees for this symbol from CSV
    const totalCommissions = symbolTransactions.reduce((sum, tx) => sum + tx.commission, 0);
    const totalFees = symbolTransactions.reduce((sum, tx) => sum + tx.fees, 0);
    
    console.log(`Symbol ${symbol}: CSV commissions: $${totalCommissions.toFixed(2)}, fees: $${totalFees.toFixed(2)}`);
    
    // Sort by execution time for FIFO matching
    symbolTransactions.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
    
    // Simple FIFO matching - track open positions
    const openBuys = [];  // Long positions waiting to be sold
    const openSells = []; // Short positions waiting to be covered
    const symbolCompletedTrades = []; // Track completed trades for this symbol
    
    symbolTransactions.forEach(transaction => {
      if (transaction.side === 'buy') {
        // Try to cover short positions first
        while (transaction.quantity > 0 && openSells.length > 0) {
          const shortPosition = openSells[0];
          const matchQuantity = Math.min(transaction.quantity, shortPosition.quantity);
          
          // Create completed short trade (commission will be distributed later)
          const trade = {
            symbol: symbol,
            tradeDate: shortPosition.tradeDate,
            entryTime: shortPosition.entryTime,
            exitTime: transaction.entryTime,
            entryPrice: shortPosition.entryPrice,
            exitPrice: transaction.entryPrice,
            quantity: matchQuantity,
            side: 'short',
            commission: 0, // Will be set later from total CSV commissions
            fees: 0, // Will be set later from total CSV fees
            broker: 'lightspeed',
            notes: shortPosition.notes + ' | Covered'
          };
          
          symbolCompletedTrades.push(trade);
          
          // Update quantities
          transaction.quantity -= matchQuantity;
          shortPosition.quantity -= matchQuantity;
          
          if (shortPosition.quantity === 0) {
            openSells.shift();
          }
        }
        
        // Any remaining quantity becomes a long position
        if (transaction.quantity > 0) {
          openBuys.push({ ...transaction });
        }
        
      } else if (transaction.side === 'sell') {
        // Try to close long positions first
        while (transaction.quantity > 0 && openBuys.length > 0) {
          const longPosition = openBuys[0];
          const matchQuantity = Math.min(transaction.quantity, longPosition.quantity);
          
          // Create completed long trade (commission will be distributed later)
          const trade = {
            symbol: symbol,
            tradeDate: longPosition.tradeDate,
            entryTime: longPosition.entryTime,
            exitTime: transaction.entryTime,
            entryPrice: longPosition.entryPrice,
            exitPrice: transaction.entryPrice,
            quantity: matchQuantity,
            side: 'long',
            commission: 0, // Will be set later from total CSV commissions
            fees: 0, // Will be set later from total CSV fees
            broker: 'lightspeed',
            notes: longPosition.notes + ' | Sold'
          };
          
          symbolCompletedTrades.push(trade);
          
          // Update quantities
          transaction.quantity -= matchQuantity;
          longPosition.quantity -= matchQuantity;
          
          if (longPosition.quantity === 0) {
            openBuys.shift();
          }
        }
        
        // Any remaining quantity becomes a short position
        if (transaction.quantity > 0) {
          openSells.push({ ...transaction });
        }
      }
    });
    
    // Count total trades (completed + open) for commission distribution
    const totalTrades = symbolCompletedTrades.length + openBuys.length + openSells.length;
    const commissionPerTrade = totalTrades > 0 ? totalCommissions / totalTrades : 0;
    const feesPerTrade = totalTrades > 0 ? totalFees / totalTrades : 0;
    
    // Add completed trades with distributed commissions
    symbolCompletedTrades.forEach(trade => {
      trade.commission = commissionPerTrade;
      trade.fees = feesPerTrade;
      totalDistributedCommissions += commissionPerTrade;
      totalDistributedFees += feesPerTrade;
      completedTrades.push(trade);
    });
    
    // Add remaining open positions as open trades with distributed commissions
    openBuys.forEach(position => {
      totalDistributedCommissions += commissionPerTrade;
      totalDistributedFees += feesPerTrade;
      completedTrades.push({
        symbol: position.symbol,
        tradeDate: position.tradeDate,
        entryTime: position.entryTime,
        exitTime: null,
        entryPrice: position.entryPrice,
        exitPrice: null,
        quantity: position.quantity,
        side: 'long',
        commission: commissionPerTrade,
        fees: feesPerTrade,
        broker: 'lightspeed',
        notes: position.notes + ' | Open'
      });
    });
    
    openSells.forEach(position => {
      totalDistributedCommissions += commissionPerTrade;
      totalDistributedFees += feesPerTrade;
      completedTrades.push({
        symbol: position.symbol,
        tradeDate: position.tradeDate,
        entryTime: position.entryTime,
        exitTime: null,
        entryPrice: position.entryPrice,
        exitPrice: null,
        quantity: position.quantity,
        side: 'short',
        commission: commissionPerTrade,
        fees: feesPerTrade,
        broker: 'lightspeed',
        notes: position.notes + ' | Open'
      });
    });
  });

  console.log(`Created ${completedTrades.length} trades from ${transactions.length} transactions`);
  console.log(`Total distributed commissions: $${totalDistributedCommissions.toFixed(2)} (should match CSV total: $${totalCSVCommissions.toFixed(2)})`);
  console.log(`Total distributed fees: $${totalDistributedFees.toFixed(2)} (should match CSV total: $${totalCSVFees.toFixed(2)})`);
  
  return completedTrades;
}

async function parseSchwabTrades(records) {
  console.log(`Processing ${records.length} Schwab trade records`);
  
  // Debug: Show available columns in the first record
  if (records.length > 0) {
    if (Array.isArray(records[0])) {
      console.log('Schwab data is array format (no headers), first record length:', records[0].length);
      console.log('First record sample:', records[0]);
    } else {
      console.log('Available Schwab CSV columns:', Object.keys(records[0]));
      console.log('First record sample:', records[0]);
    }
  }
  
  const completedTrades = [];
  let totalCommissions = 0;
  let totalFees = 0;
  let totalPnL = 0;
  
  for (const record of records) {
    try {
      let symbol, quantity, costPerShare, proceedsPerShare, gainLoss, openedDate, closedDate, costBasis, term, washSale;
      
      // Handle array format (positional data without headers)
      if (Array.isArray(record)) {
        // Based on your sample: [0]=Symbol, [1]=Name, [2]=ClosedDate, [3]=OpenedDate, 
        // [4]=Quantity, [5]=ProceedsPerShare, [6]=CostPerShare, [7]=Proceeds, [8]=CostBasis, [9]=GainLoss
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
        // Handle named columns format
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
      
      // Determine if this is a short trade based on the data
      // For short trades in Schwab data, they might indicate it differently
      // We'll assume it's a long trade unless there's clear indication otherwise
      // You may need to check the "Name" field or other indicators for short positions
      const isShort = false; // Default to long trades for now
      
      // Calculate estimated commission/fees from cost basis vs theoretical cost
      const theoreticalCost = costPerShare * quantity;
      const actualCostBasis = costBasis;
      const estimatedCommission = Math.abs(actualCostBasis - theoreticalCost);
      
      // Get the gain/loss percentage
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
        entryPrice: costPerShare,  // Cost is always entry for Schwab
        exitPrice: proceedsPerShare,  // Proceeds is always exit for Schwab
        quantity: quantity,
        side: 'long',  // Schwab doesn't clearly indicate short vs long in this format
        commission: estimatedCommission,
        fees: 0,
        pnl: gainLoss,  // Use Schwab's calculated gain/loss
        pnlPercent: gainLossPercent,  // Use Schwab's calculated percentage
        broker: 'schwab',
        notes: `${term} - ${washSale ? 'Wash Sale' : 'Normal'}`
      };
      
      console.log('Parsed Schwab trade:', {
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        side: trade.side,
        pnl: trade.pnl,
        pnlPercent: trade.pnlPercent,
        commission: trade.commission,
        rawGainLoss: Array.isArray(record) ? record[9] : record['Gain/Loss ($)'],
        rawGainLossPercent: Array.isArray(record) ? record[10] : record['Gain/Loss (%)']
      });
      
      if (trade.symbol && trade.entryPrice > 0 && trade.exitPrice > 0 && trade.quantity > 0) {
        completedTrades.push(trade);
        totalCommissions += estimatedCommission;
        totalPnL += gainLoss;
        console.log(`Valid trade added: ${trade.symbol} - P&L: $${gainLoss.toFixed(2)}`);
      } else {
        console.log('Trade rejected - validation failed:', {
          hasSymbol: !!trade.symbol,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          quantity: trade.quantity
        });
      }
    } catch (error) {
      console.error('Error parsing Schwab trade:', error, record);
    }
  }
  
  console.log(`Created ${completedTrades.length} Schwab trades`);
  console.log(`Total P&L from Schwab data: $${totalPnL.toFixed(2)}`);
  console.log(`Total estimated commissions: $${totalCommissions.toFixed(2)}`);
  
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