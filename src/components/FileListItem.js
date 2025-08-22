import React from 'react';
import MetadataDisplay from './MetadataDisplay';

const FileListItem = ({ 
  file, 
  isSelected, 
  onFileSelect, 
  onRemoveFile, 
  onMetadataLoad 
}) => {
  return (
    <div className={`file-item ${isSelected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onFileSelect(file.id)}
      />
      <div className="file-info">
        <div className="file-name">{file.name}</div>
        <div className="file-path">{file.directory}</div>
        <div className="file-status">
          Status: <span className={`status-${file.status}`}>{file.status}</span>
        </div>
        <MetadataDisplay 
          file={file} 
          onMetadataLoad={onMetadataLoad}
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
  );
};

export default FileListItem;