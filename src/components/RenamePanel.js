import React, { useState, useEffect } from 'react';
import MetadataMatchSelector from './MetadataMatchSelector';
import MetadataRefinement from './MetadataRefinement';
import metadataService from '../services/metadataService';
import metadataWriter from '../services/metadataWriter';
import settingsService from '../services/settingsService';
import dependencyService from '../services/dependencyService';
import { logger } from '../hooks/useLogger';

const RenamePanel = ({ files, selectedFiles, onUpdateFiles }) => {
  const [format, setFormat] = useState('{n} - {s00e00} - {t}');
  const [customFormat, setCustomFormat] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [metadataCache, setMetadataCache] = useState(new Map());
  const [failedLookups, setFailedLookups] = useState([]);
  const [showRefinement, setShowRefinement] = useState(false);

  useEffect(() => {
    // Load API keys from settings when component mounts
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      logger.info('Loading API keys for metadata services');
      const apiKeys = await settingsService.getApiKeys();
      if (apiKeys && Object.keys(apiKeys).length > 0) {
        metadataService.setApiKeys(apiKeys);
        logger.success('API keys loaded successfully', { keyCount: Object.keys(apiKeys).length });
      } else {
        logger.warn('No API keys found - metadata lookup may be limited');
      }
    } catch (error) {
      logger.error('Failed to load API keys', { error: error.message });
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

  // Metadata caching methods
  const cacheMetadata = (fileId, metadata) => {
    setMetadataCache(prev => {
      const newCache = new Map(prev);
      newCache.set(fileId, {
        metadata,
        timestamp: Date.now(),
        source: 'rename_preview'
      });
      logger.metadata(`Cached metadata for file ${fileId}`, { 
        title: metadata.title, 
        type: metadata.type,
        cacheSize: newCache.size 
      });
      return newCache;
    });
  };

  const getCachedMetadata = (fileId) => {
    return metadataCache.get(fileId);
  };

  const clearMetadataCache = () => {
    logger.metadata(`Clearing metadata cache (${metadataCache.size} entries)`);
    setMetadataCache(new Map());
  };

  // Convert API metadata to FFmpeg-ready format
  const createFFmpegMetadataMap = (metadata) => {
    const metadataMap = {};

    // Common metadata fields
    if (metadata.title) {
      metadataMap.title = metadata.title;
    }

    if (metadata.year) {
      metadataMap.date = metadata.year.toString();
      metadataMap.year = metadata.year.toString();
    }

    if (metadata.overview) {
      const summary = `${metadata.overview} [Source: ${metadata.source || 'API'}] [Confidence: ${Math.round((metadata.confidence || 0) * 100)}%]`;
      metadataMap.comment = summary;
      metadataMap.description = metadata.overview;
      metadataMap.synopsis = metadata.overview;
    }

    if (metadata.type === 'tv') {
      // TV Show specific metadata
      if (metadata.title) {
        metadataMap.show = metadata.title;
        metadataMap.series = metadata.title;
      }

      if (metadata.season) {
        metadataMap.season_number = metadata.season.toString();
        metadataMap.season = metadata.season.toString();
      }

      if (metadata.episode) {
        metadataMap.episode_id = metadata.episode.toString();
        metadataMap.episode_sort = metadata.episode.toString();
        metadataMap.track = metadata.episode.toString();
      }

      if (metadata.episodeTitle) {
        metadataMap.title = metadata.episodeTitle;
        metadataMap.episode = metadata.episodeTitle;
      }

      // Set media type
      metadataMap.media_type = '10'; // TV Show
      metadataMap.genre = 'TV Show';

    } else if (metadata.type === 'movie') {
      // Movie specific metadata
      metadataMap.media_type = '9'; // Movie
      metadataMap.genre = 'Movie';
    }

    // Add source information
    metadataMap.encoder = `MediaBot via ${metadata.source || 'API'}`;

    return metadataMap;
  };

  const handleMatchSelection = async (selectedMatch) => {
    const currentPendingMatch = pendingMatches[currentMatchIndex];
    if (!currentPendingMatch) return;
    
    const fileIndex = currentPendingMatch.fileIndex;
    logger.metadata(`User selected series for ${currentPendingMatch.fileName}`, { 
      selection: selectedMatch,
      affectedEpisodes: currentPendingMatch.episodeCount 
    });
    
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
        const filenameInfo = metadataService.generateFileName(episodeMetadata, getEffectiveFormat(), `.${fileExtension}`, file?.path);
        
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
    const newFormat = e.target.value;
    logger.info(`User changed naming format: ${format} → ${newFormat}`);
    setFormat(newFormat);
    
    // If switching to custom, initialize with current format
    if (newFormat === 'custom' && !customFormat) {
      setCustomFormat(format);
    }
  };

  const handleCustomFormatChange = (e) => {
    const newCustomFormat = e.target.value;
    setCustomFormat(newCustomFormat);
    logger.info(`User updated custom format: ${newCustomFormat}`);
  };

  // Get the effective format to use for operations
  const getEffectiveFormat = () => {
    return format === 'custom' ? customFormat : format;
  };

  // Handle refinement completion
  const handleRefinementComplete = (refinedResults) => {
    logger.info('Processing refinement results', {
      totalResults: refinedResults.length,
      refinedCount: refinedResults.filter(r => !r.skipped && r.metadata).length,
      skippedCount: refinedResults.filter(r => r.skipped).length
    });

    // Update results with refined metadata
    const updatedResults = results.map(result => {
      const refinedResult = refinedResults.find(r => r.fileId === result.id);
      
      if (refinedResult && !refinedResult.skipped && refinedResult.metadata) {
        // Generate new filename with refined metadata
        const fileExtension = result.originalName.split('.').pop();
        const file = selectedFilesList.find(f => f.id === result.id);
        const filenameInfo = metadataService.generateFileName(
          refinedResult.metadata, 
          getEffectiveFormat(), 
          `.${fileExtension}`, 
          file?.path
        );

        logger.success(`Applied refined metadata for ${result.originalName}`, {
          originalQuery: refinedResult.searchQuery,
          selectedTitle: refinedResult.metadata.title,
          newFilename: filenameInfo.filename
        });

        return {
          ...result,
          metadata: refinedResult.metadata,
          newName: filenameInfo.filename,
          confidence: 0.9, // High confidence for user-selected results
          seasonFolder: filenameInfo.seasonFolder,
          seriesFolder: filenameInfo.seriesFolder,
          needsDirectoryCreation: filenameInfo.needsDirectoryCreation,
          matches: [
            {
              source: refinedResult.metadata.source || 'User Selected',
              title: refinedResult.metadata.title,
              year: refinedResult.metadata.year || 'Unknown',
              type: refinedResult.metadata.type || 'unknown'
            }
          ]
        };
      }
      
      return result;
    });

    setResults(updatedResults);
    
    // Remove refined files from failed lookups
    const remainingFailedLookups = failedLookups.filter(failed => 
      !refinedResults.some(refined => refined.fileId === failed.id && !refined.skipped)
    );
    setFailedLookups(remainingFailedLookups);
    
    setShowRefinement(false);
    
    logger.success('Refinement process completed successfully', {
      updatedFiles: updatedResults.filter(r => refinedResults.some(rf => rf.fileId === r.id && !rf.skipped)).length,
      remainingFailedLookups: remainingFailedLookups.length
    });
  };

  // Handle refinement cancellation
  const handleRefinementCancel = () => {
    logger.info('User cancelled metadata refinement process');
    setShowRefinement(false);
  };

  // Start refinement process
  const startRefinementProcess = () => {
    if (failedLookups.length === 0) {
      alert('No failed lookups to refine');
      return;
    }

    logger.info(`Starting refinement process for ${failedLookups.length} failed lookups`);
    setShowRefinement(true);
  };

  const previewRename = async () => {
    if (selectedFilesList.length === 0) {
      logger.warn('Preview rename attempted with no files selected');
      alert('Please select files to rename');
      return;
    }

    logger.info(`Starting preview rename process for ${selectedFilesList.length} files`);

    // Check dependencies before processing
    const validation = await dependencyService.validateOperation(['ffmpeg']);
    if (!validation.valid) {
      logger.error('Dependency validation failed for ffmpeg');
      return; // User was already prompted with installation instructions
    }

    setIsProcessing(true);
    
    try {
      logger.info(`Beginning metadata lookup for ${selectedFilesList.length} files`, { 
        format: format,
        fileNames: selectedFilesList.map(f => f.name) 
      });
      const previews = [];
      const currentFailedLookups = [];

      for (const file of selectedFilesList) {
        logger.file(`Processing file: ${file.name}`, { path: file.path });
        
        // Parse the filename to extract metadata
        const parsed = metadataService.parseFileName(file.name, file.path);
        logger.metadata(`Parsed metadata for ${file.name}`, parsed);
        
        // Send debug info to Electron console
        if (window.electronAPI && window.electronAPI.debugLog) {
          window.electronAPI.debugLog(`Parsing file: ${file.name}`, parsed);
        }
        
        // Fetch metadata for accurate renaming (but don't apply to files)
        let metadata = null;
        let lookupResult = null;

        // Look up metadata based on file type for accurate renaming
        if (parsed.type === 'movie') {
          logger.api(`Searching for movie metadata: ${parsed.title}`, { year: parsed.year });
          lookupResult = await metadataService.searchMovie(parsed.title, parsed.year);
        } else if (parsed.type === 'tv') {
          logger.api(`Searching for TV show metadata: ${parsed.title}`, { 
            season: parsed.season, 
            episode: parsed.episode 
          });
          lookupResult = await metadataService.searchTVShow(parsed.title, parsed.season, parsed.episode);
        } else {
          logger.debug(`Unknown media type for ${file.name}`, { parsedType: parsed.type });
        }

        if (lookupResult && lookupResult.success) {
          // Check if we have multiple matches that need user selection
          if (lookupResult.matches && lookupResult.matches.length > 1) {
            logger.metadata(`Found ${lookupResult.matches.length} matches for ${file.name}`, {
              matches: lookupResult.matches.map(m => ({ title: m.title, year: m.year, source: m.source }))
            });
            
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
            logger.success(`Using best match for ${file.name}`, { bestMatch: lookupResult.bestMatch });
          } else {
            // Single match or best match
            const selectedMatch = lookupResult.bestMatch || lookupResult.matches?.[0] || lookupResult;
            metadata = { ...parsed, ...selectedMatch };
            logger.success(`Found single match for ${file.name}`, { match: selectedMatch });
          }
          
          // Cache the metadata for later use in Apply Metadata operation
          cacheMetadata(file.id, metadata);
          
        } else {
          // Track this as a failed lookup for potential refinement
          const failedLookup = {
            id: file.id,
            name: file.name,
            path: file.path,
            parsed: parsed,
            originalLookupType: parsed.type,
            failureReason: lookupResult ? 'API call failed' : 'Unknown media type'
          };
          currentFailedLookups.push(failedLookup);
          
          // Fallback to parsed data
          metadata = parsed;
          
          // Set confidence based on parsing quality
          if (parsed.episodeTitle || parsed.movieTitle) {
            metadata.confidence = 0.8; // High confidence for already formatted files
          } else if (parsed.type !== 'unknown') {
            metadata.confidence = 0.7; // Good confidence for recognized format
          } else {
            metadata.confidence = 0.5; // Medium confidence for basic parsing
          }
          
          logger.warn(`No metadata found for ${file.name}, using parsed data`, { 
            confidence: metadata.confidence,
            failureReason: lookupResult ? 'API call failed' : 'Unknown media type'
          });
        }

        // Generate new filename and path information
        const fileExtension = file.name.split('.').pop();
        const filenameInfo = metadataService.generateFileName(metadata, getEffectiveFormat(), `.${fileExtension}`, file.path);
        
        logger.file(`Generated filename for ${file.name}`, { 
          original: file.name,
          new: filenameInfo.filename,
          format: format,
          extension: fileExtension
        });
        
        // Determine parent folder changes - but check if file is already in correct location
        const currentDirectory = window.nodeAPI ? 
          window.nodeAPI.path.dirname(file.path) : 
          file.path.substring(0, file.path.lastIndexOf('/'));
        const currentParentName = window.nodeAPI ? 
          window.nodeAPI.path.basename(currentDirectory) : 
          currentDirectory.split('/').pop();
        let parentFolderChange = null;
        
        // Check if file is already in a Season folder
        const seasonPattern = /^Season\s+(\d+)$/i;
        const isInSeasonFolder = seasonPattern.test(currentParentName);
        
        logger.debug(`Checking season folder for ${file.name}`, {
          currentDirectory,
          currentParentName,
          isInSeasonFolder,
          metadataType: metadata.type,
          metadataSeason: metadata.season
        });
        
        if (isInSeasonFolder && metadata.type === 'tv' && metadata.season) {
          // File is in a Season folder - check if it's the correct season
          const currentSeasonMatch = currentParentName.match(seasonPattern);
          const currentSeasonNumber = currentSeasonMatch ? parseInt(currentSeasonMatch[1]) : null;
          const targetSeasonNumber = metadata.season;
          
          if (currentSeasonNumber === targetSeasonNumber) {
            // File is already in the correct Season folder - no parent folder change needed
            logger.success(`File already in correct Season ${targetSeasonNumber} folder - no folder change needed: ${file.name}`);
            parentFolderChange = null;
          } else {
            // Wrong season folder
            logger.info(`File in wrong season folder - needs correction: ${file.name}`, {
              current: currentSeasonNumber,
              target: targetSeasonNumber
            });
            parentFolderChange = {
              from: currentParentName,
              to: `Season ${targetSeasonNumber}`,
              type: 'season_correction',
              isCleanup: false
            };
          }
        } else if (filenameInfo.seriesFolder && !isInSeasonFolder) {
          // File is NOT in a season folder, check if we need to move to series structure
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
          matches: [
            { 
              source: 'Parsed', 
              title: metadata.title || 'Unknown', 
              year: metadata.year || 'Unknown',
              type: metadata.type || 'unknown'
            }
          ]
        });
      }
      
      setResults(previews);
      setFailedLookups(currentFailedLookups);
      
      // Check for multiple matches that need user selection
      const hasMultipleMatches = checkForMultipleMatches(previews);
      
      logger.success(`Preview generation complete: ${previews.length} files processed`, {
        filesProcessed: previews.length,
        averageConfidence: (previews.reduce((sum, p) => sum + p.confidence, 0) / previews.length * 100).toFixed(1) + '%',
        multipleMatchesFound: hasMultipleMatches,
        failedLookupsCount: currentFailedLookups.length,
        processingMode: 'api_lookup_with_staging'
      });
      
      if (hasMultipleMatches) {
        logger.info('Multiple matches found - user selection required');
      } else if (currentFailedLookups.length > 0) {
        logger.warn(`${currentFailedLookups.length} files had failed metadata lookups and may need refinement`);
      } else {
        logger.success('Preview ready for execution');
      }
    } catch (error) {
      logger.error('Preview generation failed', { error: error.message });
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
    
    logger.debug(`determineCorrectFilePath: Checking season folder detection`, {
      fileName: file.name,
      currentDirectory,
      currentFolderName,
      isInSeasonFolder,
      targetSeason: result.metadata?.season,
      metadataType: result.metadata?.type
    });
    
    if (isInSeasonFolder) {
      const currentSeasonMatch = currentFolderName.match(seasonPattern);
      const currentSeasonNumber = currentSeasonMatch ? parseInt(currentSeasonMatch[1]) : null;
      const targetSeasonNumber = result.metadata?.season;
      
      // If already in the correct season folder, just rename the file in place
      if (currentSeasonNumber === targetSeasonNumber) {
        const newPath = window.nodeAPI ?
          window.nodeAPI.path.join(currentDirectory, result.newName) :
          `${currentDirectory}/${result.newName}`;
        
        logger.success(`File already in correct Season ${targetSeasonNumber} folder, renaming in place`, {
          fileName: result.newName,
          currentPath: file.path,
          newPath: newPath,
          seasonFolder: currentFolderName
        });
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
      logger.warn('Execute rename attempted without preview');
      alert('Please preview rename first');
      return;
    }

    logger.info(`Starting rename execution for ${results.length} files`);

    // Load settings to check backup preferences
    let createBackup = false;
    try {
      const preferences = await settingsService.getPreferences();
      createBackup = preferences?.createBackup === true;
      logger.info('Loaded user preferences', { createBackup });
    } catch (error) {
      logger.warn('Failed to load user preferences, using defaults', { error: error.message });
    }

    // Confirm the rename operation
    const confirmMessage = `Are you sure you want to rename ${results.length} file(s)?\n\nThis will rename files and stage metadata for later application.`;
    if (!window.confirm(confirmMessage)) {
      logger.info('User cancelled rename operation');
      return;
    }

    logger.info('User confirmed rename operation, beginning execution');
    setIsProcessing(true);
    
    try {
      logger.debug('Rename execution details', {
        resultsCount: results.length,
        selectedFilesCount: selectedFilesList.length,
        nodeAPIAvailable: !!window.nodeAPI,
        electronAPIAvailable: !!window.electronAPI
      });
      
      // Check if electronAPI is available
      if (!window.electronAPI || !window.electronAPI.organizeFiles) {
        logger.error('Electron API not available for file operations');
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
        
        logger.debug(`Mapping rename operation`, {
          fileId: result.id,
          fileName: file.name,
          oldPath: file.path,
          newPath: newPath,
          parentFolderChange: result.parentFolderChange
        });
        
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
      
      // Prepare operations - stage metadata but don't write to files during rename
      const organizeOperations = renameOperations.map(op => ({
        ...op,
        metadata: null, // Don't write metadata during rename
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
        
        // Stage metadata for successfully renamed files for later application
        logger.info('Staging metadata for renamed files');
        let metadataStaged = 0;
        for (const successfulRename of successful) {
          const resultData = results.find(r => r.id === successfulRename.id);
          if (resultData?.metadata && window.electronAPI.stageMetadata) {
            try {
              // Convert metadata to FFmpeg format
              const ffmpegMetadata = createFFmpegMetadataMap(resultData.metadata);
              const stageResult = await window.electronAPI.stageMetadata(successfulRename.newPath, ffmpegMetadata, {
                confidence: resultData.confidence || 0.8,
                source: 'rename_operation'
              });
              if (stageResult.success) {
                metadataStaged++;
                logger.metadata(`Staged metadata for ${successfulRename.newPath}`);
              }
            } catch (error) {
              logger.warn(`Failed to stage metadata for ${successfulRename.newPath}`, { error: error.message });
            }
          }
        }
        
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
          const metadataMsg = metadataStaged > 0 ? ` and staged metadata for ${metadataStaged} files` : '';
          alert(`Successfully renamed ${successful.length} file(s)${metadataMsg}!\n\nUse "Apply Metadata" from the Files menu to write metadata to files.`);
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
              value={customFormat}
              placeholder="Enter custom format (e.g., {n} - {s00e00} - {t})"
              className="custom-format-input"
              onChange={handleCustomFormatChange}
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
            {isProcessing ? 'Processing...' : 'Preview Rename (Fast)'}
          </button>
          
          <button 
            className="btn btn-info" 
            onClick={() => console.log('Metadata fetch feature coming soon')}
            disabled={isProcessing || selectedFilesList.length === 0}
            title="Fetch metadata from online databases (slower but more accurate)"
          >
            🌐 Fetch Metadata
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

          {failedLookups.length > 0 && (
            <button 
              className="btn btn-orange" 
              onClick={startRefinementProcess}
              disabled={isProcessing}
              title={`Refine ${failedLookups.length} failed metadata lookups`}
            >
              🔍 Refine Failed Lookups ({failedLookups.length})
            </button>
          )}
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
          <div className="preview-header">
            <h3>Rename Preview</h3>
            {failedLookups.length > 0 && (
              <div className="failed-lookups-summary">
                <span className="warning-icon">⚠️</span>
                <span className="warning-text">
                  {failedLookups.length} file(s) had failed metadata lookups
                </span>
                <button 
                  className="btn-link" 
                  onClick={startRefinementProcess}
                  disabled={isProcessing}
                >
                  Click to refine
                </button>
              </div>
            )}
          </div>
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
                <div className="result-metadata-section">
                  <div className="confidence-display">
                    <div className="confidence-bar-container">
                      <div className="confidence-label">
                        <span className="confidence-icon">
                          {result.confidence >= 0.9 ? '🎯' : result.confidence >= 0.7 ? '👍' : result.confidence >= 0.5 ? '⚠️' : '❓'}
                        </span>
                        <span className="confidence-text">
                          Confidence: {(result.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="confidence-bar">
                        <div 
                          className={`confidence-fill confidence-${result.confidence >= 0.8 ? 'high' : result.confidence >= 0.6 ? 'medium' : 'low'}`}
                          style={{ width: `${result.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="confidence-description">
                      {result.confidence >= 0.9 ? 'Excellent match' : 
                       result.confidence >= 0.7 ? 'Good match' : 
                       result.confidence >= 0.5 ? 'Fair match' : 'Low confidence'}
                    </div>
                  </div>
                  
                  <div className="metadata-details">
                    {result.metadata && (
                      <div className="detected-info">
                        <div className="metadata-header">
                          <span className="metadata-icon">🎬</span>
                          <span className="metadata-title">Detected Metadata</span>
                        </div>
                        <div className="metadata-grid">
                          <div className="metadata-item">
                            <span className="metadata-key">Type:</span>
                            <span className="metadata-value">
                              {result.metadata.type === 'tv' ? '📺 TV Show' : 
                               result.metadata.type === 'movie' ? '🎥 Movie' : 
                               '❓ Unknown'}
                            </span>
                          </div>
                          <div className="metadata-item">
                            <span className="metadata-key">Title:</span>
                            <span className="metadata-value">"{result.metadata.title}"</span>
                          </div>
                          {result.metadata.year && (
                            <div className="metadata-item">
                              <span className="metadata-key">Year:</span>
                              <span className="metadata-value">{result.metadata.year}</span>
                            </div>
                          )}
                          {result.metadata.season && result.metadata.episode && (
                            <div className="metadata-item">
                              <span className="metadata-key">Episode:</span>
                              <span className="metadata-value">S{result.metadata.season}E{result.metadata.episode}</span>
                            </div>
                          )}
                          {result.metadata.episodeTitle && (
                            <div className="metadata-item">
                              <span className="metadata-key">Episode Title:</span>
                              <span className="metadata-value">"{result.metadata.episodeTitle}"</span>
                            </div>
                          )}
                          {result.metadata.source && (
                            <div className="metadata-item">
                              <span className="metadata-key">Source:</span>
                              <span className="metadata-value source-badge">
                                {result.metadata.source === 'TheMovieDB' ? '🎬 TMDB' :
                                 result.metadata.source === 'TheTVDB' ? '📺 TVDB' :
                                 result.metadata.source === 'OMDb' ? '🎭 OMDb' :
                                 result.metadata.source}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="source-matches">
                      <div className="matches-header">
                        <span className="matches-icon">🔍</span>
                        <span className="matches-title">Search Results</span>
                      </div>
                      <div className="matches-list">
                        {result.matches.map((match, index) => (
                          <div key={index} className="match-item">
                            <span className="match-source-badge">
                              {match.source === 'Parsed' ? '📝' : 
                               match.source === 'TheMovieDB' ? '🎬' :
                               match.source === 'TheTVDB' ? '📺' :
                               match.source === 'OMDb' ? '🎭' : '🔍'}
                              {match.source}
                            </span>
                            <span className="match-details">
                              {match.title} ({match.year}) [{match.type}]
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
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

      <MetadataRefinement
        failedFiles={failedLookups}
        onRetryComplete={handleRefinementComplete}
        onCancel={handleRefinementCancel}
        isVisible={showRefinement}
      />
    </div>
  );
};

export default RenamePanel;