import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import RenamePanel from './components/RenamePanel';
import SettingsPanel from './components/SettingsPanel';
import DependencyChecker from './components/DependencyChecker';
import Terminal from './components/Terminal';
import { logger } from './hooks/useLogger';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isTerminalVisible, setIsTerminalVisible] = useState(false);

  useEffect(() => {
    logger.info('MediaBot application initialized', { version: '1.0', theme: 'cyberpunk' });
    
    // Test various log levels on startup
    setTimeout(() => {
      logger.success('System ready for media processing');
      logger.debug('Debug logging enabled');
      logger.file('File system monitoring active');
      logger.api('API services initialized');
      logger.metadata('Metadata services ready');
    }, 1000);
    
    // Listen for file selections from Electron menu
    if (window.electronAPI) {
      window.electronAPI.onFilesSelected((event, filePaths) => {
        logger.file(`Files selected via menu: ${filePaths.length} file(s)`, { paths: filePaths });
        
        const newFiles = filePaths.map(filePath => ({
          id: Date.now() + Math.random(),
          path: filePath,
          name: window.nodeAPI.path.basename(filePath),
          directory: window.nodeAPI.path.dirname(filePath),
          status: 'pending'
        }));
        setFiles(prev => [...prev, ...newFiles]);
        setActiveTab('files');
        
        logger.success(`Added ${newFiles.length} files to queue`);
      });

      window.electronAPI.onFolderSelected((event, folderPath) => {
        logger.file(`Folder selected via menu: ${folderPath}`);
        // Scan folder for media files
        scanFolder(folderPath);
        setActiveTab('files');
      });
    } else {
      logger.warn('Electron API not available - running in browser mode');
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('files-selected');
        window.electronAPI.removeAllListeners('folder-selected');
      }
    };
  }, []);

  const scanFolder = async (folderPath) => {
    try {
      logger.info(`Scanning folder for media files: ${folderPath}`);
      
      // Use glob to find media files
      const mediaExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'];
      const pattern = `${folderPath}/**/*.{${mediaExtensions.join(',')}}`;
      
      logger.debug(`Search pattern: ${pattern}`, { extensions: mediaExtensions });
      
      // This would need to be implemented with proper async file scanning
      // For now, we'll just add the folder as a placeholder
      const newFile = {
        id: Date.now(),
        path: folderPath,
        name: window.nodeAPI.path.basename(folderPath),
        directory: window.nodeAPI.path.dirname(folderPath),
        status: 'folder',
        isFolder: true
      };
      setFiles(prev => [...prev, newFile]);
      
      logger.success(`Folder scan complete: ${folderPath}`);
    } catch (error) {
      logger.error('Error scanning folder', { error: error.message, folderPath });
    }
  };

  const handleFileDrop = (droppedFiles) => {
    logger.file(`Files dropped: ${droppedFiles.length} file(s)`);
    
    // Check if we received already-formatted file objects (from folder scanning)
    if (droppedFiles.length > 0 && droppedFiles[0].hasOwnProperty('path') && droppedFiles[0].hasOwnProperty('name')) {
      // Already formatted file objects from backend
      logger.debug('Received formatted file objects from backend', { count: droppedFiles.length });
      setFiles(prev => [...prev, ...droppedFiles]);
      logger.success(`Added ${droppedFiles.length} formatted files to queue`);
    } else {
      // HTML5 drag-and-drop files that need formatting
      logger.debug('Processing HTML5 drag-and-drop files', { count: droppedFiles.length });
      const newFiles = Array.from(droppedFiles).map(file => ({
        id: Date.now() + Math.random(),
        path: file.path || file.name,
        name: file.name,
        directory: file.path ? window.nodeAPI.path.dirname(file.path) : '',
        status: 'pending'
      }));
      setFiles(prev => [...prev, ...newFiles]);
      logger.success(`Processed and added ${newFiles.length} dropped files to queue`);
    }
  };

  const removeFile = (fileId) => {
    const fileToRemove = files.find(f => f.id === fileId);
    if (fileToRemove) {
      logger.file(`Removing file from queue: ${fileToRemove.name}`);
    }
    setFiles(prev => prev.filter(file => file.id !== fileId));
    setSelectedFiles(prev => prev.filter(id => id !== fileId));
    logger.success('File removed from queue');
  };

  const clearAllFiles = () => {
    const fileCount = files.length;
    logger.file(`Clearing all files from queue (${fileCount} files)`);
    setFiles([]);
    setSelectedFiles([]);
    logger.success(`Queue cleared - removed ${fileCount} files`);
  };

  const handleFileUpdate = (fileId, updates) => {
    const file = files.find(f => f.id === fileId);
    if (file && updates.status) {
      logger.file(`File status updated: ${file.name} -> ${updates.status}`, { updates });
    }
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, ...updates } : file
    ));
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'files':
        return (
          <FileList
            files={files}
            selectedFiles={selectedFiles}
            onFileSelect={setSelectedFiles}
            onFileDrop={handleFileDrop}
            onRemoveFile={removeFile}
            onClearAll={clearAllFiles}
            onFileUpdate={handleFileUpdate}
          />
        );
      case 'rename':
        return (
          <RenamePanel
            files={files}
            selectedFiles={selectedFiles}
            onUpdateFiles={setFiles}
          />
        );
      case 'settings':
        return <SettingsPanel />;
      default:
        return <div>Select a tab from the sidebar</div>;
    }
  };

  return (
    <DependencyChecker>
      <div className="app-container">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="main-content">
          {renderContent()}
        </main>
        <Terminal 
          isVisible={isTerminalVisible} 
          onToggle={() => setIsTerminalVisible(!isTerminalVisible)} 
        />
      </div>
    </DependencyChecker>
  );
}

export default App;