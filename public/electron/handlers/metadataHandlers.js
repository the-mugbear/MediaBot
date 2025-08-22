const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { getLogger } = require('../services/logger');
const { generateTempPath, atomicReplace } = require('../utils/fileUtils');

const logger = getLogger();

// Register all metadata-related IPC handlers
function registerMetadataHandlers() {
  // Check FFmpeg availability
  ipcMain.handle('check-ffmpeg', checkFFmpegAvailability);
  
  // Metadata staging system
  ipcMain.handle('stage-metadata', stageMetadata);
  ipcMain.handle('check-staged-metadata', checkStagedMetadata);
  ipcMain.handle('apply-staged-metadata', applyStagedMetadata);
  
  // Direct metadata operations
  ipcMain.handle('write-metadata', writeMetadata);
  ipcMain.handle('read-metadata', readMetadata);
  
  logger.info('Metadata IPC handlers registered');
}

async function checkFFmpegAvailability() {
  return new Promise((resolve) => {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      const { spawn } = require('child_process');
      const os = require('os');
      
      // First check if fluent-ffmpeg can load
      let ffmpegPath = null;
      try {
        ffmpegPath = ffmpeg.getAvailableFormats ? 'fluent-ffmpeg' : null;
      } catch {
        // Continue to manual check
      }
      
      // Manual check for FFmpeg binary availability
      const isWindows = os.platform() === 'win32';
      const ffmpegCommand = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
      
      const testProcess = spawn(ffmpegCommand, ['-version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      testProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      testProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      testProcess.on('close', (code) => {
        if (code === 0 || stdout.includes('ffmpeg version') || stderr.includes('ffmpeg version')) {
          logger.info('FFmpeg availability confirmed', { 
            platform: os.platform(),
            version: (stdout + stderr).match(/ffmpeg version ([^\s]+)/)?.[1] || 'unknown'
          });
          resolve({ 
            available: true,
            version: (stdout + stderr).match(/ffmpeg version ([^\s]+)/)?.[1] || 'unknown',
            platform: os.platform()
          });
        } else {
          const errorMessage = isWindows 
            ? 'FFmpeg not found. Please download FFmpeg from https://ffmpeg.org/download.html#build-windows and add it to your PATH, or place ffmpeg.exe in the application directory.'
            : 'FFmpeg not found. Please install FFmpeg using your package manager (e.g., apt install ffmpeg, brew install ffmpeg) or download from https://ffmpeg.org/download.html';
            
          logger.warn('FFmpeg not available', { 
            platform: os.platform(),
            exitCode: code,
            stderr: stderr.substring(0, 200)
          });
          resolve({ 
            available: false, 
            error: errorMessage,
            platform: os.platform(),
            suggestion: isWindows 
              ? 'Download from https://www.gyan.dev/ffmpeg/builds/ and extract to your PATH'
              : 'Install via package manager or download from official site'
          });
        }
      });
      
      testProcess.on('error', (error) => {
        const errorMessage = isWindows
          ? 'FFmpeg executable not found. Please download FFmpeg for Windows and ensure ffmpeg.exe is in your PATH or application directory.'
          : 'FFmpeg not installed or not in PATH. Please install FFmpeg to enable metadata operations.';
          
        logger.error('FFmpeg process spawn failed', { 
          platform: os.platform(),
          error: error.message,
          code: error.code
        });
        resolve({ 
          available: false, 
          error: errorMessage,
          platform: os.platform(),
          code: error.code,
          suggestion: isWindows 
            ? 'Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/ and extract ffmpeg.exe to your application folder or add to PATH'
            : 'Install FFmpeg using: sudo apt install ffmpeg (Ubuntu/Debian) or brew install ffmpeg (macOS)'
        });
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        testProcess.kill();
        resolve({ 
          available: false, 
          error: 'FFmpeg check timed out. The system may be slow or FFmpeg may be unresponsive.',
          platform: os.platform()
        });
      }, 5000);
      
    } catch (requireError) {
      logger.error('Failed to check FFmpeg', requireError);
      resolve({ 
        available: false, 
        error: 'Failed to check FFmpeg installation. Please ensure FFmpeg is properly installed.',
        details: requireError.message
      });
    }
  });
}

async function stageMetadata(event, filePath, metadataMap, options = {}) {
  const stageFile = `${filePath}.metadata.json`;
  
  try {
    const stagedMetadata = {
      timestamp: new Date().toISOString(),
      source: metadataMap.encoder || 'MediaBot',
      confidence: options.confidence || 0.5,
      mediaType: metadataMap.media_type || 'unknown',
      metadata: metadataMap,
      applied: false
    };

    await fs.writeFile(stageFile, JSON.stringify(stagedMetadata, null, 2), 'utf8');
    logger.info(`Metadata staged for: ${path.basename(filePath)}`);
    
    return { 
      success: true, 
      stagedFile: stageFile,
      message: 'Metadata staged successfully' 
    };
  } catch (error) {
    logger.error('Failed to stage metadata', { filePath, error: error.message });
    return { 
      success: false, 
      error: `Failed to stage metadata: ${error.message}` 
    };
  }
}

async function checkStagedMetadata(event, filePath) {
  const stageFile = `${filePath}.metadata.json`;
  
  try {
    await fs.access(stageFile);
    const stagedData = JSON.parse(await fs.readFile(stageFile, 'utf8'));
    
    return {
      hasStaged: true,
      metadata: stagedData,
      stageFile: stageFile,
      applied: stagedData.applied || false
    };
  } catch {
    return { hasStaged: false };
  }
}

async function applyStagedMetadata(event, filePath, options = {}) {
  const stageFile = `${filePath}.metadata.json`;
  
  try {
    const stagedData = JSON.parse(await fs.readFile(stageFile, 'utf8'));
    const metadataMap = stagedData.metadata;
    
    logger.info(`Applying staged metadata to: ${path.basename(filePath)}`);
    
    const result = await applyMetadataToFile(filePath, metadataMap);
    
    if (result.success) {
      // Mark as applied in the staging file
      stagedData.applied = true;
      stagedData.appliedTimestamp = new Date().toISOString();
      await fs.writeFile(stageFile, JSON.stringify(stagedData, null, 2), 'utf8');
      
      // Optionally remove staging file if requested
      if (options.cleanupStaging) {
        await fs.unlink(stageFile);
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to apply staged metadata', { filePath, error: error.message });
    return { 
      success: false, 
      error: `Failed to apply staged metadata: ${error.message}` 
    };
  }
}

async function writeMetadata(event, filePath, metadataMap, options = {}) {
  return await applyMetadataToFile(filePath, metadataMap);
}

async function readMetadata(event, filePath) {
  logger.info(`Reading metadata from: ${path.basename(filePath)}`);

  try {
    let ffmpeg;
    try {
      ffmpeg = require('fluent-ffmpeg');
    } catch (requireError) {
      logger.error('fluent-ffmpeg not available', requireError);
      return { 
        success: false, 
        error: 'FFmpeg not installed. Please install FFmpeg to read metadata.',
        metadata: {}
      };
    }

    // Check if source file exists
    await fs.access(filePath);

    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          logger.error('FFprobe failed', { filePath, error: err.message });
          resolve({ 
            success: false, 
            error: err.message,
            metadata: {}
          });
        } else {
          logger.success(`Metadata read successfully: ${path.basename(filePath)}`);
          resolve({ 
            success: true, 
            metadata: metadata,
            message: 'Metadata read successfully' 
          });
        }
      });
    });

  } catch (error) {
    logger.error('Error reading metadata', { filePath, error: error.message });
    return { success: false, error: error.message, metadata: {} };
  }
}

// Internal function to apply metadata to file (NO BACKUPS - space efficient)
async function applyMetadataToFile(filePath, metadataMap) {
  logger.info(`Writing metadata to: ${path.basename(filePath)}`);
  logger.debug('Metadata map', metadataMap);

  return new Promise(async (resolve) => {
    try {
      // Build metadata arguments - output to temp file for atomic replacement
      const ffmpegArgs = [
        '-i', filePath,
        '-map_metadata', '0',
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y'
      ];
      
      // Add new metadata options
      Object.entries(metadataMap).forEach(([key, value]) => {
        if (value && value.toString().trim()) {
          const cleanValue = value.toString()
            .replace(/"/g, "'")
            .replace(/\n/g, ' ')
            .replace(/&/g, 'and')
            .replace(/[<>|]/g, '')
            .trim();
          ffmpegArgs.push('-metadata', `${key}=${cleanValue}`);
        }
      });

      const tempPath = generateTempPath(filePath);
      ffmpegArgs.push(tempPath);

      logger.debug(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      // Spawn FFmpeg process
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      ffmpegProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress milestones
        const timeMatch = data.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          logger.debug(`FFmpeg progress: ${timeMatch[1]}`);
        }
      });

      ffmpegProcess.on('close', async (code) => {
        if (code === 0) {
          const replaceResult = await atomicReplace(filePath, tempPath);
          if (replaceResult.success) {
            logger.success(`Metadata writing completed: ${path.basename(filePath)}`);
            resolve({ 
              success: true, 
              outputPath: filePath,
              message: 'Metadata written successfully' 
            });
          } else {
            resolve(replaceResult);
          }
        } else {
          // Cleanup temp file on FFmpeg failure
          try { await fs.unlink(tempPath); } catch {}
          logger.error('FFmpeg process failed', { 
            filePath: path.basename(filePath), 
            exitCode: code, 
            stderr: stderr.substring(0, 500) + (stderr.length > 500 ? '...' : '') 
          });
          
          resolve({ 
            success: false, 
            error: `FFmpeg failed with exit code ${code}: ${stderr || 'Unknown error'}`
          });
        }
      });

      ffmpegProcess.on('error', async (error) => {
        // Cleanup temp file on spawn error
        try { await fs.unlink(tempPath); } catch {}
        logger.error('FFmpeg spawn error', { filePath: path.basename(filePath), error: error.message });
        resolve({ 
          success: false, 
          error: `Failed to start FFmpeg: ${error.message}`
        });
      });

    } catch (error) {
      logger.error('Metadata writing setup error', { filePath: path.basename(filePath), error: error.message });
      resolve({ 
        success: false, 
        error: `Setup error: ${error.message}`
      });
    }
  });
}

module.exports = { registerMetadataHandlers, applyMetadataToFile };