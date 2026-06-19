jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/lossAversionAnalyticsService', () => ({ analyzeLossAversion: jest.fn() }));
jest.mock('../../src/services/overconfidenceAnalyticsService', () => ({ analyzeHistoricalTrades: jest.fn() }));
jest.mock('../../src/services/behavioralAnalyticsServiceV2', () => ({ analyzeHistoricalTradesV2: jest.fn() }));
// Stub models so requiring the service doesn't pull in real DB-backed code.
jest.mock('../../src/models/Trade', () => ({}));
jest.mock('../../src/models/Diary', () => ({}));
jest.mock('../../src/models/Account', () => ({}));

const db = require('../../src/config/database');
const LossAversion = require('../../src/services/lossAversionAnalyticsService');
const Overconfidence = require('../../src/services/overconfidenceAnalyticsService');
const BehavioralV2 = require('../../src/services/behavioralAnalyticsServiceV2');
const SampleDataService = require('../../src/services/sampleDataService');

describe('SampleDataService analyzer-on-signup', () => {
  let logSpy;
  beforeAll(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterAll(() => logSpy.mockRestore());
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    LossAversion.analyzeLossAversion.mockResolvedValue({});
    Overconfidence.analyzeHistoricalTrades.mockResolvedValue();
    BehavioralV2.analyzeHistoricalTradesV2.mockResolvedValue();
  });

  it('seeds behavioral + overconfidence settings idempotently for the user', async () => {
    await SampleDataService._seedBehavioralSettings('user-1');
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[0][0]).toMatch(/behavioral_settings/);
    expect(db.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/);
    expect(db.query.mock.calls[0][1]).toEqual(['user-1']);
    expect(db.query.mock.calls[1][0]).toMatch(/overconfidence_settings/);
  });

  it('runs all three behavioural analyzers for the user', async () => {
    await SampleDataService._runHistoricalAnalyzers('user-1');
    expect(LossAversion.analyzeLossAversion).toHaveBeenCalledWith('user-1');
    expect(Overconfidence.analyzeHistoricalTrades).toHaveBeenCalledWith('user-1');
    expect(BehavioralV2.analyzeHistoricalTradesV2).toHaveBeenCalledWith('user-1');
  });

  it('is best-effort: one analyzer throwing does not block the others or reject', async () => {
    Overconfidence.analyzeHistoricalTrades.mockRejectedValueOnce(new Error('boom'));
    await expect(SampleDataService._runHistoricalAnalyzers('user-1')).resolves.toBeUndefined();
    expect(LossAversion.analyzeLossAversion).toHaveBeenCalled();
    expect(BehavioralV2.analyzeHistoricalTradesV2).toHaveBeenCalled();
  });

  it('swallows settings DB errors so signup is never blocked', async () => {
    db.query.mockRejectedValue(new Error('db down'));
    await expect(SampleDataService._seedBehavioralSettings('user-1')).resolves.toBeUndefined();
  });
});
