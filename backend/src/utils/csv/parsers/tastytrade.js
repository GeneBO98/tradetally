const { isExecutionDuplicate } = require('../dedup');
const { extractAccountFromRecord } = require('../detect');
const { cleanString, parseDateTime, parseNumeric, parseInteger } = require('../shared');


/**
 * Parse tastytrade transaction CSV records into round-trip trades.
 * Tastytrade exports include Trade, Receive Deliver, Money Movement rows.
 * Only Trade rows are actual trades. Uses position tracking (FIFO) to create round-trip trades.
 */
async function parseTastytradeTransactions(records, existingPositions = {}, context = {}) {
  console.log(`\n=== TASTYTRADE TRANSACTION PARSER ===`);
  console.log(`Processing ${records.length} Tastytrade transaction records`);
  console.log(`Existing open positions passed to parser: ${Object.keys(existingPositions).length}`);

  if (Object.keys(existingPositions).length > 0) {
    console.log(`Existing positions:`);
    Object.entries(existingPositions).forEach(([symbol, position]) => {
      console.log(`  ${symbol}: ${position.side} ${position.quantity} @ $${position.entryPrice} (Trade ID: ${position.id})`);
    });
  }

  const transactions = [];
  const completedTrades = [];

  // Debug: Log first few records
  console.log('\nSample Tastytrade records:');
  records.slice(0, 3).forEach((record, i) => {
    console.log(`Record ${i}:`, JSON.stringify(record));
  });

  // Helper to parse OCC option symbol: "IBM   260220C00265000"
  // Format: 6-char padded underlying + YYMMDD + C/P + 8-digit strike*1000
  function parseOCCSymbol(symbol) {
    if (!symbol) return null;
    const trimmed = symbol.trim();
    // OCC format: at least 15 chars with embedded C or P
    const match = trimmed.match(/^(.{6})(\d{6})([CP])(\d{8})$/);
    if (!match) return null;
    const [, underlying, dateStr, callPut, strikeStr] = match;
    const underlyingClean = underlying.trim();
    const year = `20${dateStr.substring(0, 2)}`;
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);
    const expirationDate = `${year}-${month}-${day}`;
    const strikePrice = parseInt(strikeStr) / 1000;
    const optionType = callPut === 'C' ? 'call' : 'put';
    return { underlyingClean, expirationDate, strikePrice, optionType };
  }

  // Parse each record
  for (const record of records) {
    try {
      // Only process Trade rows
      const type = cleanString(record.Type || record.type || '');
      if (type !== 'Trade') {
        continue;
      }

      // Get action - support both header variants
      const actionCode = cleanString(record.Action || record.action || record.Action_Type || record.action_type || '').toUpperCase();
      const subType = cleanString(record['Sub Type'] || record['sub type'] || '');
      const rawSymbol = cleanString(record.Symbol || record.symbol || record.Symbol_Type || record.symbol_type || '');
      const instrumentType = cleanString(record['Instrument Type'] || record['instrument type'] || '');
      const quantity = Math.abs(parseInteger(record.Quantity || record.quantity || record.Quantity_Type || record.quantity_type || 0));
      const commission = Math.abs(parseNumeric(record.Commissions || record.commissions || 0));
      const fees = Math.abs(parseNumeric(record.Fees || record.fees || 0));
      const multiplier = parseInteger(record.Multiplier || record.multiplier || 1);
      // Tastytrade "Average Price" is already multiplied by the contract multiplier
      // (e.g., a $1.00 option with 100x multiplier shows as -100 in Average Price)
      // Divide by multiplier to get the per-share/per-contract price
      const rawAvgPrice = Math.abs(parseNumeric(record['Average Price'] || record['average price'] || 0));
      const avgPrice = multiplier > 1 ? rawAvgPrice / multiplier : rawAvgPrice;
      const rootSymbol = cleanString(record['Root Symbol'] || record['root symbol'] || '');
      const underlyingSymbol = cleanString(record['Underlying Symbol'] || record['underlying symbol'] || '');
      const expirationDateRaw = cleanString(record['Expiration Date'] || record['expiration date'] || '');
      const strikePrice = parseNumeric(record['Strike Price'] || record['strike price'] || 0);
      const callOrPut = cleanString(record['Call or Put'] || record['call or put'] || '');
      const currency = cleanString(record.Currency || record.currency || 'USD').toUpperCase();
      const dateStr = cleanString(record.Date || record.date || '');
      const accountRaw = cleanString(record.Account || record.account || '');

      // Skip if missing essential data
      if (!rawSymbol || quantity === 0 || !dateStr) {
        console.log(`Skipping Tastytrade record missing data:`, { rawSymbol, quantity, dateStr });
        continue;
      }

      // Use the shared date normalizer so regional Tastytrade exports receive
      // the same format and timezone support as every other importer.
      const parsedExecDateTime = parseDateTime(dateStr);
      const execDateTime = parsedExecDateTime ? new Date(parsedExecDateTime) : null;
      if (!execDateTime || isNaN(execDateTime.getTime())) {
        console.log(`Skipping Tastytrade record with invalid date: ${dateStr}`);
        continue;
      }

      // Determine action from Action code or Sub Type
      let tradeAction;
      if (actionCode.includes('BUY')) {
        tradeAction = 'buy';
      } else if (actionCode.includes('SELL')) {
        tradeAction = 'sell';
      } else {
        // Fall back to Sub Type
        const subTypeLower = subType.toLowerCase();
        if (subTypeLower.includes('buy')) {
          tradeAction = 'buy';
        } else if (subTypeLower.includes('sell')) {
          tradeAction = 'sell';
        } else if (subTypeLower === 'expiration') {
          // Expirations close the position at $0
          // For long positions, expiration is a sell; for short, it's a buy
          // We'll handle this in position tracking - default to sell for now
          tradeAction = 'sell';
        } else {
          console.log(`Skipping Tastytrade record with unknown action: ${actionCode} / ${subType}`);
          continue;
        }
      }

      // Determine instrument type and build position key
      let symbol, instrumentData;
      const isOption = instrumentType.toLowerCase().includes('option');
      const isFuture = instrumentType.toLowerCase().includes('future');

      if (isOption) {
        // Parse option details from columns or OCC symbol
        let optUnderlying = underlyingSymbol || rootSymbol;
        let optExpiration = '';
        let optStrike = strikePrice;
        let optType = callOrPut.toLowerCase() === 'call' || callOrPut.toLowerCase() === 'c' ? 'call' : 'put';

        // Parse expiration date - format: M/D/YY or M/D/YYYY
        if (expirationDateRaw) {
          const parts = expirationDateRaw.split('/');
          if (parts.length === 3) {
            // Handle 2-digit year (e.g., 2/20/26 -> 2026-02-20)
            // Use parseInt to be robust against invisible Unicode characters
            const yearNum = parseInt(parts[2], 10);
            const year = yearNum < 100 ? `${2000 + yearNum}` : `${yearNum}`;
            optExpiration = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }

        // Fallback: parse from OCC symbol if columns are missing
        if (!optUnderlying || !optExpiration) {
          const occData = parseOCCSymbol(rawSymbol);
          if (occData) {
            optUnderlying = optUnderlying || occData.underlyingClean;
            optExpiration = optExpiration || occData.expirationDate;
            optStrike = optStrike || occData.strikePrice;
            optType = optType || occData.optionType;
          }
        }

        symbol = optUnderlying || rawSymbol.trim().substring(0, 6).trim();
        instrumentData = {
          instrumentType: 'option',
          underlyingSymbol: optUnderlying,
          strikePrice: optStrike,
          expirationDate: optExpiration,
          optionType: optType,
          contractSize: multiplier || 100
        };
      } else if (isFuture) {
        symbol = rootSymbol || rawSymbol;
        instrumentData = {
          instrumentType: 'future',
          underlyingSymbol: rootSymbol || rawSymbol,
          contractSize: multiplier || 1
        };
      } else {
        // Stock / Equity
        symbol = rawSymbol;
        instrumentData = {
          instrumentType: 'stock',
          underlyingSymbol: rawSymbol
        };
      }

      // Extract account identifier
      const accountIdentifier = context.selectedAccountId
        ? context.selectedAccountId
        : context.accountColumnName
          ? extractAccountFromRecord(record, context.accountColumnName)
          : (accountRaw || null);

      transactions.push({
        symbol,
        fullSymbol: rawSymbol,
        date: execDateTime.toISOString().split('T')[0],
        datetime: execDateTime,
        action: tradeAction,
        quantity,
        price: avgPrice,
        commission,
        fees,
        currency,
        description: `Tastytrade ${subType || actionCode}`,
        raw: record,
        accountIdentifier,
        instrumentData,
        multiplier: multiplier || (isOption ? 100 : 1),
        subType
      });

      console.log(`Parsed Tastytrade transaction: ${tradeAction.toUpperCase()} ${quantity} ${symbol} @ $${avgPrice.toFixed(2)} (${instrumentType})`);
    } catch (error) {
      console.error('Error parsing Tastytrade transaction:', error, record);
    }
  }

  // Sort transactions by symbol and datetime
  transactions.sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    return new Date(a.datetime) - new Date(b.datetime);
  });

  console.log(`Parsed ${transactions.length} valid Tastytrade trade transactions`);

  // Group transactions by position key
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

    console.log(`\n=== Processing ${symbolTransactions.length} Tastytrade transactions for ${symbolKey} ===`);
    console.log(`Instrument type: ${instrumentData.instrumentType}`);

    // Value multiplier for options/futures
    const valueMultiplier = instrumentData.contractSize || (instrumentData.instrumentType === 'option' ? 100 : 1);

    // Track position using FIFO
    let currentPosition = 0;
    let currentTrade = null;

    // Check for existing position
    const existingPosition = existingPositions[firstTx.symbol] || existingPositions[symbolKey];
    if (existingPosition) {
      currentPosition = existingPosition.side === 'long' ? existingPosition.quantity : -existingPosition.quantity;
      console.log(`  → Starting with existing ${existingPosition.side} position: ${existingPosition.quantity} @ $${existingPosition.entryPrice}`);

      currentTrade = {
        id: existingPosition.id,
        symbol: existingPosition.symbol,
        tradeDate: existingPosition.tradeDate,
        entryTime: existingPosition.entryTime,
        entryPrice: existingPosition.entryPrice,
        quantity: existingPosition.quantity,
        side: existingPosition.side,
        commission: existingPosition.commission || 0,
        fees: existingPosition.fees || 0,
        broker: existingPosition.broker || 'Tastytrade',
        currency: firstTx.currency,
        accountIdentifier: firstTx.accountIdentifier,
        executions: existingPosition.executions || [],
        ...instrumentData
      };
      console.log(`  → Initialized trade from existing position with ${currentTrade.executions.length} executions`);
    }

    for (const transaction of symbolTransactions) {
      // Check for duplicate execution
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
        continue;
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
            fees: transaction.fees,
            broker: 'Tastytrade',
            currency: transaction.currency,
            accountIdentifier: transaction.accountIdentifier,
            executions: [{
              entryTime: transaction.datetime,
              entryPrice: transaction.price,
              quantity: Math.abs(signedQty),
              side: side,
              commission: transaction.commission,
              fees: transaction.fees
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
          currentTrade.fees += transaction.fees;
          currentTrade.executions.push({
            entryTime: transaction.datetime,
            entryPrice: transaction.price,
            quantity: Math.abs(signedQty),
            side: currentTrade.side,
            commission: transaction.commission,
            fees: transaction.fees
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
          const closeFees = isPartialClose
            ? (currentTrade.fees * closeQty / currentTrade.quantity) + transaction.fees
            : currentTrade.fees + transaction.fees;
          pnl -= closeCommission + closeFees;

          if (isPartialClose) {
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: transaction.fees,
              pnl: pnl
            });

            currentTrade.quantity = remainingQty;
            currentTrade.commission += transaction.commission;
            currentTrade.fees += transaction.fees;
            currentTrade.realizedPnl = (currentTrade.realizedPnl || 0) + pnl;

            console.log(`  [PARTIAL CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, realized P&L: $${pnl.toFixed(2)}, remaining: ${remainingQty}`);
          } else {
            // Full close
            currentTrade.executions.push({
              exitTime: transaction.datetime,
              exitPrice: transaction.price,
              quantity: closeQty,
              side: currentTrade.side === 'long' ? 'sell' : 'buy',
              commission: transaction.commission,
              fees: transaction.fees,
              pnl: pnl
            });

            currentTrade.exitTime = transaction.datetime;
            currentTrade.exitPrice = transaction.price;
            currentTrade.pnl = pnl;
            currentTrade.profitLoss = pnl;
            currentTrade.commission += transaction.commission;
            currentTrade.fees += transaction.fees;
            currentTrade.executionData = currentTrade.executions;

            console.log(`  [CLOSE] Closed ${closeQty} @ $${transaction.price.toFixed(2)}, P&L: $${pnl.toFixed(2)}`);
            completedTrades.push(currentTrade);

            // Handle reversal
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
                broker: 'Tastytrade',
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
      if (!currentTrade.exitTime) {
        currentTrade.quantity = Math.abs(currentPosition);
        currentTrade.notes = `Open position: ${currentTrade.executions.length} executions`;
        currentTrade.executionData = currentTrade.executions;
        if (currentTrade.id) {
          currentTrade.isUpdate = true;
          currentTrade.existingTradeId = currentTrade.id;
        }
        console.log(`  [OPEN] Remaining open ${currentTrade.side} position: ${Math.abs(currentPosition)} @ $${currentTrade.entryPrice.toFixed(2)}${currentTrade.id ? ' (updating existing)' : ''}`);
        completedTrades.push(currentTrade);
      }
    }
  }

  console.log(`\n[SUCCESS] Created ${completedTrades.length} trades from ${transactions.length} Tastytrade transactions`);
  completedTrades.forEach((trade, i) => {
    console.log(`  Trade ${i + 1}: ${trade.symbol} ${trade.side} ${trade.quantity}, entry $${trade.entryPrice?.toFixed(2)}, exit $${trade.exitPrice?.toFixed(2) || 'OPEN'}, P&L: $${trade.pnl?.toFixed(2) || 'N/A'}, executions: ${trade.executions?.length || 0}${trade.isUpdate ? ' (UPDATE)' : ''}`);
  });
  return completedTrades;
}

module.exports = {
  parseTastytradeTransactions
};
