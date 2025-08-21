const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Folder scanning
  scanFolderForMedia: (folderPath) => ipcRenderer.invoke('scan-folder-for-media', folderPath),

  // API key testing
  testApiKey: (service, apiKey) => ipcRenderer.invoke('test-api-key', service, apiKey),

  // File renaming and organization
  testRenameConnection: () => ipcRenderer.invoke('test-rename-connection'),
  renameFiles: (renameOperations) => ipcRenderer.invoke('rename-files', renameOperations),
  organizeFiles: (organizeOperations) => ipcRenderer.invoke('organize-files', organizeOperations),
  restoreBackupFiles: (folderPath) => ipcRenderer.invoke('restore-backup-files', folderPath),
  
  // Debug logging
  debugLog: (message, data) => ipcRenderer.invoke('debug-log', message, data),

  // Metadata writing and reading
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  writeMetadata: (filePath, metadataMap, options) => ipcRenderer.invoke('write-metadata', filePath, metadataMap, options),
  readMetadata: (filePath) => ipcRenderer.invoke('read-metadata', filePath),
  
  // Metadata staging system
  stageMetadata: (filePath, metadataMap, options) => ipcRenderer.invoke('stage-metadata', filePath, metadataMap, options),
  checkStagedMetadata: (filePath) => ipcRenderer.invoke('check-staged-metadata', filePath),
  applyStagedMetadata: (filePath, options) => ipcRenderer.invoke('apply-staged-metadata', filePath, options),
  
  // Settings storage (file-based, more reliable than localStorage)
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Folder operations
  renameFolder: (oldPath, newPath) => ipcRenderer.invoke('rename-folder', oldPath, newPath),
  pathExists: (path) => ipcRenderer.invoke('path-exists', path),

  // File system operations
  onFilesSelected: (callback) => ipcRenderer.on('files-selected', callback),
  onFolderSelected: (callback) => ipcRenderer.on('folder-selected', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Node.js APIs for main process operations
contextBridge.exposeInMainWorld('nodeAPI', {
  path: require('path'),
  fs: require('fs-extra'),
  glob: require('glob'),
  os: require('os')
});