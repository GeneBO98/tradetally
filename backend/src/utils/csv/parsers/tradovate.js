const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../../futuresUtils');
const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { parseDate, parseDateTime, getExecutionTimeBounds, cleanString, parseInstrumentData, parseNumeric, parseInteger } = require('../shared');


/**
 * Parse Tradovate futures transactions
 * Tradovate Performance Report parser - pre-matched round-trip trades
 * Headers: symbol, _priceFormat, _priceFormatType, _tickSize, buyFillId, sellFillId, qty, buyPrice, sellPrice, pnl, boughtTimestamp, soldTimestamp, duration
 * Each row is a completed round-trip trade (entry + exit already paired)
 */
async function parseTradovatePerformanceReport(records, context = {}) {
  console.log(`\n=== TRADOVATE PERFORMANCE REPORT PARSER ===`);
  console.log(`Processing ${records.length} pre-matched round-trip trades`);

  const completedTrades = [];
  const diagnostics = context.diagnostics;

  const getField = (record, ...fieldNames) => {
    for (const fieldName of fieldNames) {
      if (record[fieldName] !== undefined && record[fieldName] !== null) {
        return record[fieldName];
      }
    }
    return undefined;
  };

  const parseTradovateTimestamp = (value) => {
    const rawValue = cleanString(value);
    if (!rawValue) {
      return null;
    }

    if (/^\d{10,13}$/.test(rawValue)) {
      const numericValue = Number(rawValue);
      const milliseconds = rawValue.length === 10 ? numericValue * 1000 : numericValue;
      const parsed = new Date(milliseconds);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    return parseDateTime(rawValue);
  };

  // Debug: Log first few records
  console.log('Sample Tradovate Performance Report records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      const rawSymbol = cleanString(
        getField(record, 'symbol', 'Symbol', 'Contract', 'contract', 'Product', 'product')
      );
      const quantity = Math.abs(parseInteger(
        getField(record, 'qty', 'Qty', 'Paired Qty', 'pairedQty', 'paired qty')
      ));
      const buyPrice = parseNumeric(getField(record, 'buyPrice', 'Buy Price', 'buy price'));
      const sellPrice = parseNumeric(getField(record, 'sellPrice', 'Sell Price', 'sell price'));

      // Parse PnL - Tradovate uses $185.00 or $(160.00) for negative
      let pnlStr = cleanString(getField(record, 'pnl', 'P/L', 'pl'));
      let pnl = 0;
      if (pnlStr) {
        const isNegative = pnlStr.includes('(') && pnlStr.includes(')');
        const cleaned = pnlStr.replace(/[$(),]/g, '');
        pnl = parseFloat(cleaned) || 0;
        if (isNegative) pnl = -pnl;
      }

      const rawBought = cleanString(getField(record, 'boughtTimestamp', 'Bought Timestamp', 'bought timestamp'));
      const rawSold = cleanString(getField(record, 'soldTimestamp', 'Sold Timestamp', 'sold timestamp'));
      const boughtTime = parseTradovateTimestamp(rawBought);
      const soldTime = parseTradovateTimestamp(rawSold);

      if (!boughtTime || !soldTime) {
        console.log(`[WARNING] Skipping row ${i + 1}: invalid timestamps - bought: "${rawBought}", sold: "${rawSold}"`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: i + 1, reason: 'Invalid bought/sold timestamps in Tradovate paired trade row' });
        }
        continue;
      }

      if (!rawSymbol || quantity === 0) {
        console.log(`[WARNING] Skipping row ${i + 1}: missing symbol or zero quantity`);
        if (diagnostics) {
          diagnostics.invalidRows++;
          diagnostics.skippedReasons.push({ row: i + 1, reason: 'Missing contract/product symbol or paired quantity in Tradovate paired trade row' });
        }
        continue;
      }

      // Determine side: if bought first then sold -> LONG, if sold first then bought -> SHORT
      const boughtMs = new Date(boughtTime).getTime();
      const soldMs = new Date(soldTime).getTime();
      const isLong = boughtMs !== soldMs
        ? boughtMs <= soldMs
        : (pnl >= 0 ? sellPrice >= buyPrice : sellPrice < buyPrice);
      const side = isLong ? 'long' : 'short';
      const entryPrice = isLong ? buyPrice : sellPrice;
      const exitPrice = isLong ? sellPrice : buyPrice;
      const entryTime = isLong ? boughtTime : soldTime;
      const exitTime = isLong ? soldTime : boughtTime;
      const tradeDate = parseDate(rawBought) || parseDate(rawSold) || entryTime.split('T')[0];

      const product = cleanString(getField(record, 'Product', 'product'));
      const instrumentData = parseInstrumentData(rawSymbol);
      if (instrumentData.instrumentType === 'future') {
        instrumentData.underlyingAsset = instrumentData.underlyingAsset || product || extractUnderlyingFromFuturesSymbol(rawSymbol);
        instrumentData.underlyingSymbol = instrumentData.underlyingSymbol || instrumentData.underlyingAsset || null;
      }
      const pointValue = instrumentData.instrumentType === 'future'
        ? (instrumentData.pointValue || getFuturesPointValue(product || extractUnderlyingFromFuturesSymbol(rawSymbol)))
        : (instrumentData.contractSize || 1);

      // If PnL was not parsed from the formatted string, calculate it from the inferred side
      if (pnl === 0 && buyPrice !== sellPrice) {
        const priceDelta = isLong ? (sellPrice - buyPrice) : (buyPrice - sellPrice);
        pnl = priceDelta * quantity * pointValue;
      }

      // Determine account identifier
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : null;

      const entryOrderId = isLong
        ? cleanString(getField(record, 'buyFillId', 'Buy Fill ID', 'buy fill id'))
        : cleanString(getField(record, 'sellFillId', 'Sell Fill ID', 'sell fill id'));
      const exitOrderId = isLong
        ? cleanString(getField(record, 'sellFillId', 'Sell Fill ID', 'sell fill id'))
        : cleanString(getField(record, 'buyFillId', 'Buy Fill ID', 'buy fill id'));
      const notes = [];
      const duration = cleanString(getField(record, 'duration', 'Duration'));
      const pairId = cleanString(getField(record, 'Pair ID', 'pairId', 'pair id'));
      if (duration) notes.push(`Duration: ${duration}`);
      if (pairId) notes.push(`Pair ID: ${pairId}`);

      const trade = {
        symbol: rawSymbol,
        tradeDate,
        entryTime,
        exitTime,
        entryPrice,
        exitPrice,
        quantity,
        side,
        commission: 0,
        fees: 0,
        pnl,
        profitLoss: pnl,
        broker: 'tradovate',
        accountIdentifier,
        currency: cleanString(getField(record, 'Currency', 'currency')) || 'USD',
        notes: notes.join(' | '),
        executions: [
          {
            action: isLong ? 'buy' : 'sell',
            side: isLong ? 'buy' : 'sell',
            datetime: entryTime,
            entryTime,
            entryPrice,
            price: entryPrice,
            quantity,
            orderId: entryOrderId || undefined,
            commission: 0,
            fees: 0
          },
          {
            action: isLong ? 'sell' : 'buy',
            side: isLong ? 'sell' : 'buy',
            datetime: exitTime,
            exitTime,
            exitPrice,
            price: exitPrice,
            quantity,
            orderId: exitOrderId || undefined,
            commission: 0,
            fees: 0,
            pnl
          }
        ],
        executionData: [
          {
            action: isLong ? 'buy' : 'sell',
            side: isLong ? 'buy' : 'sell',
            datetime: entryTime,
            entryTime,
            entryPrice,
            price: entryPrice,
            quantity,
            orderId: entryOrderId || undefined,
            commission: 0,
            fees: 0
          },
          {
            action: isLong ? 'sell' : 'buy',
            side: isLong ? 'sell' : 'buy',
            datetime: exitTime,
            exitTime,
            exitPrice,
            price: exitPrice,
            quantity,
            orderId: exitOrderId || undefined,
            commission: 0,
            fees: 0,
            pnl
          }
        ],
        ...instrumentData
      };

      completedTrades.push(trade);
      console.log(`Parsed Tradovate performance trade: ${side} ${quantity} ${rawSymbol} @ $${entryPrice} -> $${exitPrice}, P&L: $${pnl.toFixed(2)}`);
    } catch (error) {
      console.error(`Error parsing Tradovate Performance Report row ${i + 1}:`, error.message, record);
    }
  }

  console.log(`[SUCCESS] Parsed ${completedTrades.length} Tradovate Performance Report trades from ${records.length} records`);
  return completedTrades;
}

/**
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
    const contractMatch = symbol.match(/^([A-Z][A-Z0-9]*)([FGHJKMNQUVXZ])(\d{1,2})$/);
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

    const startTradovateTrade = (transaction, actionOverride = transaction.action) => {
      currentTrade = {
        symbol: symbol,
        entryTime: transaction.datetime,
        tradeDate: transaction.date,
        side: actionOverride === 'buy' ? 'long' : 'short',
        executions: [],
        totalQuantity: 0,
        totalFees: 0,
        entryValue: 0,
        exitValue: 0,
        broker: 'tradovate',
        accountIdentifier: transaction.accountIdentifier
      };
      console.log(`  Started new ${currentTrade.side} trade`);
    };

    const finalizeTradovateTrade = (transaction) => {
      if (!(currentPosition === 0 && currentTrade && currentTrade.totalQuantity > 0)) {
        return;
      }

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
        const { entryTime, exitTime } = getExecutionTimeBounds(currentTrade.executions);
        if (entryTime && exitTime) {
          currentTrade.entryTime = entryTime;
          currentTrade.exitTime = exitTime;
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
    };

    const appendTradovateExecution = (transaction, quantity, feesForExecution) => {
      if (!currentTrade || quantity <= 0) {
        return;
      }

      const newExecution = {
        action: transaction.action,
        quantity,
        price: transaction.price,
        datetime: transaction.datetime,
        commission: 0,
        fees: feesForExecution,
        orderId: transaction.orderId
      };

      const existsGlobally = isExecutionDuplicate(newExecution, symbol, context);
      const executionExists = existsGlobally || currentTrade.executions.some(exec => {
        if (exec.orderId && newExecution.orderId) {
          return exec.orderId === newExecution.orderId;
        }
        return false;
      });

      if (executionExists) {
        console.log(`  Skipping duplicate execution: ${newExecution.action} ${newExecution.quantity} @ $${newExecution.price}`);
        return false;
      }

      currentTrade.executions.push(newExecution);
      currentTrade.totalFees += feesForExecution;
      if (currentTrade.isExistingPosition) {
        currentTrade.newExecutionsAdded++;
      }
      return true;
    };

    const applyTradovateExecution = (transaction, quantity) => {
      const valueDelta = quantity * transaction.price * valueMultiplier;
      if (transaction.action === 'buy') {
        currentPosition += quantity;
        if (currentTrade && currentTrade.side === 'long') {
          currentTrade.entryValue += valueDelta;
          currentTrade.totalQuantity += quantity;
        } else if (currentTrade && currentTrade.side === 'short') {
          currentTrade.exitValue += valueDelta;
        }
      } else if (transaction.action === 'sell') {
        currentPosition -= quantity;
        if (currentTrade && currentTrade.side === 'short') {
          currentTrade.entryValue += valueDelta;
          currentTrade.totalQuantity += quantity;
        } else if (currentTrade && currentTrade.side === 'long') {
          currentTrade.exitValue += valueDelta;
        }
      }
    };

    for (const transaction of symbolTransactions) {
      const qty = transaction.quantity;
      const totalFees = transaction.fees || 0;
      let remainingQty = qty;
      let remainingFees = totalFees;

      console.log(`\n${transaction.action} ${qty} @ $${transaction.price} | Position: ${currentPosition}`);

      while (remainingQty > 0) {
        if (currentPosition === 0) {
          startTradovateTrade(transaction);
        }

        const sameDirection =
          (currentPosition > 0 && transaction.action === 'buy') ||
          (currentPosition < 0 && transaction.action === 'sell') ||
          currentPosition === 0;

        const consumeQty = sameDirection
          ? remainingQty
          : Math.min(Math.abs(currentPosition), remainingQty);
        const feesForExecution = remainingQty === consumeQty
          ? remainingFees
          : totalFees * (consumeQty / qty);
        const previousPosition = currentPosition;

        if (!appendTradovateExecution(transaction, consumeQty, feesForExecution)) {
          console.log(`  Position: ${currentPosition} (unchanged - duplicate)`);
          remainingQty = 0;
          remainingFees = 0;
          continue;
        }

        applyTradovateExecution(transaction, consumeQty);
        remainingQty -= consumeQty;
        remainingFees -= feesForExecution;

        console.log(`  Position: ${previousPosition} -> ${currentPosition}`);

        if (!sameDirection) {
          finalizeTradovateTrade(transaction);

          if (remainingQty > 0) {
            startTradovateTrade(transaction);
          }
          continue;
        }

        finalizeTradovateTrade(transaction);
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

module.exports = {
  parseTradovatePerformanceReport,
  parseTradovateTransactions
};
