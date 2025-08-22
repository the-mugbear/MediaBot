const fs = require('fs').promises;
const path = require('path');
const { getLogger } = require('../services/logger');

const logger = getLogger();

/**
 * Check if a file or directory exists
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely create directory structure
 */
async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    logger.debug(`Directory created: ${dirPath}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to create directory: ${dirPath}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Safely rename/move a file or directory
 */
async function safeRename(oldPath, newPath) {
  try {
    // Check source exists
    if (!(await pathExists(oldPath))) {
      throw new Error('Source path does not exist');
    }

    // Check destination doesn't exist
    if (await pathExists(newPath)) {
      throw new Error('Destination path already exists');
    }

    await fs.rename(oldPath, newPath);
    logger.info(`Renamed: ${oldPath} -> ${newPath}`);
    return { success: true, oldPath, newPath };
  } catch (error) {
    logger.error(`Rename failed: ${oldPath} -> ${newPath}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean filename for safe filesystem operations
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Generate unique temp filename with proper extension
 */
function generateTempPath(originalPath, suffix = 'tmp') {
  const ext = path.extname(originalPath);
  const baseName = path.basename(originalPath, ext);
  const dirName = path.dirname(originalPath);
  return path.join(dirName, `${baseName}.${suffix}.${Date.now()}${ext}`);
}

/**
 * Clean up temp files matching pattern
 */
async function cleanupTempFiles(directory, pattern = /\.tmp\.\d+\./i) {
  try {
    const files = await fs.readdir(directory);
    const tempFiles = files.filter(file => pattern.test(file));
    
    for (const tempFile of tempFiles) {
      const filePath = path.join(directory, tempFile);
      try {
        await fs.unlink(filePath);
        logger.debug(`Cleaned up temp file: ${filePath}`);
      } catch (error) {
        logger.warn(`Failed to cleanup temp file: ${filePath}`, error);
      }
    }
    
    return { success: true, cleaned: tempFiles.length };
  } catch (error) {
    logger.error(`Temp file cleanup failed in: ${directory}`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomic file replacement using temp file
 */
async function atomicReplace(targetPath, tempPath) {
  try {
    await fs.rename(tempPath, targetPath);
    logger.debug(`Atomic replace completed: ${targetPath}`);
    return { success: true };
  } catch (error) {
    // Cleanup temp file if replacement fails
    try {
      await fs.unlink(tempPath);
    } catch {}
    
    logger.error(`Atomic replace failed: ${targetPath}`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  pathExists,
  ensureDirectory,
  safeRename,
  sanitizeFilename,
  generateTempPath,
  cleanupTempFiles,
  atomicReplace
};