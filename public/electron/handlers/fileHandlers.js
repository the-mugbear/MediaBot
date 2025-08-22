const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { getLogger } = require('../services/logger');
const { pathExists, safeRename, ensureDirectory, sanitizeFilename, cleanupTempFiles } = require('../utils/fileUtils');

const logger = getLogger();

// Set of supported media file extensions
const MEDIA_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 
  'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'asf', 'rm', 'rmvb'
]);

function registerFileHandlers() {
  // Dialog operations
  ipcMain.handle('show-open-dialog', showOpenDialog);
  ipcMain.handle('show-save-dialog', showSaveDialog);
  ipcMain.handle('show-message-box', showMessageBox);
  
  // File system operations
  ipcMain.handle('scan-folder-for-media', scanFolderForMedia);
  ipcMain.handle('rename-folder', renameFolder);
  ipcMain.handle('path-exists', checkPathExists);
  
  // File organization
  ipcMain.handle('rename-files', renameFiles);
  ipcMain.handle('organize-files', organizeFiles);
  ipcMain.handle('restore-backup-files', restoreBackupFiles);
  
  
  logger.info('File operation IPC handlers registered');
}

async function showOpenDialog(event, options) {
  const { BrowserWindow } = require('electron');
  const mainWindow = BrowserWindow.getFocusedWindow();
  
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    logger.debug('Open dialog result', { canceled: result.canceled, fileCount: result.filePaths?.length || 0 });
    return result;
  } catch (error) {
    logger.error('Open dialog failed', error);
    return { canceled: true, filePaths: [] };
  }
}

async function showSaveDialog(event, options) {
  const { BrowserWindow } = require('electron');
  const mainWindow = BrowserWindow.getFocusedWindow();
  
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    logger.debug('Save dialog result', { canceled: result.canceled });
    return result;
  } catch (error) {
    logger.error('Save dialog failed', error);
    return { canceled: true };
  }
}

async function showMessageBox(event, options) {
  const { BrowserWindow } = require('electron');
  const mainWindow = BrowserWindow.getFocusedWindow();
  
  try {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
  } catch (error) {
    logger.error('Message box failed', error);
    return { response: 0 };
  }
}

async function scanFolderForMedia(event, folderPath) {
  logger.info(`Starting folder scan: ${folderPath}`);
  
  try {
    const foundFiles = [];

    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        logger.debug(`Scanning directory: ${dirPath} (${entries.length} entries)`);
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            logger.debug(`Found subdirectory: ${entry.name}`);
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().slice(1);
            if (MEDIA_EXTENSIONS.has(ext)) {
              logger.debug(`Found media file: ${entry.name}`);
              foundFiles.push({
                id: Date.now() + Math.random(),
                path: fullPath,
                name: entry.name,
                directory: dirPath,
                status: 'pending'
              });
            }
          }
        }
      } catch (error) {
        logger.error(`Failed to scan directory: ${dirPath}`, error);
        throw error;
      }
    };

    await scanDirectory(folderPath);
    logger.success(`Scan complete. Found ${foundFiles.length} media files`);
    return { success: true, files: foundFiles };
  } catch (error) {
    logger.error('Folder scan failed', { folderPath, error: error.message });
    return { success: false, error: error.message };
  }
}

async function renameFolder(event, oldPath, newPath) {
  logger.info(`Renaming folder: ${oldPath} -> ${newPath}`);
  return await safeRename(oldPath, newPath);
}

async function checkPathExists(event, filePath) {
  return await pathExists(filePath);
}

async function renameFiles(event, renameOperations) {
  logger.info(`Starting file rename operations (${renameOperations.length} files)`);
  
  const results = [];
  
  for (const operation of renameOperations) {
    const { id, oldPath, newPath, needsDirectoryCreation, seasonFolder, seriesFolder } = operation;
    
    logger.debug(`Processing rename operation`, {
      id,
      oldPath: path.basename(oldPath),
      newPath: path.basename(newPath),
      needsDirectoryCreation,
      seasonFolder,
      seriesFolder
    });
    
    const result = {
      id,
      oldPath,
      newPath,
      success: false,
      error: null
    };
    
    try {
      // Sanitize the new filename as a safety measure
      const sanitizedNewPath = path.join(
        path.dirname(newPath),
        sanitizeFilename(path.basename(newPath))
      );
      
      // Create directory structure if needed
      if (needsDirectoryCreation) {
        const targetDir = path.dirname(sanitizedNewPath);
        const dirResult = await ensureDirectory(targetDir);
        if (!dirResult.success) {
          throw new Error(`Failed to create directory: ${dirResult.error}`);
        }
      }
      
      // Perform the rename
      const renameResult = await safeRename(oldPath, sanitizedNewPath);
      if (renameResult.success) {
        result.success = true;
        result.newPath = sanitizedNewPath;
        logger.success(`File renamed: ${path.basename(oldPath)} -> ${path.basename(sanitizedNewPath)}`);
      } else {
        throw new Error(renameResult.error);
      }
      
    } catch (error) {
      logger.error(`Rename operation failed for ${id}`, error);
      result.error = error.message;
    }
    
    results.push(result);
  }
  
  const summary = {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  };
  
  logger.info('Rename operations completed', summary);
  
  return {
    success: true,
    results,
    summary
  };
}

async function organizeFiles(event, operations) {
  logger.info(`Starting file organization workflow (${operations.length} files)`);
  
  const results = [];
  
  for (const operation of operations) {
    const result = {
      id: operation.id,
      oldPath: operation.oldPath,
      newPath: operation.newPath,
      success: false,
      error: null,
      metadataWritten: false,
      foldersCreated: []
    };
    
    try {
      logger.debug(`Processing organization for file ${operation.id}`);
      
      // Step 1: Create necessary folder structure
      if (operation.needsDirectoryCreation) {
        const targetDir = path.dirname(operation.newPath);
        const dirResult = await ensureDirectory(targetDir);
        if (dirResult.success) {
          result.foldersCreated.push(targetDir);
        } else {
          throw new Error(`Directory creation failed: ${dirResult.error}`);
        }
      }
      
      // Step 2: Move/rename the file
      const moveResult = await safeRename(operation.oldPath, operation.newPath);
      if (!moveResult.success) {
        throw new Error(moveResult.error);
      }
      
      result.success = true;
      result.newPath = operation.newPath;
      logger.success(`File organized: ${path.basename(operation.oldPath)} -> ${operation.newPath}`);
      
      // Step 3: Write metadata (if provided)
      if (operation.metadata && Object.keys(operation.metadata).length > 0) {
        try {
          // Import and use metadata writing function
          const metadataHandlers = require('./metadataHandlers');
          const metadataResult = await metadataHandlers.applyMetadataToFile(operation.newPath, operation.metadata);
          result.metadataWritten = metadataResult.success;
          if (!metadataResult.success) {
            logger.warn(`Metadata writing failed for ${operation.newPath}`, metadataResult.error);
          }
        } catch (metadataError) {
          logger.warn(`Metadata writing error for ${operation.newPath}`, metadataError);
        }
      }
      
      // Step 4: Clean up empty source directories
      if (operation.cleanupSource) {
        try {
          const sourceDir = path.dirname(operation.oldPath);
          const sourceDirName = path.basename(sourceDir);
          
          // Check if it looks like an episode folder to clean up
          if (sourceDirName.includes('S0') && sourceDirName.includes('E0')) {
            const remaining = await fs.readdir(sourceDir);
            const relevantFiles = remaining.filter(file => 
              !file.startsWith('.') && 
              !file.endsWith('.nfo') && 
              !file.toLowerCase().includes('screen')
            );
            
            if (relevantFiles.length === 0) {
              await fs.rmdir(sourceDir, { recursive: true });
              logger.info(`Cleaned up empty source directory: ${sourceDir}`);
            }
          }
        } catch (cleanupError) {
          logger.warn(`Source cleanup failed for ${sourceDir}`, cleanupError);
        }
      }
      
    } catch (error) {
      logger.error(`Organization failed for file ${operation.id}`, error);
      result.error = error.message;
    }
    
    results.push(result);
  }
  
  const summary = {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    metadataWritten: results.filter(r => r.metadataWritten).length
  };
  
  logger.info('File organization completed', summary);
  
  return {
    success: true,
    results,
    summary
  };
}

async function restoreBackupFiles(event, folderPath) {
  logger.info(`Restoring backup files in: ${folderPath}`);
  
  try {
    const files = await fs.readdir(folderPath);
    const backupFiles = files.filter(file => file.endsWith('.backup'));
    
    if (backupFiles.length === 0) {
      return { success: true, message: 'No backup files found', restored: 0 };
    }
    
    let restored = 0;
    for (const backupFile of backupFiles) {
      try {
        const backupPath = path.join(folderPath, backupFile);
        const originalPath = backupPath.replace('.backup', '');
        
        await safeRename(backupPath, originalPath);
        restored++;
        logger.debug(`Restored backup: ${backupFile}`);
      } catch (error) {
        logger.warn(`Failed to restore backup: ${backupFile}`, error);
      }
    }
    
    logger.success(`Backup restoration completed: ${restored}/${backupFiles.length} files restored`);
    return { 
      success: true, 
      message: `Restored ${restored} backup files`, 
      restored,
      total: backupFiles.length 
    };
    
  } catch (error) {
    logger.error('Backup restoration failed', { folderPath, error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = { registerFileHandlers };