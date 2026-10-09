/**
 * Equivalence tests for the indexed CSV-import duplicate detection
 * (src/utils/importDuplicateDetection.js).
 *
 * The oracle below is a verbatim copy of the ORIGINAL O(new x existing)
 * predicate that lived inline in trade.controller.js (the
 * `existingTrades.rows.some(...)` block), including its tradeData mutation
 * side effects. Every fixture (and a seeded randomized sweep) asserts that
 * the new index-based classifier produces the identical classification and
 * the identical update-target mutation.
 */

const {
  buildExistingTradeIndex,
  classifyImportTrade
} = require('../../src/utils/importDuplicateDetection');

// ---------------------------------------------------------------------------
// Oracle: verbatim port of the old inline predicate (logging removed).
// Returns { isDuplicate, tradeData } where tradeData carries the same
// isUpdate/existingTradeId/existingExecutions mutations the old loop applied.
// ---------------------------------------------------------------------------
function oracleClassify(tradeDataInput, existingRows) {
  const tradeData = clone(tradeDataInput);

  const isDuplicate = existingRows.some(existing => {
    // Parse existing executions if available
    let existingExecutions = [];
    if (existing.executions) {
      try {
        existingExecutions = typeof existing.executions === 'string'
          ? JSON.parse(existing.executions)
          : existing.executions;
      } catch (e) {
        existingExecutions = [];
      }
    }

    let tradeExecutionsToCheck = tradeData.executionData;
    if (!tradeExecutionsToCheck || tradeExecutionsToCheck.length === 0) {
      tradeExecutionsToCheck = [{
        datetime: tradeData.datetime,
        entryTime: tradeData.entryTime,
        exitTime: tradeData.exitTime,
        entryPrice: tradeData.entryPrice,
        quantity: tradeData.quantity,
        side: tradeData.side
      }];
    }

    const symbolsMatch = existing.symbol === tradeData.symbol;

    const newInstrumentType = tradeData.instrumentType || tradeData.instrument_type || 'stock';
    const existingInstrumentType = existing.instrument_type || 'stock';
    const instrumentTypesMatch = newInstrumentType === existingInstrumentType;

    const newConid = tradeData.conid;
    const existingConid = existing.conid;
    const conidMatch = newConid && existingConid && newConid === existingConid;

    const tradeTypesMatch = (symbolsMatch && instrumentTypesMatch) || conidMatch;

    if (tradeTypesMatch && tradeExecutionsToCheck && tradeExecutionsToCheck.length > 0 && existingExecutions.length > 0) {
      const newExecutionTimestamps = new Set(
        tradeExecutionsToCheck.map(exec => {
          const timestamp = exec.datetime || exec.entryTime;
          return timestamp ? new Date(timestamp).getTime() : null;
        }).filter(t => t !== null && !isNaN(t))
      );

      if (newExecutionTimestamps.size === 0) {
        // No valid timestamps found, skip timestamp matching
      } else {
        const matchingExecutionCount = existingExecutions.filter(exec => {
          const timestamp = exec.datetime || exec.entryTime;
          if (!timestamp) return false;
          const execTime = new Date(timestamp).getTime();
          return !isNaN(execTime) && newExecutionTimestamps.has(execTime);
        }).length;

        if (matchingExecutionCount > 0) {
          const newTradeExecCount = tradeExecutionsToCheck.length;
          const existingExecCount = existingExecutions.length;

          if (newTradeExecCount <= existingExecCount) {
            return true;
          } else {
            tradeData.isUpdate = true;
            tradeData.existingTradeId = existing.id;
            tradeData.existingExecutions = existingExecutions;
            return false;
          }
        }
      }
    }

    if (!tradeTypesMatch) {
      return false;
    }

    if (tradeData.exitPrice && existing.exit_price) {
      const entryMatch = Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01;
      const exitMatch = Math.abs(parseFloat(existing.exit_price) - parseFloat(tradeData.exitPrice)) < 0.01;
      const pnlMatch = Math.abs(parseFloat(existing.pnl || 0) - parseFloat(tradeData.pnl || 0)) < 0.01;
      const entryTimeMatch = Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000;

      return entryMatch && exitMatch && pnlMatch && entryTimeMatch;
    } else if (!tradeData.exitPrice && !existing.exit_price) {
      return (
        Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01 &&
        existing.quantity === tradeData.quantity &&
        existing.side === tradeData.side &&
        Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000
      );
    }
    return false;
  });

  return { isDuplicate, tradeData };
}

// New implementation, applying the same mutation the controller now applies.
function newClassify(tradeDataInput, existingRows) {
  const tradeData = clone(tradeDataInput);
  const index = buildExistingTradeIndex(existingRows);
  const result = classifyImportTrade(tradeData, index, null);
  if (!result.is_duplicate && result.update_target) {
    tradeData.isUpdate = true;
    tradeData.existingTradeId = result.update_target.id;
    tradeData.existingExecutions = result.update_target.executions;
  }
  return { isDuplicate: result.is_duplicate, tradeData };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Assert the new classifier matches the oracle for one (new trade, existing
 * rows) case. Mutations are only compared for non-duplicate outcomes: the
 * old loop `continue`d on duplicates, so any mutation it left on a skipped
 * tradeData was unobservable.
 */
function expectEquivalent(tradeData, existingRows, label) {
  const oracle = oracleClassify(tradeData, existingRows);
  const actual = newClassify(tradeData, existingRows);

  expect({ label, isDuplicate: actual.isDuplicate }).toEqual({ label, isDuplicate: oracle.isDuplicate });

  if (!oracle.isDuplicate) {
    expect({
      label,
      isUpdate: actual.tradeData.isUpdate,
      existingTradeId: actual.tradeData.existingTradeId,
      existingExecutions: actual.tradeData.existingExecutions
    }).toEqual({
      label,
      isUpdate: oracle.tradeData.isUpdate,
      existingTradeId: oracle.tradeData.existingTradeId,
      existingExecutions: oracle.tradeData.existingExecutions
    });
  }

  return oracle;
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------
let nextId = 1;
function existingRow(overrides = {}) {
  return {
    id: `existing-${nextId++}`,
    symbol: 'AAPL',
    entry_time: '2026-06-01T14:30:00.000Z',
    entry_price: '100.00000000',
    exit_price: '105.00000000',
    pnl: '500.00000000',
    quantity: '100.00000000',
    side: 'long',
    executions: null,
    instrument_type: 'stock',
    conid: null,
    ...overrides
  };
}

function newTrade(overrides = {}) {
  return {
    symbol: 'AAPL',
    entryTime: '2026-06-01T14:30:00.000Z',
    exitTime: '2026-06-01T15:30:00.000Z',
    entryPrice: 100,
    exitPrice: 105,
    pnl: 500,
    quantity: 100,
    side: 'long',
    instrumentType: 'stock',
    ...overrides
  };
}

function exec(datetime, extras = {}) {
  return { datetime, quantity: 50, price: 100, ...extras };
}

describe('importDuplicateDetection equivalence with the original predicate', () => {
  test('execution-level duplicate: same timestamps, same count', () => {
    const rows = [existingRow({
      executions: JSON.stringify([exec('2026-06-01T14:30:00.000Z'), exec('2026-06-01T15:30:00.000Z')])
    })];
    const trade = newTrade({
      executionData: [exec('2026-06-01T14:30:00.000Z'), exec('2026-06-01T15:30:00.000Z')]
    });
    const oracle = expectEquivalent(trade, rows, 'exec dup');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('partial close: new trade has MORE executions -> update, not duplicate', () => {
    const rows = [existingRow({
      executions: [exec('2026-06-01T14:30:00.000Z'), exec('2026-06-01T15:00:00.000Z')]
    })];
    const trade = newTrade({
      executionData: [
        exec('2026-06-01T14:30:00.000Z'),
        exec('2026-06-01T15:00:00.000Z'),
        exec('2026-06-01T15:45:00.000Z')
      ]
    });
    const oracle = expectEquivalent(trade, rows, 'partial close');
    expect(oracle.isDuplicate).toBe(false);
    expect(oracle.tradeData.isUpdate).toBe(true);
    expect(oracle.tradeData.existingTradeId).toBe(rows[0].id);
  });

  test('same symbol, different times and prices -> not a duplicate', () => {
    const rows = [existingRow({
      executions: [exec('2026-06-01T14:30:00.000Z')],
      entry_price: '100.00000000',
      exit_price: '105.00000000'
    })];
    const trade = newTrade({
      entryTime: '2026-06-01T18:00:00.000Z',
      exitTime: '2026-06-01T19:00:00.000Z',
      entryPrice: 210.55,
      exitPrice: 212.4,
      pnl: 185,
      executionData: [exec('2026-06-01T18:00:00.000Z')]
    });
    const oracle = expectEquivalent(trade, rows, 'same symbol different trade');
    expect(oracle.isDuplicate).toBe(false);
  });

  test('price/pnl fallback: closed-trade match within tolerance', () => {
    // Existing trade has no stored executions -> falls to price/PnL logic.
    const rows = [existingRow({ executions: null })];
    const trade = newTrade({
      entryPrice: 100.004, // within 0.01
      exitPrice: 104.996,
      pnl: 500.005,
      entryTime: '2026-06-01T14:30:00.500Z' // within 1s
    });
    const oracle = expectEquivalent(trade, rows, 'fallback closed match');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('price/pnl fallback near-miss: pnl outside tolerance', () => {
    const rows = [existingRow({ executions: null })];
    const trade = newTrade({ pnl: 500.02 });
    const oracle = expectEquivalent(trade, rows, 'fallback near miss pnl');
    expect(oracle.isDuplicate).toBe(false);
  });

  test('price/pnl fallback near-miss: entry time 2s off', () => {
    const rows = [existingRow({ executions: null })];
    const trade = newTrade({ entryTime: '2026-06-01T14:30:02.000Z' });
    const oracle = expectEquivalent(trade, rows, 'fallback near miss time');
    expect(oracle.isDuplicate).toBe(false);
  });

  test('open-trade fallback: matches only with identical raw quantity value', () => {
    const rows = [existingRow({ executions: null, exit_price: null, quantity: 100 })];
    const openMatch = newTrade({ exitPrice: null, exitTime: null, quantity: 100 });
    const oracle = expectEquivalent(openMatch, rows, 'open match');
    expect(oracle.isDuplicate).toBe(true);

    // Old code compared quantity with strict === (string from PG vs number
    // from parser). Preserve that quirk exactly.
    const rowsStringQty = [existingRow({ executions: null, exit_price: null, quantity: '100.00000000' })];
    const oracleStrict = expectEquivalent(openMatch, rowsStringQty, 'open strict qty');
    expect(oracleStrict.isDuplicate).toBe(false);
  });

  test('instrument type mismatch: stock vs option on same underlying', () => {
    const rows = [existingRow({
      instrument_type: 'option',
      executions: [exec('2026-06-01T14:30:00.000Z')]
    })];
    const trade = newTrade({
      instrumentType: 'stock',
      executionData: [exec('2026-06-01T14:30:00.000Z')]
    });
    const oracle = expectEquivalent(trade, rows, 'instrument mismatch');
    expect(oracle.isDuplicate).toBe(false);
  });

  test('conid match bridges different symbols (CUSIP vs resolved ticker)', () => {
    const rows = [existingRow({
      symbol: '037833100', // unresolved CUSIP stored previously
      conid: 265598,
      executions: [exec('2026-06-01T14:30:00.000Z')]
    })];
    const trade = newTrade({
      symbol: 'AAPL',
      conid: 265598,
      executionData: [exec('2026-06-01T14:30:00.000Z')]
    });
    const oracle = expectEquivalent(trade, rows, 'conid bridge');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('executions stored as JSON string are parsed identically', () => {
    const rows = [existingRow({
      executions: JSON.stringify([exec('2026-06-01T14:30:00.000Z')])
    })];
    const trade = newTrade({ executionData: [exec('2026-06-01T14:30:00.000Z')] });
    const oracle = expectEquivalent(trade, rows, 'string executions');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('corrupt executions JSON falls back to price/PnL matching', () => {
    const rows = [existingRow({ executions: '{not-json' })];
    const trade = newTrade({});
    const oracle = expectEquivalent(trade, rows, 'corrupt executions');
    expect(oracle.isDuplicate).toBe(true); // matches on price/PnL fallback
  });

  test('invalid timestamps in new executions fall back to price/PnL matching', () => {
    const rows = [existingRow({ executions: [exec('2026-06-01T14:30:00.000Z')] })];
    const trade = newTrade({
      executionData: [{ datetime: 'garbage-not-a-date', quantity: 100, price: 100 }]
    });
    const oracle = expectEquivalent(trade, rows, 'invalid new timestamps');
    expect(oracle.isDuplicate).toBe(true); // via fallback price/PnL match
  });

  test('no executionData: synthetic execution from entry/exit fields matches by entry timestamp', () => {
    const rows = [existingRow({
      executions: [exec('2026-06-01T14:30:00.000Z'), exec('2026-06-01T15:30:00.000Z')]
    })];
    const trade = newTrade({}); // executionData undefined -> synthetic single execution
    const oracle = expectEquivalent(trade, rows, 'synthetic execution');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('mixed candidates: earlier partial-close target, later duplicate wins as duplicate', () => {
    const rows = [
      existingRow({ executions: [exec('2026-06-01T14:30:00.000Z')] }), // fewer execs -> update branch
      existingRow({
        executions: [
          exec('2026-06-01T14:30:00.000Z'),
          exec('2026-06-01T15:00:00.000Z'),
          exec('2026-06-01T15:30:00.000Z')
        ]
      }) // same count -> duplicate
    ];
    const trade = newTrade({
      executionData: [
        exec('2026-06-01T14:30:00.000Z'),
        exec('2026-06-01T15:00:00.000Z'),
        exec('2026-06-01T15:30:00.000Z')
      ]
    });
    const oracle = expectEquivalent(trade, rows, 'update then duplicate');
    expect(oracle.isDuplicate).toBe(true);
  });

  test('multiple partial-close candidates: LAST one in row order wins', () => {
    const rows = [
      existingRow({ executions: [exec('2026-06-01T14:30:00.000Z')] }),
      existingRow({ executions: [exec('2026-06-01T15:00:00.000Z')] })
    ];
    const trade = newTrade({
      executionData: [
        exec('2026-06-01T14:30:00.000Z'),
        exec('2026-06-01T15:00:00.000Z'),
        exec('2026-06-01T16:00:00.000Z')
      ]
    });
    const oracle = expectEquivalent(trade, rows, 'last update target wins');
    expect(oracle.isDuplicate).toBe(false);
    expect(oracle.tradeData.existingTradeId).toBe(rows[1].id);
  });

  test('row order is preserved when conid and symbol candidates interleave', () => {
    const dupExecs = [exec('2026-06-01T14:30:00.000Z')];
    const rows = [
      // Symbol matches but different instrument type; conid matches -> candidate via conid only
      existingRow({ symbol: 'AAPL', instrument_type: 'option', conid: 777, executions: [exec('2026-06-01T13:00:00.000Z')] }),
      // Symbol+type candidate
      existingRow({ symbol: 'AAPL', instrument_type: 'stock', executions: dupExecs })
    ];
    const trade = newTrade({ conid: 777, executionData: dupExecs });
    expectEquivalent(trade, rows, 'conid + symbol interleave');
  });

  // -------------------------------------------------------------------------
  // Seeded randomized sweep: hundreds of generated (new, existing) cases must
  // classify identically to the oracle.
  // -------------------------------------------------------------------------
  test('randomized sweep matches the oracle exactly', () => {
    let seed = 0xC0FFEE;
    const rand = () => {
      // xorshift32
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17; seed >>>= 0;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 0xFFFFFFFF;
    };
    const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];

    const symbols = ['AAPL', 'TSLA', 'SPY', 'INTC', '037833100'];
    const types = ['stock', 'option', 'future', undefined];
    const sides = ['long', 'short'];
    const baseTimes = [
      '2026-06-01T14:30:00.000Z',
      '2026-06-01T14:30:00.500Z',
      '2026-06-01T15:00:00.000Z',
      '2026-06-02T14:30:00.000Z'
    ];

    const makeExecs = () => {
      const count = Math.floor(rand() * 4); // 0..3
      const list = [];
      for (let i = 0; i < count; i++) {
        list.push(exec(pick(baseTimes), { quantity: Math.floor(rand() * 200) }));
      }
      return list;
    };

    const existingRows = [];
    for (let i = 0; i < 120; i++) {
      const execs = makeExecs();
      existingRows.push(existingRow({
        symbol: pick(symbols),
        instrument_type: pick(types),
        conid: rand() < 0.3 ? Math.floor(rand() * 5) + 1 : null,
        entry_time: pick(baseTimes),
        entry_price: (100 + Math.floor(rand() * 3) * 0.005).toFixed(8),
        exit_price: rand() < 0.2 ? null : (105 + Math.floor(rand() * 3) * 0.005).toFixed(8),
        pnl: (500 + Math.floor(rand() * 5) * 0.004).toFixed(8),
        quantity: rand() < 0.5 ? 100 : '100.00000000',
        side: pick(sides),
        executions: execs.length === 0 ? null : (rand() < 0.5 ? JSON.stringify(execs) : execs)
      }));
    }

    for (let i = 0; i < 400; i++) {
      const execs = makeExecs();
      const trade = newTrade({
        symbol: pick(symbols),
        instrumentType: pick(types),
        conid: rand() < 0.3 ? Math.floor(rand() * 5) + 1 : undefined,
        entryTime: pick(baseTimes),
        entryPrice: 100 + Math.floor(rand() * 3) * 0.005,
        exitPrice: rand() < 0.2 ? null : 105 + Math.floor(rand() * 3) * 0.005,
        pnl: 500 + Math.floor(rand() * 5) * 0.004,
        quantity: 100,
        side: pick(sides),
        executionData: execs.length === 0 ? undefined : execs
      });
      expectEquivalent(trade, existingRows, `random case ${i}`);
    }
  });
});
