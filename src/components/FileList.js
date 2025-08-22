import React, { useState, useEffect } from 'react';
import FileListItem from './FileListItem';
import BulkActions from './BulkActions';
import ProgressDisplay from './ProgressDisplay';
import FileOperations from './FileOperations';
import InteractiveBulkMetadata from './InteractiveBulkMetadata';
import apiMetadataService from '../services/apiMetadataService';
import dependencyService from '../services/dependencyService';

const FileList = ({ 
  files, 
  selectedFiles, 
  onFileSelect, 
  onFileDrop, 
  onRemoveFile, 
  onClearAll,
  onFileUpdate
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [fileMetadata, setFileMetadata] = useState({});
  const [bulkFetching, setBulkFetching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [dependencyStatus, setDependencyStatus] = useState(null);
  const [showInteractiveBulk, setShowInteractiveBulk] = useState(false);
  const [bulkFiles, setBulkFiles] = useState([]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    onFileDrop(droppedFiles);
  };

  const handleFileSelect = (fileId) => {
    if (selectedFiles.includes(fileId)) {
      onFileSelect(selectedFiles.filter(id => id !== fileId));
    } else {
      onFileSelect([...selectedFiles, fileId]);
    }
  };

  const selectAll = () => {
    onFileSelect(files.map(file => file.id));
  };

  const deselectAll = () => {
    onFileSelect([]);
  };

  const handleOpenFiles = async () => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          const newFiles = result.filePaths.map(filePath => ({
            id: Date.now() + Math.random(),
            path: filePath,
            name: window.nodeAPI.path.basename(filePath),
            directory: window.nodeAPI.path.dirname(filePath),
            status: 'pending'
          }));
          onFileDrop(newFiles);
        }
      } catch (error) {
        console.error('Failed to open files:', error);
      }
    }
  };

  const handleOpenFolder = async () => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.showOpenDialog({
          properties: ['openDirectory']
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          const folderPath = result.filePaths[0];
          
          // Temporarily disable rename functionality to test if that's causing the issue
          await scanFolderForMedia(folderPath);
        }
      } catch (error) {
        console.error('Failed to open folder:', error);
      }
    }
  };

  const scanFolderForMedia = async (folderPath) => {
    try {
      console.log('Frontend: Starting folder scan for:', folderPath);
      const result = await window.electronAPI.scanFolderForMedia(folderPath);
      console.log('Frontend: Received result from backend:', result);
      
      if (result && result.success) {
        if (result.files && result.files.length > 0) {
          console.log(`Frontend: Found ${result.files.length} media files:`, result.files);
          onFileDrop(result.files);
          console.log('Frontend: Called onFileDrop with files');
        } else {
          const folderName = window.nodeAPI.path.basename(folderPath);
          console.log(`Frontend: No media files found in "${folderName}"`);
          alert(`No media files found in "${folderName}"`);
        }
      } else {
        console.error('Frontend: Folder scan failed:', result);
        alert(`Failed to scan folder: ${result ? result.error : 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Frontend: Error scanning folder:', error);
      alert('Failed to scan folder for media files');
    }
  };

  const showFolderRenameDialog = async (folderPath) => {
    const folderName = window.nodeAPI.path.basename(folderPath);
    const parentPath = window.nodeAPI.path.dirname(folderPath);
    
    const shouldRename = window.confirm(
      `Selected folder: "${folderName}"\n\n` +
      `Would you like to rename this folder to something more organized?\n\n` +
      `Current path: ${folderPath}`
    );
    
    if (!shouldRename) {
      return false; // User chose not to rename
    }
    
    const newName = window.prompt(
      `Enter new name for the folder:\n\n` +
      `Current name: "${folderName}"`,
      folderName
    );
    
    if (newName === null) {
      return null; // User canceled
    }
    
    if (newName === folderName) {
      return false; // No change needed
    }
    
    if (!newName.trim()) {
      alert('Folder name cannot be empty.');
      return await showFolderRenameDialog(folderPath); // Retry
    }
    
    try {
      const newPath = window.nodeAPI.path.join(parentPath, newName.trim());
      
      // Check if folder already exists (the rename function will handle this check)
      // This avoids potential async issues with pathExists
      
      // Perform the rename using electron API
      const result = await window.electronAPI.renameFolder(folderPath, newPath);
      
      if (result.success) {
        alert(`Folder successfully renamed to: "${newName}"`);
        return newPath;
      } else {
        alert(`Failed to rename folder: ${result.error}`);
        
        // If the error is about folder already existing, offer to retry
        if (result.error.includes('already exists')) {
          return await showFolderRenameDialog(folderPath); // Retry
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error renaming folder:', error);
      alert(`Error renaming folder: ${error.message}`);
      return false;
    }
  };

  const handleMetadataLoad = (fileId, metadata) => {
    setFileMetadata(prev => ({
      ...prev,
      [fileId]: metadata
    }));
    
    // Update the file object with metadata info if onFileUpdate is provided
    if (onFileUpdate) {
      onFileUpdate(fileId, {
        hasMetadata: metadata.hasContent,
        metadataCompleteness: metadata.completeness
      });
    }
  };

  const handleBulkFetchMetadata = async () => {
    // Check dependencies first
    const validation = await dependencyService.validateOperation(['ffmpeg']);
    if (!validation.valid) {
      return; // User was already prompted with installation instructions
    }

    // Check API configuration
    const apiConfig = await apiMetadataService.checkApiConfiguration();
    if (!apiConfig.configured) {
      alert('Please configure API keys in Settings first.\n\n' + apiConfig.message);
      return;
    }

    const selectedFileObjects = files.filter(file => selectedFiles.includes(file.id));
    
    if (selectedFileObjects.length === 0) {
      alert('Please select files to fetch metadata for.');
      return;
    }

    const confirmMessage = `Start interactive metadata fetch for ${selectedFileObjects.length} selected files?\n\n` +
                          'This will:\n' +
                          '• Show you potential matches for each file\n' +
                          '• Let you confirm or select the correct metadata\n' +
                          '• Apply metadata only after your confirmation\n' +
                          '• Allow you to skip files with incorrect matches\n\n' +
                          'Continue?';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setBulkFiles(selectedFileObjects);
    setShowInteractiveBulk(true);
  };

  const handleInteractiveBulkComplete = (result) => {
    setShowInteractiveBulk(false);
    setBulkFiles([]);
    
    if (!result.success && result.error) {
      // Handle setup errors (like missing API keys)
      alert(`Interactive metadata fetch failed:\n\n${result.error}`);
      return;
    }
    
    const summary = result.summary;
    let message = `Interactive metadata fetch completed!\n\n`;
    message += `📊 Results:\n`;
    message += `✅ Confirmed: ${summary.successful}\n`;
    message += `⏭️ Skipped: ${summary.skipped}\n`;
    message += `❌ Failed: ${summary.failed}\n`;
    
    if (summary.errors.length > 0 && summary.errors.length <= 5) {
      message += `\n🚫 Errors:\n${summary.errors.slice(0, 5).join('\n')}`;
      if (summary.errors.length > 5) {
        message += `\n... and ${summary.errors.length - 5} more`;
      }
    }

    alert(message);
  };

  const handleInteractiveBulkCancel = () => {
    setShowInteractiveBulk(false);
    setBulkFiles([]);
  };

  return (
    <div className="file-list-container">
      <div className="file-list-header">
        <h2>Media Files</h2>
        <FileOperations 
          onOpenFiles={handleOpenFiles}
          onOpenFolder={handleOpenFolder}
        />
        <BulkActions
          selectedFilesCount={selectedFiles.length}
          bulkFetching={bulkFetching}
          bulkProgress={bulkProgress}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onClearAll={onClearAll}
          onBulkFetchMetadata={handleBulkFetchMetadata}
        />
      </div>

      <ProgressDisplay progress={bulkProgress} />

      {showInteractiveBulk && (
        <InteractiveBulkMetadata
          files={bulkFiles}
          onComplete={handleInteractiveBulkComplete}
          onCancel={handleInteractiveBulkCancel}
        />
      )}

      <div 
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div>
            <p>📂 Drop files here or click "Open Files" / "Open Folder" above</p>
            <p>🎬 Supported formats: MP4, MKV, AVI, MOV, WMV, FLV, WEBM, M4V, MPG, MPEG</p>
            <p>💡 You can also use File menu → Open Files/Folder</p>
          </div>
        ) : (
          <div className="file-grid">
            {files.map(file => (
              <FileListItem
                key={file.id}
                file={file}
                isSelected={selectedFiles.includes(file.id)}
                onFileSelect={handleFileSelect}
                onRemoveFile={onRemoveFile}
                onMetadataLoad={handleMetadataLoad}
              />
            ))}
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="file-list-summary">
          <p>{files.length} files loaded, {selectedFiles.length} selected</p>
        </div>
      )}
    </div>
  );
};

export default FileList;