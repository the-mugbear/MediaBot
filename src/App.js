import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FileList from './components/FileList';
import RenamePanel from './components/RenamePanel';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  useEffect(() => {
    // Listen for file selections from Electron menu
    if (window.electronAPI) {
      window.electronAPI.onFilesSelected((event, filePaths) => {
        const newFiles = filePaths.map(filePath => ({
          id: Date.now() + Math.random(),
          path: filePath,
          name: window.nodeAPI.path.basename(filePath),
          directory: window.nodeAPI.path.dirname(filePath),
          status: 'pending'
        }));
        setFiles(prev => [...prev, ...newFiles]);
        setActiveTab('files');
      });

      window.electronAPI.onFolderSelected((event, folderPath) => {
        // Scan folder for media files
        scanFolder(folderPath);
        setActiveTab('files');
      });
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
      // Use glob to find media files
      const mediaExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'];
      const pattern = `${folderPath}/**/*.{${mediaExtensions.join(',')}}`;
      
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
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
  };

  const handleFileDrop = (droppedFiles) => {
    // Check if we received already-formatted file objects (from folder scanning)
    if (droppedFiles.length > 0 && droppedFiles[0].hasOwnProperty('path') && droppedFiles[0].hasOwnProperty('name')) {
      // Already formatted file objects from backend
      console.log('App: Received formatted file objects:', droppedFiles);
      setFiles(prev => [...prev, ...droppedFiles]);
    } else {
      // HTML5 drag-and-drop files that need formatting
      console.log('App: Received HTML5 files, formatting...');
      const newFiles = Array.from(droppedFiles).map(file => ({
        id: Date.now() + Math.random(),
        path: file.path || file.name,
        name: file.name,
        directory: file.path ? window.nodeAPI.path.dirname(file.path) : '',
        status: 'pending'
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
    setSelectedFiles(prev => prev.filter(id => id !== fileId));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setSelectedFiles([]);
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
    <div className="app-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;