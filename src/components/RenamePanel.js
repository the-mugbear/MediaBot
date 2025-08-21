import React, { useState, useEffect } from 'react';
import metadataService from '../services/metadataService';
import metadataWriter from '../services/metadataWriter';

const RenamePanel = ({ files, selectedFiles, onUpdateFiles }) => {
  const [format, setFormat] = useState('{n} - {s00e00} - {t}');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    // Load API keys from settings when component mounts
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      let settings = null;
      
      // Try file-based storage first (Electron)
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const result = await window.electronAPI.loadSettings();
        if (result.success && result.settings) {
          settings = result.settings;
        }
      } else {
        // Fallback to localStorage
        const savedSettings = localStorage.getItem('mediabot-settings');
        if (savedSettings) {
          settings = JSON.parse(savedSettings);
        }
      }
      
      if (settings && settings.apiKeys) {
        metadataService.setApiKeys(settings.apiKeys);
        console.log('API keys loaded in RenamePanel');
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const formatOptions = [
    { value: '{n} - {s00e00} - {t}', label: 'Show - S01E01 - Title' },
    { value: '{n} ({y}) - {t}', label: 'Movie (Year) - Title' },
    { value: '{n}/{n} - {s00e00} - {t}', label: 'Show/Show - S01E01 - Title' },
    { value: '{n} Season {s}/{n} - {s00e00} - {t}', label: 'Show Season 1/Show - S01E01 - Title' },
    { value: 'custom', label: 'Custom Format...' }
  ];

  const selectedFilesList = files.filter(file => selectedFiles.includes(file.id));

  const handleFormatChange = (e) => {
    setFormat(e.target.value);
  };

  const previewRename = async () => {
    if (selectedFilesList.length === 0) {
      alert('Please select files to rename');
      return;
    }

    setIsProcessing(true);
    
    try {
      console.log('Starting metadata lookup for', selectedFilesList.length, 'files');
      const previews = [];

      for (const file of selectedFilesList) {
        console.log(`Processing file: ${file.name}`);
        
        // Parse the filename to extract metadata
        const parsed = metadataService.parseFileName(file.name, file.path);
        console.log(`Parsed metadata:`, parsed);
        
        // Send debug info to Electron console
        if (window.electronAPI && window.electronAPI.debugLog) {
          window.electronAPI.debugLog(`Parsing file: ${file.name}`, parsed);
        }
        
        let metadata = null;
        let lookupResult = null;

        // Look up metadata based on file type
        if (parsed.type === 'movie') {
          lookupResult = await metadataService.searchMovie(parsed.title, parsed.year);
        } else if (parsed.type === 'tv') {
          lookupResult = await metadataService.searchTVShow(parsed.title, parsed.season, parsed.episode);
        }

        if (lookupResult && lookupResult.success) {
          metadata = { ...parsed, ...lookupResult };
          console.log(`Found metadata:`, metadata);
        } else {
          // Fallback to parsed data
          metadata = parsed;
          
          // If we have episode title or good parsing, increase confidence
          if (parsed.episodeTitle || parsed.movieTitle) {
            metadata.confidence = 0.8; // High confidence for already formatted files
          } else if (parsed.type !== 'unknown') {
            metadata.confidence = 0.6; // Medium confidence for recognized format
          } else {
            metadata.confidence = 0.3; // Low confidence for fallback
          }
          
          console.log(`No metadata found, using parsed data:`, metadata);
        }

        // Generate new filename and path information
        const fileExtension = file.name.split('.').pop();
        const filenameInfo = metadataService.generateFileName(metadata, format, `.${fileExtension}`, file.path);
        
        console.log(`Generated filename info for ${file.name}:`, filenameInfo);
        
        // Determine parent folder changes
        const currentDirectory = file.path.substring(0, file.path.lastIndexOf('/'));
        const currentParentName = currentDirectory.split('/').pop();
        let parentFolderChange = null;
        
        if (filenameInfo.seriesFolder) {
          // Check if we're moving from a release folder to a clean series folder
          const isFromReleaseFolder = currentParentName.includes('.') || 
                                     currentParentName.includes('[') || 
                                     currentParentName.includes('S01') ||
                                     currentParentName.length > 50; // Long folder names are usually release names
          
          if (isFromReleaseFolder || currentParentName !== filenameInfo.seriesFolder) {
            parentFolderChange = {
              from: currentParentName,
              to: filenameInfo.seriesFolder,
              type: 'series',
              isCleanup: isFromReleaseFolder
            };
          }
        }
        
        previews.push({
          id: file.id,
          originalName: file.name,
          newName: filenameInfo.filename,
          confidence: metadata.confidence || 0.5,
          metadata: metadata,
          seasonFolder: filenameInfo.seasonFolder,
          seriesFolder: filenameInfo.seriesFolder,
          needsDirectoryCreation: filenameInfo.needsDirectoryCreation,
          season: filenameInfo.season,
          parentFolderChange: parentFolderChange,
          matches: lookupResult && lookupResult.success ? [
            { 
              source: metadata.source || 'Unknown', 
              title: metadata.title || 'Unknown', 
              year: metadata.year || 'Unknown',
              type: metadata.type || 'unknown'
            }
          ] : []
        });
      }
      
      setResults(previews);
      console.log('Preview generation complete:', previews);
    } catch (error) {
      console.error('Preview failed:', error);
      alert('Failed to generate preview: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const restoreBackups = async () => {
    if (selectedFilesList.length === 0) {
      alert('Please select files first');
      return;
    }

    const confirmMessage = 'This will restore .backup files and remove template files. Continue?';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);
    
    try {
      // Get the base directory from the first selected file
      const baseDir = selectedFilesList[0].path.split('/').slice(0, -2).join('/');
      console.log('Restoring backups in:', baseDir);
      
      const result = await window.electronAPI.restoreBackupFiles(baseDir);
      
      if (result.success) {
        const successful = result.results.filter(r => r.success);
        const failed = result.results.filter(r => !r.success);
        
        if (failed.length === 0) {
          alert(`Successfully restored ${successful.length} backup file(s)!`);
        } else {
          alert(`Restored ${successful.length} files, ${failed.length} failed.`);
        }
        
        // Refresh the file list
        window.location.reload();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore backups: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeRename = async () => {
    if (results.length === 0) {
      alert('Please preview rename first');
      return;
    }

    // Load settings to check backup and metadata preferences
    let createBackup = false;
    let writeMetadata = true; // Default to true
    try {
      let settings = null;
      
      // Try file-based storage first (Electron)
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const result = await window.electronAPI.loadSettings();
        if (result.success && result.settings) {
          settings = result.settings;
        }
      } else {
        // Fallback to localStorage
        const savedSettings = localStorage.getItem('mediabot-settings');
        if (savedSettings) {
          settings = JSON.parse(savedSettings);
        }
      }
      
      if (settings) {
        console.log('Loaded settings:', settings);
        createBackup = settings.preferences?.createBackup === true;
        writeMetadata = settings.preferences?.writeMetadata !== false; // Default to true unless explicitly disabled
        console.log('Create backup setting:', createBackup);
        console.log('Write metadata setting:', writeMetadata);
      } else {
        console.log('No settings found, using defaults (backup: false, metadata: true)');
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }

    // Confirm the rename operation
    const confirmMessage = `Are you sure you want to rename ${results.length} file(s)?\n\nThis will directly rename the files without creating backups.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);
    
    try {
      console.log('Executing rename for:', results.length, 'files');
      console.log('Selected files:', selectedFilesList);
      console.log('Results:', results);
      console.log('nodeAPI available:', !!window.nodeAPI);
      
      // Test IPC connection first
      try {
        const testResult = await window.electronAPI.testRenameConnection();
        console.log('IPC test result:', testResult);
      } catch (error) {
        console.error('IPC test failed:', error);
        throw new Error('IPC communication failed: ' + error.message);
      }
      
      // Prepare rename operations for the backend
      const renameOperations = results.map(result => {
        const file = selectedFilesList.find(f => f.id === result.id);
        
        if (!file) {
          throw new Error(`File with ID ${result.id} not found in selected files`);
        }
        
        if (!file.path) {
          throw new Error(`File path not available for ${file.name || 'unknown file'}`);
        }
        
        // Handle season folder creation for TV shows
        let newPath;
        if (window.nodeAPI && window.nodeAPI.path) {
          const currentDirectory = window.nodeAPI.path.dirname(file.path);
          const currentBasename = window.nodeAPI.path.basename(currentDirectory);
          
          // Check if the file is in an individual episode folder (e.g., "Alien.Earth.S01E01.1080p.x265-ELiTE")
          const isInEpisodeFolder = currentBasename.includes('S0') && currentBasename.includes('E0');
          
          let baseDirectory;
          if (isInEpisodeFolder) {
            // Go up one level to consolidate from episode subfolders
            baseDirectory = window.nodeAPI.path.dirname(currentDirectory);
          } else {
            baseDirectory = currentDirectory;
          }
          
          if (result.needsDirectoryCreation && result.seasonFolder) {
            // TV show - place in series/season folder structure
            if (result.seriesFolder) {
              newPath = window.nodeAPI.path.join(baseDirectory, result.seriesFolder, result.seasonFolder, result.newName);
            } else {
              // Fallback to just season folder if no series folder
              newPath = window.nodeAPI.path.join(baseDirectory, result.seasonFolder, result.newName);
            }
          } else {
            // Movie or no season folder needed
            newPath = window.nodeAPI.path.join(baseDirectory, result.newName);
          }
        } else {
          // Fallback path manipulation
          const currentDirectory = file.path.substring(0, file.path.lastIndexOf('/'));
          const currentBasename = currentDirectory.split('/').pop();
          
          // Check if the file is in an individual episode folder
          const isInEpisodeFolder = currentBasename.includes('S0') && currentBasename.includes('E0');
          
          let baseDirectory;
          if (isInEpisodeFolder) {
            // Go up one level to consolidate from episode subfolders
            const pathParts = currentDirectory.split('/');
            pathParts.pop();
            baseDirectory = pathParts.join('/');
          } else {
            baseDirectory = currentDirectory;
          }
          
          if (result.needsDirectoryCreation && result.seasonFolder) {
            // TV show - place in series/season folder structure
            if (result.seriesFolder) {
              newPath = `${baseDirectory}/${result.seriesFolder}/${result.seasonFolder}/${result.newName}`;
            } else {
              // Fallback to just season folder if no series folder
              newPath = `${baseDirectory}/${result.seasonFolder}/${result.newName}`;
            }
          } else {
            newPath = `${baseDirectory}/${result.newName}`;
          }
        }
        
        console.log(`Mapping rename: ${file.path} -> ${newPath}`);
        
        return {
          id: result.id,
          oldPath: file.path,
          newPath: newPath,
          createBackup: false, // Force no backup for now - will fix settings loading later
          needsDirectoryCreation: result.needsDirectoryCreation,
          seasonFolder: result.seasonFolder,
          seriesFolder: result.seriesFolder
        };
      });

      console.log('Sending rename operations to backend:', renameOperations);
      console.log('Individual operations:');
      renameOperations.forEach((op, index) => {
        console.log(`Operation ${index}:`, {
          id: op.id,
          oldPath: op.oldPath,
          newPath: op.newPath,
          createBackup: op.createBackup,
          needsDirectoryCreation: op.needsDirectoryCreation,
          seasonFolder: op.seasonFolder,
          seriesFolder: op.seriesFolder
        });
      });
      
      // Prepare operations with metadata for the new efficient workflow
      const organizeOperations = renameOperations.map(op => ({
        ...op,
        metadata: writeMetadata ? results.find(r => r.id === op.id)?.metadata : null,
        cleanupSource: true
      }));
      
      // Execute the complete organization workflow
      const organizeResult = await window.electronAPI.organizeFiles(organizeOperations);
      
      if (organizeResult.success) {
        console.log('Organization results:', organizeResult.results);
        console.log('Organization summary:', organizeResult.summary);
        
        // Check results and update file list
        const successful = organizeResult.results.filter(r => r.success);
        const failed = organizeResult.results.filter(r => !r.success);
        
        if (successful.length > 0) {
          // Metadata is now handled automatically in the organize workflow

          // Update the files in the main app state
          const updatedFiles = files.map(file => {
            const successfulRename = successful.find(r => r.id === file.id);
            if (successfulRename) {
              // Extract filename from path - use nodeAPI if available, otherwise fallback
              let newFileName;
              if (window.nodeAPI && window.nodeAPI.path) {
                newFileName = window.nodeAPI.path.basename(successfulRename.newPath);
              } else {
                // Fallback: extract filename from path
                newFileName = successfulRename.newPath.split('/').pop() || successfulRename.newPath.split('\\').pop();
              }
              
              return {
                ...file,
                name: newFileName,
                path: successfulRename.newPath,
                status: 'renamed'
              };
            }
            return file;
          });
          
          onUpdateFiles(updatedFiles);
        }
        
        // Show results to user
        if (failed.length === 0) {
          const metadataCount = organizeResult.summary.metadataWritten;
          const metadataMsg = writeMetadata && metadataCount > 0 ? ` and wrote metadata to ${metadataCount} files` : '';
          alert(`Successfully organized ${successful.length} file(s)${metadataMsg}!`);
        } else {
          // Extract basename safely for error messages
          const failedMessages = failed.map(f => {
            let fileName;
            if (window.nodeAPI && window.nodeAPI.path) {
              fileName = window.nodeAPI.path.basename(f.oldPath);
            } else {
              fileName = f.oldPath.split('/').pop() || f.oldPath.split('\\').pop() || f.oldPath;
            }
            return `• ${fileName}: ${f.error}`;
          }).join('\n');
          alert(`Rename completed with some errors:\n\nSuccessful: ${successful.length}\nFailed: ${failed.length}\n\nErrors:\n${failedMessages}`);
        }
        
        // Clear results after execution
        setResults([]);
      } else {
        throw new Error('Rename operation failed');
      }
    } catch (error) {
      console.error('Rename failed:', error);
      alert('Failed to rename files: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rename-panel">
      <div className="rename-header">
        <h2>Rename Files</h2>
        <p>Configure how your media files should be renamed</p>
      </div>

      <div className="rename-config">
        <div className="format-section">
          <h3>Naming Format</h3>
          <select value={format} onChange={handleFormatChange} className="format-select">
            {formatOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          {format === 'custom' && (
            <input
              type="text"
              placeholder="Enter custom format (e.g., {n} - {s00e00} - {t})"
              className="custom-format-input"
              onChange={(e) => setFormat(e.target.value)}
            />
          )}
          
          <div className="format-help">
            <h4>Format Variables:</h4>
            <ul>
              <li><code>{'{n}'}</code> - Series/Movie name</li>
              <li><code>{'{s}'}</code> - Season number</li>
              <li><code>{'{e}'}</code> - Episode number</li>
              <li><code>{'{t}'}</code> - Episode/Movie title</li>
              <li><code>{'{y}'}</code> - Year</li>
              <li><code>{'{s00e00}'}</code> - Season and episode with padding</li>
            </ul>
          </div>
        </div>

        <div className="selected-files">
          <h3>Selected Files ({selectedFilesList.length})</h3>
          {selectedFilesList.length === 0 ? (
            <p>No files selected. Go to Files tab to select files.</p>
          ) : (
            <div className="file-list">
              {selectedFilesList.map(file => (
                <div key={file.id} className="file-item">
                  <div className="file-info">
                    <div className="file-name">{file.name}</div>
                    <div className="file-path">{file.path}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rename-actions">
          <button 
            className="btn btn-primary" 
            onClick={previewRename}
            disabled={isProcessing || selectedFilesList.length === 0}
          >
            {isProcessing ? 'Processing...' : 'Preview Rename'}
          </button>
          
          <button 
            className="btn btn-success" 
            onClick={executeRename}
            disabled={isProcessing || results.length === 0}
          >
            Execute Rename
          </button>

          <button 
            className="btn btn-warning" 
            onClick={restoreBackups}
            disabled={isProcessing || selectedFilesList.length === 0}
            title="Restore .backup files and remove template files"
          >
            Restore Backups
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="rename-results">
          <h3>Rename Preview</h3>
          <div className="results-list">
            {results.map(result => (
              <div key={result.id} className="result-item">
                <div className="result-comparison">
                  <div className="original">
                    <strong>Original:</strong> {result.originalName}
                  </div>
                  <div className="arrow">→</div>
                  <div className="new">
                    <strong>New:</strong> {result.newName}
                    {result.seriesFolder && result.seasonFolder && (
                      <div className="folder-structure">
                        <small>📁 {result.seriesFolder}/{result.seasonFolder}/</small>
                      </div>
                    )}
                    {result.seasonFolder && !result.seriesFolder && (
                      <div className="folder-structure">
                        <small>📁 {result.seasonFolder}/</small>
                      </div>
                    )}
                    {result.parentFolderChange && (
                      <div className="parent-folder-change">
                        <small>
                          {result.parentFolderChange.isCleanup ? '🧹' : '📂'} Parent folder: 
                          <span className="folder-from">{result.parentFolderChange.from}</span> → 
                          <span className="folder-to">{result.parentFolderChange.to}</span>
                          {result.parentFolderChange.isCleanup && <span className="cleanup-note"> (cleanup release folder)</span>}
                        </small>
                      </div>
                    )}
                  </div>
                </div>
                <div className="result-confidence">
                  Confidence: {(result.confidence * 100).toFixed(1)}%
                </div>
                <div className="result-matches">
                  {result.matches.map((match, index) => (
                    <span key={index} className="match-source">
                      {match.source}: {match.title} ({match.year}) [{match.type}]
                    </span>
                  ))}
                  {result.metadata && (
                    <div className="parsed-info">
                      Detected: {result.metadata.type} - "{result.metadata.title}"
                      {result.metadata.year && ` (${result.metadata.year})`}
                      {result.metadata.season && result.metadata.episode && 
                        ` - S${result.metadata.season}E${result.metadata.episode}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing files...</p>
        </div>
      )}
    </div>
  );
};

export default RenamePanel;