import React, { useState, useEffect } from 'react';
import dependencyService from '../services/dependencyService';

const DependencyChecker = ({ children }) => {
  const [dependencyStatus, setDependencyStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkDependencies();
  }, []);

  const checkDependencies = async () => {
    setIsLoading(true);
    try {
      const status = await dependencyService.checkAllDependencies();
      setDependencyStatus(status);
    } catch (error) {
      console.error('Failed to check dependencies:', error);
      setDependencyStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallDependency = async (dependencyName) => {
    await dependencyService.showDependencyDialog(dependencyName);
    // Recheck dependencies after user potentially installs something
    setTimeout(() => {
      checkDependencies();
    }, 1000);
  };

  const getCriticalIssues = () => {
    if (!dependencyStatus) return [];
    
    return Object.entries(dependencyStatus)
      .filter(([name, status]) => status.critical && !status.available)
      .map(([name, status]) => ({ name, ...status }));
  };

  const getWarningIssues = () => {
    if (!dependencyStatus) return [];
    
    return Object.entries(dependencyStatus)
      .filter(([name, status]) => !status.critical && !status.available)
      .map(([name, status]) => ({ name, ...status }));
  };

  if (isLoading) {
    return (
      <div className="dependency-checker loading">
        <div className="spinner"></div>
        <p>Checking system dependencies...</p>
      </div>
    );
  }

  const criticalIssues = getCriticalIssues();
  const warningIssues = getWarningIssues();

  if (criticalIssues.length === 0 && warningIssues.length === 0) {
    // All dependencies OK, render children normally
    return children;
  }

  return (
    <div className="dependency-checker">
      {criticalIssues.length > 0 && (
        <div className="dependency-issues critical">
          <h3>⚠️ Critical Dependencies Missing</h3>
          <p>The following dependencies are required for MediaBot to function properly:</p>
          
          {criticalIssues.map(issue => (
            <div key={issue.name} className="dependency-issue">
              <div className="issue-header">
                <strong>{issue.displayName}</strong>
                <span className="issue-status critical">Missing</span>
              </div>
              <p className="issue-description">{issue.description}</p>
              {issue.error && (
                <p className="issue-error">Error: {issue.error}</p>
              )}
              <button 
                className="btn btn-primary"
                onClick={() => handleInstallDependency(issue.name)}
              >
                Show Installation Instructions
              </button>
            </div>
          ))}
          
          <div className="dependency-actions">
            <button 
              className="btn btn-secondary"
              onClick={checkDependencies}
            >
              🔄 Recheck Dependencies
            </button>
            <button 
              className="btn btn-info"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
        </div>
      )}

      {warningIssues.length > 0 && (
        <div className="dependency-issues warning">
          <details>
            <summary>⚡ Optional Dependencies ({warningIssues.length})</summary>
            <p>These dependencies are optional but provide enhanced functionality:</p>
            
            {warningIssues.map(issue => (
              <div key={issue.name} className="dependency-issue minor">
                <div className="issue-header">
                  <strong>{issue.displayName}</strong>
                  <span className="issue-status warning">Optional</span>
                </div>
                <p className="issue-description">{issue.description}</p>
                {issue.fallbackAvailable && (
                  <p className="fallback-note">✓ Fallback functionality available</p>
                )}
              </div>
            ))}
          </details>
        </div>
      )}

      {showDetails && dependencyStatus && (
        <div className="dependency-details">
          <h4>Dependency Status Details</h4>
          <ul>
            {Object.entries(dependencyStatus).map(([name, status]) => (
              <li key={name} className={`dependency-detail ${status.available ? 'ok' : 'missing'}`}>
                <strong>{status.displayName}:</strong> 
                <span className={`status ${status.available ? 'ok' : 'missing'}`}>
                  {status.available ? '✓ Available' : '✗ Missing'}
                </span>
                {status.version && <span className="version">v{status.version}</span>}
                {status.error && <span className="error"> - {status.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {criticalIssues.length === 0 && warningIssues.length > 0 && (
        <div className="app-container-with-warnings">
          <div className="warning-banner">
            <p>⚡ {warningIssues.length} optional dependencies missing. Core functionality available.</p>
            <button className="btn btn-small" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
          {children}
        </div>
      )}
      
      {criticalIssues.length === 0 && warningIssues.length === 0 && children}
    </div>
  );
};

export default DependencyChecker;