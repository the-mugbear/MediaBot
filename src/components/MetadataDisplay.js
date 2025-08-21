import React, { useState, useEffect, useRef } from 'react';
import metadataReader from '../services/metadataReader';
import apiMetadataService from '../services/apiMetadataService';

const MetadataDisplay = ({ file, onMetadataLoad }) => {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [fetchingFromApi, setFetchingFromApi] = useState(false);
  const [apiConfig, setApiConfig] = useState(null);
  const lastLoadedPath = useRef(null);

  useEffect(() => {
    if (file && file.path && file.path !== lastLoadedPath.current && !loading) {
      loadMetadata();
    }
  }, [file?.path]);

  useEffect(() => {
    // Check API configuration when component mounts
    checkApiConfiguration();
  }, []);

  const checkApiConfiguration = async () => {
    try {
      const config = await apiMetadataService.checkApiConfiguration();
      setApiConfig(config);
    } catch (error) {
      console.error('Error checking API configuration:', error);
      setApiConfig({
        configured: false,
        message: 'Error checking API configuration'
      });
    }
  };

  const loadMetadata = async () => {
    if (!file?.path || file.path === lastLoadedPath.current) return;
    
    setLoading(true);
    setError(null);
    lastLoadedPath.current = file.path;
    
    try {
      console.log('MetadataDisplay: Reading metadata for:', file.path);
      const result = await metadataReader.readMetadata(file.path);
      
      if (result.success) {
        const parsedMetadata = metadataReader.parseMetadata(result.metadata);
        const displayMetadata = metadataReader.formatMetadataForDisplay(parsedMetadata);
        
        setMetadata({
          raw: parsedMetadata,
          display: displayMetadata,
          hasContent: metadataReader.hasMetadata(parsedMetadata),
          completeness: metadataReader.getMetadataCompleteness(parsedMetadata)
        });
        
        // Notify parent component
        if (onMetadataLoad) {
          onMetadataLoad(file.id, {
            ...parsedMetadata,
            hasContent: metadataReader.hasMetadata(parsedMetadata),
            completeness: metadataReader.getMetadataCompleteness(parsedMetadata)
          });
        }
      } else {
        setError(result.error);
        setMetadata({
          raw: {},
          display: {},
          hasContent: false,
          completeness: 0
        });
      }
    } catch (err) {
      console.error('MetadataDisplay: Error loading metadata:', err);
      setError(err.message);
      setMetadata({
        raw: {},
        display: {},
        hasContent: false,
        completeness: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const getMetadataStatusIcon = () => {
    if (loading) return '⏳';
    if (error) return '❌';
    if (!metadata) return '❓';
    if (metadata.hasContent) {
      if (metadata.completeness >= 0.8) return '✅';
      if (metadata.completeness >= 0.5) return '⚠️';
      return '📝';
    }
    return '📄';
  };

  const getMetadataStatusText = () => {
    if (loading) return 'Loading metadata...';
    if (error) return `Error: ${error}`;
    if (!metadata) return 'No metadata';
    if (metadata.hasContent) {
      const percentage = Math.round(metadata.completeness * 100);
      return `${percentage}% complete`;
    }
    return 'No content metadata';
  };

  const getMetadataStatusClass = () => {
    if (loading) return 'metadata-loading';
    if (error) return 'metadata-error';
    if (!metadata || !metadata.hasContent) return 'metadata-empty';
    if (metadata.completeness >= 0.8) return 'metadata-complete';
    if (metadata.completeness >= 0.5) return 'metadata-partial';
    return 'metadata-minimal';
  };

  const handleRefresh = () => {
    lastLoadedPath.current = null; // Reset to force reload
    setMetadata(null);
    setError(null);
    loadMetadata();
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const handleFetchFromApi = async () => {
    if (!apiConfig?.configured) {
      alert('Please configure API keys in Settings first.');
      return;
    }

    setFetchingFromApi(true);
    
    try {
      console.log('MetadataDisplay: Fetching metadata from API for:', file.name);
      
      const result = await apiMetadataService.fetchAndWriteMetadata(file, {
        writeToFile: true,
        createBackup: true,
        skipIfHasMetadata: false
      });
      
      if (result.success) {
        // Refresh the metadata display to show the new data
        lastLoadedPath.current = null;
        setMetadata(null);
        await loadMetadata();
        
        alert(`✅ Successfully fetched and wrote metadata for "${file.name}"`);
      } else if (result.skipped) {
        alert(`ℹ️ Skipped "${file.name}": ${result.reason}`);
      } else {
        alert(`❌ Failed to fetch metadata for "${file.name}": ${result.error}`);
      }
      
    } catch (error) {
      console.error('MetadataDisplay: Error fetching from API:', error);
      alert(`❌ Error fetching metadata: ${error.message}`);
    } finally {
      setFetchingFromApi(false);
    }
  };

  return (
    <div className="metadata-display">
      <div className="metadata-summary" onClick={toggleExpanded}>
        <span className={`metadata-icon ${getMetadataStatusClass()}`}>
          {getMetadataStatusIcon()}
        </span>
        <span className="metadata-status">
          {getMetadataStatusText()}
        </span>
        <span className="metadata-toggle">
          {expanded ? '▼' : '▶'}
        </span>
        <button 
          className="btn btn-sm btn-secondary metadata-refresh"
          onClick={(e) => {
            e.stopPropagation();
            handleRefresh();
          }}
          disabled={loading}
          title="Refresh metadata"
        >
          🔄
        </button>
        <button 
          className="btn btn-sm btn-primary metadata-fetch"
          onClick={(e) => {
            e.stopPropagation();
            handleFetchFromApi();
          }}
          disabled={fetchingFromApi || loading}
          title={apiConfig?.configured ? "Fetch metadata from API and write to file" : "Configure API keys in Settings first"}
        >
          {fetchingFromApi ? '⏳' : '🌐'}
        </button>
      </div>

      {expanded && (
        <div className="metadata-details">
          {error ? (
            <div className="metadata-error-details">
              <p>❌ Failed to read metadata</p>
              <p className="error-message">{error}</p>
              <p className="error-hint">
                Make sure FFmpeg is installed and the file is accessible.
              </p>
            </div>
          ) : metadata && Object.keys(metadata.display).length > 0 ? (
            <div className="metadata-fields">
              <div className="metadata-section">
                <h4>Content Metadata</h4>
                <div className="metadata-grid">
                  {Object.entries(metadata.display)
                    .filter(([key]) => !['Duration', 'File Size', 'Resolution', 'Video Codec', 'Audio Codec', 'Audio Channels', 'Bit Rate', 'Encoder'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="metadata-field">
                        <span className="metadata-label">{key}:</span>
                        <span className="metadata-value">{value}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="metadata-section">
                <h4>Technical Information</h4>
                <div className="metadata-grid">
                  {Object.entries(metadata.display)
                    .filter(([key]) => ['Duration', 'File Size', 'Resolution', 'Video Codec', 'Audio Codec', 'Audio Channels', 'Bit Rate', 'Encoder'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="metadata-field">
                        <span className="metadata-label">{key}:</span>
                        <span className="metadata-value">{value}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="metadata-empty-details">
              <p>📄 No metadata found in this file</p>
              <p className="metadata-hint">
                You can add metadata using the rename panel after identifying the content.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MetadataDisplay;