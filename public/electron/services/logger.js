const { app } = require('electron');
const fs = require('fs');
const path = require('path');

class ElectronLogger {
  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.currentLogFile = path.join(this.logDir, `mediabot-${new Date().toISOString().split('T')[0]}.log`);
    this.initializeLogDirectory();
  }

  initializeLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      // Clean up logs older than 7 days
      this.cleanupOldLogs();
    } catch (error) {
      // Fallback - write to console if we can't create log directory
      console.error('Failed to initialize log directory:', error);
    }
  }

  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime.getTime() < sevenDaysAgo) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  formatLogEntry(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const processInfo = `[PID:${process.pid}]`;
    let logEntry = `${timestamp} ${processInfo} [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        logEntry += `\n  Data: ${JSON.stringify(data, null, 2)}`;
      } else {
        logEntry += `\n  Data: ${data}`;
      }
    }
    
    return logEntry + '\n';
  }

  writeToFile(logEntry) {
    try {
      fs.appendFileSync(this.currentLogFile, logEntry);
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error);
      console.log(logEntry.trim());
    }
  }

  info(message, data = null) {
    const logEntry = this.formatLogEntry('info', message, data);
    this.writeToFile(logEntry);
  }

  warn(message, data = null) {
    const logEntry = this.formatLogEntry('warn', message, data);
    this.writeToFile(logEntry);
  }

  error(message, data = null) {
    const logEntry = this.formatLogEntry('error', message, data);
    this.writeToFile(logEntry);
  }

  debug(message, data = null) {
    // Only log debug in development
    if (process.env.NODE_ENV === 'development' || app.isPackaged === false) {
      const logEntry = this.formatLogEntry('debug', message, data);
      this.writeToFile(logEntry);
    }
  }

  success(message, data = null) {
    const logEntry = this.formatLogEntry('success', message, data);
    this.writeToFile(logEntry);
  }
}

// Create singleton instance
let loggerInstance = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = new ElectronLogger();
  }
  return loggerInstance;
}

module.exports = { getLogger };