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
    const { id, oldPath, newPath, createBackup, needsDirectoryCreation, seasonFolder } = operation;
    
    console.log(`Electron: Processing operation - ID: ${id}`);
    console.log(`Electron: - Old path: ${oldPath}`);
    console.log(`Electron: - New path: ${newPath}`);
    console.log(`Electron: - Create backup: ${createBackup}`);
    console.log(`Electron: - Needs directory: ${needsDirectoryCreation}`);
    console.log(`Electron: - Season folder: ${seasonFolder}`);
    
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

// Write metadata to a media file
ipcMain.handle('write-metadata', async (event, filePath, metadataMap, options = {}) => {
  const fs = require('fs').promises;
  const path = require('path');

  console.log('Electron: Writing metadata to:', filePath);
  console.log('Electron: Metadata map:', metadataMap);

  try {
    // Check if fluent-ffmpeg is available
    let ffmpeg;
    try {
      ffmpeg = require('fluent-ffmpeg');
    } catch (requireError) {
      console.error('Electron: fluent-ffmpeg not available:', requireError);
      return { 
        success: false, 
        error: 'FFmpeg not installed. Please install FFmpeg to enable metadata writing.' 
      };
    }

    // Check if source file exists
    await fs.access(filePath);

    // Create temporary output path
    const ext = path.extname(filePath);
    const tempPath = filePath.replace(ext, '_temp' + ext);

    return new Promise((resolve, reject) => {
      let ffmpegCommand = ffmpeg(filePath);

      // Add metadata options
      Object.entries(metadataMap).forEach(([key, value]) => {
        if (value && value.toString().trim()) {
          ffmpegCommand = ffmpegCommand.outputOptions(['-metadata', `${key}=${value}`]);
        }
      });

      // Set codec options to avoid re-encoding (much faster)
      ffmpegCommand = ffmpegCommand
        .outputOptions(['-c', 'copy']) // Copy streams without re-encoding
        .output(tempPath);

      ffmpegCommand
        .on('end', async () => {
          try {
            console.log('Electron: Metadata writing completed');
            
            // Replace original file with temp file
            await fs.unlink(filePath);
            await fs.rename(tempPath, filePath);
            
            resolve({ 
              success: true, 
              outputPath: filePath,
              message: 'Metadata written successfully' 
            });
          } catch (error) {
            console.error('Electron: Error replacing file:', error);
            reject({ success: false, error: error.message });
          }
        })
        .on('error', (err) => {
          console.error('Electron: FFmpeg error:', err);
          reject({ success: false, error: err.message });
        })
        .on('progress', (progress) => {
          console.log('Electron: Processing: ' + progress.percent + '% done');
        })
        .run();
    });

  } catch (error) {
    console.error('Electron: Error writing metadata:', error);
    return { success: false, error: error.message };
  }
});