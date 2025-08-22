import React, { useState, useEffect } from 'react';
import MetadataMatchSelector from './MetadataMatchSelector';
import metadataService from '../services/metadataService';
import metadataWriter from '../services/metadataWriter';
import settingsService from '../services/settingsService';
import dependencyService from '../services/dependencyService';

const RenamePanel = ({ files, selectedFiles, onUpdateFiles }) => {
  const [format, setFormat] = useState('{n} - {s00e00} - {t}');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  useEffect(() => {
    // Load API keys from settings when component mounts
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const apiKeys = await settingsService.getApiKeys();
      if (apiKeys && Object.keys(apiKeys).length > 0) {
        metadataService.setApiKeys(apiKeys);
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

  const handleMatchSelection = async (selectedMatch) => {
    const currentPendingMatch = pendingMatches[currentMatchIndex];
    if (!currentPendingMatch) return;
    
    const fileIndex = currentPendingMatch.fileIndex;
    console.log(`User selected series for ${currentPendingMatch.fileName}:`, selectedMatch);
    
    // The selected match is the series - now we need to apply this series to all related files
    // and fetch episode-specific details for each
    await applySelectedSeriesToRelatedFiles(selectedMatch);
    
    // Move to next pending match or clear if done
    const newPendingMatches = pendingMatches.filter((_, index) => index !== currentMatchIndex);
    setPendingMatches(newPendingMatches);
    
    // If there are more matches to handle, move to the next one
    if (newPendingMatches.length > 0) {
      // Adjust currentMatchIndex if we removed an item before it
      if (currentMatchIndex >= newPendingMatches.length) {
        setCurrentMatchIndex(newPendingMatches.length - 1);
      }
      // Otherwise keep the same index (next item moved into this position)
    } else {
      setCurrentMatchIndex(0);
    }
  };

  const applySelectedSeriesToRelatedFiles = async (selectedSeries) => {
    console.log('Applying selected series to related files:', selectedSeries);
    
    const currentPendingMatch = pendingMatches[currentMatchIndex];
    if (!currentPendingMatch) return;
    
    // Get all file indexes that need to be updated for this series
    const targetFileIndexes = currentPendingMatch.fileIndexes;
    
    // Update results with episode-specific metadata for each file
    const updatedResults = [...results];
    
    for (const fileIndex of targetFileIndexes) {
      const result = updatedResults[fileIndex];
      
      try {
        // Get episode-specific details for this file
        const parsedInfo = result.metadata;
        let episodeMetadata = null;
        
        if (parsedInfo.season && parsedInfo.episode && selectedSeries.id) {
          console.log(`Fetching episode details for S${parsedInfo.season}E${parsedInfo.episode} of ${selectedSeries.title || selectedSeries.name}`);
          
          // Fetch episode details using the selected series ID
          const episodeResult = await metadataService.getEpisodeDetails(
            selectedSeries.id,
            parsedInfo.season,
            parsedInfo.episode
          );
          
          if (episodeResult.success && episodeResult.episode) {
            episodeMetadata = {
              // Series-level info from selected match
              id: selectedSeries.id,
              title: selectedSeries.title || selectedSeries.name,
              name: selectedSeries.title || selectedSeries.name,
              year: selectedSeries.year,
              overview: episodeResult.episode.overview || selectedSeries.overview,
              source: selectedSeries.source,
              type: 'tv',
              
              // Episode-specific info
              season: parsedInfo.season,
              episode: parsedInfo.episode,
              episodeTitle: episodeResult.episode.name || episodeResult.episode.title,
              
              // Confidence
              confidence: selectedSeries.confidence || 0.9
            };
            
            console.log(`Found episode metadata for ${result.originalName}:`, episodeMetadata);
          }
        }
        
        // Fallback to series info if episode details not found or for movies
        if (!episodeMetadata) {
          episodeMetadata = {
            ...parsedInfo,
            id: selectedSeries.id,
            title: selectedSeries.title || selectedSeries.name,
            name: selectedSeries.title || selectedSeries.name,
            year: selectedSeries.year,
            overview: selectedSeries.overview,
            source: selectedSeries.source,
            confidence: selectedSeries.confidence || 0.8
          };
        }
        
        // Regenerate filename with episode-specific metadata
        const fileExtension = result.originalName.split('.').pop();
        const file = selectedFilesList.find(f => f.id === result.id);
        const filenameInfo = metadataService.generateFileName(episodeMetadata, format, `.${fileExtension}`, file?.path);
        
        // Update the result
        updatedResults[fileIndex] = {
          ...result,
          metadata: episodeMetadata,
          confidence: episodeMetadata.confidence,
          hasMultipleMatches: false, // Mark as resolved
          newName: filenameInfo.filename,
          seasonFolder: filenameInfo.seasonFolder,
          seriesFolder: filenameInfo.seriesFolder,
          needsDirectoryCreation: filenameInfo.needsDirectoryCreation,
          matches: [{ 
            source: episodeMetadata.source || 'API', 
            title: episodeMetadata.title, 
            year: episodeMetadata.year || 'Unknown',
            type: episodeMetadata.type || 'tv'
          }]
        };
        
        console.log(`Updated filename for ${result.originalName}: ${filenameInfo.filename}`);
        
      } catch (error) {
        console.error(`Failed to fetch episode details for ${result.originalName}:`, error);
        // Keep the original result if episode fetch fails
      }
    }
    
    setResults(updatedResults);
    console.log(`Applied selected series to ${targetFileIndexes.length} episodes`);
  };

  const handleMatchSkip = () => {
    const currentPendingMatch = pendingMatches[currentMatchIndex];
    if (!currentPendingMatch) return;
    
    console.log(`Skipping match selection for ${currentPendingMatch.fileName}`);
    
    // Remove this match from pending matches
    const newPendingMatches = pendingMatches.filter((_, index) => index !== currentMatchIndex);
    setPendingMatches(newPendingMatches);
    
    // If there are more matches to handle, move to the next one
    if (newPendingMatches.length > 0) {
      // Adjust currentMatchIndex if we removed an item before it
      if (currentMatchIndex >= newPendingMatches.length) {
        setCurrentMatchIndex(newPendingMatches.length - 1);
      }
      // Otherwise keep the same index (next item moved into this position)
    } else {
      setCurrentMatchIndex(0);
    }
  };

  const checkForMultipleMatches = (resultsList) => {
    // Group results by series title to avoid showing the same series selection multiple times
    const seriesGroups = {};
    
    resultsList.forEach((result, index) => {
      if (result.metadata?.hasMultipleMatches && result.metadata?.allMatches && result.metadata.type === 'tv') {
        const seriesTitle = result.metadata.title;
        
        if (!seriesGroups[seriesTitle]) {
          seriesGroups[seriesTitle] = {
            seriesTitle,
            matches: result.metadata.allMatches,
            mediaType: result.metadata.type,
            fileIndexes: [index],
            representativeFile: result.originalName,
            episodeCount: 1
          };
        } else {
          // Add this episode to the existing series group
          seriesGroups[seriesTitle].fileIndexes.push(index);
          seriesGroups[seriesTitle].episodeCount++;
        }
      } else if (result.metadata?.hasMultipleMatches && result.metadata?.allMatches && result.metadata.type === 'movie') {
        // For movies, handle individually since each movie is unique
        const movieTitle = result.metadata.title;
        seriesGroups[`movie_${index}`] = {
          seriesTitle: movieTitle,
          matches: result.metadata.allMatches,
          mediaType: result.metadata.type,
          fileIndexes: [index],
          representativeFile: result.originalName,
          episodeCount: 1
        };
      }
    });
    
    const multipleMatches = Object.values(seriesGroups).map(group => ({
      fileIndexes: group.fileIndexes, // All episodes in this series
      fileName: group.representativeFile,
      matches: group.matches,
      mediaType: group.mediaType,
      originalTitle: group.seriesTitle,
      episodeCount: group.episodeCount,
      seriesTitle: group.seriesTitle
    }));
    
    if (multipleMatches.length > 0) {
      console.log(`Found ${multipleMatches.length} series/movies with multiple matches, showing selector`);
      setPendingMatches(multipleMatches);
      setCurrentMatchIndex(0);
      return true; // Indicate that matches need user selection
    }
    return false; // No matches need selection
  };

  const handleFormatChange = (e) => {
    setFormat(e.target.value);
  };

  const previewRename = async () => {
    if (selectedFilesList.length === 0) {
      alert('Please select files to rename');
      return;
    }

    // Check dependencies before processing
    const validation = await dependencyService.validateOperation(['ffmpeg']);
    if (!validation.valid) {
      return; // User was already prompted with installation instructions
    }

    setIsProcessing(true);
    
    try {
      console.log('Starting metadata lookup for', selectedFilesList.length, 'files');
      const previews = [];

      for (const file of selectedFilesList) {
        console.log(`Processing file: ${file.name}`);
        
        // Parse the filename to extract metadata
        const parsed = metadataService.parseFileName(file.name, file.path);
        console.log(`Parsed metadata for ${file.name}:`, parsed);
        
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
          // Check if we have multiple matches that need user selection
          if (lookupResult.matches && lookupResult.matches.length > 1) {
            // Store multiple matches for user selection
            const matchData = {
              file,
              parsed,
              matches: lookupResult.matches,
              fileIndex: previews.length
            };
            
            // For now, use the best match but mark it for potential user review
            metadata = { ...parsed, ...lookupResult.bestMatch };
            metadata.hasMultipleMatches = true;
            metadata.allMatches = lookupResult.matches;
            console.log(`Found ${lookupResult.matches.length} matches for ${file.name}, using best match:`, metadata);
          } else {
            // Single match or best match
            const selectedMatch = lookupResult.bestMatch || lookupResult.matches?.[0] || lookupResult;
            metadata = { ...parsed, ...selectedMatch };
            console.log(`Found single match:`, metadata);
          }
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
      
      // Check if any results have multiple matches that need user selection
      const hasMultipleMatches = checkForMultipleMatches(previews);
      if (hasMultipleMatches) {
        console.log('Multiple matches found, showing match selector...');
      } else {
        console.log('No multiple matches found, preview ready for execution');
      }
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
        
        // Request parent component to refresh file list
        if (onUpdateFiles) {
          // Trigger a refresh by clearing and reloading
          // This is better than a hard page reload
          alert('Backups restored successfully. Please refresh the file list manually or re-scan the folder.');
        }
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

  const determineCorrectFilePath = (file, result) => {
    const currentDirectory = window.nodeAPI ? 
      window.nodeAPI.path.dirname(file.path) : 
      file.path.substring(0, file.path.lastIndexOf('/'));
    
    const currentFolderName = window.nodeAPI ? 
      window.nodeAPI.path.basename(currentDirectory) : 
      currentDirectory.split('/').pop();
    
    // Check if the file is already in a proper Season XX folder (case insensitive)
    const seasonPattern = /^Season\s+(\d+)$/i;
    const isInSeasonFolder = seasonPattern.test(currentFolderName);
    
    if (isInSeasonFolder) {
      const currentSeasonMatch = currentFolderName.match(seasonPattern);
      const currentSeasonNumber = currentSeasonMatch ? parseInt(currentSeasonMatch[1]) : null;
      const targetSeasonNumber = result.metadata?.season;
      
      // If already in the correct season folder, just rename the file in place
      if (currentSeasonNumber === targetSeasonNumber) {
        const newPath = window.nodeAPI ?
          window.nodeAPI.path.join(currentDirectory, result.newName) :
          `${currentDirectory}/${result.newName}`;
        
        console.log(`File already in correct Season ${targetSeasonNumber} folder, renaming in place`);
        return newPath;
      }
    }
    
    // Check if file is in an individual episode folder that should be consolidated
    const isInEpisodeFolder = currentFolderName.includes('S0') && currentFolderName.includes('E0');
    
    let baseDirectory;
    if (isInEpisodeFolder) {
      // Go up one level to consolidate from episode subfolders
      baseDirectory = window.nodeAPI ? 
        window.nodeAPI.path.dirname(currentDirectory) : 
        currentDirectory.split('/').slice(0, -1).join('/');
    } else if (isInSeasonFolder) {
      // If in wrong season folder, go up to series level
      baseDirectory = window.nodeAPI ? 
        window.nodeAPI.path.dirname(currentDirectory) : 
        currentDirectory.split('/').slice(0, -1).join('/');
    } else {
      baseDirectory = currentDirectory;
    }
    
    // For TV shows, create proper Season XX folder structure
    if (result.metadata?.type === 'tv' && result.metadata?.season) {
      const seasonFolder = `Season ${result.metadata.season}`;
      
      if (result.seriesFolder) {
        // Full series/season structure
        return window.nodeAPI ?
          window.nodeAPI.path.join(baseDirectory, result.seriesFolder, seasonFolder, result.newName) :
          `${baseDirectory}/${result.seriesFolder}/${seasonFolder}/${result.newName}`;
      } else {
        // Just season folder
        return window.nodeAPI ?
          window.nodeAPI.path.join(baseDirectory, seasonFolder, result.newName) :
          `${baseDirectory}/${seasonFolder}/${result.newName}`;
      }
    }
    
    // For movies or files without season info, just rename in current directory
    return window.nodeAPI ?
      window.nodeAPI.path.join(baseDirectory, result.newName) :
      `${baseDirectory}/${result.newName}`;
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
      const preferences = await settingsService.getPreferences();
      createBackup = preferences?.createBackup === true;
      writeMetadata = preferences?.writeMetadata !== false; // Default to true unless explicitly disabled
      console.log('Create backup setting:', createBackup);
      console.log('Write metadata setting:', writeMetadata);
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
      
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.organizeFiles) {
        throw new Error('Electron API not available. Please restart the application.');
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
        
        // Determine the correct path for this file
        const newPath = determineCorrectFilePath(file, result);
        
        console.log(`Mapping rename: ${file.path} -> ${newPath}`);
        
        // Check if source and destination are the same (no operation needed)
        // Normalize paths for cross-platform comparison
        const normalizedOldPath = file.path.replace(/\\/g, '/').toLowerCase();
        const normalizedNewPath = newPath.replace(/\\/g, '/').toLowerCase();
        
        if (normalizedOldPath === normalizedNewPath) {
          console.log(`Skipping file - already in correct location: ${file.path}`);
          return null; // Will be filtered out
        }
        
        return {
          id: result.id,
          oldPath: file.path,
          newPath: newPath,
          createBackup: false, // Force no backup for now - will fix settings loading later
          needsDirectoryCreation: result.needsDirectoryCreation,
          seasonFolder: result.seasonFolder,
          seriesFolder: result.seriesFolder
        };
      }).filter(operation => operation !== null); // Remove skipped files

      if (renameOperations.length === 0) {
        alert('All files are already in the correct location and format. No rename operations needed.');
        return;
      }

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

      {pendingMatches.length > 0 && (
        <div className="rename-match-selection">
          <div className="match-selection-header">
            <h3>🎬 Select Correct Series/Movie</h3>
            <p>Selection {currentMatchIndex + 1} of {pendingMatches.length}:</p>
            <div className="current-file-info">
              <strong>📺 {pendingMatches[currentMatchIndex]?.seriesTitle}</strong>
              {pendingMatches[currentMatchIndex]?.episodeCount > 1 && (
                <div className="episode-count">
                  ({pendingMatches[currentMatchIndex]?.episodeCount} episodes will be affected)
                </div>
              )}
              <div className="representative-file">
                Example file: {pendingMatches[currentMatchIndex]?.fileName}
              </div>
            </div>
          </div>
          <MetadataMatchSelector
            matches={pendingMatches[currentMatchIndex]?.matches}
            originalTitle={pendingMatches[currentMatchIndex]?.originalTitle}
            mediaType={pendingMatches[currentMatchIndex]?.mediaType}
            onSelect={handleMatchSelection}
            onCancel={handleMatchSkip}
          />
        </div>
      )}

      {results.length > 0 && pendingMatches.length === 0 && (
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