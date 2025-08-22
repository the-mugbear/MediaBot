import React, { useState, useEffect, useRef } from 'react';
import { useLogger } from '../hooks/useLogger';

const Terminal = ({ isVisible, onToggle }) => {
  const { logs, clearLogs } = useLogger();
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle scroll detection for auto-scroll
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setAutoScroll(isAtBottom);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getLogIcon = (level) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      case 'success': return '✅';
      case 'file': return '📁';
      case 'api': return '🌐';
      case 'metadata': return '🎬';
      default: return '•';
    }
  };

  const getLogColor = (level) => {
    switch (level) {
      case 'error': return 'var(--cyber-error)';
      case 'warn': return 'var(--cyber-warning)';
      case 'info': return 'var(--cyber-info)';
      case 'debug': return 'var(--cyber-text-secondary)';
      case 'success': return 'var(--cyber-success)';
      case 'file': return 'var(--cyber-neon-cyan)';
      case 'api': return 'var(--cyber-neon-purple)';
      case 'metadata': return 'var(--cyber-neon-orange)';
      default: return 'var(--cyber-text-primary)';
    }
  };

  if (!isVisible) {
    return (
      <div className="terminal-toggle-button" onClick={onToggle}>
        <span className="terminal-icon">📟</span>
        Terminal
      </div>
    );
  }

  return (
    <div className={`terminal-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-icon">📟</span>
          <span>MediaBot Terminal</span>
          <span className="log-count">({logs.length})</span>
        </div>
        <div className="terminal-controls">
          <button 
            className="terminal-control-btn"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
          >
            {autoScroll ? '📌' : '📍'}
          </button>
          <button 
            className="terminal-control-btn"
            onClick={clearLogs}
            title="Clear terminal"
          >
            🗑️
          </button>
          <button 
            className="terminal-control-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse terminal" : "Expand terminal"}
          >
            {isExpanded ? '🔽' : '🔼'}
          </button>
          <button 
            className="terminal-control-btn"
            onClick={onToggle}
            title="Close terminal"
          >
            ❌
          </button>
        </div>
      </div>
      
      <div 
        className="terminal-content"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className="terminal-welcome">
          <div className="terminal-line">
            <span className="terminal-prompt">MediaBot@Terminal:~$</span>
            <span className="terminal-text">Welcome to MediaBot Terminal v1.0</span>
          </div>
          <div className="terminal-line">
            <span className="terminal-prompt">System:</span>
            <span className="terminal-text">Verbose logging enabled • Cyberpunk mode active</span>
          </div>
          <div className="terminal-divider">{'='.repeat(60)}</div>
        </div>

        {logs.map((log, index) => (
          <div 
            key={`${log.timestamp}-${index}`}
            className={`terminal-log-entry log-${log.level}`}
          >
            <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
            <span className="log-icon">{getLogIcon(log.level)}</span>
            <span className="log-level" style={{ color: getLogColor(log.level) }}>
              {log.level.toUpperCase()}
            </span>
            <span className="log-message">{log.message}</span>
            {log.data && (
              <div className="log-data">
                <pre>{JSON.stringify(log.data, null, 2)}</pre>
              </div>
            )}
          </div>
        ))}

        {logs.length === 0 && (
          <div className="terminal-empty">
            <div className="terminal-line">
              <span className="terminal-prompt">Status:</span>
              <span className="terminal-text">No activity logged yet...</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-prompt">Tip:</span>
              <span className="terminal-text">Start using MediaBot to see verbose logging here</span>
            </div>
          </div>
        )}

        {!autoScroll && (
          <div className="scroll-indicator">
            <button 
              className="scroll-to-bottom-btn"
              onClick={() => {
                setAutoScroll(true);
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              }}
            >
              ⬇️ Scroll to bottom
            </button>
          </div>
        )}
      </div>
      
      <div className="terminal-footer">
        <span className="terminal-status">
          🟢 Connected • {logs.length} entries • {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        </span>
      </div>
    </div>
  );
};

export default Terminal;