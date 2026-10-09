const DEFAULT_PRIORITY = 3;

const FinnhubPriority = Object.freeze({
  ACTIVE_QUOTE: 0,
  ACTIVE_CANDLE: 1,
  ACTIVE_OTHER: 3,
  BACKGROUND_PRICE: 6,
  BACKGROUND_ENRICHMENT: 7,
  BACKGROUND_MAINTENANCE: 9
});

// Send below the configured provider limit so window misalignment between our
// sliding window and the provider's counter never produces a 429.
const DEFAULT_SAFETY_FACTOR = 0.9;

// How long background jobs wait in the queue by default. Background work is
// trickled out under the rate limit rather than dropped; callers that prefer
// skip-and-retry-next-cycle semantics pass maxQueueWaitMs explicitly.
const DEFAULT_BACKGROUND_QUEUE_WAIT_MS = 15 * 60 * 1000;
const DEFAULT_ACTIVE_QUEUE_WAIT_MS = 10000;

// Pause after an upstream 429 when the provider doesn't send Retry-After.
const DEFAULT_COOLDOWN_MS = 10000;

class FinnhubSchedulerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'FinnhubSchedulerError';
    this.code = code;
    Object.assign(this, details);
  }
}

class FinnhubRequestScheduler {
  constructor(options = {}) {
    // Provider label for logs - the scheduler is shared by Finnhub and FMP, so
    // hardcoding "Finnhub" in log output is misleading when running on FMP
    this.label = options.label || 'MARKET-DATA';
    const safetyFactor = Number.isFinite(options.safetyFactor) && options.safetyFactor > 0 && options.safetyFactor <= 1
      ? options.safetyFactor
      : DEFAULT_SAFETY_FACTOR;
    this.safetyFactor = safetyFactor;
    this.configuredCallsPerMinute = Math.max(1, parseInt(options.maxCallsPerMinute, 10) || 60);
    this.configuredCallsPerSecond = Math.max(1, parseInt(options.maxCallsPerSecond, 10) || 1);
    this.maxCallsPerMinute = Math.max(1, Math.floor(this.configuredCallsPerMinute * safetyFactor));
    this.maxCallsPerSecond = Math.max(1, Math.floor(this.configuredCallsPerSecond * safetyFactor));
    this.activeReservePerMinute = Math.max(
      0,
      Math.min(
        this.maxCallsPerMinute - 1,
        parseInt(options.activeReservePerMinute, 10) || Math.ceil(this.maxCallsPerMinute * 0.1)
      )
    );
    this.autoProcess = options.autoProcess !== false;

    this.callTimestamps = [];
    this.secondTimestamps = [];
    this.queue = [];
    this.sequence = 0;
    this.processTimer = null;
    // After an upstream 429, hold all sends until this timestamp.
    this.cooldownUntil = 0;

    console.log(
      `[${this.label}-SCHEDULER] Effective send rate: ${this.maxCallsPerMinute}/min, ${this.maxCallsPerSecond}/sec ` +
      `(configured ${this.configuredCallsPerMinute}/min, ${this.configuredCallsPerSecond}/sec, safety factor ${safetyFactor})`
    );

    this.stats = {
      recentWaits: [],
      backgroundSkips: 0,
      activeTimeouts: 0,
      ran: 0
    };
  }

  updateLimits({ maxCallsPerMinute, maxCallsPerSecond, activeReservePerMinute } = {}) {
    if (maxCallsPerMinute) {
      this.configuredCallsPerMinute = Math.max(1, parseInt(maxCallsPerMinute, 10));
      this.maxCallsPerMinute = Math.max(1, Math.floor(this.configuredCallsPerMinute * this.safetyFactor));
    }
    if (maxCallsPerSecond) {
      this.configuredCallsPerSecond = Math.max(1, parseInt(maxCallsPerSecond, 10));
      this.maxCallsPerSecond = Math.max(1, Math.floor(this.configuredCallsPerSecond * this.safetyFactor));
    }
    if (activeReservePerMinute !== undefined) {
      this.activeReservePerMinute = Math.max(
        0,
        Math.min(this.maxCallsPerMinute - 1, parseInt(activeReservePerMinute, 10) || 0)
      );
    }
  }

  async schedule(requestFn, context = {}) {
    const priority = Number.isFinite(context.priority) ? context.priority : DEFAULT_PRIORITY;
    const background = Boolean(context.background) || priority >= FinnhubPriority.BACKGROUND_PRICE;
    const maxQueueWaitMs = context.maxQueueWaitMs
      ?? (background ? DEFAULT_BACKGROUND_QUEUE_WAIT_MS : DEFAULT_ACTIVE_QUEUE_WAIT_MS);
    const queuedAt = Date.now();

    return new Promise((resolve, reject) => {
      const job = {
        id: ++this.sequence,
        priority,
        background,
        endpoint: context.endpoint || 'unknown',
        source: context.source || 'unknown',
        userId: context.userId || null,
        queuedAt,
        requestFn,
        resolve,
        reject,
        timeoutId: null,
        started: false
      };

      if (maxQueueWaitMs !== null && maxQueueWaitMs !== undefined) {
        job.timeoutId = setTimeout(() => {
          this.removeJob(job);
          const waitedMs = Date.now() - queuedAt;
          const code = background ? 'FINNHUB_SCHEDULER_SKIPPED' : 'FINNHUB_SCHEDULER_TIMEOUT';
          if (background) {
            this.stats.backgroundSkips++;
          } else {
            this.stats.activeTimeouts++;
          }
          this.log('skipped', job, waitedMs, code);
          reject(new FinnhubSchedulerError(
            `${this.label} request ${background ? 'skipped' : 'timed out'} after ${waitedMs}ms in scheduler`,
            code,
            { endpoint: job.endpoint, source: job.source, priority: job.priority, waitedMs }
          ));
        }, Math.max(0, maxQueueWaitMs));
        if (typeof job.timeoutId.unref === 'function') {
          job.timeoutId.unref();
        }
      }

      this.queue.push(job);
      if (this.autoProcess) {
        this.processQueue();
      }
    });
  }

  processQueue() {
    this.clearProcessTimer();
    this.pruneTimestamps();

    while (this.queue.length > 0) {
      const nextJob = this.takeNextRunnableJob();
      if (!nextJob) break;
      this.runJob(nextJob);
      this.pruneTimestamps();
    }

    if (this.queue.length > 0) {
      this.scheduleNextProcess();
    }
  }

  takeNextRunnableJob() {
    const runnable = this.queue
      .filter(job => this.hasCapacity(job))
      .sort((a, b) => a.priority - b.priority || a.id - b.id)[0];

    if (!runnable) return null;
    this.removeJob(runnable);
    return runnable;
  }

  hasCapacity(job) {
    if (Date.now() < this.cooldownUntil) {
      return false;
    }

    if (this.secondTimestamps.length >= this.maxCallsPerSecond) {
      return false;
    }

    const minuteLimit = job.background
      ? Math.max(0, this.maxCallsPerMinute - this.activeReservePerMinute)
      : this.maxCallsPerMinute;

    return this.callTimestamps.length < minuteLimit;
  }

  runJob(job) {
    job.started = true;
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
      job.timeoutId = null;
    }

    const now = Date.now();
    const waitMs = now - job.queuedAt;
    this.callTimestamps.push(now);
    this.secondTimestamps.push(now);
    this.stats.ran++;
    this.recordWait(waitMs);
    this.log('run', job, waitMs);

    Promise.resolve()
      .then(job.requestFn)
      .then(job.resolve)
      .catch((error) => {
        if (error?.response?.status === 429) {
          this.notifyRateLimited(error);
        }
        job.reject(error);
      })
      .finally(() => {
        if (this.queue.length > 0 && this.autoProcess) {
          this.processQueue();
        }
      });
  }

  // Upstream said no: stop sending entirely until the provider's window
  // clears. Honors Retry-After when present.
  notifyRateLimited(error) {
    const retryAfterHeader = error?.response?.headers?.['retry-after'];
    const retryAfterSeconds = parseInt(retryAfterHeader, 10);
    const cooldownMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 60000)
      : DEFAULT_COOLDOWN_MS;
    const until = Date.now() + cooldownMs;
    if (until > this.cooldownUntil) {
      this.cooldownUntil = until;
      console.warn(`[${this.label}-SCHEDULER] Upstream 429 — pausing all sends for ${cooldownMs}ms`);
    }
  }

  removeJob(job) {
    const index = this.queue.indexOf(job);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  pruneTimestamps() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;
    this.callTimestamps.splice(0, this.callTimestamps.length, ...this.callTimestamps.filter(timestamp => timestamp > oneMinuteAgo));
    this.secondTimestamps.splice(0, this.secondTimestamps.length, ...this.secondTimestamps.filter(timestamp => timestamp > oneSecondAgo));
  }

  scheduleNextProcess() {
    const now = Date.now();
    const oldestSecondCall = this.secondTimestamps[0];
    const oldestMinuteCall = this.callTimestamps[0];
    const secondDelay = oldestSecondCall ? Math.max(0, 1000 - (now - oldestSecondCall) + 10) : 0;
    const minuteDelay = oldestMinuteCall ? Math.max(0, 60000 - (now - oldestMinuteCall) + 10) : 0;
    const cooldownDelay = Math.max(0, this.cooldownUntil - now + 10);
    const rateDelay = this.secondTimestamps.length >= this.maxCallsPerSecond
      ? secondDelay
      : minuteDelay || 1000;
    const delay = Math.max(rateDelay, cooldownDelay);

    this.processTimer = setTimeout(() => this.processQueue(), delay);
    if (typeof this.processTimer.unref === 'function') {
      this.processTimer.unref();
    }
  }

  clearProcessTimer() {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }

  recordWait(waitMs) {
    this.stats.recentWaits.push(waitMs);
    if (this.stats.recentWaits.length > 100) {
      this.stats.recentWaits.shift();
    }
  }

  log(status, job, waitMs, code = null) {
    console.log(
      `[${this.label}-SCHEDULER] status=${status} priority=${job.priority} endpoint=${job.endpoint} source=${job.source} waitMs=${waitMs}` +
        (job.background ? ' background=true' : ' background=false') +
        (code ? ` code=${code}` : '')
    );
  }

  getStats() {
    this.pruneTimestamps();
    const pendingByPriority = this.queue.reduce((accumulator, job) => {
      accumulator[job.priority] = (accumulator[job.priority] || 0) + 1;
      return accumulator;
    }, {});
    const recentWaits = this.stats.recentWaits;
    const avgWaitMs = recentWaits.length
      ? Math.round(recentWaits.reduce((sum, wait) => sum + wait, 0) / recentWaits.length)
      : 0;

    return {
      maxCallsPerMinute: this.maxCallsPerMinute,
      maxCallsPerSecond: this.maxCallsPerSecond,
      configuredCallsPerMinute: this.configuredCallsPerMinute,
      configuredCallsPerSecond: this.configuredCallsPerSecond,
      cooldownRemainingMs: Math.max(0, this.cooldownUntil - Date.now()),
      queueDepth: this.queue.length,
      activeReservePerMinute: this.activeReservePerMinute,
      recentCalls: this.callTimestamps.length,
      lastMinuteCalls: this.callTimestamps.length,
      lastSecondCalls: this.secondTimestamps.length,
      pendingByPriority,
      recentAverageWaitMs: avgWaitMs,
      backgroundSkips: this.stats.backgroundSkips,
      activeTimeouts: this.stats.activeTimeouts,
      ran: this.stats.ran
    };
  }
}

module.exports = {
  FinnhubPriority,
  FinnhubRequestScheduler,
  FinnhubSchedulerError
};
