

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

    // Lightspeed sequence numbers are execution-level identifiers and are more
    // reliable than trade numbers, which can span multiple fills.
    if (execution.sequenceNumber && existingExec.sequenceNumber) {
      return String(existingExec.sequenceNumber) === String(execution.sequenceNumber);
    }

    // Trade numbers alone are not unique enough for Lightspeed fills.
    // Only treat them as duplicates when the fill details also align.
    if (execution.tradeNumber && existingExec.tradeNumber) {
      const existingDatetime = existingExec.datetime || existingExec.entryTime;
      const existingPrice = existingExec.price ?? existingExec.entryPrice;
      const existingTime = existingDatetime ? new Date(existingDatetime).getTime() : NaN;
      const newTime = new Date(execution.datetime).getTime();

      if (String(existingExec.tradeNumber) !== String(execution.tradeNumber)) {
        return false;
      }

      return !isNaN(existingTime) &&
             !isNaN(newTime) &&
             Math.abs(existingTime - newTime) <= 1000 &&
             Number(existingExec.quantity) === Number(execution.quantity) &&
             Math.abs((existingPrice || 0) - (execution.price || 0)) < 0.01;
    }

    // Check by order ID if available (for Interactive Brokers)
    if (execution.orderId && existingExec.orderId) {
      return String(existingExec.orderId) === String(execution.orderId);
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
 * Check if an execution already exists using multiple candidate lookup keys.
 * This handles cases where IBKR returns a conid-based key but the DB trade
 * was imported via CSV under a composite key (e.g., AMGN_392.5_2026-03-13_call).
 * @param {Object} execution - The execution to check
 * @param {Array<String>} keys - Array of candidate lookup keys to try
 * @param {Object} context - Context object containing existingExecutions
 * @returns {boolean} - True if execution already exists under any key
 */
function isExecutionDuplicateMultiKey(execution, keys, context) {
  return keys.some(key => isExecutionDuplicate(execution, key, context));
}

module.exports = {
  isExecutionDuplicate,
  isExecutionDuplicateMultiKey
};
