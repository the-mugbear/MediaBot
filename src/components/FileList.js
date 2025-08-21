import React, { useState } from 'react';
import MetadataDisplay from './MetadataDisplay';
import apiMetadataService from '../services/apiMetadataService';

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
    // Check API configuration first
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

    const confirmMessage = `Fetch metadata from APIs and write to ${selectedFileObjects.length} selected files?\n\n` +
                          'This will:\n' +
                          '• Parse each filename to identify the media\n' +
                          '• Search APIs for matching content\n' +
                          '• Write metadata directly to the files\n' +
                          '• Create backup files (.backup)\n\n' +
                          'Continue?';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setBulkFetching(true);
    setBulkProgress({
      current: 0,
      total: selectedFileObjects.length,
      currentFile: '',
      progress: 0
    });

    try {
      const result = await apiMetadataService.batchFetchMetadata(
        selectedFileObjects,
        {
          writeToFile: true,
          createBackup: true,
          skipIfHasMetadata: false,
          delayBetweenCalls: 800 // Be respectful to APIs
        },
        (progress) => {
          setBulkProgress(progress);
        }
      );

      const summary = result.summary;
      let message = `Bulk metadata fetch completed!\n\n`;
      message += `📊 Results:\n`;
      message += `✅ Successful: ${summary.successful}\n`;
      message += `⏭️ Skipped: ${summary.skipped}\n`;
      message += `❌ Failed: ${summary.failed}\n`;
      
      if (summary.errors.length > 0 && summary.errors.length <= 5) {
        message += `\n🚫 Errors:\n${summary.errors.slice(0, 5).join('\n')}`;
        if (summary.errors.length > 5) {
          message += `\n... and ${summary.errors.length - 5} more`;
        }
      }

      alert(message);

      // The metadata has been written to files, the changes will be visible on next scan

    } catch (error) {
      console.error('Bulk fetch error:', error);
      alert(`Error during bulk metadata fetch: ${error.message}`);
    } finally {
      setBulkFetching(false);
      setBulkProgress(null);
    }
  };

  return (
    <div className="file-list-container">
      <div className="file-list-header">
        <h2>Media Files</h2>
        <div className="file-list-actions">
          <button className="btn btn-primary" onClick={handleOpenFiles}>
            📁 Open Files
          </button>
          <button className="btn btn-primary" onClick={handleOpenFolder}>
            📂 Open Folder
          </button>
          <button className="btn btn-secondary" onClick={selectAll}>
            Select All
          </button>
          <button className="btn btn-secondary" onClick={deselectAll}>
            Deselect All
          </button>
          <button className="btn btn-secondary" onClick={onClearAll}>
            Clear List
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleBulkFetchMetadata}
            disabled={selectedFiles.length === 0 || bulkFetching}
            title="Fetch metadata from APIs for selected files"
          >
            {bulkFetching ? (
              bulkProgress ? `⏳ ${bulkProgress.progress}% (${bulkProgress.current}/${bulkProgress.total})` : '⏳ Starting...'
            ) : (
              `🌐 Fetch Metadata (${selectedFiles.length})`
            )}
          </button>
        </div>
      </div>

      {bulkProgress && (
        <div className="bulk-progress">
          <div className="progress-info">
            <span>Fetching metadata: {bulkProgress.currentFile}</span>
            <span>{bulkProgress.current} of {bulkProgress.total} files</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${bulkProgress.progress}%` }}
            ></div>
          </div>
        </div>
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
              <div 
                key={file.id} 
                className={`file-item ${selectedFiles.includes(file.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(file.id)}
                  onChange={() => handleFileSelect(file.id)}
                />
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-path">{file.directory}</div>
                  <div className="file-status">
                    Status: <span className={`status-${file.status}`}>{file.status}</span>
                  </div>
                  <MetadataDisplay 
                    file={file} 
                    onMetadataLoad={handleMetadataLoad}
                  />
                </div>
                <div className="file-actions">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => onRemoveFile(file.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
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