const fs = require('fs');
const path = require('path');
const { sanitizeForLogging, sanitizeErrorForLogging } = require('./logSanitizer');

const FLUSH_BYTES = 64 * 1024;      // flush a file's buffer once it reaches ~64KB
const FLUSH_INTERVAL_MS = 250;      // or on this timer, whichever comes first
const TAIL_READ_CAP = 2 * 1024 * 1024; // readLogFile reads at most the last 2MB
const RETENTION_SWEEP_MS = 24 * 60 * 60 * 1000;

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.allowedLogFilenamePattern = /^[a-z0-9-]+_\d{4}-\d{2}-\d{2}\.log$/i;
    this.ensureLogDirectory();

    // Buffered write state: filePath -> { lines: [], size: 0, pending: 0, chain: Promise }
    this.writeBuffers = new Map();
    this.flushTimer = null;

    // Flush anything still buffered when the process ends. server.js's SIGINT/SIGTERM
    // handlers call process.exit(0), which fires 'exit', so graceful shutdown is covered.
    process.on('exit', () => {
      try {
        this.flushSync();
      } catch (_) {
        // Silently fail - never throw from the exit path
      }
    });

    this.retentionTimer = null;
    if (process.env.NODE_ENV !== 'test') {
      // Retention sweep: deferred so it does not block boot, then every 24h.
      setImmediate(() => {
        this.runRetentionSweep().catch(() => {});
      });
      this.retentionTimer = setInterval(() => {
        this.runRetentionSweep().catch(() => {});
      }, RETENTION_SWEEP_MS);
      if (typeof this.retentionTimer.unref === 'function') {
        this.retentionTimer.unref();
      }
    }

    // Log levels: DEBUG=0, INFO=1, WARN=2, ERROR=3
    this.levels = {
      DEBUG: 0,
      INFO: 1, 
      WARN: 2,
      ERROR: 3
    };
    
    // Get log level from environment, default to INFO
    const envLevel = (process.env.LOG_LEVEL || 'INFO').trim();
    this.currentLevel = this.levels[envLevel.toUpperCase()] ?? this.levels.INFO;
    
    // Log the configured level on startup
    if (this.currentLevel === this.levels.DEBUG) {
      console.log(`Logger initialized with level: DEBUG (${this.currentLevel})`);
    }

    // Colors for console output
    this.colors = {
      DEBUG: '\x1b[36m',    // Cyan
      INFO: '\x1b[32m',     // Green  
      WARN: '\x1b[33m',     // Yellow
      ERROR: '\x1b[31m',    // Red
      RESET: '\x1b[0m'      // Reset
    };

    // Always sanitize console output. DEBUG mode also captures everything to file.
    this.interceptConsole(this.currentLevel === this.levels.DEBUG);
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Buffered async writes
  // Lines accumulate per file and are flushed with async fs.appendFile when the
  // buffer reaches FLUSH_BYTES or on a FLUSH_INTERVAL_MS timer, whichever first.
  // Flushes for the same file are serialized on a per-file promise chain so
  // appends never interleave. All failures are swallowed silently: the console
  // interception calls into the logger, so an error surfaced here could recurse.
  // ---------------------------------------------------------------------------

  getWriteBuffer(filePath) {
    let buf = this.writeBuffers.get(filePath);
    if (!buf) {
      buf = { lines: [], size: 0, pending: 0, chain: Promise.resolve() };
      this.writeBuffers.set(filePath, buf);
    }
    return buf;
  }

  enqueueWrite(filePath, line) {
    try {
      const buf = this.getWriteBuffer(filePath);
      buf.lines.push(line);
      buf.size += Buffer.byteLength(line);

      if (buf.size >= FLUSH_BYTES) {
        this.flushFile(filePath);
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flushAll();
        }, FLUSH_INTERVAL_MS);
        if (typeof this.flushTimer.unref === 'function') {
          this.flushTimer.unref();
        }
      }
    } catch (_) {
      // Silently fail to avoid recursion through intercepted console methods
    }
  }

  // Async flush of one file's buffer, chained so writes to the same file are
  // strictly ordered and never interleave.
  flushFile(filePath) {
    const buf = this.writeBuffers.get(filePath);
    if (!buf || buf.lines.length === 0) {
      return buf ? buf.chain : Promise.resolve();
    }
    const data = buf.lines.join('');
    buf.lines = [];
    buf.size = 0;
    buf.pending++;
    buf.chain = buf.chain
      .then(() => fs.promises.appendFile(filePath, data))
      .catch(() => {
        // Silently fail - a console.error here would recurse into the logger
      })
      .finally(() => {
        buf.pending--;
      });
    return buf.chain;
  }

  flushAll() {
    for (const filePath of this.writeBuffers.keys()) {
      this.flushFile(filePath);
    }
  }

  // Synchronous flush of one file's buffer, used before reading a log file so
  // the viewer sees fresh lines. Skipped if an async append is in flight for
  // this file (a sync append would land ahead of it and reorder the file);
  // in that case the lines arrive within the normal flush interval anyway.
  flushFileSync(filePath) {
    const buf = this.writeBuffers.get(filePath);
    if (!buf || buf.lines.length === 0 || buf.pending > 0) {
      return;
    }
    const data = buf.lines.join('');
    buf.lines = [];
    buf.size = 0;
    try {
      fs.appendFileSync(filePath, data);
    } catch (_) {
      // Silently fail
    }
  }

  // Synchronous flush of every buffer. Called on process exit (and available to
  // graceful-shutdown code paths); safe to call multiple times.
  flushSync() {
    for (const [filePath, buf] of this.writeBuffers) {
      if (buf.lines.length === 0) {
        continue;
      }
      const data = buf.lines.join('');
      buf.lines = [];
      buf.size = 0;
      try {
        fs.appendFileSync(filePath, data);
      } catch (_) {
        // Silently fail - never throw from the exit path
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Retention sweep: delete *.log files older than LOG_RETENTION_DAYS (default 14)
  // by mtime. Fully async so a directory with ~1600 files never blocks the loop.
  // ---------------------------------------------------------------------------
  async runRetentionSweep() {
    try {
      const parsed = parseInt(process.env.LOG_RETENTION_DAYS, 10);
      const retentionDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const entries = await fs.promises.readdir(this.logDir);
      let deleted = 0;
      for (const name of entries) {
        if (!name.endsWith('.log')) {
          continue;
        }
        const filePath = path.join(this.logDir, name);
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isFile() && stats.mtimeMs < cutoff) {
            await fs.promises.unlink(filePath);
            this.writeBuffers.delete(filePath);
            deleted++;
          }
        } catch (_) {
          // File may have been removed concurrently - skip
        }
      }

      // Prune idle buffers for files we are no longer writing to
      for (const [filePath, buf] of this.writeBuffers) {
        if (buf.lines.length === 0 && buf.pending === 0) {
          this.writeBuffers.delete(filePath);
        }
      }

      this.info(`[RETENTION] Log retention sweep complete: deleted ${deleted} file(s) older than ${retentionDays} day(s)`, 'app');
    } catch (_) {
      // Silently fail - retention is best-effort
    }
  }

  // Intercept console methods to sanitize output; optionally capture everything in DEBUG mode.
  interceptConsole(captureToDebugLog = false) {
    const self = this;

    // Store original methods
    const originalLog = console.log.bind(console);
    const originalInfo = console.info.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    const originalDebug = console.debug.bind(console);

    // Helper to format arguments into a string
    const formatArgs = (args) => {
      return args.map(arg => {
        const sanitizedArg = sanitizeForLogging(arg);
        if (typeof sanitizedArg === 'object') {
          try {
            return JSON.stringify(sanitizedArg, null, 2);
          } catch {
            return String(sanitizedArg);
          }
        }
        return String(sanitizedArg);
      }).join(' ');
    };

    // Helper to write to debug log file
    const writeToDebugLog = (level, args) => {
      if (!captureToDebugLog) {
        return;
      }

      const timestamp = new Date().toISOString();
      const message = formatArgs(args);
      const logMessage = `[${timestamp}] [${level}] ${message}\n`;
      try {
        self.enqueueWrite(self.getLogFileName('debug'), logMessage);
      } catch (error) {
        // Silently fail to avoid infinite loops
      }
    };

    // Override console.log
    console.log = function(...args) {
      originalLog(...sanitizeForLogging(args));
      writeToDebugLog('LOG', args);
    };

    // Override console.info
    console.info = function(...args) {
      originalInfo(...sanitizeForLogging(args));
      writeToDebugLog('INFO', args);
    };

    // Override console.warn
    console.warn = function(...args) {
      originalWarn(...sanitizeForLogging(args));
      writeToDebugLog('WARN', args);
    };

    // Override console.error
    console.error = function(...args) {
      originalError(...sanitizeForLogging(args));
      writeToDebugLog('ERROR', args);
    };

    // Override console.debug
    console.debug = function(...args) {
      originalDebug(...sanitizeForLogging(args));
      writeToDebugLog('DEBUG', args);
    };

    if (captureToDebugLog) {
      originalLog('Console interception enabled - all logs will be written to debug log file');
    }
  }

  getLogFileName(type = 'import') {
    const date = new Date().toISOString().split('T')[0];
    const safeType = typeof type === 'string' && /^[a-z0-9_-]+$/i.test(type) ? type : 'app';
    return path.join(this.logDir, `${safeType}_${date}.log`);
  }

  validateLogFilename(filename, options = {}) {
    const normalized = typeof filename === 'string' ? filename.trim() : '';
    const { allowedPrefixes = null } = options;

    if (!normalized) {
      const error = new Error('Log filename is required');
      error.code = 'INVALID_LOG_FILENAME';
      throw error;
    }

    if (path.basename(normalized) !== normalized || path.isAbsolute(normalized) || normalized.includes('..')) {
      const error = new Error('Invalid log filename');
      error.code = 'INVALID_LOG_FILENAME';
      throw error;
    }

    if (!this.allowedLogFilenamePattern.test(normalized)) {
      const error = new Error('Invalid log filename');
      error.code = 'INVALID_LOG_FILENAME';
      throw error;
    }

    if (Array.isArray(allowedPrefixes) && allowedPrefixes.length > 0) {
      const hasAllowedPrefix = allowedPrefixes.some(prefix => normalized.toLowerCase().startsWith(`${prefix.toLowerCase()}_`));
      if (!hasAllowedPrefix) {
        const error = new Error('Log filename is not allowed for this endpoint');
        error.code = 'INVALID_LOG_FILENAME';
        throw error;
      }
    }

    return normalized;
  }

  resolveLogFilePath(filename, options = {}) {
    const safeFilename = this.validateLogFilename(filename, options);
    const filePath = path.resolve(this.logDir, safeFilename);
    const logDirPath = path.resolve(this.logDir);

    if (!filePath.startsWith(`${logDirPath}${path.sep}`)) {
      const error = new Error('Invalid log filename');
      error.code = 'INVALID_LOG_FILENAME';
      throw error;
    }

    return filePath;
  }

  shouldLog(level) {
    return this.levels[level] >= this.currentLevel;
  }

  writeLog(message, level = 'INFO', type = 'app') {
    // Callers sometimes pass an object/array as `type` (console-style logging).
    // Fold it into the message instead of letting it become the log filename.
    if (typeof type !== 'string' || !/^[a-z0-9_-]+$/i.test(type)) {
      let extra;
      try {
        extra = typeof type === 'string' ? type : JSON.stringify(sanitizeForLogging(type));
      } catch {
        extra = String(type);
      }
      message = typeof message === 'string' ? `${message} ${extra}` : message;
      type = 'app';
    }
    const timestamp = new Date().toISOString();
    const sanitizedMessage = typeof message === 'string'
      ? sanitizeForLogging(message)
      : JSON.stringify(sanitizeForLogging(message));
    const logMessage = `[${timestamp}] [${level}] ${sanitizedMessage}\n`;
    
    // Only output to console if the log level permits
    if (this.shouldLog(level)) {
      const color = this.colors[level] || this.colors.RESET;
      console.log(`${color}[${level}]${this.colors.RESET} ${sanitizedMessage}`);
    }
    
    // Only write to file if the log level permits (buffered, flushed async)
    if (this.shouldLog(level)) {
      this.enqueueWrite(this.getLogFileName(type), logMessage);
    }
  }

  // Standard logging methods
  debug(message, type = 'app') {
    this.writeLog(message, 'DEBUG', type);
  }
  
  info(message, type = 'app') {
    this.writeLog(message, 'INFO', type);
  }
  
  warn(message, type = 'app') {
    this.writeLog(message, 'WARN', type);
  }
  
  error(message, error = null, type = 'app') {
    let logMessage = message;
    if (error) {
      const sanitizedError = sanitizeErrorForLogging(error);
      logMessage += `\nError: ${sanitizedError.message}\nStack: ${sanitizedError.stack}`;
    }
    this.writeLog(logMessage, 'ERROR', type);
  }

  // Legacy methods for backward compatibility
  logImport(message) {
    const timestamp = new Date().toISOString();
    const sanitizedMessage = sanitizeForLogging(message);
    const logMessage = `[${timestamp}] [INFO] [IMPORT] ${sanitizedMessage}\n`;
    
    // Always write to file for UI display (buffered; readLogFile flushes before reading)
    this.enqueueWrite(this.getLogFileName('import'), logMessage);
    
    // Only log to console if level permits
    if (this.shouldLog('INFO')) {
      const color = this.colors.INFO || this.colors.RESET;
      console.log(`${color}[INFO]${this.colors.RESET} [IMPORT] ${sanitizedMessage}`);
    }
  }

  logParsing(message) {
    this.debug(`[PARSING] ${message}`, 'import');
  }

  logMatching(message) {
    this.debug(`[MATCHING] ${message}`, 'import');
  }

  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    const sanitizedMessage = sanitizeForLogging(message);
    let logMessage = `[${timestamp}] [ERROR] ${sanitizedMessage}`;
    if (error) {
      const sanitizedError = sanitizeErrorForLogging(error);
      logMessage += `\nError: ${sanitizedError.message}\nStack: ${sanitizedError.stack}`;
    }
    logMessage += '\n';
    
    // Always write errors to file (buffered, flushed async)
    this.enqueueWrite(this.getLogFileName('error'), logMessage);
    // Also write to import log if it's import-related
    if (message.includes('import') || message.includes('Import')) {
      this.enqueueWrite(this.getLogFileName('import'), logMessage);
    }
    
    // Always log errors to console (errors should always be visible)
    const color = this.colors.ERROR || this.colors.RESET;
    console.error(`${color}[ERROR]${this.colors.RESET} ${sanitizedMessage}`);
    if (error) {
      console.error(sanitizeErrorForLogging(error));
    }
  }

  logDebug(message) {
    this.debug(message, 'debug');
  }

  logWarn(message) {
    this.warn(message, 'warn');
  }

  getLogFiles(showAll = false, page = 1, limit = 10, options = {}) {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const { allowedPrefixes = null } = options;
      
      const allFiles = fs.readdirSync(this.logDir)
        .filter(file => file.endsWith('.log'))
        .filter(file => {
          try {
            this.validateLogFilename(file, { allowedPrefixes });
            return true;
          } catch (_) {
            return false;
          }
        })
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          modified: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.modified - a.modified);

      // Determine which files to show
      let filesToShow = showAll ? allFiles : allFiles.filter(file => file.name.includes(today));
      
      // Apply pagination
      const total = filesToShow.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedFiles = filesToShow.slice(startIndex, endIndex);

      const todayFiles = allFiles.filter(file => file.name.includes(today));
      
      return {
        files: paginatedFiles,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
          showAll,
          totalFiles: allFiles.length,
          todayFiles: todayFiles.length,
          olderFiles: allFiles.length - todayFiles.length
        }
      };
    } catch (error) {
      return {
        files: [],
        pagination: { 
          page: 1, 
          limit, 
          total: 0, 
          totalPages: 0, 
          hasMore: false, 
          showAll: false, 
          totalFiles: 0, 
          todayFiles: 0, 
          olderFiles: 0 
        }
      };
    }
  }

  readLogFile(filename, page = 1, limit = 100, showAll = false, searchQuery = '', options = {}) {
    try {
      const safeFilename = this.validateLogFilename(filename, options);
      const filePath = this.resolveLogFilePath(safeFilename, options);

      // Flush any buffered lines for this file so the viewer sees fresh output
      this.flushFileSync(filePath);

      // Tail read: only read the last TAIL_READ_CAP bytes of large files
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      let content;
      let truncated = false;
      if (fileSize > TAIL_READ_CAP) {
        truncated = true;
        const fd = fs.openSync(filePath, 'r');
        try {
          const buffer = Buffer.alloc(TAIL_READ_CAP);
          const bytesRead = fs.readSync(fd, buffer, 0, TAIL_READ_CAP, fileSize - TAIL_READ_CAP);
          content = buffer.toString('utf8', 0, bytesRead);
        } finally {
          fs.closeSync(fd);
        }
        // Drop the first (likely partial) line
        const firstNewline = content.indexOf('\n');
        content = firstNewline >= 0 ? content.slice(firstNewline + 1) : '';
      } else {
        content = fs.readFileSync(filePath, 'utf8');
      }
      const lines = content.split('\n').filter(line => line.trim());
      
      // Filter to last 24 hours unless showAll is true
      let filteredLines = lines;
      if (!showAll) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        filteredLines = lines.filter(line => {
          // Extract timestamp from log line [2025-08-20T20:33:11.897Z]
          const timestampMatch = line.match(/^\[([^\]]+)\]/);
          if (timestampMatch) {
            try {
              const logTime = new Date(timestampMatch[1]);
              return logTime >= oneDayAgo;
            } catch (e) {
              return true; // Include lines with unparseable timestamps
            }
          }
          return true; // Include lines without timestamps
        });
      }
      
      // Apply search filter if provided
      let searchedLines = filteredLines;
      let searchMatchCount = 0;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        searchedLines = filteredLines.filter(line => line.toLowerCase().includes(query));
        
        // Count total matches
        searchMatchCount = searchedLines.reduce((count, line) => {
          const matches = (line.toLowerCase().match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          return count + matches;
        }, 0);
        
        console.log(`SEARCH: Found ${searchedLines.length} lines matching "${searchQuery}" (${searchMatchCount} total matches)`);
      }

      // Keep chronological order (oldest first, newest last)
      const total = searchedLines.length;
      const allLinesCount = lines.length;
      const filteredCount = filteredLines.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const pageLines = searchedLines.slice(startIndex, endIndex);
      
      return {
        content: pageLines.join('\n'),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
          showAll,
          totalAllLines: allLinesCount,
          filteredOut: allLinesCount - filteredCount,
          searchQuery,
          searchMatchCount,
          searchLineCount: searchQuery ? searchedLines.length : 0,
          ...(truncated ? { truncated: true, fileSizeBytes: fileSize, tailBytes: TAIL_READ_CAP } : {})
        }
      };
    } catch (error) {
      if (error.code === 'INVALID_LOG_FILENAME') {
        throw error;
      }
      return null;
    }
  }
}

module.exports = new Logger();
