// Service for writing metadata to media files using ffmpeg

class MetadataWriter {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
  }

  // Check if ffmpeg is available on the system
  async checkFFmpegAvailability() {
    if (!this.isElectron) {
      return { available: false, error: 'Not running in Electron environment' };
    }

    try {
      const result = await window.electronAPI.checkFFmpeg();
      return result;
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  // Write metadata to a video file
  async writeMetadata(filePath, metadata, options = {}) {
    if (!this.isElectron) {
      throw new Error('Metadata writing only available in Electron environment');
    }

    try {
      console.log('Writing metadata to:', filePath);
      console.log('Metadata:', metadata);

      const metadataMap = this.createMetadataMap(metadata);
      
      const result = await window.electronAPI.writeMetadata(filePath, metadataMap, options);
      
      if (result.success) {
        console.log('Metadata written successfully');
        return { success: true, outputPath: result.outputPath };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to write metadata:', error);
      throw error;
    }
  }

  // Create metadata map based on media type
  createMetadataMap(metadata) {
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
      metadataMap.comment = metadata.overview;
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
      
      if (metadata.title) {
        metadataMap.title = metadata.title;
        metadataMap.movie = metadata.title;
      }
    }

    // Add source information
    if (metadata.source) {
      metadataMap.encoder = `MediaBot via ${metadata.source}`;
      metadataMap.comment = (metadataMap.comment || '') + ` [Source: ${metadata.source}]`;
    }

    // Add confidence score
    if (metadata.confidence) {
      metadataMap.comment = (metadataMap.comment || '') + ` [Confidence: ${(metadata.confidence * 100).toFixed(1)}%]`;
    }

    return metadataMap;
  }

  // Get supported metadata fields for different file formats
  getSupportedFields(fileExtension) {
    const ext = fileExtension.toLowerCase().replace('.', '');
    
    const commonFields = ['title', 'date', 'year', 'comment', 'description', 'genre'];
    
    switch (ext) {
      case 'mp4':
      case 'm4v':
        return [...commonFields, 'show', 'season_number', 'episode_id', 'media_type'];
      
      case 'mkv':
        return [...commonFields, 'series', 'season', 'episode', 'synopsis'];
      
      case 'avi':
      case 'wmv':
        return commonFields;
      
      default:
        return commonFields;
    }
  }

  // Validate metadata before writing
  validateMetadata(metadata, fileExtension) {
    const supportedFields = this.getSupportedFields(fileExtension);
    const issues = [];

    if (!metadata.title) {
      issues.push('Title is required');
    }

    if (metadata.type === 'tv' && (!metadata.season || !metadata.episode)) {
      issues.push('Season and episode numbers are required for TV shows');
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      supportedFields: supportedFields
    };
  }
}

export default new MetadataWriter();