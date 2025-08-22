const { app, BrowserWindow } = require('electron');
const path = require('path');

// Simple development mode check
const isDev = !app.isPackaged;

// Import modular handlers
const { registerFileHandlers } = require('./electron/handlers/fileHandlers');
const { registerMetadataHandlers } = require('./electron/handlers/metadataHandlers');
const { registerSettingsHandlers } = require('./electron/handlers/settingsHandlers');
const { registerApiHandlers } = require('./electron/handlers/apiHandlers');
const { getLogger } = require('./electron/services/logger');

let mainWindow;
let logger;

// Initialize logging as early as possible
function initializeLogging() {
  try {
    logger = getLogger();
    logger.info('MediaBot application starting', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      isDevelopment: isDev
    });
  } catch (error) {
    console.error('Failed to initialize logging:', error);
  }
}

function createWindow() {
  logger.info('Creating main application window');

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
    
  logger.info(`Loading application from: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    logger.info('Application window ready, showing to user');
    mainWindow.show();
    
    // Focus the window
    if (isDev) {
      mainWindow.webContents.openDevTools();
      logger.debug('Development mode: DevTools opened');
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    logger.info('Main window closed');
    mainWindow = null;
  });

  // Handle navigation attempts (security)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'http://localhost:3000' && !navigationUrl.startsWith('file://')) {
      logger.warn('Blocked navigation attempt', { url: navigationUrl });
      event.preventDefault();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.info('External link requested', { url });
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerAllHandlers() {
  try {
    logger.info('Registering IPC handlers');
    
    // Register all modular handlers
    registerFileHandlers();
    registerMetadataHandlers();
    registerSettingsHandlers();
    registerApiHandlers();
    
    logger.success('All IPC handlers registered successfully');
  } catch (error) {
    logger.error('Failed to register IPC handlers', error);
    throw error;
  }
}

// App event handlers
app.whenReady().then(() => {
  initializeLogging();
  registerAllHandlers();
  createWindow();
  
  logger.info('MediaBot application ready');
});

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    logger.info('Quitting application');
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.info('Activating application - creating new window');
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    logger.warn('Blocked new window creation attempt', { url: navigationUrl });
    event.preventDefault();
  });
});

// Handle app crashes and errors
process.on('uncaughtException', (error) => {
  if (logger) {
    logger.error('Uncaught exception', error);
  } else {
    console.error('Uncaught exception before logging initialized:', error);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  if (logger) {
    logger.error('Unhandled promise rejection', { reason, promise });
  } else {
    console.error('Unhandled promise rejection before logging initialized:', reason);
  }
});

// Handle app termination
app.on('before-quit', () => {
  if (logger) {
    logger.info('Application shutting down');
  }
});

// Export for testing purposes
module.exports = { app, createWindow };