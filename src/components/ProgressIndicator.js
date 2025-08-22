import React from 'react';

const ProgressIndicator = ({ 
  isVisible = false,
  title = "Processing...",
  progress = 0,
  currentItem = "",
  total = 0,
  current = 0,
  showDetails = true,
  size = "medium",
  type = "circular" // circular or linear
}) => {
  if (!isVisible) return null;

  const percentage = Math.min(Math.max(progress, 0), 100);
  
  const CircularProgress = () => (
    <div className={`progress-circular ${size}`}>
      <svg className="progress-ring" viewBox="0 0 120 120">
        <circle
          className="progress-ring-background"
          cx="60"
          cy="60"
          r="54"
          fill="transparent"
          stroke="var(--cyber-bg-secondary)"
          strokeWidth="8"
        />
        <circle
          className="progress-ring-progress"
          cx="60"
          cy="60"
          r="54"
          fill="transparent"
          stroke="var(--cyber-neon-cyan)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(percentage / 100) * 339.292} 339.292`}
          transform="rotate(-90 60 60)"
          style={{
            transition: 'stroke-dasharray 0.3s ease',
            filter: 'drop-shadow(0 0 8px var(--cyber-neon-cyan))'
          }}
        />
      </svg>
      <div className="progress-percentage">
        {Math.round(percentage)}%
      </div>
    </div>
  );

  const LinearProgress = () => (
    <div className="progress-linear">
      <div className="progress-bar-background">
        <div 
          className="progress-bar-fill"
          style={{ 
            width: `${percentage}%`,
            background: 'linear-gradient(90deg, var(--cyber-neon-cyan), var(--cyber-neon-purple))',
            boxShadow: '0 0 10px var(--cyber-neon-cyan)',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      <div className="progress-percentage-linear">
        {Math.round(percentage)}%
      </div>
    </div>
  );

  return (
    <div className="progress-overlay">
      <div className="progress-modal">
        <div className="progress-header">
          <h3 className="progress-title">{title}</h3>
          <div className="progress-spinner">
            <div className="cyber-spinner"></div>
          </div>
        </div>
        
        <div className="progress-content">
          {type === "circular" ? <CircularProgress /> : <LinearProgress />}
          
          {showDetails && (
            <div className="progress-details">
              {total > 0 && (
                <div className="progress-count">
                  {current} of {total} files
                </div>
              )}
              {currentItem && (
                <div className="progress-current-item">
                  <span className="progress-label">Processing:</span>
                  <span className="progress-filename">{currentItem}</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="progress-footer">
          <div className="progress-tips">
            <span className="tip-icon">💡</span>
            <span className="tip-text">
              Large operations may take some time. Please be patient.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;