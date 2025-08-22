// Renderer process logging utility that routes to main process logger
class RendererLogger {
  constructor() {
    this.isElectron = window.electronAPI !== undefined;
  }

  async log(level, message, data = null) {
    if (this.isElectron) {
      try {
        await window.electronAPI.log(level, message, data);
      } catch (error) {
        // Fallback to console if IPC fails
        console.error('Failed to send log to main process:', error);
        console.log(`[${level.toUpperCase()}] ${message}`, data);
      }
    } else {
      // Fallback for non-electron environments
      console.log(`[${level.toUpperCase()}] ${message}`, data);
    }
  }

  async debug(message, data = null) {
    await this.log('debug', message, data);
  }

  async info(message, data = null) {
    await this.log('info', message, data);
  }

  async warn(message, data = null) {
    await this.log('warn', message, data);
  }

  async error(message, data = null) {
    await this.log('error', message, data);
  }

  async success(message, data = null) {
    await this.log('success', message, data);
  }
}

// Export singleton instance
export const logger = new RendererLogger();

// Legacy console.log replacement functions
export const log = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logger.info(message);
};

export const error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logger.error(message);
};

export const warn = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logger.warn(message);
};

export const debug = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  logger.debug(message);
};