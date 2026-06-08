jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const OptionStrategyGroupingService = require('../../src/services/optionStrategyGroupingService');

function leg(overrides = {}) {
  return {
    id: overrides.id || `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}`,
    symbol: 'SPY',
    underlying_symbol: 'SPY',
    instrument_type: 'option',
    expiration_date: '2026-01-16',
    option_type: 'put',
    strike_price: 400,
    side: 'short',
    quantity: 1,
    account_identifier: 'ACC1',
    trade_date: '2026-01-02',
    entry_time: '2026-01-02T15:00:00.000Z',
    exit_time: '2026-01-03T15:00:00.000Z',
    pnl: 10,
    commission: 0.65,
    fees: 0.05,
    ...overrides
  };
}

describe('OptionStrategyGroupingService.classifyOptionStrategy', () => {
  test.each([
    ['bull_put_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000001', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000002', option_type: 'put', side: 'long', strike_price: 395 })
    ]],
    ['bear_put_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000003', option_type: 'put', side: 'long', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000004', option_type: 'put', side: 'short', strike_price: 395 })
    ]],
    ['bull_call_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000005', option_type: 'call', side: 'long', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000006', option_type: 'call', side: 'short', strike_price: 405 })
    ]],
    ['bear_call_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000007', option_type: 'call', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000008', option_type: 'call', side: 'long', strike_price: 405 })
    ]],
    ['long_straddle', [
      leg({ id: '00000000-0000-4000-8000-000000000009', option_type: 'call', side: 'long', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000010', option_type: 'put', side: 'long', strike_price: 400 })
    ]],
    ['short_straddle', [
      leg({ id: '00000000-0000-4000-8000-000000000011', option_type: 'call', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000012', option_type: 'put', side: 'short', strike_price: 400 })
    ]],
    ['long_strangle', [
      leg({ id: '00000000-0000-4000-8000-000000000013', option_type: 'call', side: 'long', strike_price: 405 }),
      leg({ id: '00000000-0000-4000-8000-000000000014', option_type: 'put', side: 'long', strike_price: 395 })
    ]],
    ['short_strangle', [
      leg({ id: '00000000-0000-4000-8000-000000000015', option_type: 'call', side: 'short', strike_price: 405 }),
      leg({ id: '00000000-0000-4000-8000-000000000016', option_type: 'put', side: 'short', strike_price: 395 })
    ]],
    ['calendar_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000017', option_type: 'call', side: 'long', strike_price: 400, expiration_date: '2026-02-20' }),
      leg({ id: '00000000-0000-4000-8000-000000000018', option_type: 'call', side: 'short', strike_price: 400, expiration_date: '2026-01-16' })
    ]],
    ['diagonal_spread', [
      leg({ id: '00000000-0000-4000-8000-000000000019', option_type: 'call', side: 'long', strike_price: 405, expiration_date: '2026-02-20' }),
      leg({ id: '00000000-0000-4000-8000-000000000020', option_type: 'call', side: 'short', strike_price: 400, expiration_date: '2026-01-16' })
    ]]
  ])('classifies %s', (expectedStrategy, legs) => {
    const classification = OptionStrategyGroupingService.classifyOptionStrategy(legs);
    expect(classification.strategy).toBe(expectedStrategy);
    expect(classification.confidence).toBe(95);
    expect(classification.metadata.leg_ids).toHaveLength(2);
  });

  test('classifies iron condor', () => {
    const classification = OptionStrategyGroupingService.classifyOptionStrategy([
      leg({ id: '00000000-0000-4000-8000-000000000021', option_type: 'put', side: 'long', strike_price: 390 }),
      leg({ id: '00000000-0000-4000-8000-000000000022', option_type: 'put', side: 'short', strike_price: 395 }),
      leg({ id: '00000000-0000-4000-8000-000000000023', option_type: 'call', side: 'short', strike_price: 405 }),
      leg({ id: '00000000-0000-4000-8000-000000000024', option_type: 'call', side: 'long', strike_price: 410 })
    ]);
    expect(classification.strategy).toBe('iron_condor');
  });

  test('classifies iron butterfly', () => {
    const classification = OptionStrategyGroupingService.classifyOptionStrategy([
      leg({ id: '00000000-0000-4000-8000-000000000025', option_type: 'put', side: 'long', strike_price: 390 }),
      leg({ id: '00000000-0000-4000-8000-000000000026', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000027', option_type: 'call', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000028', option_type: 'call', side: 'long', strike_price: 410 })
    ]);
    expect(classification.strategy).toBe('iron_butterfly');
  });
});

describe('OptionStrategyGroupingService.detectGroups', () => {
  test('groups exact entry times', () => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000101', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000102', option_type: 'put', side: 'long', strike_price: 395 })
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].detected_strategy).toBe('bull_put_spread');
  });

  test('groups entry times within five minutes', () => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000103', option_type: 'call', side: 'long', strike_price: 400, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000104', option_type: 'call', side: 'short', strike_price: 405, entry_time: '2026-01-02T15:04:59.000Z' })
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].detected_strategy).toBe('bull_call_spread');
  });

  test('does not group outside the time window', () => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000105', option_type: 'put', side: 'short', strike_price: 400, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000106', option_type: 'put', side: 'long', strike_price: 395, entry_time: '2026-01-02T15:05:01.000Z' })
    ]);
    expect(groups).toHaveLength(0);
  });

  test.each([
    ['different account', { account_identifier: 'ACC2' }],
    ['different underlying', { underlying_symbol: 'QQQ', symbol: 'QQQ' }],
    ['different trade date', { trade_date: '2026-01-03', entry_time: '2026-01-03T15:00:00.000Z' }],
    ['unequal quantity', { quantity: 2 }]
  ])('does not group legs with %s', (_label, secondOverrides) => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000107', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000108', option_type: 'put', side: 'long', strike_price: 395, ...secondOverrides })
    ]);
    expect(groups).toHaveLength(0);
  });

  test('does not group different expirations', () => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000109', option_type: 'put', side: 'short', strike_price: 400, expiration_date: '2026-01-16' }),
      leg({ id: '00000000-0000-4000-8000-000000000110', option_type: 'call', side: 'long', strike_price: 395, expiration_date: '2026-02-20' })
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe('OptionStrategyGroupingService.rebuildUserGroups', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  test('updates an existing group when the same legs are detected again', async () => {
    const existingGroupId = '00000000-0000-4000-8000-000000000901';
    const legs = [
      leg({ id: '00000000-0000-4000-8000-000000000111', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000112', option_type: 'put', side: 'long', strike_price: 395 })
    ];

    db.query.mockImplementation(async (sql) => {
      const query = String(sql);
      if (query.includes('FROM trades') && query.includes("instrument_type = 'option'")) {
        return { rows: legs };
      }
      if (query.includes('FROM trade_position_groups tpg')) {
        return { rows: [{ id: existingGroupId, trade_ids: legs.map(existingLeg => existingLeg.id) }] };
      }
      if (query.includes('UPDATE trade_position_groups')) {
        return { rows: [{ id: existingGroupId }] };
      }
      if (query.includes('INSERT INTO trade_position_groups')) {
        throw new Error('unexpected insert');
      }
      return { rows: [] };
    });

    const result = await OptionStrategyGroupingService.rebuildUserGroups('00000000-0000-4000-8000-000000000999');

    expect(result).toEqual({ groupsCreated: 1, legsGrouped: 2 });
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO trade_position_groups'))).toBe(false);
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE trade_position_groups'))).toBe(true);
  });
});
