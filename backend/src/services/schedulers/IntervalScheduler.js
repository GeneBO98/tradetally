/**
 * IntervalScheduler
 * Shared lifecycle base class for setInterval-based background schedulers.
 *
 * Handles the boilerplate that was copy-pasted across schedulers:
 * - interval creation/teardown (with optional unref so timers never keep the process alive)
 * - an optional immediate run on start, or a delayed initial run (initialDelayMs)
 * - an optional "previous run still in progress" guard (isRunning)
 * - optional shouldRun() gating checked before every scheduled/initial run
 * - runNow() manual triggering and a default getStatus() shape
 *
 * Subclasses implement execute() with the domain logic (including any
 * task-specific logging and lastRunDate bookkeeping) and pass their exact
 * log strings via options.messages so console output is preserved verbatim.
 *
 * Supported options:
 * - intervalMs {number}          interval between scheduled runs
 * - runOnStart {boolean}         run immediately when start() is called (default true)
 * - initialDelayMs {number}      delay the initial run instead of running immediately
 * - useUnref {boolean}           unref() the interval/timeout handles (default false)
 * - useRunningGuard {boolean}    skip a run while one is in progress (default true)
 * - guardRestart {boolean}       make start() a no-op when already started (default false)
 * - stopLogAlways {boolean}      log the stopped message even when not running (default true)
 * - log {function}               log sink (default console.log)
 * - logError {function}          error log sink (default console.error)
 * - messages {object}            full log strings, all optional:
 *     startLogs {string[]}       lines logged at the top of start()
 *     alreadyStarted             logged when guardRestart blocks a second start()
 *     started                    logged after the interval is scheduled
 *     stopping / stopped         logged by stop()
 *     skip                       logged when the running guard skips a run
 *     runError                   passed to logError with the error when execute() throws;
 *                                when absent the error is rethrown (matching schedulers
 *                                that had no catch at this level)
 *     initialError               catch label for the start-time run
 *     scheduledError             catch label for interval runs
 *     manualRun                  logged by runNow()
 *     shouldRunTriggered         logged when shouldRun() passes before a gated run
 *     tick                       logged at the start of every interval tick
 *     initialDelayFired          logged when the delayed initial run fires
 */
class IntervalScheduler {
  constructor(options = {}) {
    const {
      intervalMs,
      runOnStart = true,
      initialDelayMs = null,
      useUnref = false,
      useRunningGuard = true,
      guardRestart = false,
      stopLogAlways = true,
      log = (...args) => console.log(...args),
      logError = (...args) => console.error(...args),
      messages = {}
    } = options;

    this.intervalMs = intervalMs;
    this.runOnStart = runOnStart;
    this.initialDelayMs = initialDelayMs;
    this.useUnref = useUnref;
    this.useRunningGuard = useRunningGuard;
    this.guardRestart = guardRestart;
    this.stopLogAlways = stopLogAlways;
    this.log = log;
    this.logError = logError;
    this.messages = messages;

    this.interval = null;
    this.initialRunTimeout = null;
    this.isRunning = false;
    this.lastRunDate = null;
  }

  /**
   * Domain logic for a single run. Subclasses must override.
   */
  async execute() {
    throw new Error('IntervalScheduler subclasses must implement execute()');
  }

  /**
   * Optional gate checked before scheduled/initial runs (not runNow()).
   * Subclasses may override (e.g. hour-of-day gating).
   */
  shouldRun() {
    return true;
  }

  /**
   * Run the task, honoring the "previous run still in progress" guard.
   */
  async runGuarded() {
    if (this.useRunningGuard && this.isRunning) {
      if (this.messages.skip) this.log(this.messages.skip);
      return;
    }

    this.isRunning = true;
    try {
      return await this.execute();
    } catch (error) {
      if (!this.messages.runError) throw error;
      this.logError(this.messages.runError, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check the shouldRun() gate and run if it passes.
   */
  async checkAndRun() {
    if (!this.shouldRun()) return;
    if (this.messages.shouldRunTriggered) this.log(this.messages.shouldRunTriggered);
    await this.runGuarded();
  }

  _invokeScheduled(errorMessage) {
    const promise = this.checkAndRun();
    if (errorMessage) {
      promise.catch(error => this.logError(errorMessage, error));
    }
    return promise;
  }

  /**
   * Start the scheduler.
   */
  start() {
    if (this.guardRestart && this.interval) {
      if (this.messages.alreadyStarted) this.log(this.messages.alreadyStarted);
      return;
    }

    for (const line of this.messages.startLogs || []) {
      this.log(line);
    }

    if (this.initialDelayMs !== null) {
      this.initialRunTimeout = setTimeout(() => {
        if (this.messages.initialDelayFired) this.log(this.messages.initialDelayFired);
        this._invokeScheduled(this.messages.initialError);
      }, this.initialDelayMs);
      if (this.useUnref && typeof this.initialRunTimeout.unref === 'function') {
        this.initialRunTimeout.unref();
      }
    } else if (this.runOnStart) {
      this._invokeScheduled(this.messages.initialError);
    }

    this.interval = setInterval(() => {
      if (this.messages.tick) this.log(this.messages.tick);
      this._invokeScheduled(this.messages.scheduledError);
    }, this.intervalMs);
    if (this.useUnref && typeof this.interval.unref === 'function') {
      this.interval.unref();
    }

    if (this.messages.started) this.log(this.messages.started);
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this.messages.stopping) this.log(this.messages.stopping);

    const wasActive = this.interval !== null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.initialRunTimeout) {
      clearTimeout(this.initialRunTimeout);
      this.initialRunTimeout = null;
    }

    if (this.messages.stopped && (this.stopLogAlways || wasActive)) {
      this.log(this.messages.stopped);
    }
  }

  /**
   * Force run now (for manual triggering/testing). Bypasses shouldRun().
   */
  async runNow() {
    if (this.messages.manualRun) this.log(this.messages.manualRun);
    return await this.runGuarded();
  }

  /**
   * Get scheduler status.
   */
  getStatus() {
    return {
      running: this.interval !== null,
      processing: this.isRunning,
      checkIntervalMinutes: this.intervalMs / 60000,
      lastRunDate: this.lastRunDate
    };
  }
}

module.exports = IntervalScheduler;
