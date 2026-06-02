const DEFAULT_PRIORITY = 3;

const FinnhubPriority = Object.freeze({
  ACTIVE_QUOTE: 0,
  ACTIVE_CANDLE: 1,
  ACTIVE_OTHER: 3,
  BACKGROUND_PRICE: 6,
  BACKGROUND_MAINTENANCE: 9
});

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
    this.maxCallsPerMinute = Math.max(1, parseInt(options.maxCallsPerMinute, 10) || 60);
    this.maxCallsPerSecond = Math.max(1, parseInt(options.maxCallsPerSecond, 10) || 1);
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

    this.stats = {
      recentWaits: [],
      backgroundSkips: 0,
      activeTimeouts: 0,
      ran: 0
    };
  }

  updateLimits({ maxCallsPerMinute, maxCallsPerSecond, activeReservePerMinute } = {}) {
    if (maxCallsPerMinute) {
      this.maxCallsPerMinute = Math.max(1, parseInt(maxCallsPerMinute, 10));
    }
    if (maxCallsPerSecond) {
      this.maxCallsPerSecond = Math.max(1, parseInt(maxCallsPerSecond, 10));
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
    const maxQueueWaitMs = context.maxQueueWaitMs ?? (background ? 0 : 10000);
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
            `Finnhub request ${background ? 'skipped' : 'timed out'} after ${waitedMs}ms in scheduler`,
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
      .catch(job.reject)
      .finally(() => {
        if (this.queue.length > 0 && this.autoProcess) {
          this.processQueue();
        }
      });
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
    const delay = this.secondTimestamps.length >= this.maxCallsPerSecond
      ? secondDelay
      : minuteDelay || 1000;

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
      `[FINNHUB-SCHEDULER] status=${status} priority=${job.priority} endpoint=${job.endpoint} source=${job.source} waitMs=${waitMs}` +
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
