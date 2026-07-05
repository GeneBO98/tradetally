jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/positionGrouping', () => ({
  isPositionGroupingEnabled: jest.fn()
}));

const db = require('../../src/config/database');
const { isPositionGroupingEnabled } = require('../../src/utils/positionGrouping');
const BehavioralAnalysisPositionService = require('../../src/services/behavioralAnalysisPositionService');

const USER_ID = '00000000-0000-4000-8000-000000000001';

function optionLeg(overrides = {}) {
  return {
    id: overrides.id || '00000000-0000-4000-8000-000000000101',
    symbol: 'SNOW250620P00100000',
    account_identifier: 'ACC1',
    underlying_symbol: 'SNOW',
    instrument_type: 'option',
    option_type: 'put',
    strike_price: 100,
    expiration_date: '2026-06-20',
    entry_time: '2026-06-01T14:30:00.000Z',
    exit_time: '2026-06-05T18:00:00.000Z',
    trade_date: '2026-06-01',
    entry_price: 2.5,
    exit_price: 1.2,
    quantity: 1,
    side: 'short',
    strategy: null,
    manual_override: false,
    commission: 1,
    fees: 0.5,
    pnl: 130,
    contract_size: 100,
    point_value: null,
    position_group_id: '00000000-0000-4000-8000-000000000201',
    group_detected_strategy: 'bull_put_spread',
    group_strategy_confidence: 95,
    persisted_leg_count: 2,
    ...overrides
  };
}

describe('BehavioralAnalysisPositionService.getCompletedPositions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('collapses multi-leg option groups when whole-trade grouping is enabled', async () => {
    isPositionGroupingEnabled.mockResolvedValue(true);
    db.query.mockResolvedValue({
      rows: [
        optionLeg({ id: '00000000-0000-4000-8000-000000000101', pnl: 130 }),
        optionLeg({
          id: '00000000-0000-4000-8000-000000000102',
          symbol: 'SNOW250620P00095000',
          strike_price: 95,
          side: 'long',
          pnl: -60,
          entry_price: 1.1,
          exit_price: 0.5
        })
      ]
    });

    const positions = await BehavioralAnalysisPositionService.getCompletedPositions(USER_ID);

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      symbol: 'SNOW',
      pnl: 70,
      position_grouped: true,
      leg_count: 2,
      group_detected_strategy: 'bull_put_spread',
      strategy: 'bull_put_spread',
      has_option_leg: true,
      position_risk: {
        amount: 360,
        basis: 'max_loss',
        confidence: 'high',
        is_approximate: false
      }
    });
    expect(positions[0].trade_ids).toEqual([
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102'
    ]);
  });

  test('keeps individual legs when whole-trade grouping is disabled', async () => {
    isPositionGroupingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({
      rows: [
        optionLeg({ id: '00000000-0000-4000-8000-000000000101', pnl: 130 }),
        optionLeg({ id: '00000000-0000-4000-8000-000000000102', pnl: -60 })
      ]
    });

    const positions = await BehavioralAnalysisPositionService.getCompletedPositions(USER_ID);

    expect(positions).toHaveLength(2);
    expect(positions.every(position => position.position_grouped === false)).toBe(true);
    expect(positions.map(position => position.pnl)).toEqual([130, -60]);
  });

  test('uses net debit as risk for long premium option positions', async () => {
    isPositionGroupingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({
      rows: [
        optionLeg({
          id: '00000000-0000-4000-8000-000000000301',
          side: 'long',
          option_type: 'call',
          strike_price: 100,
          entry_price: 3,
          quantity: 2,
          position_group_id: null,
          group_detected_strategy: null,
          persisted_leg_count: null
        })
      ]
    });

    const positions = await BehavioralAnalysisPositionService.getCompletedPositions(USER_ID);

    expect(positions[0].position_risk).toMatchObject({
      amount: 600,
      basis: 'net_debit',
      confidence: 'high',
      is_approximate: false
    });
  });

  test('marks undefined short call structures as approximate notional risk', async () => {
    isPositionGroupingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({
      rows: [
        optionLeg({
          id: '00000000-0000-4000-8000-000000000401',
          side: 'short',
          option_type: 'call',
          strike_price: 100,
          entry_price: 2,
          quantity: 1,
          position_group_id: null,
          group_detected_strategy: null,
          persisted_leg_count: null
        })
      ]
    });

    const positions = await BehavioralAnalysisPositionService.getCompletedPositions(USER_ID);

    expect(positions[0].position_risk).toMatchObject({
      amount: 200,
      basis: 'undefined_risk_notional',
      is_approximate: true
    });
  });

  test('uses stop-loss risk for non-option positions when available', async () => {
    isPositionGroupingEnabled.mockResolvedValue(false);
    db.query.mockResolvedValue({
      rows: [
        {
          ...optionLeg({
            id: '00000000-0000-4000-8000-000000000501',
            symbol: 'AAPL',
            underlying_symbol: null,
            instrument_type: 'stock',
            option_type: null,
            strike_price: null,
            expiration_date: null,
            side: 'long',
            entry_price: 100,
            stop_loss: 95,
            quantity: 10,
            position_group_id: null,
            group_detected_strategy: null,
            persisted_leg_count: null
          })
        }
      ]
    });

    const positions = await BehavioralAnalysisPositionService.getCompletedPositions(USER_ID);

    expect(positions[0].position_risk).toMatchObject({
      amount: 50,
      basis: 'stop_loss',
      confidence: 'high'
    });
  });
});
