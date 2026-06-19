jest.mock('../../src/config/database', () => {
  const query = jest.fn();
  // The client's query delegates to the shared pool mock so one
  // mockImplementation drives both, while __mockClient lets tests assert
  // which connection ran a statement.
  const client = {
    query: jest.fn((...args) => query(...args)),
    release: jest.fn()
  };
  return {
    query,
    connect: jest.fn(async () => client),
    __mockClient: client
  };
});

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

  test('groups staggered fills using rolling window (each leg within 5 min of the previous)', () => {
    // Iron condor with 4 legs filling ~4 minutes apart: total span is 12 min but each
    // consecutive gap is ≤ 5 min. A fixed-start window (old behaviour) would split
    // the cluster; the rolling window should group all 4 into one iron condor.
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000120', option_type: 'put',  side: 'long',  strike_price: 390, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000121', option_type: 'put',  side: 'short', strike_price: 395, entry_time: '2026-01-02T15:04:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000122', option_type: 'call', side: 'short', strike_price: 405, entry_time: '2026-01-02T15:08:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000123', option_type: 'call', side: 'long',  strike_price: 410, entry_time: '2026-01-02T15:12:00.000Z' })
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].detected_strategy).toBe('iron_condor');
    expect(groups[0].leg_count).toBe(4);
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
    // mockClear (not mockReset) keeps the delegate-to-db.query implementation.
    db.__mockClient.query.mockClear();
    db.__mockClient.release.mockClear();
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

  test('runs the write phase in a transaction on a single client', async () => {
    const legs = [
      leg({ id: '00000000-0000-4000-8000-000000000113', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000114', option_type: 'put', side: 'long', strike_price: 395 })
    ];

    db.query.mockImplementation(async (sql) => {
      const query = String(sql);
      if (query.includes('FROM trades') && query.includes("instrument_type = 'option'")) {
        return { rows: legs };
      }
      if (query.includes('INSERT INTO trade_position_groups')) {
        return { rows: [{ id: '00000000-0000-4000-8000-000000000902' }] };
      }
      return { rows: [] };
    });

    await OptionStrategyGroupingService.rebuildUserGroups('00000000-0000-4000-8000-000000000999');

    const clientCalls = db.__mockClient.query.mock.calls.map(([sql]) => String(sql));
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
    expect(clientCalls.some(sql => sql.includes('UPDATE trades SET position_group_id = NULL'))).toBe(true);
    expect(clientCalls.some(sql => sql.includes('INSERT INTO trade_position_groups'))).toBe(true);
    expect(clientCalls.some(sql => sql.includes('DELETE FROM trade_position_groups'))).toBe(true);
    // The trades SELECT stays on the pool so a connection is not held during detection.
    expect(clientCalls.some(sql => sql.includes("instrument_type = 'option'"))).toBe(false);
    expect(db.__mockClient.release).toHaveBeenCalledTimes(1);

    // manual_override was removed from the rebuild SELECT.
    const tradesSelect = db.query.mock.calls
      .map(([sql]) => String(sql))
      .find(sql => sql.includes("instrument_type = 'option'"));
    expect(tradesSelect).not.toContain('manual_override');
  });

  test('rolls back and releases the client when a write fails', async () => {
    const legs = [
      leg({ id: '00000000-0000-4000-8000-000000000115', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000116', option_type: 'put', side: 'long', strike_price: 395 })
    ];

    db.query.mockImplementation(async (sql) => {
      const query = String(sql);
      if (query.includes('FROM trades') && query.includes("instrument_type = 'option'")) {
        return { rows: legs };
      }
      if (query.includes('INSERT INTO trade_position_groups')) {
        throw new Error('insert failed');
      }
      return { rows: [] };
    });

    await expect(
      OptionStrategyGroupingService.rebuildUserGroups('00000000-0000-4000-8000-000000000999')
    ).rejects.toThrow('insert failed');

    const clientCalls = db.__mockClient.query.mock.calls.map(([sql]) => String(sql));
    expect(clientCalls).toContain('ROLLBACK');
    expect(clientCalls).not.toContain('COMMIT');
    expect(db.__mockClient.release).toHaveBeenCalledTimes(1);
  });
});

describe('OptionStrategyGroupingService cluster matching', () => {
  test('detects 12 interleaved iron condors in one 48-leg rolling cluster quickly', () => {
    // 12 iron condors whose legs fill 1 minute apart, condor after condor.
    // Every consecutive gap is 1 minute, so the rolling window chains all 48
    // legs into a single cluster. The old brute-force C(48,4) scan with
    // restarts would take far longer than the bound below.
    const legs = [];
    for (let k = 0; k < 12; k++) {
      const baseMinute = 4 * k;
      const condorLegs = [
        { option_type: 'put', side: 'long', strike_price: 300 + k },
        { option_type: 'put', side: 'short', strike_price: 310 + k },
        { option_type: 'call', side: 'short', strike_price: 400 + k },
        { option_type: 'call', side: 'long', strike_price: 410 + k }
      ];
      condorLegs.forEach((overrides, i) => {
        const minute = String(baseMinute + i).padStart(2, '0');
        legs.push(leg({
          id: `00000000-0000-4000-8000-0000000002${String(4 * k + i).padStart(2, '0')}`,
          ...overrides,
          entry_time: `2026-01-02T15:${minute}:00.000Z`
        }));
      });
    }

    const start = Date.now();
    const groups = OptionStrategyGroupingService.detectGroups(legs);
    const elapsed = Date.now() - start;

    expect(groups).toHaveLength(12);
    expect(groups.every(group => group.detected_strategy === 'iron_condor')).toBe(true);
    expect(groups.every(group => group.leg_count === 4)).toBe(true);
    const groupedIds = new Set(groups.flatMap(group => group.tradeIds));
    expect(groupedIds.size).toBe(48);
    expect(elapsed).toBeLessThan(2000);
  });

  test('mixed cluster keeps 4-leg priority and leaves a stray leg ungrouped', () => {
    const legs = [
      leg({ id: '00000000-0000-4000-8000-000000000301', option_type: 'put', side: 'long', strike_price: 390, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000302', option_type: 'put', side: 'short', strike_price: 395, entry_time: '2026-01-02T15:01:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000303', option_type: 'call', side: 'short', strike_price: 405, entry_time: '2026-01-02T15:02:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000304', option_type: 'call', side: 'long', strike_price: 410, entry_time: '2026-01-02T15:03:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000305', option_type: 'put', side: 'short', strike_price: 380, entry_time: '2026-01-02T15:04:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000306', option_type: 'put', side: 'long', strike_price: 375, entry_time: '2026-01-02T15:05:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000307', option_type: 'call', side: 'short', strike_price: 450, entry_time: '2026-01-02T15:06:00.000Z' })
    ];

    const groups = OptionStrategyGroupingService.detectGroups(legs);

    expect(groups).toHaveLength(2);
    const strategies = groups.map(group => group.detected_strategy).sort();
    expect(strategies).toEqual(['bull_put_spread', 'iron_condor']);
    const groupedIds = new Set(groups.flatMap(group => group.tradeIds));
    expect(groupedIds.has('00000000-0000-4000-8000-000000000307')).toBe(false);
  });

  test('detection is deterministic regardless of input order', () => {
    const legs = [
      leg({ id: '00000000-0000-4000-8000-000000000311', option_type: 'put', side: 'long', strike_price: 390, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000312', option_type: 'put', side: 'short', strike_price: 395, entry_time: '2026-01-02T15:01:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000313', option_type: 'call', side: 'short', strike_price: 405, entry_time: '2026-01-02T15:02:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000314', option_type: 'call', side: 'long', strike_price: 410, entry_time: '2026-01-02T15:03:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000315', option_type: 'put', side: 'short', strike_price: 380, entry_time: '2026-01-02T15:04:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000316', option_type: 'put', side: 'long', strike_price: 375, entry_time: '2026-01-02T15:05:00.000Z' })
    ];

    const normalize = groups => groups
      .map(group => ({ strategy: group.detected_strategy, ids: [...group.tradeIds].sort() }))
      .sort((a, b) => a.ids[0].localeCompare(b.ids[0]));

    const forward = OptionStrategyGroupingService.detectGroups(legs);
    const reversed = OptionStrategyGroupingService.detectGroups([...legs].reverse());

    expect(normalize(forward)).toEqual(normalize(reversed));
  });

  test('unknown same-expiration leftovers fall back to multi_leg_option', () => {
    const groups = OptionStrategyGroupingService.detectGroups([
      leg({ id: '00000000-0000-4000-8000-000000000321', option_type: 'put', side: 'short', strike_price: 390, entry_time: '2026-01-02T15:00:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000322', option_type: 'put', side: 'short', strike_price: 395, entry_time: '2026-01-02T15:01:00.000Z' }),
      leg({ id: '00000000-0000-4000-8000-000000000323', option_type: 'put', side: 'short', strike_price: 400, entry_time: '2026-01-02T15:02:00.000Z' })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].detected_strategy).toBe('multi_leg_option');
    expect(groups[0].strategy_confidence).toBe(70);
    expect(groups[0].leg_count).toBe(3);
  });
});

describe('OptionStrategyGroupingService.classifyOptionStrategy robustness', () => {
  test('drops malformed legs instead of crashing', () => {
    const classification = OptionStrategyGroupingService.classifyOptionStrategy([
      leg({ id: '00000000-0000-4000-8000-000000000331', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000332', option_type: 'put', side: 'long', strike_price: 395 }),
      leg({ id: '00000000-0000-4000-8000-000000000333', option_type: '' })
    ]);

    expect(classification.strategy).toBe('bull_put_spread');
    expect(classification.metadata.leg_ids).toHaveLength(2);
  });

  test('falls back to multi_leg_option when fewer than two legs normalize', () => {
    const classification = OptionStrategyGroupingService.classifyOptionStrategy([
      leg({ id: '00000000-0000-4000-8000-000000000334', option_type: 'put', side: 'short', strike_price: 400 }),
      leg({ id: '00000000-0000-4000-8000-000000000335', option_type: 'invalid' })
    ]);

    expect(classification.strategy).toBe('multi_leg_option');
  });
});
