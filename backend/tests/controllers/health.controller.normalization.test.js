jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../src/utils/aiService', () => ({}));

const db = require('../../src/config/database');
const healthController = require('../../src/controllers/health.controller');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('health controller normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalizes health data type aliases and metadata aliases', () => {
    expect(healthController.normalizeDataType('heartRate')).toBe('heart_rate');
    expect(healthController.normalizeDataType('heart_rate')).toBe('heart_rate');
    expect(healthController.getDataTypeAliases('heartRate')).toEqual(['heart_rate', 'heartRate']);

    const metadata = healthController.normalizeMetadata({
      sleep_quality: 0.82,
      heartRateVariability: 44
    });

    expect(metadata.sleepQuality).toBe(0.82);
    expect(metadata.sleep_quality).toBe(0.82);
    expect(metadata.hrv).toBe(44);
  });

  test('stores legacy heartRate submissions using canonical heart_rate type', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ inserted: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 'user-1' },
      headers: {},
      body: {
        healthData: [{
          date: '2026-04-29T14:00:00.000Z',
          type: 'heartRate',
          value: 78,
          timestamp: '2026-04-29T14:00:00.000Z',
          metadata: { heartRateVariability: 39 }
        }]
      }
    };
    const res = createResponse();

    await healthController.submitHealthData(req, res);

    expect(res.statusCode).toBe(200);
    expect(db.query.mock.calls[1][1][2]).toBe('heart_rate');
    expect(JSON.parse(db.query.mock.calls[1][1][4])).toMatchObject({
      hrv: 39
    });
  });

  test('correlation calculation handles old and new heart rate type names', () => {
    const correlations = healthController.calculateCorrelations([
      {
        date: new Date('2026-04-29T00:00:00.000Z'),
        data_type: 'heartRate',
        value: '80',
        metadata: { hrv: 40 }
      },
      {
        date: new Date('2026-04-29T00:00:00.000Z'),
        data_type: 'heart_rate',
        value: '90',
        metadata: {}
      },
      {
        date: new Date('2026-04-29T00:00:00.000Z'),
        data_type: 'sleep',
        value: '7.5',
        metadata: { sleep_quality: 85 }
      }
    ], [{
      trade_date: new Date('2026-04-29T15:00:00.000Z'),
      total_pnl: '125',
      total_trades: '2',
      avg_pnl: '62.5',
      wins: '1'
    }]);

    expect(correlations).toHaveLength(1);
    expect(correlations[0].avg_heart_rate).toBe(85);
    expect(correlations[0].sleep_quality).toBe(0.85);
    expect(correlations[0].heart_rate_variability).toBe(40);
  });
});
