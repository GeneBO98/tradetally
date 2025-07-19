const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName(type = 'import') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}_${date}.log`);
  }

  writeLog(message, type = 'import') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    console.log(message); // Also log to console
    
    try {
      fs.appendFileSync(this.getLogFileName(type), logMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  logImport(message) {
    this.writeLog(`[IMPORT] ${message}`, 'import');
  }

  logParsing(message) {
    this.writeLog(`[PARSING] ${message}`, 'import');
  }

  logMatching(message) {
    this.writeLog(`[MATCHING] ${message}`, 'import');
  }

  logError(message, error = null) {
    let logMessage = `[ERROR] ${message}`;
    if (error) {
      logMessage += `\nMessage: ${error.message}\nStack: ${error.stack}`;
    }
    this.writeLog(logMessage, 'error');
  }

  logDebug(message) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      this.writeLog(`[DEBUG] ${message}`, 'debug');
    }
  }

  logWarn(message) {
    this.writeLog(`[WARN] ${message}`, 'warn');
  }

  getLogFiles() {
    try {
      return fs.readdirSync(this.logDir)
        .filter(file => file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          modified: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.modified - a.modified);
    } catch (error) {
      return [];
    }
  }

  readLogFile(filename) {
    try {
      const filePath = path.join(this.logDir, filename);
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      return null;
    }
  }
}

module.exports = new Logger();