jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/services/behavioralAnalyticsService', () => ({}));
jest.mock('../../src/services/behavioralAnalyticsServiceV2', () => ({}));
jest.mock('../../src/services/overconfidenceAnalyticsService', () => ({}));
jest.mock('../../src/services/lossAversionAnalyticsService', () => ({}));
jest.mock('../../src/services/tradingPersonalityService', () => ({}));
jest.mock('../../src/services/revengeTradeDetector', () => ({}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/services/tickDataService', () => ({}));

const behavioralAnalyticsController = require('../../src/controllers/behavioralAnalytics.controller');

describe('behavioralAnalyticsController.calculateOverallRisk', () => {
  test('uses event count, size escalation, cooling-period gap, and revenge pattern severity', () => {
    const risk = behavioralAnalyticsController.calculateOverallRisk(
      {
        patterns: [
          {
            pattern_type: 'same_symbol_revenge',
            high_severity_count: '1',
            medium_severity_count: '2'
          },
          {
            pattern_type: 'emotional_reactive_trading',
            high_severity_count: '0',
            medium_severity_count: '1'
          }
        ]
      },
      {
        statistics: {
          total_events: '15',
          loss_rate: '33.3',
          avg_size_increase: '286.07',
          cooling_period_usage_rate: '0'
        }
      }
    );

    expect(risk.score).toBeGreaterThan(40);
    expect(risk.level).not.toBe('low');
    expect(risk.components).toMatchObject({
      event_frequency: 30,
      position_size_escalation: 25,
      cooling_period_gap: 10
    });
  });
});
