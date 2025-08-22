import React from 'react';

const ProgressDisplay = ({ progress }) => {
  if (!progress) return null;

  return (
    <div className="bulk-progress">
      <div className="progress-info">
        <span>Fetching metadata: {progress.currentFile}</span>
        <span>{progress.current} of {progress.total} files</span>
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress.progress}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressDisplay;