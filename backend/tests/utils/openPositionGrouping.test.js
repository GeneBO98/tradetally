const {
  OPTION_FALLBACK_PREFIX,
  enrichOptionMetadata,
  getPositionKey,
  groupTradesIntoPositions
} = require('../../src/utils/openPositionGrouping');

function optionLeg(overrides = {}) {
  return {
    id: overrides.id || 'leg-1',
    symbol: 'MRVL',
    instrument_type: 'option',
    underlying_symbol: 'MRVL',
    strike_price: '65.0000',
    expiration_date: new Date('2026-02-20T00:00:00Z'),
    option_type: 'put',
    side: 'short',
    quantity: 2,
    entry_price: 1.5,
    contract_size: 100,
    executions: [],
    ...overrides
  };
}

describe('getPositionKey', () => {
  test('normalizes case, strike formatting, and date representation', () => {
    const a = getPositionKey(optionLeg({ underlying_symbol: 'mrvl ', strike_price: '65.0000', expiration_date: new Date('2026-02-20T00:00:00Z'), option_type: 'PUT' }));
    const b = getPositionKey(optionLeg({ underlying_symbol: 'MRVL', strike_price: 65, expiration_date: '2026-02-20', option_type: 'put' }));

    expect(a).toBe(b);
    expect(a).toBe('MRVL_65_2026-02-20_put');
  });

  test('different strikes produce different keys', () => {
    const a = getPositionKey(optionLeg({ strike_price: 65 }));
    const b = getPositionKey(optionLeg({ strike_price: 70 }));
    expect(a).not.toBe(b);
  });

  test('options without metadata get a namespaced fallback key, stocks keep plain symbol', () => {
    const option = getPositionKey(optionLeg({ underlying_symbol: '', strike_price: null }));
    expect(option).toBe(`${OPTION_FALLBACK_PREFIX}MRVL`);

    const stock = getPositionKey({ symbol: 'MRVL', instrument_type: 'stock' });
    expect(stock).toBe('MRVL');
  });
});

describe('enrichOptionMetadata', () => {
  test('parses OCC symbols to fill missing fields without overwriting', () => {
    const trade = optionLeg({
      symbol: 'MRVL260220P00065000',
      underlying_symbol: '',
      strike_price: null,
      expiration_date: null,
      option_type: null
    });

    enrichOptionMetadata(trade);

    expect(trade.underlying_symbol).toBe('MRVL');
    expect(trade.strike_price).toBe(65);
    expect(trade.expiration_date).toBe('2026-02-20');
    expect(trade.option_type).toBe('put');
  });

  test('keeps existing fields and uppercases underlying', () => {
    const trade = optionLeg({
      symbol: 'MRVL260220P00065000',
      underlying_symbol: 'mrvl',
      strike_price: '70.0000'
    });

    enrichOptionMetadata(trade);

    expect(trade.underlying_symbol).toBe('MRVL');
    expect(trade.strike_price).toBe('70.0000');
  });

  test('leaves unparseable symbols alone', () => {
    const trade = optionLeg({ symbol: 'MRVL', underlying_symbol: '', strike_price: null });
    enrichOptionMetadata(trade);
    expect(trade.underlying_symbol).toBe('');
    expect(trade.strike_price).toBeNull();
  });
});

describe('groupTradesIntoPositions', () => {
  test('groups legs of the same contract despite formatting differences', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', underlying_symbol: 'MRVL', strike_price: '65.0000', side: 'short', quantity: 2 }),
      optionLeg({ id: 'leg-2', underlying_symbol: 'mrvl', strike_price: 65, expiration_date: '2026-02-20', side: 'short', quantity: 1 })
    ]);

    const keys = Object.keys(positions);
    expect(keys).toHaveLength(1);
    expect(positions[keys[0]].totalQuantity).toBe(3);
    expect(positions[keys[0]].side).toBe('short');
    expect(positions[keys[0]].position_key).toBe(keys[0]);
  });

  test('an OCC-symbol leg with missing metadata joins the composite position', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', side: 'short', quantity: 2 }),
      optionLeg({
        id: 'leg-2',
        symbol: 'MRVL260220P00065000',
        underlying_symbol: '',
        strike_price: null,
        expiration_date: null,
        option_type: null,
        side: 'short',
        quantity: 1
      })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions['MRVL_65_2026-02-20_put'].totalQuantity).toBe(3);
  });

  test('different contracts on the same underlying stay separate with distinct keys', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', strike_price: 65 }),
      optionLeg({ id: 'leg-2', strike_price: 70 })
    ]);

    const keys = Object.keys(positions);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(positions[keys[0]].position_key).not.toBe(positions[keys[1]].position_key);
  });

  test('a metadata-less option never pollutes the stock position on the same symbol', () => {
    const positions = groupTradesIntoPositions([
      { id: 'stock-1', symbol: 'MRVL', instrument_type: 'stock', side: 'long', quantity: 100, entry_price: 60, executions: [] },
      optionLeg({ id: 'opt-1', symbol: 'MRVL', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, quantity: 1 })
    ]);

    expect(positions['MRVL'].instrumentType).toBe('stock');
    expect(positions['MRVL'].totalQuantity).toBe(100);
    expect(positions[`${OPTION_FALLBACK_PREFIX}MRVL`].instrumentType).toBe('option');
  });

  test('heal-merge folds an unparseable fallback into the single matching contract', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', side: 'short', quantity: 2 }),
      optionLeg({ id: 'leg-2', symbol: 'MRVL', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 1 })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions['MRVL_65_2026-02-20_put'].totalQuantity).toBe(3);
  });

  test('heal-merge refuses ambiguous merges across multiple contracts', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', strike_price: 65 }),
      optionLeg({ id: 'leg-2', strike_price: 70 }),
      optionLeg({ id: 'leg-3', symbol: 'MRVL', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, quantity: 1 })
    ]);

    expect(Object.keys(positions)).toHaveLength(3);
    expect(positions[`${OPTION_FALLBACK_PREFIX}MRVL`]).toBeDefined();
  });

  test('two metadata-less legs sharing a symbol merge under one fallback key', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', symbol: 'XYZ', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 1 }),
      optionLeg({ id: 'leg-2', symbol: 'XYZ', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 2 })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions[`${OPTION_FALLBACK_PREFIX}XYZ`].totalQuantity).toBe(3);
  });

  test('removes zero-net positions and computes avgPrice with the contract multiplier', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', side: 'short', quantity: 2, entry_price: 1.5 }),
      optionLeg({ id: 'closed-1', symbol: 'AAPL', underlying_symbol: 'AAPL', strike_price: 150, side: 'long', quantity: 1, executions: [
        { entryPrice: 2, exitPrice: 3, quantity: 1 }
      ] })
    ]);

    // The AAPL position nets to zero via its closed round-trip execution.
    expect(Object.keys(positions)).toHaveLength(1);
    const mrvl = positions['MRVL_65_2026-02-20_put'];
    expect(mrvl.side).toBe('short');
    expect(mrvl.totalQuantity).toBe(2);
    // totalCost = |net| * entry * contract_size = 2 * 1.5 * 100 = 300
    // avgPrice = totalCost / (qty * multiplier) = 300 / 200 = 1.5
    expect(mrvl.avgPrice).toBeCloseTo(1.5, 6);
  });
});
