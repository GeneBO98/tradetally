/**
 * CronScheduler
 * Shared lifecycle base class for node-cron based background schedulers.
 *
 * Handles the boilerplate that was copy-pasted across schedulers:
 * - cron expression resolution (env var override with default) and validation
 * - job creation/teardown with optional schedule options (timezone etc.)
 * - an optional restart guard and an optional delayed initial run
 * - a runExclusive() helper implementing the "already in progress" guard
 *
 * Subclasses implement execute() with the domain logic (or override onTick()
 * entirely when the tick handler carries its own try/catch and logging) and
 * pass their exact log strings via options.messages so console output is
 * preserved verbatim.
 *
 * Supported options:
 * - logPrefix {string}            prefix used for the invalid-cron error log
 * - defaultCron {string}          default cron expression
 * - cronEnvVar {string}           env var that overrides defaultCron (optional)
 * - getScheduleOptions {function} returns the options object passed to
 *                                 cron.schedule (evaluated at start time);
 *                                 when absent no options argument is passed
 * - validateExpression {boolean}  validate the cron expression (default true)
 * - guardRestart {boolean}        make start() a no-op when already started (default false)
 * - returnBoolean {boolean}       start() returns true/false instead of undefined (default false)
 * - initialDelayMs {number}       run onTick() once after this delay at start (optional)
 * - skipReturnValue {*}           value returned by runExclusive() when skipped
 * - errorReturnValue {*}          value returned by runExclusive() when execute() throws
 * - errorLogsMessageOnly {bool}   log error.message instead of the error object (default false)
 * - messages {object}             full log strings, all optional:
 *     startLogs {string[]}        lines logged at the top of start()
 *     alreadyStarted              logged when guardRestart blocks a second start()
 *     started                     logged after scheduling; a string, an array of
 *                                 strings, or a function receiving the cron expression
 *     stopped                     logged by stop() when a job was active
 *     skip                        logged when runExclusive() skips a concurrent run
 *     runError                    catch label logged when execute() throws
 */
const cron = require('node-cron');

class CronScheduler {
  constructor(options = {}) {
    const {
      logPrefix = '',
      defaultCron,
      cronEnvVar = null,
      getScheduleOptions = null,
      validateExpression = true,
      guardRestart = false,
      returnBoolean = false,
      initialDelayMs = null,
      skipReturnValue = undefined,
      errorReturnValue = undefined,
      errorLogsMessageOnly = false,
      messages = {}
    } = options;

    this.logPrefix = logPrefix;
    this.defaultCron = defaultCron;
    this.cronEnvVar = cronEnvVar;
    this.getScheduleOptions = getScheduleOptions;
    this.validateExpression = validateExpression;
    this.guardRestart = guardRestart;
    this.returnBoolean = returnBoolean;
    this.initialDelayMs = initialDelayMs;
    this.skipReturnValue = skipReturnValue;
    this.errorReturnValue = errorReturnValue;
    this.errorLogsMessageOnly = errorLogsMessageOnly;
    this.messages = messages;

    this.job = null;
    this.running = false;
  }

  /**
   * Resolve the active cron expression (env override or default).
   */
  getCronExpression() {
    return (this.cronEnvVar && process.env[this.cronEnvVar]) || this.defaultCron;
  }

  /**
   * Hook run before scheduling; return false to abort start().
   */
  beforeStart() {
    return true;
  }

  /**
   * Hook run after the main job is scheduled (e.g. to schedule secondary jobs).
   */
  afterSchedule() {}

  /**
   * Cron tick handler. Defaults to the guarded run; subclasses override to
   * route to their public run method (runBatch, recompute, runSync, ...).
   */
  onTick() {
    return this.runExclusive();
  }

  /**
   * Domain logic for a single run. Subclasses must override unless they
   * override onTick() entirely.
   */
  async execute() {
    throw new Error('CronScheduler subclasses must implement execute()');
  }

  /**
   * Run the task, honoring the "already in progress" guard.
   */
  async runExclusive() {
    if (this.running) {
      if (this.messages.skip) console.log(this.messages.skip);
      return this.skipReturnValue;
    }

    this.running = true;
    try {
      return await this.execute();
    } catch (error) {
      if (this.messages.runError) {
        console.error(this.messages.runError, this.errorLogsMessageOnly ? error.message : error);
      }
      return this.errorReturnValue;
    } finally {
      this.running = false;
    }
  }

  _logStarted(cronExpression) {
    const { started } = this.messages;
    if (!started) return;
    if (typeof started === 'function') {
      console.log(started(cronExpression));
    } else if (Array.isArray(started)) {
      started.forEach(line => console.log(line));
    } else {
      console.log(started);
    }
  }

  /**
   * Start the scheduler.
   */
  start() {
    if (this.beforeStart() === false) {
      return this.returnBoolean ? false : undefined;
    }

    if (this.guardRestart && this.job) {
      if (this.messages.alreadyStarted) console.log(this.messages.alreadyStarted);
      return this.returnBoolean ? false : undefined;
    }

    for (const line of this.messages.startLogs || []) {
      console.log(line);
    }

    const cronExpression = this.getCronExpression();
    if (this.validateExpression && !cron.validate(cronExpression)) {
      console.error(`${this.logPrefix} Invalid cron expression: ${cronExpression}`);
      return this.returnBoolean ? false : undefined;
    }

    this.job = this.getScheduleOptions
      ? cron.schedule(cronExpression, () => this.onTick(), this.getScheduleOptions())
      : cron.schedule(cronExpression, () => this.onTick());

    this.afterSchedule();

    this._logStarted(cronExpression);

    if (this.initialDelayMs !== null) {
      setTimeout(() => this.onTick(), this.initialDelayMs);
    }

    return this.returnBoolean ? true : undefined;
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      if (this.messages.stopped) console.log(this.messages.stopped);
    }
  }
}

module.exports = CronScheduler;
