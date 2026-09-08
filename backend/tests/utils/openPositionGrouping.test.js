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
    expect(a).toBe('MRVL_65_2026-02-20_put|UNKNOWN');
  });

  test('different strikes produce different keys', () => {
    const a = getPositionKey(optionLeg({ strike_price: 65 }));
    const b = getPositionKey(optionLeg({ strike_price: 70 }));
    expect(a).not.toBe(b);
  });

  test('options without metadata get a namespaced fallback key, stocks keep plain symbol', () => {
    // Every key is suffixed with the currency the stored values are in, so one
    // symbol held in two currencies cannot collapse into a single position.
    const option = getPositionKey(optionLeg({ underlying_symbol: '', strike_price: null }));
    expect(option).toBe(`${OPTION_FALLBACK_PREFIX}MRVL|UNKNOWN`);

    const stock = getPositionKey({ symbol: 'MRVL', instrument_type: 'stock' });
    expect(stock).toBe('MRVL|UNKNOWN');

    const eurStock = getPositionKey({ symbol: 'MRVL', instrument_type: 'stock', original_currency: 'EUR' });
    expect(eurStock).toBe('MRVL|EUR');
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
    expect(positions['MRVL_65_2026-02-20_put|UNKNOWN'].totalQuantity).toBe(3);
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

    expect(positions['MRVL|UNKNOWN'].instrumentType).toBe('stock');
    expect(positions['MRVL|UNKNOWN'].totalQuantity).toBe(100);
    expect(positions[`${OPTION_FALLBACK_PREFIX}MRVL|UNKNOWN`].instrumentType).toBe('option');
  });

  test('heal-merge folds an unparseable fallback into the single matching contract', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', side: 'short', quantity: 2 }),
      optionLeg({ id: 'leg-2', symbol: 'MRVL', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 1 })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions['MRVL_65_2026-02-20_put|UNKNOWN'].totalQuantity).toBe(3);
  });

  test('heal-merge refuses ambiguous merges across multiple contracts', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', strike_price: 65 }),
      optionLeg({ id: 'leg-2', strike_price: 70 }),
      optionLeg({ id: 'leg-3', symbol: 'MRVL', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, quantity: 1 })
    ]);

    expect(Object.keys(positions)).toHaveLength(3);
    expect(positions[`${OPTION_FALLBACK_PREFIX}MRVL|UNKNOWN`]).toBeDefined();
  });

  test('two metadata-less legs sharing a symbol merge under one fallback key', () => {
    const positions = groupTradesIntoPositions([
      optionLeg({ id: 'leg-1', symbol: 'XYZ', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 1 }),
      optionLeg({ id: 'leg-2', symbol: 'XYZ', underlying_symbol: '', strike_price: null, expiration_date: null, option_type: null, side: 'short', quantity: 2 })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions[`${OPTION_FALLBACK_PREFIX}XYZ|UNKNOWN`].totalQuantity).toBe(3);
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
    const mrvl = positions['MRVL_65_2026-02-20_put|UNKNOWN'];
    expect(mrvl.side).toBe('short');
    expect(mrvl.totalQuantity).toBe(2);
    // totalCost = |net| * entry * contract_size = 2 * 1.5 * 100 = 300
    // avgPrice = totalCost / (qty * multiplier) = 300 / 200 = 1.5
    expect(mrvl.avgPrice).toBeCloseTo(1.5, 6);
  });
});

describe('position currency', () => {
  test('carries the trade currency onto the grouped position', () => {
    const positions = groupTradesIntoPositions([
      {
        id: 't1',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 100,
        instrument_type: 'stock',
        original_currency: 'EUR',
        executions: [{ action: 'buy', quantity: 10, price: 100 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBe('EUR');
  });

  test('leaves the currency null when the trade does not record one', () => {
    const positions = groupTradesIntoPositions([
      {
        id: 't2',
        symbol: 'EXCO',
        side: 'long',
        quantity: 1,
        entry_price: 50,
        instrument_type: 'stock',
        executions: [{ action: 'buy', quantity: 1, price: 50 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBeNull();
  });
});

describe('stored currency vs original_currency', () => {
  // A converted import stores USD and keeps the source currency in
  // original_currency, so the two disagree exactly when a conversion ran.
  test('reports USD for a converted import, not the source currency', () => {
    const positions = groupTradesIntoPositions([
      {
        id: 't3',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 150,
        instrument_type: 'stock',
        original_currency: 'EUR',
        exchange_rate: 1.5,
        original_entry_price_currency: 100,
        executions: [{ action: 'buy', quantity: 10, price: 150 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBe('USD');
  });

  test('reports the trade currency when nothing was converted', () => {
    const positions = groupTradesIntoPositions([
      {
        id: 't4',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 100,
        instrument_type: 'stock',
        original_currency: 'EUR',
        exchange_rate: 1,
        executions: [{ action: 'buy', quantity: 10, price: 100 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBe('EUR');
  });

  test('does not treat a non-1 exchange_rate as proof of conversion', () => {
    // A manual, API or OAuth-broker trade can carry a rate beside a price that
    // was never rewritten. Only the pre-conversion value proves a conversion.
    const positions = groupTradesIntoPositions([
      {
        id: 't7',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 100,
        instrument_type: 'stock',
        original_currency: 'EUR',
        exchange_rate: 1.5,
        executions: [{ action: 'buy', quantity: 10, price: 100 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBe('EUR');
  });

  test('does not read a null exchange_rate as USD', () => {
    // Number(null) is 0, which is not 1 — coercing first would call this
    // converted and label a EUR position in dollars.
    const positions = groupTradesIntoPositions([
      {
        id: 't8',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 100,
        instrument_type: 'stock',
        original_currency: 'EUR',
        exchange_rate: null,
        executions: [{ action: 'buy', quantity: 10, price: 100 }]
      }
    ]);

    expect(Object.values(positions)[0].currency).toBe('EUR');
  });

  test('separates one symbol held in two currencies into two positions', () => {
    const positions = groupTradesIntoPositions([
      {
        id: 't5',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 100,
        instrument_type: 'stock',
        original_currency: 'EUR',
        exchange_rate: 1,
        account_identifier: 'A',
        executions: [{ action: 'buy', quantity: 10, price: 100 }]
      },
      {
        id: 't6',
        symbol: 'EXCO.DE',
        side: 'long',
        quantity: 10,
        entry_price: 150,
        instrument_type: 'stock',
        original_currency: 'EUR',
        original_entry_price_currency: 100,
        account_identifier: 'B',
        executions: [{ action: 'buy', quantity: 10, price: 150 }]
      }
    ]);

    // Two positions, each with its own currency — never one group whose
    // totalCost adds euros to dollars.
    const grouped = Object.values(positions);
    expect(grouped).toHaveLength(2);
    expect(grouped.map(p => p.currency).sort()).toEqual(['EUR', 'USD']);
    grouped.forEach(position => expect(position.totalCost).toBeGreaterThan(0));
  });
});

describe('heal-merge respects currency', () => {
  const composite = (over = {}) => ({
    id: 'c1', symbol: 'MRVL', side: 'long', quantity: 1, entry_price: 100,
    instrument_type: 'option', underlying_symbol: 'MRVL', strike_price: 65,
    expiration_date: '2026-02-20', option_type: 'put',
    executions: [{ action: 'buy', quantity: 1, price: 100 }], ...over
  });
  const fallback = (over = {}) => ({
    id: 'f1', symbol: 'MRVL', side: 'long', quantity: 2, entry_price: 100,
    instrument_type: 'option',
    executions: [{ action: 'buy', quantity: 2, price: 100 }], ...over
  });

  test('does not fold a EUR fallback into a USD composite position', () => {
    const positions = groupTradesIntoPositions([
      composite({ original_currency: 'USD' }),
      fallback({ original_currency: 'EUR' })
    ]);

    // Merging would add EUR contracts into a USD position's totalCost.
    const grouped = Object.values(positions);
    expect(grouped).toHaveLength(2);
    expect(grouped.map(p => p.currency).sort()).toEqual(['EUR', 'USD']);
  });

  test('still folds a fallback into a composite of the same currency', () => {
    const positions = groupTradesIntoPositions([
      composite({ original_currency: 'USD' }),
      fallback({ original_currency: 'USD' })
    ]);

    expect(Object.keys(positions)).toHaveLength(1);
    expect(Object.values(positions)[0].totalQuantity).toBe(3);
  });
});
