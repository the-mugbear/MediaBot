import React, { useState } from 'react';

const MediaFileCard = ({ file, isSelected, onToggleSelect, onShowDetails }) => {
  const [showPreview, setShowPreview] = useState(false);
  
  // Determine file type and confidence from metadata
  const getMediaType = () => {
    if (file.metadata?.type) {
      return file.metadata.type;
    }
    // Fallback detection from filename
    if (file.name.match(/S\d{2}E\d{2}/i)) return 'tv';
    if (file.name.match(/\d{4}/)) return 'movie';
    return 'unknown';
  };

  const getConfidenceLevel = () => {
    const confidence = file.metadata?.confidence || 0;
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.7) return 'medium';
    if (confidence >= 0.5) return 'low';
    return 'none';
  };

  const mediaType = getMediaType();
  const confidenceLevel = getConfidenceLevel();
  const confidence = file.metadata?.confidence || 0;

  const getTypeIcon = () => {
    switch (mediaType) {
      case 'tv': return '📺';
      case 'movie': return '🎬';
      default: return '❓';
    }
  };

  const getTypeColor = () => {
    switch (mediaType) {
      case 'tv': return 'var(--cyber-tv-color)';
      case 'movie': return 'var(--cyber-movie-color)';
      default: return 'var(--cyber-unknown-color)';
    }
  };

  const getConfidenceColor = () => {
    switch (confidenceLevel) {
      case 'high': return 'var(--cyber-success)';
      case 'medium': return 'var(--cyber-warning)';
      case 'low': return 'var(--cyber-error)';
      default: return 'var(--cyber-text-muted)';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className={`media-file-card ${isSelected ? 'selected' : ''} ${mediaType}`}>
      <div className="card-header">
        <div className="selection-control">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(file.id)}
            className="cyber-checkbox"
          />
        </div>
        
        <div className="type-indicator">
          <span 
            className="type-badge"
            style={{ color: getTypeColor() }}
            title={`${mediaType.toUpperCase()} - ${Math.round(confidence * 100)}% confidence`}
          >
            {getTypeIcon()} {mediaType.toUpperCase()}
          </span>
        </div>
        
        <div className="confidence-indicator">
          <div className="confidence-bar">
            <div 
              className="confidence-fill"
              style={{ 
                width: `${confidence * 100}%`,
                backgroundColor: getConfidenceColor()
              }}
            />
          </div>
          <span className="confidence-text" style={{ color: getConfidenceColor() }}>
            {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>

      <div className="card-body">
        <div className="file-name" title={file.name}>
          <span className="filename-display">{file.name}</span>
        </div>
        
        <div className="file-details">
          <span className="file-size">{formatFileSize(file.size)}</span>
          {file.metadata && (
            <span className="metadata-indicator" title="Has metadata">
              📝
            </span>
          )}
        </div>

        {file.metadata && (
          <div className="media-info">
            {mediaType === 'tv' && (
              <div className="tv-info">
                <div className="series-name">{file.metadata.title || 'Unknown Series'}</div>
                <div className="episode-info">
                  {file.metadata.season && file.metadata.episode && (
                    <span>S{String(file.metadata.season).padStart(2, '0')}E{String(file.metadata.episode).padStart(2, '0')}</span>
                  )}
                  {file.metadata.episodeTitle && (
                    <span className="episode-title">: {file.metadata.episodeTitle}</span>
                  )}
                </div>
              </div>
            )}
            
            {mediaType === 'movie' && (
              <div className="movie-info">
                <div className="movie-title">{file.metadata.title || 'Unknown Movie'}</div>
                {file.metadata.year && (
                  <div className="movie-year">({file.metadata.year})</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card-actions">
        <button 
          className="btn-preview"
          onClick={() => setShowPreview(!showPreview)}
          title="Show change preview"
        >
          {showPreview ? '▼' : '▶'} Preview
        </button>
        
        <button 
          className="btn-details"
          onClick={() => onShowDetails && onShowDetails(file)}
          title="Show full details"
        >
          🔍 Details
        </button>
      </div>

      {showPreview && (
        <div className="change-preview">
          <div className="preview-header">📁 Folder Structure Changes</div>
          <div className="folder-tree">
            <div className="current-path">
              <span className="path-label">Current:</span>
              <code className="path-display">{file.path}</code>
            </div>
            {/* Future folder structure preview will go here */}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaFileCard;