jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const TradeVerificationService = require('../../src/services/tradeVerificationService');

function syncedTrade(overrides = {}) {
  return {
    id: 'trade-1',
    user_id: 'user-1',
    symbol: 'AAPL',
    underlying_symbol: null,
    side: 'long',
    entry_price: 230,
    exit_price: 240,
    quantity: 100,
    pnl: 985,
    pnl_percent: 4.35,
    r_value: 1.0,
    entry_time: '2026-06-05T13:20:00Z',
    exit_time: '2026-06-05T13:38:00Z',
    trade_date: '2026-06-05',
    instrument_type: 'stock',
    broker: 'schwab',
    broker_connection_id: 'conn-1',
    ...overrides
  };
}

describe('TradeVerificationService', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  describe('eligibility', () => {
    test('broker-synced closed trades are eligible', () => {
      expect(TradeVerificationService.isEligible(syncedTrade())).toBe(true);
    });

    test('manual and CSV trades are not eligible', () => {
      expect(TradeVerificationService.isEligible(syncedTrade({ broker_connection_id: null }))).toBe(false);
    });

    test('open trades are not eligible', () => {
      expect(TradeVerificationService.isEligible(syncedTrade({ exit_price: null, pnl: null }))).toBe(false);
    });
  });

  describe('verifyTrade', () => {
    test('issues a verification with a public code for an eligible trade', async () => {
      db.query.mockImplementation(async (sql) => {
        const query = String(sql);
        if (query.includes('FROM trades WHERE id')) return { rows: [syncedTrade()] };
        if (query.includes('SELECT * FROM trade_verifications WHERE trade_id')) return { rows: [] };
        if (query.includes('INSERT INTO trade_verifications')) {
          return {
            rows: [{
              public_code: 'abc123def456',
              status: 'broker_verified',
              created_at: '2026-06-09T00:00:00Z',
              show_amounts: false,
              revoked_at: null
            }]
          };
        }
        return { rows: [] };
      });

      const verification = await TradeVerificationService.verifyTrade('trade-1', 'user-1');
      expect(verification).toEqual({
        public_code: 'abc123def456',
        status: 'broker_verified',
        verified_at: '2026-06-09T00:00:00Z',
        show_amounts: false
      });

      const insertCall = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO trade_verifications'));
      // snapshot hash param is a 64-char sha256 hex digest
      expect(insertCall[1][4]).toMatch(/^[a-f0-9]{64}$/);
    });

    test('returns null for an ineligible trade and never writes', async () => {
      db.query.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM trades WHERE id')) {
          return { rows: [syncedTrade({ broker_connection_id: null })] };
        }
        return { rows: [] };
      });

      const verification = await TradeVerificationService.verifyTrade('trade-1', 'user-1');
      expect(verification).toBeNull();
      expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))).toBe(false);
    });
  });

  describe('getPublicVerification', () => {
    function verificationRow(tradeOverrides = {}, rowOverrides = {}) {
      const trade = syncedTrade(tradeOverrides);
      return {
        id: 'ver-1',
        public_code: 'abc123def456',
        status: 'broker_verified',
        snapshot_hash: TradeVerificationService.computeSnapshotHash(trade),
        show_amounts: false,
        created_at: '2026-06-09T00:00:00Z',
        revoked_at: null,
        broker: 'schwab',
        username: 'brennon',
        ...trade,
        ...rowOverrides
      };
    }

    test('valid verification exposes percent and R but not dollars by default', async () => {
      db.query.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM trade_verifications v')) return { rows: [verificationRow()] };
        return { rows: [] };
      });

      const payload = await TradeVerificationService.getPublicVerification('ABC123DEF456');
      expect(payload.status).toBe('broker_verified');
      expect(payload.symbol).toBe('AAPL');
      expect(payload.pnl_percent).toBeCloseTo(4.35);
      expect(payload.r_value).toBeCloseTo(1.0);
      expect(payload.is_win).toBe(true);
      expect(payload.pnl).toBeUndefined();
      expect(payload.quantity).toBeUndefined();
      expect(payload.entry_price).toBeUndefined();
    });

    test('show_amounts exposes dollars and size', async () => {
      db.query.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM trade_verifications v')) {
          return { rows: [verificationRow({}, { show_amounts: true })] };
        }
        return { rows: [] };
      });

      const payload = await TradeVerificationService.getPublicVerification('abc123def456');
      expect(payload.pnl).toBe(985);
      expect(payload.quantity).toBe(100);
    });

    test('an edited trade revokes the verification on read', async () => {
      // Hash was computed for exit 240; the live trade now says exit 999.
      const row = verificationRow();
      row.exit_price = 999;

      db.query.mockImplementation(async (sql) => {
        if (String(sql).includes('FROM trade_verifications v')) return { rows: [row] };
        return { rows: [] };
      });

      const payload = await TradeVerificationService.getPublicVerification('abc123def456');
      expect(payload.status).toBe('revoked');
      expect(db.query.mock.calls.some(([sql]) =>
        String(sql).includes('SET revoked_at = NOW()')
      )).toBe(true);
    });

    test('unknown code returns null', async () => {
      db.query.mockResolvedValue({ rows: [] });
      expect(await TradeVerificationService.getPublicVerification('nope')).toBeNull();
    });
  });
});
