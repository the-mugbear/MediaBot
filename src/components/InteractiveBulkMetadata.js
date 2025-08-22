import React, { useState, useEffect } from 'react';
import MetadataMatchSelector from './MetadataMatchSelector';
import metadataService from '../services/metadataService';
import apiMetadataService from '../services/apiMetadataService';
import settingsService from '../services/settingsService';

const InteractiveBulkMetadata = ({ 
  files, 
  onComplete, 
  onCancel 
}) => {
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [currentMatches, setCurrentMatches] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentMetadata, setCurrentMetadata] = useState(null);
  const [isApplyingMetadata, setIsApplyingMetadata] = useState(false);
  const [applyProgress, setApplyProgress] = useState(null);
  const [summary, setSummary] = useState({
    processed: 0,
    confirmed: 0,
    skipped: 0,
    errors: []
  });

  useEffect(() => {
    const loadApiKeysAndStart = async () => {
      // Load API keys first
      try {
        const apiKeys = await settingsService.getApiKeys();
        if (apiKeys && Object.keys(apiKeys).length > 0) {
          metadataService.setApiKeys(apiKeys);
          console.log('API keys loaded in InteractiveBulkMetadata');
          
          // Start processing
          if (files.length > 0) {
            processNextFile();
          }
        } else {
          // No API keys configured - show error and exit
          onComplete({
            success: false,
            error: 'No API keys configured. Please configure API keys in Settings first.',
            results: [],
            summary: {
              total: files.length,
              successful: 0,
              skipped: 0,
              failed: files.length,
              errors: files.map(f => `${f.name}: No API keys configured`)
            }
          });
        }
      } catch (error) {
        console.error('Failed to load API keys:', error);
        onComplete({
          success: false,
          error: `Failed to load API keys: ${error.message}`,
          results: [],
          summary: {
            total: files.length,
            successful: 0,
            skipped: 0,
            failed: files.length,
            errors: files.map(f => `${f.name}: Failed to load API keys`)
          }
        });
      }
    };
    
    loadApiKeysAndStart();
  }, []);

  const processNextFile = async () => {
    if (currentFileIndex >= files.length) {
      // All files processed
      const finalResults = processedFiles.map(pf => ({
        success: pf.action === 'confirmed',
        file: pf.file,
        metadata: pf.metadata,
        skipped: pf.action === 'skipped',
        error: pf.error
      }));

      onComplete({
        success: true,
        results: finalResults,
        summary: {
          total: files.length,
          successful: summary.confirmed,
          skipped: summary.skipped,
          failed: summary.errors.length,
          errors: summary.errors
        }
      });
      return;
    }

    const file = files[currentFileIndex];
    setIsProcessing(true);

    try {
      console.log(`Processing file ${currentFileIndex + 1}/${files.length}:`, file.name);

      // Parse filename to extract media information
      const parsedInfo = metadataService.parseFileName(file.name, file.path);
      
      if (!parsedInfo || parsedInfo.type === 'unknown') {
        handleFileError('Could not parse filename to identify media');
        return;
      }

      // Fetch metadata from APIs
      let apiResult = null;
      
      if (parsedInfo.type === 'tv' && parsedInfo.title && parsedInfo.season && parsedInfo.episode) {
        apiResult = await metadataService.searchTVShow(parsedInfo.title, parsedInfo.season, parsedInfo.episode);
      } else if (parsedInfo.type === 'movie' && parsedInfo.title) {
        apiResult = await metadataService.searchMovie(parsedInfo.title, parsedInfo.year);
      } else {
        handleFileError('Insufficient information to fetch metadata');
        return;
      }

      if (!apiResult || !apiResult.success) {
        handleFileError('No metadata found from API services');
        return;
      }

      // Check if we have multiple matches
      if (apiResult.matches && apiResult.matches.length > 1) {
        // Show match selection
        setCurrentMatches(apiResult.matches);
        setCurrentMetadata(null);
        setShowConfirmation(false);
      } else {
        // Single match or best match - show confirmation
        const selectedMatch = apiResult.bestMatch || apiResult.matches?.[0] || apiResult;
        const metadata = { ...parsedInfo, ...selectedMatch };
        setCurrentMetadata(metadata);
        setCurrentMatches(null);
        setShowConfirmation(true);
      }

    } catch (error) {
      console.error('Error processing file:', error);
      handleFileError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileError = (error) => {
    const newSummary = {
      ...summary,
      processed: summary.processed + 1,
      errors: [...summary.errors, `${files[currentFileIndex].name}: ${error}`]
    };
    setSummary(newSummary);

    setProcessedFiles(prev => [...prev, {
      file: files[currentFileIndex],
      action: 'error',
      error: error
    }]);

    // Calculate next index
    const nextIndex = currentFileIndex + 1;
    
    // Move to next file immediately to prevent infinite loop
    setCurrentFileIndex(nextIndex);
    setCurrentMatches(null);
    setCurrentMetadata(null);
    setShowConfirmation(false);
    
    // Process next file after a short delay
    setTimeout(() => {
      if (nextIndex < files.length) {
        processNextFile();
      } else {
        // Complete processing - all files done
        const finalResults = [...processedFiles, {
          file: files[currentFileIndex],
          action: 'error',
          error: error
        }].map(pf => ({
          success: pf.action === 'confirmed',
          file: pf.file,
          metadata: pf.metadata,
          skipped: pf.action === 'skipped',
          error: pf.error
        }));

        onComplete({
          success: true,
          results: finalResults,
          summary: {
            total: files.length,
            successful: newSummary.confirmed,
            skipped: newSummary.skipped,
            failed: newSummary.errors.length,
            errors: newSummary.errors
          }
        });
      }
    }, 100);
  };

  const handleMatchSelection = async (selectedMatch) => {
    const parsedInfo = metadataService.parseFileName(files[currentFileIndex].name, files[currentFileIndex].path);
    const metadata = { ...parsedInfo, ...selectedMatch };
    
    setCurrentMetadata(metadata);
    setCurrentMatches(null);
    setShowConfirmation(true);
  };

  const handleMatchSkip = () => {
    handleSkipFile();
  };

  const handleConfirmMetadata = async (applyToDirectory = false) => {
    if (!currentMetadata) return;

    setIsApplyingMetadata(true);
    setApplyProgress(null);

    try {
      if (applyToDirectory) {
        // Apply to all files in the same directory
        await handleBulkDirectoryApply();
      } else {
        // Apply to current file only
        setApplyProgress({
          current: 1,
          total: 1,
          currentFile: files[currentFileIndex].name,
          action: 'Writing metadata...'
        });
        await applySingleFileMetadata(files[currentFileIndex], currentMetadata);
      }
    } catch (error) {
      handleFileError(error.message);
    } finally {
      setIsApplyingMetadata(false);
      setApplyProgress(null);
    }
  };

  const applySingleFileMetadata = async (file, metadata) => {
    const result = await apiMetadataService.fetchAndWriteMetadata(file, {
      writeToFile: true,
      skipIfHasMetadata: false,
      useProvidedMetadata: metadata
    });

    if (result.success) {
      const newSummary = {
        ...summary,
        processed: summary.processed + 1,
        confirmed: summary.confirmed + 1
      };
      setSummary(newSummary);

      setProcessedFiles(prev => [...prev, {
        file: file,
        action: 'confirmed',
        metadata: metadata
      }]);

      moveToNextFile();
    } else {
      throw new Error(result.error || 'Failed to write metadata');
    }
  };

  const handleBulkDirectoryApply = async () => {
    const currentFile = files[currentFileIndex];
    const currentDirectory = currentFile.path.substring(0, currentFile.path.lastIndexOf('/'));
    
    // Find all files in the same directory that haven't been processed yet
    const directoryFiles = files.filter((file, index) => {
      const fileDirectory = file.path.substring(0, file.path.lastIndexOf('/'));
      return fileDirectory === currentDirectory && index >= currentFileIndex;
    });

    console.log(`Applying series metadata to ${directoryFiles.length} files in directory:`, currentDirectory);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Initialize progress for bulk apply
    setApplyProgress({
      current: 0,
      total: directoryFiles.length,
      currentFile: '',
      action: 'Preparing directory apply...'
    });

    for (let i = 0; i < directoryFiles.length; i++) {
      const file = directoryFiles[i];
      
      // Update progress
      setApplyProgress({
        current: i + 1,
        total: directoryFiles.length,
        currentFile: file.name,
        action: 'Processing episode metadata...'
      });
      
      try {
        // For each file, parse its filename to get episode-specific info
        const parsedInfo = metadataService.parseFileName(file.name, file.path);
        
        // Create metadata specific to this file, keeping series info but updating episode details
        const fileSpecificMetadata = {
          ...currentMetadata,
          // Keep series-level info
          title: currentMetadata.title || currentMetadata.name,
          year: currentMetadata.year,
          overview: currentMetadata.overview,
          source: currentMetadata.source,
          // Update file-specific info
          season: parsedInfo.season || currentMetadata.season,
          episode: parsedInfo.episode || currentMetadata.episode,
          episodeTitle: parsedInfo.episodeTitle || null,
          original: file.name
        };

        // If this file has episode info but no episode title, try to fetch it
        if (fileSpecificMetadata.season && fileSpecificMetadata.episode && !fileSpecificMetadata.episodeTitle) {
          setApplyProgress(prev => ({
            ...prev,
            action: 'Fetching episode title...'
          }));
          
          try {
            const episodeResult = await metadataService.getEpisodeDetails(
              currentMetadata.id,
              fileSpecificMetadata.season,
              fileSpecificMetadata.episode
            );
            if (episodeResult.success && episodeResult.episode) {
              fileSpecificMetadata.episodeTitle = episodeResult.episode.name;
            }
          } catch (episodeError) {
            console.warn('Could not fetch episode title for', file.name, episodeError);
          }
        }

        setApplyProgress(prev => ({
          ...prev,
          action: 'Writing metadata to file...'
        }));

        const result = await apiMetadataService.fetchAndWriteMetadata(file, {
          writeToFile: true,
          skipIfHasMetadata: false,
          useProvidedMetadata: fileSpecificMetadata
        });

        if (result.success) {
          successCount++;
          setProcessedFiles(prev => [...prev, {
            file: file,
            action: 'confirmed',
            metadata: fileSpecificMetadata
          }]);
        } else {
          errorCount++;
          errors.push(`${file.name}: ${result.error || 'Failed to write metadata'}`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    // Update summary
    const newSummary = {
      ...summary,
      processed: summary.processed + directoryFiles.length,
      confirmed: summary.confirmed + successCount
    };
    setSummary(newSummary);

    if (errors.length > 0) {
      newSummary.errors = [...newSummary.errors, ...errors];
    }

    // Skip ahead past all the files we just processed
    const lastFileIndex = files.findIndex(f => f === directoryFiles[directoryFiles.length - 1]);
    setCurrentFileIndex(lastFileIndex + 1);
    setCurrentMatches(null);
    setCurrentMetadata(null);
    setShowConfirmation(false);

    // Continue with next file (if any)
    setTimeout(() => {
      if (lastFileIndex + 1 < files.length) {
        processNextFile();
      }
    }, 100);

    console.log(`Bulk directory apply completed: ${successCount} successful, ${errorCount} failed`);
  };

  const handleSkipFile = () => {
    const newSummary = {
      ...summary,
      processed: summary.processed + 1,
      skipped: summary.skipped + 1
    };
    setSummary(newSummary);

    setProcessedFiles(prev => [...prev, {
      file: files[currentFileIndex],
      action: 'skipped'
    }]);

    moveToNextFile();
  };

  const moveToNextFile = () => {
    const nextIndex = currentFileIndex + 1;
    setCurrentFileIndex(nextIndex);
    setCurrentMatches(null);
    setCurrentMetadata(null);
    setShowConfirmation(false);
    
    // Process next file after a short delay, but only if there are more files
    setTimeout(() => {
      if (nextIndex < files.length) {
        processNextFile();
      }
    }, 100);
  };

  const getDirectoryFileCount = () => {
    if (currentFileIndex >= files.length) return 0;
    
    const currentFile = files[currentFileIndex];
    const currentDirectory = currentFile.path.substring(0, currentFile.path.lastIndexOf('/'));
    
    return files.filter((file, index) => {
      const fileDirectory = file.path.substring(0, file.path.lastIndexOf('/'));
      return fileDirectory === currentDirectory && index >= currentFileIndex;
    }).length;
  };

  const getDirectoryName = () => {
    if (currentFileIndex >= files.length) return '';
    
    const currentFile = files[currentFileIndex];
    const currentDirectory = currentFile.path.substring(0, currentFile.path.lastIndexOf('/'));
    return currentDirectory.split('/').pop() || 'Unknown Directory';
  };

  if (currentFileIndex >= files.length) {
    return (
      <div className="interactive-bulk-metadata completing">
        <h3>Processing Complete</h3>
        <p>Finalizing results...</p>
      </div>
    );
  }

  const currentFile = files[currentFileIndex];
  const progress = Math.round((currentFileIndex / files.length) * 100);

  return (
    <div className="interactive-bulk-metadata">
      <div className="bulk-header">
        <h3>Interactive Metadata Fetch</h3>
        <div className="progress-info">
          <span>File {currentFileIndex + 1} of {files.length}</span>
          <span>{progress}% Complete</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="current-file">
        <h4>📁 {currentFile.name}</h4>
        <p className="file-path">{currentFile.path}</p>
      </div>

      <div className="process-summary">
        <span className="summary-item">✅ Confirmed: {summary.confirmed}</span>
        <span className="summary-item">⏭️ Skipped: {summary.skipped}</span>
        <span className="summary-item">❌ Errors: {summary.errors.length}</span>
      </div>

      {isProcessing && (
        <div className="processing-status">
          <div className="spinner"></div>
          <p>Searching for metadata...</p>
        </div>
      )}

      {isApplyingMetadata && applyProgress && (
        <div className="applying-metadata-status">
          <div className="apply-header">
            <h4>🎬 Applying Metadata</h4>
            <div className="apply-progress-info">
              <span>File {applyProgress.current} of {applyProgress.total}</span>
              <span>{Math.round((applyProgress.current / applyProgress.total) * 100)}% Complete</span>
            </div>
          </div>
          
          <div className="apply-progress-bar">
            <div 
              className="apply-progress-fill" 
              style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
            />
          </div>
          
          <div className="apply-current-file">
            <div className="current-file-name">📄 {applyProgress.currentFile}</div>
            <div className="current-action">{applyProgress.action}</div>
          </div>
          
          <div className="apply-spinner">
            <div className="spinner"></div>
          </div>
        </div>
      )}

      {currentMatches && (
        <div className="match-selection">
          <MetadataMatchSelector
            matches={currentMatches}
            originalTitle={currentFile.name}
            mediaType="auto-detected"
            onSelect={handleMatchSelection}
            onCancel={handleMatchSkip}
          />
        </div>
      )}

      {showConfirmation && currentMetadata && (
        <div className="metadata-confirmation">
          <h4>Confirm Metadata</h4>
          {getDirectoryFileCount() > 1 && (
            <div className="directory-notice">
              <p>📁 <strong>{getDirectoryFileCount() - 1} other files</strong> found in directory "<em>{getDirectoryName()}</em>" that may belong to this series.</p>
            </div>
          )}
          <div className="metadata-preview">
            <div className="metadata-item">
              <strong>Title:</strong> {currentMetadata.title || currentMetadata.name}
            </div>
            {currentMetadata.year && (
              <div className="metadata-item">
                <strong>Year:</strong> {currentMetadata.year}
              </div>
            )}
            {currentMetadata.season && currentMetadata.episode && (
              <div className="metadata-item">
                <strong>Episode:</strong> S{currentMetadata.season}E{currentMetadata.episode}
                {currentMetadata.episodeTitle && ` - ${currentMetadata.episodeTitle}`}
              </div>
            )}
            {currentMetadata.overview && (
              <div className="metadata-item">
                <strong>Overview:</strong> {currentMetadata.overview.substring(0, 200)}
                {currentMetadata.overview.length > 200 && '...'}
              </div>
            )}
            <div className="metadata-item">
              <strong>Source:</strong> {currentMetadata.source || 'API'}
              <span className="confidence-badge" style={{ 
                backgroundColor: currentMetadata.confidence >= 0.8 ? '#27ae60' : 
                                currentMetadata.confidence >= 0.6 ? '#f39c12' : '#e74c3c'
              }}>
                {Math.round((currentMetadata.confidence || 0.5) * 100)}% confidence
              </span>
            </div>
          </div>
          
          <div className="confirmation-actions">
            <button 
              className="btn btn-primary" 
              onClick={() => handleConfirmMetadata(false)}
              disabled={isApplyingMetadata}
            >
              ✅ Apply to This File Only
            </button>
            {getDirectoryFileCount() > 1 && (
              <button 
                className="btn btn-success" 
                onClick={() => handleConfirmMetadata(true)}
                disabled={isApplyingMetadata}
                title={`Apply series metadata to all ${getDirectoryFileCount()} files in this directory`}
              >
                🎬 Apply to All {getDirectoryFileCount()} Files in Directory
              </button>
            )}
            <button 
              className="btn btn-secondary" 
              onClick={handleSkipFile}
              disabled={isApplyingMetadata}
            >
              ⏭️ Skip This File
            </button>
            <button 
              className="btn btn-danger" 
              onClick={onCancel}
            >
              ❌ Cancel Bulk Process
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveBulkMetadata;