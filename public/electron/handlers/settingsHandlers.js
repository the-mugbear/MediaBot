const { ipcMain, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { getLogger } = require('../services/logger');

const logger = getLogger();

function registerSettingsHandlers() {
  // Settings storage (file-based, more reliable than localStorage)
  ipcMain.handle('save-settings', saveSettings);
  ipcMain.handle('load-settings', loadSettings);
  
  // Application info
  ipcMain.handle('get-app-version', getAppVersion);
  
  logger.info('Settings IPC handlers registered');
}

async function saveSettings(event, settings) {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'mediabot-settings.json');
    
    // Ensure the directory exists
    await fs.mkdir(userDataPath, { recursive: true });
    
    // Write settings with restricted permissions (only owner can read/write)
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), { 
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
    
    logger.info(`Settings saved to: ${settingsPath}`);
    return { success: true, path: settingsPath };
  } catch (error) {
    logger.error('Failed to save settings', error);
    return { success: false, error: error.message };
  }
}

async function loadSettings(event) {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'mediabot-settings.json');
    
    const settingsData = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(settingsData);
    
    logger.info(`Settings loaded from: ${settingsPath}`);
    
    // Don't log the actual settings content to avoid exposing API keys
    logger.debug('Settings loaded successfully', {
      hasApiKeys: !!(settings.apiKeys && Object.keys(settings.apiKeys).length > 0),
      hasPreferences: !!(settings.preferences && Object.keys(settings.preferences).length > 0)
    });
    
    return { success: true, settings: settings };
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('No settings file found, returning defaults');
      return { success: true, settings: null };
    }
    logger.error('Failed to load settings', error);
    return { success: false, error: error.message };
  }
}

function getAppVersion() {
  const version = app.getVersion();
  logger.debug(`App version requested: ${version}`);
  return version;
}

module.exports = { registerSettingsHandlers };