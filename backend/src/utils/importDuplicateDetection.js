/**
 * Duplicate detection for CSV trade imports.
 *
 * Extracted from the inline predicate in trade.controller.js so that:
 * 1. It can be unit tested against the original O(new x existing) logic.
 * 2. Existing trades are pre-processed ONCE into an index (executions parsed
 *    a single time per row) instead of per (new, existing) comparison pair.
 *
 * Matching semantics are intentionally IDENTICAL to the original predicate:
 * - A (new, existing) pair is only ever considered when
 *   (symbols match strictly AND instrument types match) OR conids match.
 *   The index keys on exactly those discriminators, so pairs that the old
 *   code short-circuited with `tradeTypesMatch === false` are simply never
 *   visited here.
 * - Candidates are evaluated in the original row order of the existing-trades
 *   query result, preserving `.some()` first-match/last-mutation behavior.
 */

function parseExecutions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  return raw;
}

function execTimestampMs(exec) {
  const timestamp = exec.datetime || exec.entryTime;
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  return isNaN(time) ? null : time;
}

function newTradeInstrumentType(tradeData) {
  return tradeData.instrumentType || tradeData.instrument_type || 'stock';
}

/**
 * Pre-process the existing-trades query rows into a lookup index.
 * Executions are parsed exactly once per row.
 *
 * @param {Array} rows - rows from the existing-trades SELECT (must include
 *   id, symbol, entry_time, entry_price, exit_price, pnl, quantity, side,
 *   executions, instrument_type, conid)
 * @returns {object} index for classifyImportTrade
 */
function buildExistingTradeIndex(rows) {
  // by_symbol: Map(symbol -> Map(instrument_type -> [entries in row order]))
  // Nested Maps keyed on RAW values preserve the strict === comparison the
  // original predicate used (including undefined === undefined).
  const bySymbol = new Map();
  // by_conid: Map(conid -> [entries in row order]) for truthy conids only.
  const byConid = new Map();

  rows.forEach((row, rowIndex) => {
    const executions = parseExecutions(row.executions);
    const execTimes = [];
    for (const exec of executions) {
      const time = execTimestampMs(exec);
      if (time !== null) execTimes.push(time);
    }

    const entry = { row, row_index: rowIndex, executions, exec_times: execTimes };

    const instrumentType = row.instrument_type || 'stock';
    let typeMap = bySymbol.get(row.symbol);
    if (!typeMap) {
      typeMap = new Map();
      bySymbol.set(row.symbol, typeMap);
    }
    let list = typeMap.get(instrumentType);
    if (!list) {
      list = [];
      typeMap.set(instrumentType, list);
    }
    list.push(entry);

    if (row.conid) {
      let conidList = byConid.get(row.conid);
      if (!conidList) {
        conidList = [];
        byConid.set(row.conid, conidList);
      }
      conidList.push(entry);
    }
  });

  return { by_symbol: bySymbol, by_conid: byConid, size: rows.length };
}

/**
 * Collect the candidate existing entries a new trade must be compared against:
 * exactly the rows where (symbolsMatch && instrumentTypesMatch) || conidMatch,
 * merged back into original row order.
 */
function getCandidates(index, tradeData) {
  const instrumentType = newTradeInstrumentType(tradeData);
  const typeMap = index.by_symbol.get(tradeData.symbol);
  const symbolCandidates = (typeMap && typeMap.get(instrumentType)) || [];

  const conid = tradeData.conid;
  const conidCandidates = conid ? (index.by_conid.get(conid) || []) : [];
  if (conidCandidates.length === 0) return symbolCandidates;

  const seen = new Set(symbolCandidates.map(entry => entry.row_index));
  const merged = symbolCandidates.concat(conidCandidates.filter(entry => !seen.has(entry.row_index)));
  merged.sort((a, b) => a.row_index - b.row_index);
  return merged;
}

/**
 * Build the per-new-trade context (execution list + timestamp set) once,
 * instead of once per comparison pair as the old inline code did.
 */
function buildNewTradeContext(tradeData) {
  // For trades without an executionData array (e.g. non-grouped single
  // trades), create a temporary execution from the trade's entry/exit fields.
  let executionsToCheck = tradeData.executionData;
  if (!executionsToCheck || executionsToCheck.length === 0) {
    executionsToCheck = [{
      datetime: tradeData.datetime,
      entryTime: tradeData.entryTime,
      exitTime: tradeData.exitTime,
      entryPrice: tradeData.entryPrice,
      quantity: tradeData.quantity,
      side: tradeData.side
    }];
  }

  const timestamps = new Set();
  for (const exec of executionsToCheck) {
    const time = execTimestampMs(exec);
    if (time !== null) timestamps.add(time);
  }

  return { executions_to_check: executionsToCheck, timestamps };
}

/**
 * Evaluate one (new trade, existing entry) pair. The caller guarantees the
 * symbol/instrument-type (or conid) gate already passed via the index.
 *
 * @returns {'duplicate'|'update'|'none'}
 */
function evaluateCandidate(tradeData, ctx, candidate, logger) {
  const existing = candidate.row;
  const existingExecutions = candidate.executions;
  const instrumentType = newTradeInstrumentType(tradeData);

  // Execution timestamp matching: the most precise duplicate detection.
  if (ctx.executions_to_check.length > 0 && existingExecutions.length > 0) {
    if (ctx.timestamps.size === 0) {
      if (logger) logger.logImport(`[DEBUG] No valid timestamps in new trade's executions, falling back to price/PnL matching`);
    } else {
      let matchingExecutionCount = 0;
      for (const time of candidate.exec_times) {
        if (ctx.timestamps.has(time)) matchingExecutionCount++;
      }

      if (matchingExecutionCount > 0) {
        const newTradeExecCount = ctx.executions_to_check.length;
        const existingExecCount = existingExecutions.length;

        if (newTradeExecCount <= existingExecCount) {
          // New trade has same or fewer executions - it's a duplicate.
          if (logger) logger.logImport(`Found duplicate based on execution timestamp match for ${tradeData.symbol} ${instrumentType} (${matchingExecutionCount} matching, new: ${newTradeExecCount}, existing: ${existingExecCount})`);
          return 'duplicate';
        }

        // New trade has MORE executions - this is an UPDATE, not a duplicate.
        if (logger) logger.logImport(`[PARTIAL CLOSE] Trade ${tradeData.symbol} has ${newTradeExecCount} executions vs ${existingExecCount} existing - NOT marking as duplicate (has additional data)`);
        return 'update';
      }
    }
  }

  // Fallback logic for trades without matching execution data.
  // For closed trades, check entry, exit, and P/L (with entry time within 1s).
  if (tradeData.exitPrice && existing.exit_price) {
    const entryMatch = Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01;
    const exitMatch = Math.abs(parseFloat(existing.exit_price) - parseFloat(tradeData.exitPrice)) < 0.01;
    const pnlMatch = Math.abs(parseFloat(existing.pnl || 0) - parseFloat(tradeData.pnl || 0)) < 0.01;
    const entryTimeMatch = Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000;

    return (entryMatch && exitMatch && pnlMatch && entryTimeMatch) ? 'duplicate' : 'none';
  }

  // For open trades, check entry price, quantity, side, and exact entry time.
  if (!tradeData.exitPrice && !existing.exit_price) {
    const isMatch = (
      Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01 &&
      existing.quantity === tradeData.quantity &&
      existing.side === tradeData.side &&
      Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000
    );
    return isMatch ? 'duplicate' : 'none';
  }

  return 'none';
}

/**
 * Classify a parsed import trade against the pre-built index of existing
 * trades.
 *
 * Semantics match the original `existingTrades.rows.some(...)` predicate:
 * - Returns is_duplicate=true when any candidate matches as a duplicate
 *   (first match in row order wins, iteration stops).
 * - update_target carries the id/executions of the LAST candidate (in row
 *   order, before any duplicate match) that matched the partial-close branch
 *   (new trade has more executions than the existing one). The caller should
 *   set tradeData.isUpdate/existingTradeId/existingExecutions from it when
 *   the trade is not a duplicate.
 *
 * @returns {{ is_duplicate: boolean, update_target: null|{ id: any, executions: Array } }}
 */
function classifyImportTrade(tradeData, index, logger) {
  const ctx = buildNewTradeContext(tradeData);
  const candidates = getCandidates(index, tradeData);

  let updateTarget = null;
  for (const candidate of candidates) {
    const verdict = evaluateCandidate(tradeData, ctx, candidate, logger);
    if (verdict === 'duplicate') {
      return { is_duplicate: true, update_target: updateTarget };
    }
    if (verdict === 'update') {
      updateTarget = { id: candidate.row.id, executions: candidate.executions };
    }
  }

  return { is_duplicate: false, update_target: updateTarget };
}

module.exports = {
  buildExistingTradeIndex,
  classifyImportTrade,
  // Exported for unit tests
  getCandidates,
  buildNewTradeContext,
  evaluateCandidate
};
