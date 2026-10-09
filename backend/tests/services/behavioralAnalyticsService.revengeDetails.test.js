jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/tierService', () => ({
  hasFeatureAccess: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const BehavioralAnalyticsService = require('../../src/services/behavioralAnalyticsService');

describe('BehavioralAnalyticsService revenge detail rows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.hasFeatureAccess.mockResolvedValue(true);
  });

  test('uses grouped position totals for revenge P&L details and exposes cross-symbol qualifier', async () => {
    const triggerId = '00000000-0000-4000-8000-000000000101';
    const revengeId = '00000000-0000-4000-8000-000000000201';

    db.query.mockImplementation(async (sql) => {
      const text = String(sql);

      if (text.includes('SELECT COUNT(*) as total_count')) {
        return { rows: [{ total_count: 1 }] };
      }

      if (text.includes('FROM revenge_trading_events rte') && text.includes('ORDER BY created_at DESC')) {
        return {
          rows: [{
            id: 'event-1',
            trigger_trade_id: triggerId,
            revenge_trades: [revengeId],
            total_additional_loss: -544.39,
            risk_basis: {
              revenge: [{
                id: revengeId,
                symbol: 'APP',
                cross_symbol_qualifier: 'same_sector',
                risk_escalation_eligible: false,
                position_risk: {
                  amount: 5400,
                  basis: 'max_loss'
                }
              }]
            },
            outcome_type: 'profit'
          }]
        };
      }

      if (text.includes('COALESCE(tpg.total_commission, t.commission) as commission')) {
        return {
          rows: [{
            id: triggerId,
            symbol: 'SOXL',
            pnl: -860.65
          }]
        };
      }

      if (text.includes('SELECT id, COALESCE(NULLIF(underlying_symbol')) {
        return {
          rows: [{
            id: triggerId,
            symbol: 'SOXL'
          }]
        };
      }

      if (text.includes('WITH revenge_trade_details AS')) {
        return {
          rows: [{
            trade_id: revengeId,
            symbol: 'APP',
            pnl: 544.39,
            gross_pnl: 556.16,
            return_percent: 10.08,
            total_cost: 5400,
            total_fees: 11.77,
            return_basis: 'grouped_position'
          }]
        };
      }

      if (text.includes('COUNT(*) as total_events')) {
        return {
          rows: [{
            total_events: 1,
            loss_events: 0,
            profit_or_neutral_events: 1,
            pattern_broken_count: 0,
            cooling_period_used_count: 0,
            stale_event_count: 0
          }]
        };
      }

      return { rows: [] };
    });

    const result = await BehavioralAnalyticsService.getRevengeTradeAnalysis('user-1', {}, {});
    const revengeDetailQuery = db.query.mock.calls.find(([sql]) => String(sql).includes('WITH revenge_trade_details AS'))[0];
    const relatedPattern = result.events[0].related_patterns[0];

    expect(revengeDetailQuery).toContain('net_pnl + commission + fees as gross_pnl');
    expect(revengeDetailQuery).toContain('net_pnl / NULLIF(total_cost, 0)');
    expect(revengeDetailQuery).toContain('grouped.total_cost');
    expect(relatedPattern).toMatchObject({
      trade_id: revengeId,
      symbol: 'APP',
      pnl: 544.39,
      gross_pnl: 556.16,
      pattern_type: 'emotional_reactive_trading',
      cross_symbol_qualifier: 'same_sector',
      risk_escalation_eligible: false,
      position_risk: {
        amount: 5400,
        basis: 'max_loss'
      }
    });
    expect(relatedPattern.return_percent).toBeCloseTo(10.08, 2);
    expect(relatedPattern.return_basis).toBe('max_loss');
  });
});
