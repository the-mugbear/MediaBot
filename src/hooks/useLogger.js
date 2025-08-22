import React, { useState, useCallback, useRef } from 'react';

// Global log store
let globalLogs = [];
let logListeners = new Set();
const MAX_LOGS = 1000; // Prevent memory issues

const useLogger = () => {
  const [logs, setLogs] = useState(globalLogs);
  const listenerRef = useRef();

  // Register listener for log updates
  React.useEffect(() => {
    const updateLogs = (newLogs) => {
      setLogs([...newLogs]);
    };
    
    listenerRef.current = updateLogs;
    logListeners.add(updateLogs);
    
    return () => {
      logListeners.delete(updateLogs);
    };
  }, []);

  const addLog = useCallback((level, message, data = null) => {
    const newLog = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      level,
      message,
      data
    };

    // Add to global store
    globalLogs.unshift(newLog);
    
    // Trim if too many logs
    if (globalLogs.length > MAX_LOGS) {
      globalLogs = globalLogs.slice(0, MAX_LOGS);
    }

    // Notify all listeners
    logListeners.forEach(listener => listener(globalLogs));
  }, []);

  const clearLogs = useCallback(() => {
    globalLogs = [];
    logListeners.forEach(listener => listener(globalLogs));
  }, []);

  // Convenience methods for different log levels
  const log = {
    error: (message, data) => addLog('error', message, data),
    warn: (message, data) => addLog('warn', message, data),
    info: (message, data) => addLog('info', message, data),
    debug: (message, data) => addLog('debug', message, data),
    success: (message, data) => addLog('success', message, data),
    file: (message, data) => addLog('file', message, data),
    api: (message, data) => addLog('api', message, data),
    metadata: (message, data) => addLog('metadata', message, data),
  };

  return {
    logs,
    addLog,
    clearLogs,
    log
  };
};

// Global logger instance for use throughout the app
export const logger = (() => {
  let loggerInstance = null;
  
  const getLogger = () => {
    if (!loggerInstance) {
      // Create a logger-like interface that works globally
      loggerInstance = {
        error: (message, data) => {
          console.error(`[ERROR] ${message}`, data);
          addGlobalLog('error', message, data);
        },
        warn: (message, data) => {
          console.warn(`[WARN] ${message}`, data);
          addGlobalLog('warn', message, data);
        },
        info: (message, data) => {
          console.info(`[INFO] ${message}`, data);
          addGlobalLog('info', message, data);
        },
        debug: (message, data) => {
          console.debug(`[DEBUG] ${message}`, data);
          addGlobalLog('debug', message, data);
        },
        success: (message, data) => {
          console.log(`[SUCCESS] ${message}`, data);
          addGlobalLog('success', message, data);
        },
        file: (message, data) => {
          console.log(`[FILE] ${message}`, data);
          addGlobalLog('file', message, data);
        },
        api: (message, data) => {
          console.log(`[API] ${message}`, data);
          addGlobalLog('api', message, data);
        },
        metadata: (message, data) => {
          console.log(`[METADATA] ${message}`, data);
          addGlobalLog('metadata', message, data);
        }
      };
    }
    return loggerInstance;
  };

  const addGlobalLog = (level, message, data) => {
    const newLog = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      level,
      message,
      data
    };

    globalLogs.unshift(newLog);
    
    if (globalLogs.length > MAX_LOGS) {
      globalLogs = globalLogs.slice(0, MAX_LOGS);
    }

    logListeners.forEach(listener => listener(globalLogs));
  };

  return getLogger();
})();

export { useLogger };