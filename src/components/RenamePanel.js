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

  const loadApiKeys = () => {
    try {
      const savedSettings = localStorage.getItem('mediabot-settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        metadataService.setApiKeys(settings.apiKeys || {});
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
        
        previews.push({
          id: file.id,
          originalName: file.name,
          newName: filenameInfo.filename,
          confidence: metadata.confidence || 0.5,
          metadata: metadata,
          seasonFolder: filenameInfo.seasonFolder,
          needsDirectoryCreation: filenameInfo.needsDirectoryCreation,
          season: filenameInfo.season,
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
      const savedSettings = localStorage.getItem('mediabot-settings');
      console.log('Raw settings from localStorage:', savedSettings);
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        console.log('Parsed settings:', settings);
        createBackup = settings.preferences?.createBackup === true;
        writeMetadata = settings.preferences?.writeMetadata !== false; // Default to true unless explicitly disabled
        console.log('Create backup setting:', createBackup);
        console.log('Write metadata setting:', writeMetadata);
      } else {
        console.log('No settings found in localStorage, using defaults (backup: false, metadata: true)');
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
            // TV show - place in season folder
            newPath = window.nodeAPI.path.join(baseDirectory, result.seasonFolder, result.newName);
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
            newPath = `${baseDirectory}/${result.seasonFolder}/${result.newName}`;
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
          seasonFolder: result.seasonFolder
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
          seasonFolder: op.seasonFolder
        });
      });
      
      // Execute the rename operations
      const renameResult = await window.electronAPI.renameFiles(renameOperations);
      
      if (renameResult.success) {
        console.log('Rename results:', renameResult.results);
        
        // Check results and update file list
        const successful = renameResult.results.filter(r => r.success);
        const failed = renameResult.results.filter(r => !r.success);
        
        if (successful.length > 0) {
          // Write metadata to successfully renamed files if enabled
          if (writeMetadata) {
            console.log('Writing metadata to renamed files...');
            for (const successfulRename of successful) {
              try {
                // Find the corresponding result with metadata
                const resultData = results.find(r => r.id === successfulRename.id);
                if (resultData && resultData.metadata) {
                  console.log(`Writing metadata for: ${successfulRename.newPath}`);
                  await metadataWriter.writeMetadata(successfulRename.newPath, resultData.metadata);
                  console.log(`Metadata written successfully for: ${successfulRename.newPath}`);
                }
              } catch (error) {
                console.warn(`Failed to write metadata for ${successfulRename.newPath}:`, error);
                // Don't fail the entire operation for metadata errors
              }
            }
          }

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
          const metadataMsg = writeMetadata ? ' and wrote metadata' : '';
          alert(`Successfully renamed ${successful.length} file(s)${metadataMsg}!`);
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