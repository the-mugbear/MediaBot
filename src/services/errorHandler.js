// User-friendly error handling service
// Converts technical errors to user-friendly messages and provides action suggestions

class ErrorHandler {
  constructor() {
    this.errorCategories = {
      NETWORK: 'network',
      FILE_SYSTEM: 'filesystem',
      API: 'api',
      DEPENDENCY: 'dependency',
      VALIDATION: 'validation',
      PERMISSION: 'permission',
      UNKNOWN: 'unknown'
    };

    this.commonErrors = new Map([
      // Network errors
      ['ENOTFOUND', { category: 'network', message: 'Unable to connect to the internet. Please check your network connection.' }],
      ['ECONNREFUSED', { category: 'network', message: 'Connection refused. The service may be temporarily unavailable.' }],
      ['ETIMEDOUT', { category: 'network', message: 'Request timed out. Please check your internet connection and try again.' }],
      ['fetch failed', { category: 'network', message: 'Network request failed. Please check your internet connection.' }],
      
      // File system errors
      ['ENOENT', { category: 'filesystem', message: 'File or folder not found. It may have been moved or deleted.' }],
      ['EACCES', { category: 'permission', message: 'Permission denied. Please check file permissions or run as administrator.' }],
      ['EPERM', { category: 'permission', message: 'Operation not permitted. You may need administrator privileges.' }],
      ['EEXIST', { category: 'filesystem', message: 'File or folder already exists. Choose a different name or location.' }],
      ['ENOSPC', { category: 'filesystem', message: 'Not enough storage space available. Please free up some disk space.' }],
      ['EMFILE', { category: 'filesystem', message: 'Too many files open. Please close some applications and try again.' }],
      
      // API errors
      ['401', { category: 'api', message: 'Invalid API key. Please check your API configuration in Settings.' }],
      ['403', { category: 'api', message: 'API access forbidden. Your API key may have expired or lacks permissions.' }],
      ['404', { category: 'api', message: 'Content not found. The movie or TV show may not be in the database.' }],
      ['429', { category: 'api', message: 'Too many requests. Please wait a moment before trying again.' }],
      ['500', { category: 'api', message: 'Server error. The API service is experiencing issues. Please try again later.' }],
      ['503', { category: 'api', message: 'Service unavailable. The API is temporarily down for maintenance.' }],
      
      // Dependency errors
      ['ffmpeg not found', { category: 'dependency', message: 'FFmpeg is not installed or not found in PATH. Please install FFmpeg to use metadata features.' }],
      ['command not found', { category: 'dependency', message: 'Required software not found. Please check the installation guide.' }],
      
      // Validation errors
      ['Invalid format', { category: 'validation', message: 'Invalid file format. Please select supported media files only.' }],
      ['No files selected', { category: 'validation', message: 'Please select files to process first.' }],
      ['Empty filename', { category: 'validation', message: 'Filename cannot be empty. Please provide a valid filename.' }]
    ]);
  }

  /**
   * Process an error and return user-friendly information
   * @param {Error|string} error - The error to process
   * @param {string} context - Additional context about where the error occurred
   * @returns {object} Processed error information
   */
  processError(error, context = '') {
    const errorString = error.toString().toLowerCase();
    const errorMessage = error.message || error.toString();

    // Try to match known error patterns
    for (const [pattern, errorInfo] of this.commonErrors) {
      if (errorString.includes(pattern.toLowerCase())) {
        return {
          category: errorInfo.category,
          userMessage: errorInfo.message,
          technicalMessage: errorMessage,
          suggestions: this.getSuggestions(errorInfo.category, pattern),
          context: context,
          severity: this.getSeverity(errorInfo.category),
          recoverable: this.isRecoverable(errorInfo.category)
        };
      }
    }

    // Fallback for unknown errors
    return {
      category: this.errorCategories.UNKNOWN,
      userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
      technicalMessage: errorMessage,
      suggestions: ['Try refreshing the application', 'Check the terminal for more details', 'Restart the application if the issue continues'],
      context: context,
      severity: 'medium',
      recoverable: true
    };
  }

  /**
   * Get suggestions based on error category
   * @param {string} category - Error category
   * @param {string} pattern - Specific error pattern
   * @returns {array} Array of suggestion strings
   */
  getSuggestions(category, pattern) {
    const suggestions = {
      network: [
        'Check your internet connection',
        'Try again in a few moments',
        'Verify firewall settings',
        'Contact your network administrator if on a corporate network'
      ],
      filesystem: [
        'Check if the file or folder exists',
        'Verify you have write permissions',
        'Ensure enough disk space is available',
        'Try running as administrator'
      ],
      api: [
        'Check API keys in Settings',
        'Verify API service status',
        'Try a different search term',
        'Wait a few minutes before retrying'
      ],
      dependency: [
        'Install required software (FFmpeg, etc.)',
        'Check system PATH configuration',
        'Restart the application after installation',
        'Consult the installation guide'
      ],
      validation: [
        'Check your input data',
        'Select appropriate files',
        'Verify format requirements',
        'Review the operation instructions'
      ],
      permission: [
        'Run as administrator',
        'Check file/folder permissions',
        'Ensure files are not in use by other programs',
        'Try moving files to a different location'
      ]
    };

    return suggestions[category] || suggestions.validation;
  }

  /**
   * Get error severity level
   * @param {string} category - Error category
   * @returns {string} Severity level (low, medium, high, critical)
   */
  getSeverity(category) {
    const severityMap = {
      network: 'medium',
      filesystem: 'high',
      api: 'medium',
      dependency: 'high',
      validation: 'low',
      permission: 'high',
      unknown: 'medium'
    };

    return severityMap[category] || 'medium';
  }

  /**
   * Check if an error is recoverable
   * @param {string} category - Error category
   * @returns {boolean} True if the error is recoverable
   */
  isRecoverable(category) {
    const recoverableCategories = ['network', 'api', 'validation'];
    return recoverableCategories.includes(category);
  }

  /**
   * Create a user-friendly error message dialog
   * @param {object} errorInfo - Processed error information
   * @returns {string} Formatted message for display
   */
  formatErrorMessage(errorInfo) {
    let message = `❌ ${errorInfo.userMessage}\n\n`;
    
    if (errorInfo.context) {
      message += `📍 Context: ${errorInfo.context}\n\n`;
    }

    if (errorInfo.suggestions.length > 0) {
      message += `💡 Suggestions:\n`;
      errorInfo.suggestions.forEach((suggestion, index) => {
        message += `${index + 1}. ${suggestion}\n`;
      });
    }

    return message;
  }

  /**
   * Show a user-friendly error dialog
   * @param {Error|string} error - The error to display
   * @param {string} context - Additional context
   * @param {function} customHandler - Optional custom error handler
   */
  showError(error, context = '', customHandler = null) {
    const errorInfo = this.processError(error, context);
    
    if (customHandler) {
      customHandler(errorInfo);
    } else {
      // Default: show browser alert (can be customized for different UI frameworks)
      const message = this.formatErrorMessage(errorInfo);
      alert(message);
    }

    // Always log technical details to console and logger
    console.error(`[${errorInfo.category.toUpperCase()}] ${context}:`, error);
    
    // Send to application logger if available
    if (typeof window !== 'undefined' && window.logger) {
      window.logger.error(`${context}: ${errorInfo.userMessage}`, {
        category: errorInfo.category,
        technicalMessage: errorInfo.technicalMessage,
        severity: errorInfo.severity
      });
    }
  }

  /**
   * Create a toast notification for less severe errors
   * @param {Error|string} error - The error to display
   * @param {string} context - Additional context
   * @returns {object} Toast notification data
   */
  createToast(error, context = '') {
    const errorInfo = this.processError(error, context);
    
    return {
      type: 'error',
      title: `${errorInfo.category.charAt(0).toUpperCase() + errorInfo.category.slice(1)} Error`,
      message: errorInfo.userMessage,
      duration: errorInfo.severity === 'high' ? 10000 : 5000,
      actions: errorInfo.recoverable ? [
        {
          label: 'Retry',
          action: 'retry'
        },
        {
          label: 'Help',
          action: 'help'
        }
      ] : [
        {
          label: 'Help',
          action: 'help'
        }
      ]
    };
  }

  /**
   * Wrap an async function with error handling
   * @param {function} fn - The async function to wrap
   * @param {string} context - Context for error reporting
   * @param {function} errorHandler - Custom error handler
   * @returns {function} Wrapped function
   */
  wrapAsync(fn, context = '', errorHandler = null) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.showError(error, context, errorHandler);
        throw error; // Re-throw for upstream handling if needed
      }
    };
  }

  /**
   * Add a custom error pattern
   * @param {string} pattern - Error pattern to match
   * @param {object} errorInfo - Error information object
   */
  addCustomError(pattern, errorInfo) {
    this.commonErrors.set(pattern, errorInfo);
  }
}

// Export singleton instance
export default new ErrorHandler();