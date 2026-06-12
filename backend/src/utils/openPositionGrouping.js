// Groups open trades into positions for the Open Positions dashboard view
// (issue #339). Extracted from trade.controller.js getOpenPositionsWithQuotes
// so the key/merge logic is unit-testable without db/quote-provider mocks.
//
// Position identity rules:
// - Options with full metadata get a composite key built from normalized
//   underlying/strike/expiration/type, so legs of the same contract always
//   group together regardless of symbol spelling or numeric formatting.
// - Options missing metadata fall back to a key namespaced with 'option:' so
//   they can never collide with a stock position on the same symbol (Schwab
//   option symbols are normalized to the bare underlying ticker).
// - Stocks and futures keep the plain symbol key; quote lookups depend on it.

const { parseInstrumentData } = require('./csvParser');

const OPTION_FALLBACK_PREFIX = 'option:';

function normalizeExpDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Fill missing option metadata in-memory by parsing the symbol (OCC and IBKR
// formats). Only fills gaps, never overwrites; only applies results that
// parsed as options. Also normalizes underlying casing for stable keys.
function enrichOptionMetadata(trade) {
  if (trade.instrument_type === 'option') {
    const missingMetadata = !trade.underlying_symbol || !String(trade.underlying_symbol).trim()
      || !trade.strike_price || !trade.expiration_date || !trade.option_type;

    if (missingMetadata && trade.symbol) {
      try {
        const parsed = parseInstrumentData(trade.symbol);
        if (parsed && parsed.instrumentType === 'option') {
          if (!trade.underlying_symbol || !String(trade.underlying_symbol).trim()) {
            trade.underlying_symbol = parsed.underlyingSymbol;
          }
          if (!trade.strike_price) trade.strike_price = parsed.strikePrice;
          if (!trade.expiration_date) trade.expiration_date = parsed.expirationDate;
          if (!trade.option_type) trade.option_type = parsed.optionType;
        }
      } catch (error) {
        console.warn(`[POSITION] Failed to parse option symbol ${trade.symbol}: ${error.message}`);
      }
    }

    if (trade.underlying_symbol) {
      trade.underlying_symbol = String(trade.underlying_symbol).trim().toUpperCase();
    }
  }
  return trade;
}

function getPositionKey(trade) {
  if (trade.instrument_type === 'option' && trade.underlying_symbol
      && String(trade.underlying_symbol).trim()
      && trade.strike_price && trade.expiration_date && trade.option_type) {
    const underlying = String(trade.underlying_symbol).trim().toUpperCase();
    const strike = parseFloat(trade.strike_price);
    const optionType = String(trade.option_type).toLowerCase();
    return `${underlying}_${strike}_${normalizeExpDate(trade.expiration_date)}_${optionType}`;
  }
  if (trade.instrument_type === 'option') {
    return `${OPTION_FALLBACK_PREFIX}${trade.symbol}`;
  }
  return trade.symbol;
}

// Calculate net position (signed shares/contracts still held) from executions
function calculateNetPosition(trade) {
  if (trade.executions && Array.isArray(trade.executions) && trade.executions.length > 0) {
    let netPosition = 0;
    trade.executions.forEach(execution => {
      const qty = parseFloat(execution.quantity) || 0;

      // Determine if this is a grouped execution (has entryPrice/exitPrice/entryTime) or individual fill
      const isGroupedExecution = execution.entryPrice !== undefined ||
                                  execution.exitPrice !== undefined ||
                                  execution.entryTime !== undefined;

      const isMixedFormat = isGroupedExecution && execution.action && execution.price !== undefined && execution.datetime;
      if (isGroupedExecution && !isMixedFormat) {
        // Grouped execution: represents a round-trip trade or open position
        // If no exitPrice, it's an open position - add/subtract based on trade side
        // If has exitPrice, it's a closed round-trip - net 0 (but shouldn't be in open trades)
        if (!execution.exitPrice) {
          if (trade.side === 'long') {
            netPosition += qty;
          } else {
            netPosition -= qty;
          }
        }
        // Closed round-trips (exitPrice exists) don't affect net position
      } else {
        // Individual fill: use action field to determine buy/sell
        const action = (execution.action || execution.side || '').toLowerCase();

        if (action === 'buy' || action === 'long') {
          netPosition += qty;
        } else if (action === 'sell' || action === 'short') {
          netPosition -= qty;
        } else if (action === '' || action === 'unknown') {
          // If action is missing we cannot reliably determine buy/sell;
          // skip the execution rather than guess.
          console.warn(`[POSITION] Execution missing action for trade ${trade.id}, skipping from net position calculation`);
        }
      }
    });
    return netPosition;
  }

  // Fallback to trade.quantity if no executions
  return trade.side === 'long' ? trade.quantity : -trade.quantity;
}

// Total shares/contracts traded across executions (all quantities positive)
function calculateTotalSharesTraded(trade) {
  if (trade.executions && Array.isArray(trade.executions) && trade.executions.length > 0) {
    let totalTraded = 0;
    trade.executions.forEach(execution => {
      const qty = parseFloat(execution.quantity) || 0;
      totalTraded += Math.abs(qty);
    });
    return totalTraded;
  }
  return trade.quantity || 0;
}

// Group open trades into positions. Returns a map of position key -> position
// with side/avgPrice resolved, zero-net positions removed, and position_key
// stamped on every surviving position.
function groupTradesIntoPositions(openTrades) {
  openTrades.forEach(enrichOptionMetadata);

  const positionMap = Object.create(null);
  openTrades.forEach(trade => {
    const posKey = getPositionKey(trade);

    if (!Object.hasOwn(positionMap, posKey)) {
      positionMap[posKey] = {
        symbol: trade.symbol,
        side: null, // Determined by net position below
        trades: [],
        totalQuantity: 0,        // Net position (shares still held)
        totalSharesTraded: 0,    // Total shares traded (all executions count positive)
        totalCost: 0,
        avgPrice: 0,
        instrumentType: trade.instrument_type || 'stock',
        contractSize: trade.contract_size || (trade.instrument_type === 'option' ? 100 : 1),
        pointValue: trade.point_value || null,
        // Option metadata for Alpaca pricing and frontend contract display
        underlying_symbol: trade.underlying_symbol || null,
        expiration_date: trade.expiration_date || null,
        option_type: trade.option_type || null,
        strike_price: trade.strike_price || null
      };
    }

    positionMap[posKey].trades.push(trade);

    const netPosition = calculateNetPosition(trade);
    positionMap[posKey].totalQuantity += netPosition;

    const sharesTraded = calculateTotalSharesTraded(trade);
    positionMap[posKey].totalSharesTraded += sharesTraded;

    // For cost calculation, account for multipliers (options use contract_size, futures use point_value)
    let costMultiplier;
    if (trade.instrument_type === 'future') {
      costMultiplier = trade.point_value || 1;
    } else if (trade.instrument_type === 'option') {
      costMultiplier = trade.contract_size || 100;
    } else {
      costMultiplier = 1;
    }
    positionMap[posKey].totalCost += Math.abs(netPosition) * trade.entry_price * costMultiplier;
  });

  // Heal-merge (last resort): option trades whose metadata could not be
  // derived are keyed by 'option:<symbol>'. Old CUSIP resolution rewrote some
  // option symbols to the underlying equity ticker, so try to fold those
  // fallback positions into a composite-keyed position for the same contract.
  // Never merge two composite positions (they are genuinely different
  // contracts).
  const fallbackKeys = new Set(
    Object.keys(positionMap).filter(key => key.startsWith(OPTION_FALLBACK_PREFIX))
  );

  for (const fbKey of fallbackKeys) {
    if (!positionMap[fbKey]) continue; // Already merged
    const fbPosition = positionMap[fbKey];
    const fbSymbol = String(fbPosition.symbol || '').trim().toUpperCase();

    // Merge only when exactly ONE composite contract matches; Schwab option
    // positions share the bare underlying as their symbol, so with multiple
    // contracts open on the same underlying we cannot tell which one the
    // metadata-less trade belongs to.
    const symbolMatches = Object.entries(positionMap).filter(([key, pos]) => {
      return key !== fbKey && !fallbackKeys.has(key) && pos.instrumentType === 'option'
        && String(pos.symbol || '').trim().toUpperCase() === fbSymbol;
    });
    let compositeMatch = symbolMatches.length === 1 ? symbolMatches[0] : null;

    // The fallback symbol may also be the underlying ticker (old CUSIP
    // rewrites stored it that way) - same exactly-one rule.
    if (!compositeMatch) {
      const underlyingMatches = Object.entries(positionMap).filter(([key, pos]) => {
        return key !== fbKey && !fallbackKeys.has(key) && pos.instrumentType === 'option'
          && String(pos.underlying_symbol || '').trim().toUpperCase() === fbSymbol;
      });
      if (underlyingMatches.length === 1) {
        compositeMatch = underlyingMatches[0];
      }
    }

    if (compositeMatch) {
      const [compositeKey, compositePosition] = compositeMatch;
      console.log(`[POSITION] Merging fallback position "${fbKey}" into composite position "${compositeKey}" (symbol: ${fbPosition.symbol})`);

      compositePosition.trades.push(...fbPosition.trades);
      compositePosition.totalQuantity += fbPosition.totalQuantity;
      compositePosition.totalSharesTraded += fbPosition.totalSharesTraded;
      compositePosition.totalCost += fbPosition.totalCost;

      // Fill in missing option metadata from the fallback position
      if (!compositePosition.underlying_symbol && fbPosition.underlying_symbol) compositePosition.underlying_symbol = fbPosition.underlying_symbol;
      if (!compositePosition.strike_price && fbPosition.strike_price) compositePosition.strike_price = fbPosition.strike_price;
      if (!compositePosition.expiration_date && fbPosition.expiration_date) compositePosition.expiration_date = fbPosition.expiration_date;
      if (!compositePosition.option_type && fbPosition.option_type) compositePosition.option_type = fbPosition.option_type;

      delete positionMap[fbKey];
    }
  }

  // Resolve side and average price; drop positions with zero net quantity
  const keysToDelete = [];
  Object.entries(positionMap).forEach(([key, position]) => {
    if (position.totalQuantity === 0) {
      keysToDelete.push(key);
      return;
    }

    position.side = position.totalQuantity > 0 ? 'long' : 'short';

    const absQuantity = Math.abs(position.totalQuantity);
    position.totalQuantity = absQuantity;

    // Multiplier from the first trade in the position (for avg price)
    const firstTrade = position.trades[0];
    let avgPriceMultiplier;
    if (firstTrade.instrument_type === 'future') {
      avgPriceMultiplier = firstTrade.point_value || 1;
    } else if (firstTrade.instrument_type === 'option') {
      avgPriceMultiplier = firstTrade.contract_size || 100;
    } else {
      avgPriceMultiplier = 1;
    }

    // avgPrice is per-share/per-contract, so divide by (quantity * multiplier)
    position.avgPrice = position.totalCost / (absQuantity * avgPriceMultiplier);
  });

  keysToDelete.forEach(key => delete positionMap[key]);

  Object.entries(positionMap).forEach(([key, position]) => {
    position.position_key = key;
  });

  return positionMap;
}

module.exports = {
  OPTION_FALLBACK_PREFIX,
  normalizeExpDate,
  enrichOptionMetadata,
  getPositionKey,
  calculateNetPosition,
  calculateTotalSharesTraded,
  groupTradesIntoPositions
};
