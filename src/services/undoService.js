// Undo service for file operations
// Tracks file operations and provides undo functionality

import { logger } from '../hooks/useLogger';
import pathUtils from './pathUtils';

class UndoService {
  constructor() {
    this.operations = [];
    this.maxOperations = 50; // Limit memory usage
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
  }

  /**
   * Record a file operation for potential undo
   * @param {object} operation - Operation details
   */
  recordOperation(operation) {
    const undoOperation = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      type: operation.type,
      description: operation.description,
      actions: operation.actions,
      canUndo: operation.canUndo !== false,
      metadata: operation.metadata || {}
    };

    this.operations.unshift(undoOperation);

    // Limit the number of stored operations
    if (this.operations.length > this.maxOperations) {
      this.operations = this.operations.slice(0, this.maxOperations);
    }

    logger.info(`Recorded undoable operation: ${operation.description}`, {
      operationId: undoOperation.id,
      type: operation.type,
      actionsCount: operation.actions.length
    });

    // Notify listeners of state change
    this.notifyListeners();
  }

  /**
   * Record a file rename operation
   * @param {array} renames - Array of rename operations
   * @param {string} description - Human-readable description
   */
  recordRenameOperation(renames, description = 'File rename operation') {
    const actions = renames.map(rename => ({
      type: 'rename',
      oldPath: rename.oldPath,
      newPath: rename.newPath,
      fileId: rename.id || null
    }));

    this.recordOperation({
      type: 'rename',
      description: `${description} (${renames.length} files)`,
      actions: actions,
      metadata: {
        fileCount: renames.length,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Record a metadata write operation
   * @param {array} metadataOps - Array of metadata operations
   * @param {string} description - Human-readable description
   */
  recordMetadataOperation(metadataOps, description = 'Metadata write operation') {
    const actions = metadataOps.map(op => ({
      type: 'metadata',
      filePath: op.filePath,
      oldMetadata: op.oldMetadata || null,
      newMetadata: op.newMetadata,
      backupPath: op.backupPath || null
    }));

    this.recordOperation({
      type: 'metadata',
      description: `${description} (${metadataOps.length} files)`,
      actions: actions,
      metadata: {
        fileCount: metadataOps.length,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Record a file move/copy operation
   * @param {array} moves - Array of move operations
   * @param {string} description - Human-readable description
   */
  recordMoveOperation(moves, description = 'File move operation') {
    const actions = moves.map(move => ({
      type: 'move',
      oldPath: move.oldPath,
      newPath: move.newPath,
      wasCopy: move.wasCopy || false,
      fileId: move.id || null
    }));

    this.recordOperation({
      type: 'move',
      description: `${description} (${moves.length} files)`,
      actions: actions,
      metadata: {
        fileCount: moves.length,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get the list of undoable operations
   * @returns {array} Array of operations that can be undone
   */
  getUndoableOperations() {
    return this.operations.filter(op => op.canUndo);
  }

  /**
   * Get the most recent undoable operation
   * @returns {object|null} The most recent operation or null
   */
  getLastOperation() {
    const undoable = this.getUndoableOperations();
    return undoable.length > 0 ? undoable[0] : null;
  }

  /**
   * Undo the most recent operation
   * @returns {Promise<object>} Result of the undo operation
   */
  async undoLastOperation() {
    const operation = this.getLastOperation();
    if (!operation) {
      throw new Error('No operations available to undo');
    }

    return this.undoOperation(operation.id);
  }

  /**
   * Undo a specific operation by ID
   * @param {string} operationId - ID of the operation to undo
   * @returns {Promise<object>} Result of the undo operation
   */
  async undoOperation(operationId) {
    const operation = this.operations.find(op => op.id === operationId);
    if (!operation) {
      throw new Error('Operation not found');
    }

    if (!operation.canUndo) {
      throw new Error('Operation cannot be undone');
    }

    logger.info(`Starting undo operation: ${operation.description}`, {
      operationId: operation.id,
      type: operation.type,
      actionsCount: operation.actions.length
    });

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each action in reverse order
    for (let i = operation.actions.length - 1; i >= 0; i--) {
      const action = operation.actions[i];
      
      try {
        const result = await this.undoAction(action);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        logger.error(`Failed to undo action`, { action, error: error.message });
        results.push({
          success: false,
          action: action,
          error: error.message
        });
        failureCount++;
      }
    }

    // Mark operation as undone
    operation.canUndo = false;
    operation.undoTimestamp = Date.now();

    const undoResult = {
      success: failureCount === 0,
      operationId: operation.id,
      description: operation.description,
      totalActions: operation.actions.length,
      successCount: successCount,
      failureCount: failureCount,
      results: results
    };

    logger.info(`Undo operation completed`, undoResult);
    this.notifyListeners();

    return undoResult;
  }

  /**
   * Undo a single action
   * @param {object} action - The action to undo
   * @returns {Promise<object>} Result of undoing the action
   */
  async undoAction(action) {
    if (!this.isElectron) {
      throw new Error('Undo operations require Electron environment');
    }

    switch (action.type) {
      case 'rename':
        return this.undoRename(action);
      case 'metadata':
        return this.undoMetadata(action);
      case 'move':
        return this.undoMove(action);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Undo a file rename
   * @param {object} action - Rename action details
   * @returns {Promise<object>} Result of the undo
   */
  async undoRename(action) {
    try {
      // Check if the new file still exists
      const newFileExists = await window.electronAPI.fileExists(action.newPath);
      if (!newFileExists) {
        return {
          success: false,
          action: action,
          error: 'Target file no longer exists'
        };
      }

      // Check if original location is available
      const oldFileExists = await window.electronAPI.fileExists(action.oldPath);
      if (oldFileExists) {
        return {
          success: false,
          action: action,
          error: 'Original location is occupied by another file'
        };
      }

      // Perform the reverse rename
      const result = await window.electronAPI.moveFile(action.newPath, action.oldPath);
      
      return {
        success: result.success,
        action: action,
        error: result.error || null,
        oldPath: action.newPath,
        newPath: action.oldPath
      };
    } catch (error) {
      return {
        success: false,
        action: action,
        error: error.message
      };
    }
  }

  /**
   * Undo a metadata write operation
   * @param {object} action - Metadata action details
   * @returns {Promise<object>} Result of the undo
   */
  async undoMetadata(action) {
    try {
      // If there's a backup, restore it
      if (action.backupPath) {
        const backupExists = await window.electronAPI.fileExists(action.backupPath);
        if (backupExists) {
          const result = await window.electronAPI.moveFile(action.backupPath, action.filePath);
          return {
            success: result.success,
            action: action,
            error: result.error || null,
            method: 'backup_restore'
          };
        }
      }

      // If we have old metadata, restore it
      if (action.oldMetadata) {
        const result = await window.electronAPI.writeMetadata(action.filePath, action.oldMetadata);
        return {
          success: result.success,
          action: action,
          error: result.error || null,
          method: 'metadata_restore'
        };
      }

      // If no backup or old metadata, try to clear metadata
      const result = await window.electronAPI.clearMetadata(action.filePath);
      return {
        success: result.success,
        action: action,
        error: result.error || null,
        method: 'metadata_clear'
      };
    } catch (error) {
      return {
        success: false,
        action: action,
        error: error.message
      };
    }
  }

  /**
   * Undo a file move operation
   * @param {object} action - Move action details
   * @returns {Promise<object>} Result of the undo
   */
  async undoMove(action) {
    try {
      // Check if the new file still exists
      const newFileExists = await window.electronAPI.fileExists(action.newPath);
      if (!newFileExists) {
        return {
          success: false,
          action: action,
          error: 'Target file no longer exists'
        };
      }

      // Check if original location is available
      const oldFileExists = await window.electronAPI.fileExists(action.oldPath);
      if (oldFileExists) {
        return {
          success: false,
          action: action,
          error: 'Original location is occupied by another file'
        };
      }

      // Perform the reverse move
      const result = await window.electronAPI.moveFile(action.newPath, action.oldPath);
      
      return {
        success: result.success,
        action: action,
        error: result.error || null,
        oldPath: action.newPath,
        newPath: action.oldPath
      };
    } catch (error) {
      return {
        success: false,
        action: action,
        error: error.message
      };
    }
  }

  /**
   * Clear all operations (cannot be undone)
   */
  clearOperations() {
    const count = this.operations.length;
    this.operations = [];
    logger.info(`Cleared ${count} undo operations`);
    this.notifyListeners();
  }

  /**
   * Clear operations older than specified age
   * @param {number} maxAgeMs - Maximum age in milliseconds
   */
  clearOldOperations(maxAgeMs = 24 * 60 * 60 * 1000) { // Default: 24 hours
    const cutoff = Date.now() - maxAgeMs;
    const originalCount = this.operations.length;
    
    this.operations = this.operations.filter(op => op.timestamp > cutoff);
    
    const clearedCount = originalCount - this.operations.length;
    if (clearedCount > 0) {
      logger.info(`Cleared ${clearedCount} old undo operations`);
      this.notifyListeners();
    }
  }

  /**
   * Get operation statistics
   * @returns {object} Statistics about stored operations
   */
  getStats() {
    const undoable = this.getUndoableOperations();
    const types = {};
    
    this.operations.forEach(op => {
      types[op.type] = (types[op.type] || 0) + 1;
    });

    return {
      total: this.operations.length,
      undoable: undoable.length,
      types: types,
      oldestTimestamp: this.operations.length > 0 ? 
        Math.min(...this.operations.map(op => op.timestamp)) : null,
      newestTimestamp: this.operations.length > 0 ? 
        Math.max(...this.operations.map(op => op.timestamp)) : null
    };
  }

  /**
   * Set up listeners for operation changes
   */
  setListener(callback) {
    this.listener = callback;
  }

  /**
   * Notify listeners of state changes
   */
  notifyListeners() {
    if (this.listener) {
      this.listener(this.getUndoableOperations());
    }
  }
}

// Export singleton instance
export default new UndoService();