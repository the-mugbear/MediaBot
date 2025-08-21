// Service for fetching metadata from APIs and writing it to files

import metadataService from './metadataService';
import metadataWriter from './metadataWriter';

class ApiMetadataService {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
  }

  // Fetch metadata from APIs for a file and write it
  async fetchAndWriteMetadata(file, options = {}) {
    if (!this.isElectron) {
      throw new Error('API metadata service only available in Electron environment');
    }

    const result = {
      success: false,
      file: file,
      error: null,
      metadata: null,
      writtenMetadata: null,
      skipped: false,
      reason: null
    };

    try {
      console.log('ApiMetadataService: Starting metadata fetch for:', file.name);
      
      // STEP 1: Check for staged metadata first to avoid redundant API calls
      const stagedCheck = await window.electronAPI.checkStagedMetadata(file.path);
      if (stagedCheck.hasStaged) {
        console.log('ApiMetadataService: Found staged metadata for:', file.name);
        
        if (stagedCheck.applied) {
          result.skipped = true;
          result.reason = 'Metadata already staged and applied';
          result.metadata = stagedCheck.metadata.metadata;
          return result;
        } else {
          // Staged but not applied - we can skip API call and just apply
          if (options.writeToFile) {
            console.log('ApiMetadataService: Applying staged metadata for:', file.name);
            const applyResult = await window.electronAPI.applyStagedMetadata(file.path, { cleanupStaging: false });
            if (applyResult.success) {
              result.success = true;
              result.metadata = stagedCheck.metadata.metadata;
              result.writtenMetadata = stagedCheck.metadata.metadata;
              result.reason = 'Applied staged metadata';
              return result;
            }
          } else {
            // Just return the staged metadata
            result.success = true;
            result.metadata = stagedCheck.metadata.metadata;
            result.reason = 'Used staged metadata';
            return result;
          }
        }
      }
      
      // Check if user wants to skip files that already have metadata
      if (options.skipIfHasMetadata && file.hasMetadata) {
        result.skipped = true;
        result.reason = 'File already has metadata';
        console.log('ApiMetadataService: Skipping file - already has metadata:', file.name);
        return result;
      }

      // STEP 2: Parse filename to get media information
      console.log('ApiMetadataService: Parsing filename:', file.name);
      const parsedInfo = metadataService.parseFileName(file.name, file.path);
      
      if (!parsedInfo || parsedInfo.type === 'unknown') {
        result.error = 'Could not parse filename to identify media';
        console.log('ApiMetadataService: Failed to parse filename:', file.name);
        return result;
      }

      console.log('ApiMetadataService: Parsed info:', parsedInfo);

      // Fetch metadata from APIs
      let apiMetadata = null;
      
      if (parsedInfo.type === 'tv' && parsedInfo.title && parsedInfo.season && parsedInfo.episode) {
        console.log('ApiMetadataService: Fetching TV show metadata');
        apiMetadata = await this.fetchTVMetadata(parsedInfo);
      } else if (parsedInfo.type === 'movie' && parsedInfo.title) {
        console.log('ApiMetadataService: Fetching movie metadata');
        apiMetadata = await this.fetchMovieMetadata(parsedInfo);
      } else {
        result.error = 'Insufficient information to fetch metadata (need title and season/episode for TV or title for movies)';
        return result;
      }

      if (!apiMetadata) {
        result.error = 'No metadata found from API services';
        return result;
      }

      result.metadata = apiMetadata;
      console.log('ApiMetadataService: Fetched metadata:', apiMetadata);

      // STEP 3: Stage the metadata first (always stage to avoid future API calls)
      console.log('ApiMetadataService: Staging metadata for future use');
      try {
        // Convert to FFmpeg-ready format before staging
        const ffmpegMetadata = this.createFFmpegMetadataMap(apiMetadata);
        
        const stageResult = await window.electronAPI.stageMetadata(file.path, ffmpegMetadata, {
          confidence: parsedInfo.confidence || 0.8
        });
        
        if (!stageResult.success) {
          console.warn('ApiMetadataService: Failed to stage metadata:', stageResult.error);
        }
      } catch (stageError) {
        console.warn('ApiMetadataService: Error staging metadata:', stageError.message);
      }

      // STEP 4: Write metadata to file if requested
      if (options.writeToFile !== false) {
        console.log('ApiMetadataService: Writing metadata to file');
        try {
          // Convert to FFmpeg format and write
          const ffmpegMetadata = this.createFFmpegMetadataMap(apiMetadata);
          const writeResult = await window.electronAPI.writeMetadata(file.path, ffmpegMetadata, {
            backup: false // No backups for space efficiency
          });
          
          if (writeResult.success) {
            result.writtenMetadata = apiMetadata;
            console.log('ApiMetadataService: Successfully wrote metadata to file');
          } else {
            result.error = `Metadata fetched but failed to write to file: ${writeResult.error}`;
          }
        } catch (writeError) {
          result.error = `Metadata fetched but failed to write to file: ${writeError.message}`;
        }
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('ApiMetadataService: Error processing file:', error);
      result.error = error.message;
      return result;
    }
  }

  // Fetch TV show metadata
  async fetchTVMetadata(parsedInfo) {
    try {
      // Use the existing metadata service to fetch TV data
      const searchResult = await metadataService.searchMedia(
        parsedInfo.title,
        'tv',
        parsedInfo.year
      );

      if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        throw new Error('No TV show found matching the title');
      }

      // Get the best match (first result)
      const tvShow = searchResult.results[0];
      
      // Fetch episode details
      const episodeResult = await metadataService.getEpisodeDetails(
        tvShow.id,
        parsedInfo.season,
        parsedInfo.episode
      );

      if (!episodeResult.success || !episodeResult.episode) {
        throw new Error(`Episode S${parsedInfo.season}E${parsedInfo.episode} not found`);
      }

      const episode = episodeResult.episode;

      // Combine show and episode information
      return {
        type: 'tv',
        title: tvShow.name || tvShow.title,
        year: tvShow.first_air_date ? new Date(tvShow.first_air_date).getFullYear() : null,
        season: parsedInfo.season,
        episode: parsedInfo.episode,
        episodeTitle: episode.name || episode.title,
        overview: episode.overview || tvShow.overview,
        source: searchResult.source,
        confidence: tvShow.confidence || 0.8
      };

    } catch (error) {
      console.error('ApiMetadataService: Error fetching TV metadata:', error);
      throw error;
    }
  }

  // Fetch movie metadata
  async fetchMovieMetadata(parsedInfo) {
    try {
      // Use the existing metadata service to fetch movie data
      const searchResult = await metadataService.searchMedia(
        parsedInfo.title,
        'movie',
        parsedInfo.year
      );

      if (!searchResult.success || !searchResult.results || searchResult.results.length === 0) {
        throw new Error('No movie found matching the title');
      }

      // Get the best match (first result)
      const movie = searchResult.results[0];

      return {
        type: 'movie',
        title: movie.title || movie.name,
        year: movie.release_date ? new Date(movie.release_date).getFullYear() : 
              movie.first_air_date ? new Date(movie.first_air_date).getFullYear() : null,
        overview: movie.overview,
        source: searchResult.source,
        confidence: movie.confidence || 0.8
      };

    } catch (error) {
      console.error('ApiMetadataService: Error fetching movie metadata:', error);
      throw error;
    }
  }

  // Optimized batch staging and processing workflow
  async batchStageAndApply(files, options = {}, progressCallback = null) {
    console.log(`ApiMetadataService: Starting optimized batch workflow for ${files.length} files`);
    
    // PHASE 1: Stage all metadata (fast, no file writes)
    console.log('ApiMetadataService: Phase 1 - Staging metadata...');
    const stageResults = await this.batchFetchMetadata(files, {
      ...options,
      writeToFile: false, // Only stage, don't write yet
    }, (progress) => {
      if (progressCallback) {
        progressCallback({
          ...progress,
          phase: 'staging',
          phaseDescription: 'Fetching and staging metadata'
        });
      }
    });
    
    // PHASE 2: Apply staged metadata to files (if requested)
    if (options.writeToFile !== false) {
      console.log('ApiMetadataService: Phase 2 - Applying staged metadata...');
      const filesToApply = stageResults.results.filter(r => r.success && !r.skipped);
      
      for (let i = 0; i < filesToApply.length; i++) {
        const result = filesToApply[i];
        
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: filesToApply.length,
            currentFile: result.file.name,
            progress: Math.round(((i + 1) / filesToApply.length) * 100),
            phase: 'applying',
            phaseDescription: 'Writing metadata to files'
          });
        }
        
        try {
          const applyResult = await window.electronAPI.applyStagedMetadata(result.file.path, {
            cleanupStaging: false
          });
          
          if (applyResult.success) {
            result.writtenMetadata = result.metadata;
          } else {
            result.error = `Failed to apply staged metadata: ${applyResult.error}`;
            result.success = false;
          }
        } catch (error) {
          result.error = `Failed to apply staged metadata: ${error.message}`;
          result.success = false;
        }
      }
    }
    
    return stageResults;
  }

  // Batch process multiple files
  async batchFetchMetadata(files, options = {}, progressCallback = null) {
    const results = [];
    const totalFiles = files.length;
    
    console.log(`ApiMetadataService: Starting batch processing of ${totalFiles} files`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update progress
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: totalFiles,
          currentFile: file.name,
          progress: Math.round(((i + 1) / totalFiles) * 100)
        });
      }

      try {
        const result = await this.fetchAndWriteMetadata(file, options);
        results.push(result);
        
        // Add delay between API calls to be respectful
        if (i < files.length - 1) {
          await this.delay(options.delayBetweenCalls || 500);
        }
      } catch (error) {
        console.error(`ApiMetadataService: Error processing ${file.name}:`, error);
        results.push({
          success: false,
          file: file,
          error: error.message,
          skipped: false
        });
      }
    }

    return {
      success: true,
      results: results,
      summary: this.generateBatchSummary(results)
    };
  }

  // Generate summary of batch operation
  generateBatchSummary(results) {
    const summary = {
      total: results.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    results.forEach(result => {
      if (result.skipped) {
        summary.skipped++;
      } else if (result.success) {
        summary.successful++;
      } else {
        summary.failed++;
        if (result.error) {
          summary.errors.push(`${result.file.name}: ${result.error}`);
        }
      }
    });

    return summary;
  }

  // Utility function for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Check if API keys are configured
  async checkApiConfiguration() {
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
        const settingsString = localStorage.getItem('mediabot-settings');
        if (settingsString) {
          settings = JSON.parse(settingsString);
        }
      }
      
      if (!settings) {
        return {
          configured: false,
          message: 'No settings found. Please configure API keys in Settings.'
        };
      }

      const apiKeys = settings.apiKeys || {};

      const hasAnyKey = Object.values(apiKeys).some(key => key && key.trim() !== '');
      
      if (!hasAnyKey) {
        return {
          configured: false,
          message: 'No API keys configured. Please add API keys in Settings.'
        };
      }

      return {
        configured: true,
        message: 'API keys are configured.',
        availableServices: Object.entries(apiKeys)
          .filter(([key, value]) => value && value.trim() !== '')
          .map(([key, value]) => key)
      };
    } catch (error) {
      return {
        configured: false,
        message: 'Error checking API configuration: ' + error.message
      };
    }
  }

  // Convert API metadata to FFmpeg-ready format
  createFFmpegMetadataMap(metadata) {
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
  }
}

export default new ApiMetadataService();