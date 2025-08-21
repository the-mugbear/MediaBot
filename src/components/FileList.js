import React, { useState } from 'react';

const FileList = ({ 
  files, 
  selectedFiles, 
  onFileSelect, 
  onFileDrop, 
  onRemoveFile, 
  onClearAll 
}) => {
  const [dragOver, setDragOver] = useState(false);

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
        </div>
      </div>

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