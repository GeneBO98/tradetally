jest.mock('../../src/events/domainEvents', () => ({
  publishInBackground: jest.fn()
}));

const { publishInBackground } = require('../../src/events/domainEvents');
const {
  publishEnrichmentCompleted,
  publishEnrichmentCompletedForRows
} = require('../../src/events/enrichmentEvents');

describe('enrichment events', () => {
  beforeEach(() => jest.clearAllMocks());

  test('publishes one event per user with that user\'s trade ids', () => {
    publishEnrichmentCompletedForRows([
      { id: 't-1', user_id: 'user-1' },
      { id: 't-2', user_id: 'user-2' },
      { id: 't-3', user_id: 'user-1' }
    ], 'recovered', 'jobRecoveryService');

    expect(publishInBackground).toHaveBeenCalledTimes(2);
    expect(publishInBackground).toHaveBeenCalledWith(
      'enrichment.completed',
      { tradeIds: ['t-1', 't-3'], count: 2, trigger: 'recovered' },
      { source: 'jobRecoveryService', userId: 'user-1' }
    );
    expect(publishInBackground).toHaveBeenCalledWith(
      'enrichment.completed',
      { tradeIds: ['t-2'], count: 1, trigger: 'recovered' },
      { source: 'jobRecoveryService', userId: 'user-2' }
    );
  });

  test('skips empty batches and missing users', () => {
    publishEnrichmentCompleted('user-1', [], 'force_completed', 'app.enrichment');
    publishEnrichmentCompleted(null, ['t-1'], 'force_completed', 'app.enrichment');
    publishEnrichmentCompletedForRows([], 'jobs_finished', 'parallelJobQueue');

    expect(publishInBackground).not.toHaveBeenCalled();
  });
});
