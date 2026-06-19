jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const PropFirmService = require('../../src/services/propFirmService');

// Server-local calendar date string, built the same way the service builds it
// (local parts, not toISOString, to avoid UTC date shift)
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function profile(overrides = {}) {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    account_identifier: 'APEX-50K-1',
    label: 'Apex 50K eval',
    account_size: 50000,
    max_daily_loss: null,
    max_drawdown: null,
    drawdown_mode: 'static',
    profit_target: null,
    min_trading_days: null,
    start_date: '2026-06-01',
    is_active: true,
    ...overrides
  };
}

describe('PropFirmService.computeStatus', () => {
  describe('fresh eval (empty dailyRows)', () => {
    it('returns starting equity, on_track and zero trading days', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000, max_drawdown: 2000, profit_target: 3000 }),
        []
      );

      expect(status).toEqual({
        current_equity: 50000,
        total_pnl: 0,
        today_pnl: 0,
        daily_loss_remaining: 1000,
        drawdown_floor: 48000,
        distance_to_floor: 2000,
        high_water_equity: 50000,
        profit_target_progress: 0,
        trading_days: 0,
        min_trading_days_met: true,
        breaches: [],
        state: 'on_track'
      });
    });

    it('returns null rule fields when no rules are configured', () => {
      const status = PropFirmService.computeStatus(profile(), []);

      expect(status.daily_loss_remaining).toBeNull();
      expect(status.drawdown_floor).toBeNull();
      expect(status.distance_to_floor).toBeNull();
      expect(status.profit_target_progress).toBeNull();
      expect(status.state).toBe('on_track');
    });
  });

  describe('static drawdown', () => {
    it('keeps the floor fixed at account_size - max_drawdown regardless of new highs', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'static' }),
        [
          { trade_date: '2026-06-01', daily_pnl: 3000 },
          { trade_date: '2026-06-02', daily_pnl: -2500 }
        ]
      );

      expect(status.drawdown_floor).toBe(48000);
      expect(status.high_water_equity).toBe(53000);
      expect(status.current_equity).toBe(50500);
      expect(status.distance_to_floor).toBe(2500);
      expect(status.breaches).toEqual([]);
      expect(status.state).toBe('on_track');
    });

    it('flags a breach when closing equity dips below the static floor', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'static' }),
        [
          { trade_date: '2026-06-01', daily_pnl: -1500 },
          { trade_date: '2026-06-02', daily_pnl: -800 }
        ]
      );

      // Day 2 close: 50000 - 2300 = 47700, floor 48000 -> breach of -300
      expect(status.breaches).toEqual([
        { type: 'drawdown', trade_date: '2026-06-02', amount: -300 }
      ]);
      expect(status.state).toBe('breached');
    });
  });

  describe('trailing drawdown', () => {
    it('ratchets the floor with the high-water mark and breaches where static would not', () => {
      const rows = [
        { trade_date: '2026-06-01', daily_pnl: 3000 },  // equity 53000, floor -> 51000
        { trade_date: '2026-06-02', daily_pnl: -2500 }  // equity 50500 < 51000 -> breach
      ];

      const trailing = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'trailing' }),
        rows
      );
      const staticStatus = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'static' }),
        rows
      );

      expect(staticStatus.breaches).toEqual([]);
      expect(trailing.breaches).toEqual([
        { type: 'drawdown', trade_date: '2026-06-02', amount: -500 }
      ]);
      expect(trailing.drawdown_floor).toBe(51000);
      expect(trailing.distance_to_floor).toBe(-500);
      expect(trailing.state).toBe('breached');
    });

    it('never lowers the floor after a drawdown (high water sticks)', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'trailing' }),
        [
          { trade_date: '2026-06-01', daily_pnl: 3000 },  // HW 53000, floor 51000
          { trade_date: '2026-06-02', daily_pnl: -1500 }, // equity 51500, floor stays 51000
          { trade_date: '2026-06-03', daily_pnl: 500 }    // equity 52000, no new HW
        ]
      );

      expect(status.high_water_equity).toBe(53000);
      expect(status.drawdown_floor).toBe(51000);
      expect(status.distance_to_floor).toBe(1000);
      expect(status.breaches).toEqual([]);
    });

    it('collects every breach day, not just the first', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_drawdown: 1000, drawdown_mode: 'trailing' }),
        [
          { trade_date: '2026-06-01', daily_pnl: -1200 }, // equity 48800 < floor 49000 -> breach
          { trade_date: '2026-06-02', daily_pnl: 500 },   // equity 49300, recovered above floor
          { trade_date: '2026-06-03', daily_pnl: -400 }   // equity 48900 < floor 49000 -> breach
        ]
      );

      expect(status.breaches).toEqual([
        { type: 'drawdown', trade_date: '2026-06-01', amount: -200 },
        { type: 'drawdown', trade_date: '2026-06-03', amount: -100 }
      ]);
    });
  });

  describe('daily loss rule', () => {
    it('flags a breach with the day P&L as the amount when a day exceeds the limit', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000 }),
        [
          { trade_date: '2026-06-01', daily_pnl: -999 },
          { trade_date: '2026-06-02', daily_pnl: -1500.5 }
        ]
      );

      expect(status.breaches).toEqual([
        { type: 'daily_loss', trade_date: '2026-06-02', amount: -1500.5 }
      ]);
      expect(status.state).toBe('breached');
    });

    it('reduces daily_loss_remaining by today\'s loss', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000 }),
        [
          { trade_date: '2026-06-01', daily_pnl: -900 },
          { trade_date: todayLocal(), daily_pnl: -300 }
        ]
      );

      expect(status.today_pnl).toBe(-300);
      expect(status.daily_loss_remaining).toBe(700);
    });

    it('leaves the full limit available on a green day (gains do not extend it)', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000 }),
        [{ trade_date: todayLocal(), daily_pnl: 500 }]
      );

      expect(status.today_pnl).toBe(500);
      expect(status.daily_loss_remaining).toBe(1000);
    });

    it('reports today_pnl 0 and full headroom when there are no trades today', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000 }),
        [{ trade_date: '2020-01-02', daily_pnl: -800 }]
      );

      expect(status.today_pnl).toBe(0);
      expect(status.daily_loss_remaining).toBe(1000);
    });
  });

  describe('profit target progress', () => {
    it('rounds to one decimal and can exceed 100', () => {
      const status = PropFirmService.computeStatus(
        profile({ profit_target: 3000 }),
        [{ trade_date: '2026-06-01', daily_pnl: 3500 }]
      );

      expect(status.profit_target_progress).toBe(116.7);
    });

    it('floors negative progress at 0', () => {
      const status = PropFirmService.computeStatus(
        profile({ profit_target: 3000 }),
        [{ trade_date: '2026-06-01', daily_pnl: -500 }]
      );

      expect(status.profit_target_progress).toBe(0);
      expect(status.total_pnl).toBe(-500);
    });
  });

  describe('minimum trading days', () => {
    it('counts days with trades and reports whether the minimum is met', () => {
      const rows = [
        { trade_date: '2026-06-01', daily_pnl: 100 },
        { trade_date: '2026-06-02', daily_pnl: -50 },
        { trade_date: '2026-06-04', daily_pnl: 75 }
      ];

      const notMet = PropFirmService.computeStatus(profile({ min_trading_days: 5 }), rows);
      const met = PropFirmService.computeStatus(profile({ min_trading_days: 3 }), rows);

      expect(notMet.trading_days).toBe(3);
      expect(notMet.min_trading_days_met).toBe(false);
      expect(met.min_trading_days_met).toBe(true);
    });

    it('blocks the passed state until the minimum trading days are met', () => {
      const p = profile({ profit_target: 1000, min_trading_days: 2 });

      const oneDay = PropFirmService.computeStatus(p, [
        { trade_date: '2026-06-01', daily_pnl: 1500 }
      ]);
      const twoDays = PropFirmService.computeStatus(p, [
        { trade_date: '2026-06-01', daily_pnl: 1500 },
        { trade_date: '2026-06-02', daily_pnl: 50 }
      ]);

      expect(oneDay.state).toBe('on_track');
      expect(twoDays.state).toBe('passed');
    });
  });

  describe('state transitions', () => {
    it('warns when today\'s remaining daily loss headroom is within 25% of the limit', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000 }),
        [{ trade_date: todayLocal(), daily_pnl: -800 }]
      );

      expect(status.daily_loss_remaining).toBe(200);
      expect(status.state).toBe('warning');
    });

    it('warns when equity is within 25% of the drawdown floor', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_drawdown: 2000, drawdown_mode: 'static' }),
        [{ trade_date: '2026-06-01', daily_pnl: -1600 }]
      );

      // equity 48400, floor 48000 -> distance 400 <= 500 (25% of 2000)
      expect(status.distance_to_floor).toBe(400);
      expect(status.state).toBe('warning');
    });

    it('stays on_track when comfortably inside all limits', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000, max_drawdown: 2000, profit_target: 3000 }),
        [{ trade_date: '2026-06-01', daily_pnl: 250 }]
      );

      expect(status.state).toBe('on_track');
    });

    it('breached takes precedence over passed', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000, profit_target: 1000 }),
        [
          { trade_date: '2026-06-01', daily_pnl: -1500 },
          { trade_date: '2026-06-02', daily_pnl: 4000 }
        ]
      );

      expect(status.total_pnl).toBe(2500);
      expect(status.state).toBe('breached');
    });

    it('passed takes precedence over warning', () => {
      const status = PropFirmService.computeStatus(
        profile({ max_daily_loss: 1000, profit_target: 2000 }),
        [
          { trade_date: '2026-06-01', daily_pnl: 3000 },
          { trade_date: todayLocal(), daily_pnl: -900 }
        ]
      );

      // Headroom 100 (warning zone) but target hit with no breach -> passed
      expect(status.state).toBe('passed');
    });
  });

  describe('pg string inputs', () => {
    it('handles NUMERIC values delivered as strings (pg default parsing)', () => {
      const status = PropFirmService.computeStatus(
        profile({ account_size: '50000.00', max_daily_loss: '1000.00', max_drawdown: '2000.00' }),
        [{ trade_date: '2026-06-01', daily_pnl: '-1250.25' }]
      );

      expect(status.current_equity).toBe(48749.75);
      expect(status.breaches).toEqual([
        { type: 'daily_loss', trade_date: '2026-06-01', amount: -1250.25 }
      ]);
    });
  });
});

describe('PropFirmService CRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createProfile inserts with the expected params and defaults', async () => {
    const inserted = { id: 'profile-1', account_size: '50000.00', min_trading_days: null };
    db.query.mockResolvedValue({ rows: [inserted] });

    const result = await PropFirmService.createProfile('user-1', {
      account_identifier: 'TOPSTEP-50K',
      label: 'Topstep 50K eval',
      account_size: 50000,
      max_daily_loss: 1000,
      start_date: '2026-06-01'
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO account_rule_profiles');
    expect(params).toEqual([
      'user-1',          // user_id
      'TOPSTEP-50K',     // account_identifier
      'Topstep 50K eval',// label
      50000,             // account_size
      1000,              // max_daily_loss
      null,              // max_drawdown
      'static',          // drawdown_mode default
      null,              // profit_target
      null,              // min_trading_days
      '2026-06-01',      // start_date
      true               // is_active default
    ]);
    // NUMERIC strings from pg are normalized to numbers
    expect(result.account_size).toBe(50000);
  });

  it('createProfile maps unique violations (23505) to a meaningful 409 error', async () => {
    const dup = new Error('duplicate key value violates unique constraint');
    dup.code = '23505';
    db.query.mockRejectedValue(dup);

    await expect(
      PropFirmService.createProfile('user-1', {
        account_identifier: 'TOPSTEP-50K',
        account_size: 50000,
        start_date: '2026-06-01'
      })
    ).rejects.toMatchObject({
      code: '23505',
      statusCode: 409,
      message: 'A rule profile already exists for this account'
    });
  });

  it('updateProfile only touches the provided fields', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'profile-1' }] });

    await PropFirmService.updateProfile('profile-1', 'user-1', {
      max_daily_loss: 1250,
      is_active: false
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('UPDATE account_rule_profiles');
    const setClause = sql.match(/SET ([\s\S]*?)\s+WHERE/)[1];
    expect(setClause).toBe('max_daily_loss = $1, is_active = $2, updated_at = NOW()');
    expect(params).toEqual([1250, false, 'profile-1', 'user-1']);
  });

  it('updateProfile returns null when the profile is not owned by the user', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const result = await PropFirmService.updateProfile('profile-1', 'someone-else', {
      label: 'New label'
    });

    expect(result).toBeNull();
  });

  it('deleteProfile reports whether a row was removed', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });

    await expect(PropFirmService.deleteProfile('profile-1', 'user-1')).resolves.toBe(true);
    await expect(PropFirmService.deleteProfile('profile-1', 'user-1')).resolves.toBe(false);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('DELETE FROM account_rule_profiles');
    expect(params).toEqual(['profile-1', 'user-1']);
  });

  it('getStatusForProfile aggregates daily P&L with one query scoped to account and start date', async () => {
    db.query.mockResolvedValue({
      rows: [
        { trade_date: '2026-06-01', daily_pnl: '500.00' },
        { trade_date: '2026-06-02', daily_pnl: '-200.00' }
      ]
    });

    const status = await PropFirmService.getStatusForProfile(
      'user-1',
      profile({ account_identifier: 'APEX-50K-1', start_date: '2026-06-01' })
    );

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('SUM(pnl) AS daily_pnl');
    expect(sql).toContain('GROUP BY trade_date');
    expect(sql).toContain('pnl IS NOT NULL');
    expect(params).toEqual(['user-1', 'APEX-50K-1', '2026-06-01']);

    expect(status.total_pnl).toBe(300);
    expect(status.current_equity).toBe(50300);
    expect(status.trading_days).toBe(2);
  });
});
