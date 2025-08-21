import React from 'react';

const CyberHeader = ({ title, subtitle, className = '', glitch = false }) => {
  return (
    <div className={`cyber-header ${className}`}>
      <h1 
        className={glitch ? 'cyber-glitch' : 'cyber-title'}
        data-text={title}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="cyber-subtitle">{subtitle}</p>
      )}
      <div className="cyber-header-divider"></div>
    </div>
  );
};

export default CyberHeader;