import React, { useState } from 'react';

const MetadataMatchSelector = ({ 
  matches, 
  originalTitle, 
  mediaType, 
  onSelect, 
  onCancel 
}) => {
  const [selectedMatch, setSelectedMatch] = useState(matches?.[0] || null);

  const handleSelect = () => {
    if (selectedMatch) {
      onSelect(selectedMatch);
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#27ae60'; // Green
    if (confidence >= 0.6) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  if (!matches || matches.length === 0) {
    return (
      <div className="metadata-match-selector">
        <div className="selector-header">
          <h3>No Matches Found</h3>
          <p>No metadata matches found for "{originalTitle}"</p>
        </div>
        <div className="selector-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Skip Metadata
          </button>
        </div>
      </div>
    );
  }

  if (matches.length === 1 && matches[0].confidence >= 0.8) {
    // Auto-select high confidence single match
    return (
      <div className="metadata-match-selector single-match">
        <div className="selector-header">
          <h3>Metadata Match Found</h3>
          <p>High confidence match for "{originalTitle}"</p>
        </div>
        <div className="match-item selected">
          <div className="match-info">
            <div className="match-title">
              {matches[0].title || matches[0].name}
              {matches[0].year && <span className="match-year"> ({matches[0].year})</span>}
            </div>
            <div className="match-overview">{matches[0].overview}</div>
            <div className="match-confidence">
              <span 
                className="confidence-badge"
                style={{ backgroundColor: getConfidenceColor(matches[0].confidence) }}
              >
                {getConfidenceLabel(matches[0].confidence)} Confidence ({Math.round(matches[0].confidence * 100)}%)
              </span>
            </div>
          </div>
        </div>
        <div className="selector-actions">
          <button className="btn btn-primary" onClick={() => onSelect(matches[0])}>
            Use This Match
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>
            Skip Metadata
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="metadata-match-selector">
      <div className="selector-header">
        <h3>Multiple Matches Found</h3>
        <p>Select the correct match for "{originalTitle}" ({mediaType}):</p>
      </div>
      
      <div className="matches-list">
        {matches.map((match, index) => (
          <div 
            key={match.id || index}
            className={`match-item ${selectedMatch?.id === match.id ? 'selected' : ''}`}
            onClick={() => setSelectedMatch(match)}
          >
            <input
              type="radio"
              name="metadata-match"
              checked={selectedMatch?.id === match.id}
              onChange={() => setSelectedMatch(match)}
            />
            <div className="match-info">
              <div className="match-title">
                {match.title || match.name}
                {match.year && <span className="match-year"> ({match.year})</span>}
              </div>
              {match.overview && (
                <div className="match-overview">
                  {match.overview.length > 150 
                    ? match.overview.substring(0, 150) + '...' 
                    : match.overview}
                </div>
              )}
              <div className="match-details">
                <span className="match-source">{match.source}</span>
                <span 
                  className="confidence-badge"
                  style={{ backgroundColor: getConfidenceColor(match.confidence) }}
                >
                  {getConfidenceLabel(match.confidence)} ({Math.round(match.confidence * 100)}%)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="selector-actions">
        <button 
          className="btn btn-primary" 
          onClick={handleSelect}
          disabled={!selectedMatch}
        >
          Use Selected Match
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Skip Metadata
        </button>
      </div>
    </div>
  );
};

export default MetadataMatchSelector;