const fs = require('fs');
const path = require('path');
const { sanitizeForLogging, sanitizeErrorForLogging } = require('./logSanitizer');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.allowedLogFilenamePattern = /^[a-z0-9-]+_\d{4}-\d{2}-\d{2}\.log$/i;
    this.ensureLogDirectory();
    
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
        fs.appendFileSync(self.getLogFileName('debug'), logMessage);
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
    return path.join(this.logDir, `${type}_${date}.log`);
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
    
    // Only write to file if the log level permits
    if (this.shouldLog(level)) {
      try {
        fs.appendFileSync(this.getLogFileName(type), logMessage);
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
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
    
    // Always write to file for UI display
    try {
      fs.appendFileSync(this.getLogFileName('import'), logMessage);
    } catch (error) {
      console.error('Failed to write to import log file:', error);
    }
    
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
    
    // Always write errors to file
    try {
      fs.appendFileSync(this.getLogFileName('error'), logMessage);
      // Also write to import log if it's import-related
      if (message.includes('import') || message.includes('Import')) {
        fs.appendFileSync(this.getLogFileName('import'), logMessage);
      }
    } catch (err) {
      console.error('Failed to write to error log file:', err);
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
      const content = fs.readFileSync(filePath, 'utf8');
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
          searchLineCount: searchQuery ? searchedLines.length : 0
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
