/**
 * Shared job-queue configuration.
 *
 * PARALLEL_JOB_TYPES is the single source of truth for which job types the
 * parallel queue (utils/parallelJobQueue.js) owns. The sequential queue
 * (utils/jobQueue.js) excludes these types from its claim query so every job
 * type has exactly one owner. Edit this list to move ownership between the
 * two queues.
 */
const PARALLEL_JOB_TYPES = [
  'cusip_resolution',
  'strategy_classification',
  'news_enrichment'
];

module.exports = { PARALLEL_JOB_TYPES };
