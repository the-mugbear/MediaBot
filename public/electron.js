const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

// Check if we're in development mode
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false
  });

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            dialog.showOpenDialog(mainWindow, {
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            }).then(result => {
              if (!result.canceled) {
                mainWindow.webContents.send('files-selected', result.filePaths);
              }
            });
          }
        },
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            }).then(result => {
              if (!result.canceled) {
                mainWindow.webContents.send('folder-selected', result.filePaths[0]);
              }
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'actualSize' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About MediaBot',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About MediaBot',
              message: 'MediaBot v1.0.0',
              detail: 'Modern media file renaming and organization tool'
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// API key validation functions
ipcMain.handle('test-api-key', async (event, service, apiKey) => {
  const axios = require('axios');
  
  console.log(`Testing ${service} API key`);
  
  try {
    let result;
    
    switch (service) {
      case 'themoviedb':
        result = await testTheMovieDBKey(apiKey);
        break;
      case 'thetvdb':
        result = await testTheTVDBKey(apiKey);
        break;
      case 'omdb':
        result = await testOMDbKey(apiKey);
        break;
      case 'opensubtitles':
        result = await testOpenSubtitlesKey(apiKey);
        break;
      default:
        return { success: false, error: 'Unknown service' };
    }
    
    return result;
  } catch (error) {
    console.error(`Error testing ${service} API key:`, error);
    return { success: false, error: error.message };
  }
});

async function testTheMovieDBKey(apiKey) {
  const axios = require('axios');
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`, {
      timeout: 10000
    });
    return { 
      success: true, 
      message: 'TheMovieDB API key is valid',
      data: { version: response.data.images?.base_url ? 'API v3' : 'Unknown' }
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: false, error: error.message || 'Connection failed' };
  }
}

async function testTheTVDBKey(apiKey) {
  const axios = require('axios');
  try {
    // TheTVDB v4 uses JWT authentication
    const response = await axios.post('https://api4.thetvdb.com/v4/login', {
      apikey: apiKey
    }, {
      timeout: 10000
    });
    return { 
      success: true, 
      message: 'TheTVDB API key is valid',
      data: { version: 'API v4', token: 'Authenticated' }
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: false, error: error.message || 'Connection failed' };
  }
}

async function testOMDbKey(apiKey) {
  const axios = require('axios');
  try {
    const response = await axios.get(`http://www.omdbapi.com/?apikey=${apiKey}&s=test&type=movie`, {
      timeout: 10000
    });
    
    if (response.data.Error === 'Invalid API key!') {
      return { success: false, error: 'Invalid API key' };
    }
    
    return { 
      success: true, 
      message: 'OMDb API key is valid',
      data: { version: 'OMDb API', response: response.data.Response }
    };
  } catch (error) {
    return { success: false, error: error.message || 'Connection failed' };
  }
}

async function testOpenSubtitlesKey(apiKey) {
  const axios = require('axios');
  try {
    // OpenSubtitles API test - if no key provided, test without auth
    if (!apiKey || apiKey.trim() === '') {
      return { 
        success: true, 
        message: 'OpenSubtitles API key is optional',
        data: { version: 'REST API', status: 'No key provided (optional)' }
      };
    }
    
    const response = await axios.get('https://api.opensubtitles.com/api/v1/infos/user', {
      headers: {
        'Api-Key': apiKey,
        'User-Agent': 'MediaBot v1.0.0'
      },
      timeout: 10000
    });
    
    return { 
      success: true, 
      message: 'OpenSubtitles API key is valid',
      data: { version: 'REST API v1', user: response.data.data?.nickname || 'Authenticated' }
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Test handler to verify IPC is working
ipcMain.handle('test-rename-connection', async (event) => {
  console.log('Electron: Test rename connection called');
  return { success: true, message: 'IPC connection working' };
});

// Debug logging channel
ipcMain.handle('debug-log', async (event, message, data) => {
  console.log(`Electron Debug: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  return { success: true };
});

// Recovery function to restore backup files
ipcMain.handle('restore-backup-files', async (event, folderPath) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  console.log('Electron: Starting backup restoration in:', folderPath);
  
  try {
    const results = [];
    
    const processDirectory = async (dirPath) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.backup')) {
          const backupPath = fullPath;
          const originalPath = backupPath.replace('.backup', '');
          const templatePath = path.join(dirPath, '{n} - {s00e00} - {t}.mkv');
          
          console.log(`Found backup: ${backupPath}`);
          
          try {
            // Check if template file exists and remove it
            try {
              await fs.access(templatePath);
              await fs.unlink(templatePath);
              console.log(`Removed template file: ${templatePath}`);
            } catch (e) {
              // Template file doesn't exist, that's fine
            }
            
            // Restore backup to original name
            await fs.rename(backupPath, originalPath);
            console.log(`Restored: ${backupPath} -> ${originalPath}`);
            
            results.push({
              success: true,
              backup: backupPath,
              restored: originalPath
            });
          } catch (error) {
            console.error(`Failed to restore ${backupPath}:`, error);
            results.push({
              success: false,
              backup: backupPath,
              error: error.message
            });
          }
        }
      }
    };
    
    await processDirectory(folderPath);
    
    console.log('Electron: Backup restoration complete');
    return { success: true, results };
  } catch (error) {
    console.error('Electron: Error during backup restoration:', error);
    return { success: false, error: error.message };
  }
});

// Sanitize filename for filesystem compatibility
function sanitizeFilename(filename) {
  return filename
    // Remove invalid characters
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// File renaming functionality
ipcMain.handle('rename-files', async (event, renameOperations) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  console.log('Electron: Starting file rename operations:', renameOperations.length);
  console.log('Electron: Operations details:', JSON.stringify(renameOperations, null, 2));
  
  const results = [];
  
  for (const operation of renameOperations) {
    const { id, oldPath, newPath, createBackup, needsDirectoryCreation, seasonFolder, seriesFolder } = operation;
    
    console.log(`Electron: Processing operation - ID: ${id}`);
    console.log(`Electron: - Old path: ${oldPath}`);
    console.log(`Electron: - New path: ${newPath}`);
    console.log(`Electron: - Create backup: ${createBackup}`);
    console.log(`Electron: - Needs directory: ${needsDirectoryCreation}`);
    console.log(`Electron: - Season folder: ${seasonFolder}`);
    console.log(`Electron: - Series folder: ${seriesFolder}`);
    
    try {
      // Sanitize the new filename as a safety measure
      const directory = path.dirname(newPath);
      const filename = path.basename(newPath);
      const sanitizedFilename = sanitizeFilename(filename);
      const sanitizedNewPath = path.join(directory, sanitizedFilename);
      
      console.log(`Electron: Renaming ${oldPath} -> ${sanitizedNewPath}`);
      
      // Check if source file exists
      try {
        await fs.access(oldPath);
      } catch (error) {
        throw new Error(`Source file does not exist: ${oldPath}`);
      }
      
      // Check if target already exists
      try {
        await fs.access(sanitizedNewPath);
        throw new Error(`Target file already exists: ${sanitizedNewPath}`);
      } catch (error) {
        // File doesn't exist, which is what we want
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
      // Create directory if needed (for TV shows with season folders)
      if (needsDirectoryCreation) {
        const targetDirectory = path.dirname(sanitizedNewPath);
        console.log(`Electron: Creating directory: ${targetDirectory}`);
        await fs.mkdir(targetDirectory, { recursive: true });
        console.log(`Electron: Directory created successfully`);
      }
      
      // Create backup if requested
      let backupPath = null;
      if (createBackup) {
        backupPath = `${oldPath}.backup`;
        await fs.copyFile(oldPath, backupPath);
        console.log(`Electron: Created backup: ${backupPath}`);
      } else {
        console.log(`Electron: Skipping backup creation`);
      }
      
      // Perform the rename
      console.log(`Electron: Attempting rename operation...`);
      await fs.rename(oldPath, sanitizedNewPath);
      console.log(`Electron: Rename successful`);
      
      // Clean up empty episode folders if we moved from a subfolder
      const oldDirectory = path.dirname(oldPath);
      const oldBasename = path.basename(oldDirectory);
      const isFromEpisodeFolder = oldBasename.includes('S0') && oldBasename.includes('E0');
      
      if (isFromEpisodeFolder) {
        try {
          // Check if the old directory is now empty
          const remaining = await fs.readdir(oldDirectory);
          // Filter out hidden files and common metadata files
          const relevantFiles = remaining.filter(file => 
            !file.startsWith('.') && 
            !file.endsWith('.nfo') && 
            !file.toLowerCase().includes('screen')
          );
          
          if (relevantFiles.length === 0) {
            console.log(`Electron: Removing empty episode folder: ${oldDirectory}`);
            await fs.rmdir(oldDirectory, { recursive: true });
            console.log(`Electron: Empty episode folder removed`);
          } else {
            console.log(`Electron: Episode folder not empty, keeping: ${oldDirectory} (${relevantFiles.length} files remaining)`);
          }
        } catch (cleanupError) {
          console.warn(`Electron: Failed to clean up episode folder ${oldDirectory}:`, cleanupError);
          // Don't fail the operation for cleanup errors
        }
      }
      
      results.push({
        id,
        success: true,
        oldPath,
        newPath: sanitizedNewPath,
        backupPath,
        message: 'File renamed successfully'
      });
      
      console.log(`Electron: Successfully renamed file: ${path.basename(sanitizedNewPath)}`);
      
    } catch (error) {
      console.error(`Electron: Failed to rename ${oldPath}:`, error);
      results.push({
        id,
        success: false,
        oldPath,
        newPath: sanitizedNewPath,
        error: error.message,
        message: `Failed to rename: ${error.message}`
      });
    }
  }
  
  console.log('Electron: Rename operations complete');
  return { success: true, results };
});

ipcMain.handle('scan-folder-for-media', async (event, folderPath) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  console.log('Electron: Starting scan of folder:', folderPath);
  
  try {
    const mediaExtensions = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg']);
    const foundFiles = [];

    const scanDirectory = async (dirPath) => {
      try {
        console.log(`Electron: Scanning directory: ${dirPath}`);
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        console.log(`Electron: Found ${entries.length} entries in ${dirPath}`);
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            console.log(`Electron: Found subdirectory: ${entry.name}`);
            // Recursively scan subdirectories
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase().slice(1);
            console.log(`Electron: Found file: ${entry.name} (ext: ${ext})`);
            if (mediaExtensions.has(ext)) {
              console.log(`Electron: Adding media file: ${entry.name}`);
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
        console.error(`Electron: Failed to scan directory ${dirPath}:`, error);
        throw error; // Re-throw to see the error in the main catch block
      }
    };

    await scanDirectory(folderPath);
    console.log('Electron: Scan complete. Found', foundFiles.length, 'media files');
    return { success: true, files: foundFiles };
  } catch (error) {
    console.error('Electron: Error scanning folder:', error);
    return { success: false, error: error.message };
  }
});

// Metadata writing functionality

// Check if ffmpeg is available
ipcMain.handle('check-ffmpeg', async (event) => {
  return new Promise((resolve) => {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          console.error('FFmpeg not available:', err);
          resolve({ 
            available: false, 
            error: 'FFmpeg not found. Please install FFmpeg to enable metadata writing.' 
          });
        } else {
          console.log('FFmpeg is available');
          resolve({ available: true });
        }
      });
    } catch (requireError) {
      console.error('Failed to load fluent-ffmpeg:', requireError);
      resolve({ 
        available: false, 
        error: 'FFmpeg libraries not installed. Please install FFmpeg to enable metadata writing.' 
      });
    }
  });
});

// Stage metadata in a sidecar file for later processing
ipcMain.handle('stage-metadata', async (event, filePath, metadataMap, options = {}) => {
  const fs = require('fs').promises;
  const path = require('path');

  const stageFile = `${filePath}.metadata.json`;
  
  try {
    // Create metadata staging object
    const stagedMetadata = {
      timestamp: new Date().toISOString(),
      source: metadataMap.encoder || 'MediaBot',
      confidence: options.confidence || 0.5,
      mediaType: metadataMap.media_type || 'unknown',
      metadata: metadataMap,
      applied: false
    };

    await fs.writeFile(stageFile, JSON.stringify(stagedMetadata, null, 2), 'utf8');
    console.log(`Electron: Staged metadata for ${path.basename(filePath)}`);
    
    return { 
      success: true, 
      stagedFile: stageFile,
      message: 'Metadata staged successfully' 
    };
  } catch (error) {
    console.error('Electron: Error staging metadata:', error);
    return { 
      success: false, 
      error: `Failed to stage metadata: ${error.message}` 
    };
  }
});

// Check if metadata is already staged for a file
ipcMain.handle('check-staged-metadata', async (event, filePath) => {
  const fs = require('fs').promises;
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
  } catch (error) {
    return { hasStaged: false };
  }
});

// Apply staged metadata to actual file
ipcMain.handle('apply-staged-metadata', async (event, filePath, options = {}) => {
  const fs = require('fs').promises;
  const path = require('path');
  const stageFile = `${filePath}.metadata.json`;
  
  try {
    // Read staged metadata
    const stagedData = JSON.parse(await fs.readFile(stageFile, 'utf8'));
    const metadataMap = stagedData.metadata;
    
    console.log(`Electron: Applying staged metadata to ${path.basename(filePath)}`);
    
    // Use the optimized metadata writing logic
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
    console.error('Electron: Error applying staged metadata:', error);
    return { 
      success: false, 
      error: `Failed to apply staged metadata: ${error.message}` 
    };
  }
});

// Write metadata to a media file using FFmpeg map_metadata to avoid temp files
ipcMain.handle('write-metadata', async (event, filePath, metadataMap, options = {}) => {
  return await applyMetadataToFile(filePath, metadataMap);
});

// Internal function to apply metadata to file (NO BACKUPS - space efficient)
async function applyMetadataToFile(filePath, metadataMap) {
  const { spawn } = require('child_process');
  const fs = require('fs').promises;
  const path = require('path');

  console.log('Electron: Writing metadata to:', filePath);
  console.log('Electron: Metadata map:', metadataMap);

  return new Promise(async (resolve, reject) => {
    try {
      // Build metadata arguments - output to temp file for atomic replacement
      const ffmpegArgs = [
        '-i', filePath,                    // Input file
        '-map_metadata', '0',              // Copy existing metadata
        '-c', 'copy',                      // Copy streams without re-encoding
        '-avoid_negative_ts', 'make_zero', // Help with some MKV files
        '-y'                               // Overwrite output file
      ];
      
      // Add new metadata options
      Object.entries(metadataMap).forEach(([key, value]) => {
        if (value && value.toString().trim()) {
          // Clean the value - remove problematic characters
          const cleanValue = value.toString()
            .replace(/"/g, "'")       // Replace quotes with apostrophes
            .replace(/\n/g, ' ')      // Replace newlines with spaces
            .replace(/&/g, 'and')     // Replace & with 'and'
            .replace(/[<>|]/g, '')    // Remove problematic shell characters
            .trim();
          console.log(`Electron: Adding metadata ${key}="${cleanValue}"`);
          ffmpegArgs.push('-metadata', `${key}=${cleanValue}`);
        }
      });

      // Output to a unique temp name with same extension to avoid format detection issues
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const dirName = path.dirname(filePath);
      const tempPath = path.join(dirName, `${baseName}.tmp.${Date.now()}${ext}`);
      ffmpegArgs.push(tempPath);

      console.log('Electron: FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));

      // Spawn FFmpeg process
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      ffmpegProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffmpegProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        // Only log major progress milestones to reduce spam
        const timeMatch = data.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          console.log(`Electron: Progress: ${timeMatch[1]}`);
        }
      });

      ffmpegProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Atomic replacement: temp -> original (no backup needed)
            await fs.rename(tempPath, filePath);
            console.log('Electron: Metadata writing completed successfully');
            resolve({ 
              success: true, 
              outputPath: filePath,
              message: 'Metadata written successfully' 
            });
          } catch (replaceError) {
            // Just cleanup temp file if replacement fails
            try { await fs.unlink(tempPath); } catch {}
            resolve({ 
              success: false, 
              error: `File replacement failed: ${replaceError.message}` 
            });
          }
        } else {
          // Cleanup temp file on FFmpeg failure
          try { await fs.unlink(tempPath); } catch {}
          console.error('Electron: FFmpeg process failed with code:', code);
          console.error('Electron: FFmpeg stderr:', stderr);
          
          resolve({ 
            success: false, 
            error: `FFmpeg failed with exit code ${code}: ${stderr || 'Unknown error'}`
          });
        }
      });

      ffmpegProcess.on('error', async (error) => {
        // Cleanup temp file on spawn error
        try { await fs.unlink(tempPath); } catch {}
        console.error('Electron: FFmpeg spawn error:', error);
        resolve({ 
          success: false, 
          error: `Failed to start FFmpeg: ${error.message}`
        });
      });

    } catch (error) {
      resolve({ 
        success: false, 
        error: `Setup error: ${error.message}`
      });
    }
  });
}

// Settings storage using file system (more reliable than localStorage)
ipcMain.handle('save-settings', async (event, settings) => {
  const fs = require('fs').promises;
  const path = require('path');
  const { app } = require('electron');
  
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'mediabot-settings.json');
    
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log('Electron: Settings saved to:', settingsPath);
    
    return { success: true, path: settingsPath };
  } catch (error) {
    console.error('Electron: Failed to save settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-settings', async (event) => {
  const fs = require('fs').promises;
  const path = require('path');
  const { app } = require('electron');
  
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'mediabot-settings.json');
    
    const settingsData = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(settingsData);
    
    console.log('Electron: Settings loaded from:', settingsPath);
    return { success: true, settings: settings };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Electron: No settings file found, returning defaults');
      return { success: true, settings: null };
    }
    console.error('Electron: Failed to load settings:', error);
    return { success: false, error: error.message };
  }
});

// Folder operations for rename functionality
ipcMain.handle('rename-folder', async (event, oldPath, newPath) => {
  const fs = require('fs').promises;
  
  try {
    console.log('Electron: Renaming folder from:', oldPath);
    console.log('Electron: Renaming folder to:', newPath);
    
    // Check if source folder exists
    try {
      await fs.access(oldPath);
    } catch (error) {
      return { success: false, error: 'Source folder does not exist' };
    }
    
    // Check if destination already exists
    try {
      await fs.access(newPath);
      return { success: false, error: 'Destination folder already exists' };
    } catch (error) {
      // Expected - destination should not exist
    }
    
    // Perform the rename
    await fs.rename(oldPath, newPath);
    console.log('Electron: Folder renamed successfully');
    
    return { success: true, oldPath, newPath };
  } catch (error) {
    console.error('Electron: Failed to rename folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('path-exists', async (event, filePath) => {
  const fs = require('fs').promises;
  
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
});

// Complete file organization workflow: folders first, then metadata
ipcMain.handle('organize-files', async (event, operations) => {
  const fs = require('fs').promises;
  const path = require('path');
  
  console.log('Electron: Starting complete file organization workflow');
  console.log('Electron: Processing', operations.length, 'files');
  
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
      console.log(`Electron: Processing file ${operation.id}`);
      console.log(`Electron: Moving ${operation.oldPath} -> ${operation.newPath}`);
      
      // Step 1: Create necessary folder structure
      if (operation.needsDirectoryCreation) {
        const targetDir = path.dirname(operation.newPath);
        console.log(`Electron: Creating directory structure: ${targetDir}`);
        await fs.mkdir(targetDir, { recursive: true });
        result.foldersCreated.push(targetDir);
      }
      
      // Step 2: Move/rename the file to correct location first
      try {
        await fs.access(operation.oldPath);
      } catch (error) {
        throw new Error(`Source file does not exist: ${operation.oldPath}`);
      }
      
      // Check if target already exists
      try {
        await fs.access(operation.newPath);
        throw new Error(`Target file already exists: ${operation.newPath}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
      // Perform the file move/rename
      await fs.rename(operation.oldPath, operation.newPath);
      console.log(`Electron: File moved successfully to ${operation.newPath}`);
      
      result.success = true;
      result.newPath = operation.newPath;
      
      // Step 3: Write metadata (if provided) to the file in its new location
      if (operation.metadata && Object.keys(operation.metadata).length > 0) {
        try {
          console.log(`Electron: Writing metadata for ${operation.newPath}`);
          const metadataResult = await writeMetadataInPlace(operation.newPath, operation.metadata);
          result.metadataWritten = metadataResult.success;
          if (!metadataResult.success) {
            console.warn(`Electron: Metadata writing failed: ${metadataResult.error}`);
          }
        } catch (metadataError) {
          console.warn(`Electron: Metadata writing error: ${metadataError.message}`);
          // Don't fail the entire operation for metadata errors
        }
      }
      
      // Step 4: Clean up empty source directories
      if (operation.cleanupSource) {
        try {
          const sourceDir = path.dirname(operation.oldPath);
          const sourceDirBasename = path.basename(sourceDir);
          
          // Check if it looks like an episode folder to clean up
          if (sourceDirBasename.includes('S0') && sourceDirBasename.includes('E0')) {
            const remaining = await fs.readdir(sourceDir);
            const relevantFiles = remaining.filter(file => 
              !file.startsWith('.') && 
              !file.endsWith('.nfo') && 
              !file.toLowerCase().includes('screen')
            );
            
            if (relevantFiles.length === 0) {
              console.log(`Electron: Removing empty source directory: ${sourceDir}`);
              await fs.rmdir(sourceDir, { recursive: true });
            }
          }
        } catch (cleanupError) {
          console.warn(`Electron: Source cleanup failed: ${cleanupError.message}`);
          // Don't fail for cleanup errors
        }
      }
      
    } catch (error) {
      console.error(`Electron: Error processing file ${operation.id}:`, error);
      result.error = error.message;
    }
    
    results.push(result);
  }
  
  return {
    success: true,
    results: results,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      metadataWritten: results.filter(r => r.metadataWritten).length
    }
  };
});

// Helper function for metadata writing with minimal temp file in same directory
async function writeMetadataInPlace(filePath, metadataMap) {
  const fs = require('fs').promises;
  const path = require('path');
  const { spawn } = require('child_process');
  
  // Create temp file in same directory
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);
  const tempPath = path.join(dir, `${name}.writing${ext}`);
  
  return new Promise(async (resolve) => {
    try {
      const ffmpegArgs = [
        '-i', filePath,
        '-map_metadata', '0',
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero'
      ];
      
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
      
      ffmpegArgs.push(tempPath);
      
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      ffmpegProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpegProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            // Replace original with temp file
            await fs.unlink(filePath);
            await fs.rename(tempPath, filePath);
            resolve({ success: true });
          } catch (replaceError) {
            // Cleanup temp file if replace fails
            try { await fs.unlink(tempPath); } catch {}
            resolve({ success: false, error: `File replacement failed: ${replaceError.message}` });
          }
        } else {
          // Cleanup temp file on FFmpeg failure
          try { await fs.unlink(tempPath); } catch {}
          resolve({ success: false, error: `FFmpeg failed: ${stderr}` });
        }
      });
      
      ffmpegProcess.on('error', async (error) => {
        // Cleanup temp file on spawn error
        try { await fs.unlink(tempPath); } catch {}
        resolve({ success: false, error: error.message });
      });
      
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Read metadata from a media file
ipcMain.handle('read-metadata', async (event, filePath) => {
  const fs = require('fs').promises;
  const path = require('path');

  console.log('Electron: Reading metadata from:', filePath);

  try {
    // Check if fluent-ffmpeg is available
    let ffmpeg;
    try {
      ffmpeg = require('fluent-ffmpeg');
    } catch (requireError) {
      console.error('Electron: fluent-ffmpeg not available:', requireError);
      return { 
        success: false, 
        error: 'FFmpeg not installed. Please install FFmpeg to read metadata.',
        metadata: {}
      };
    }

    // Check if source file exists
    await fs.access(filePath);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error('Electron: FFprobe error:', err);
          resolve({ 
            success: false, 
            error: err.message,
            metadata: {}
          });
        } else {
          console.log('Electron: Metadata read successfully');
          resolve({ 
            success: true, 
            metadata: metadata,
            message: 'Metadata read successfully' 
          });
        }
      });
    });

  } catch (error) {
    console.error('Electron: Error reading metadata:', error);
    return { success: false, error: error.message, metadata: {} };
  }
});