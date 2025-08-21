// Service for reading metadata from media files using ffprobe

class MetadataReader {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
  }

  // Read metadata from a media file
  async readMetadata(filePath) {
    if (!this.isElectron) {
      throw new Error('Metadata reading only available in Electron environment');
    }

    try {
      console.log('Reading metadata from:', filePath);
      
      const result = await window.electronAPI.readMetadata(filePath);
      
      if (result.success) {
        console.log('Metadata read successfully:', result.metadata);
        return { success: true, metadata: result.metadata };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to read metadata:', error);
      return { success: false, error: error.message, metadata: {} };
    }
  }

  // Parse and normalize metadata from ffprobe output
  parseMetadata(ffprobeData) {
    const metadata = {};
    
    if (!ffprobeData.format) {
      return metadata;
    }

    const tags = ffprobeData.format.tags || {};
    
    // Common metadata fields
    metadata.title = this.getMetadataValue(tags, ['title', 'Title', 'TITLE']);
    metadata.artist = this.getMetadataValue(tags, ['artist', 'Artist', 'ARTIST']);
    metadata.album = this.getMetadataValue(tags, ['album', 'Album', 'ALBUM']);
    metadata.date = this.getMetadataValue(tags, ['date', 'Date', 'DATE', 'year', 'Year', 'YEAR']);
    metadata.genre = this.getMetadataValue(tags, ['genre', 'Genre', 'GENRE']);
    metadata.comment = this.getMetadataValue(tags, ['comment', 'Comment', 'COMMENT', 'description', 'Description', 'DESCRIPTION']);
    
    // TV Show specific metadata
    metadata.show = this.getMetadataValue(tags, ['show', 'Show', 'SHOW', 'series', 'Series', 'SERIES']);
    metadata.season = this.getMetadataValue(tags, ['season', 'Season', 'SEASON', 'season_number', 'SEASON_NUMBER']);
    metadata.episode = this.getMetadataValue(tags, ['episode', 'Episode', 'EPISODE', 'episode_id', 'EPISODE_ID', 'track', 'Track', 'TRACK']);
    metadata.episodeTitle = this.getMetadataValue(tags, ['episode_title', 'EPISODE_TITLE']);
    
    // Movie specific metadata
    metadata.movie = this.getMetadataValue(tags, ['movie', 'Movie', 'MOVIE']);
    
    // Technical metadata
    metadata.encoder = this.getMetadataValue(tags, ['encoder', 'Encoder', 'ENCODER']);
    metadata.mediaType = this.getMetadataValue(tags, ['media_type', 'MEDIA_TYPE']);
    
    // File information
    metadata.duration = ffprobeData.format.duration;
    metadata.size = ffprobeData.format.size;
    metadata.bitRate = ffprobeData.format.bit_rate;
    metadata.formatName = ffprobeData.format.format_name;
    metadata.formatLongName = ffprobeData.format.format_long_name;
    
    // Stream information
    if (ffprobeData.streams && ffprobeData.streams.length > 0) {
      const videoStream = ffprobeData.streams.find(s => s.codec_type === 'video');
      const audioStream = ffprobeData.streams.find(s => s.codec_type === 'audio');
      
      if (videoStream) {
        metadata.videoCodec = videoStream.codec_name;
        metadata.width = videoStream.width;
        metadata.height = videoStream.height;
        metadata.frameRate = videoStream.r_frame_rate;
      }
      
      if (audioStream) {
        metadata.audioCodec = audioStream.codec_name;
        metadata.audioChannels = audioStream.channels;
        metadata.sampleRate = audioStream.sample_rate;
      }
    }
    
    return metadata;
  }

  // Helper method to get metadata value from multiple possible keys
  getMetadataValue(tags, keys) {
    console.log('MetadataReader: Looking for keys:', keys, 'in tags:', Object.keys(tags));
    for (const key of keys) {
      if (tags[key] && tags[key].toString().trim()) {
        console.log('MetadataReader: Found value for key', key, ':', tags[key]);
        return tags[key].toString().trim();
      }
    }
    console.log('MetadataReader: No value found for keys:', keys);
    return null;
  }

  // Format metadata for display
  formatMetadataForDisplay(metadata) {
    const displayMetadata = {};
    
    // Content metadata
    if (metadata.title) displayMetadata['Title'] = metadata.title;
    if (metadata.show) displayMetadata['Show'] = metadata.show;
    if (metadata.season) displayMetadata['Season'] = metadata.season;
    if (metadata.episode) displayMetadata['Episode'] = metadata.episode;
    if (metadata.episodeTitle) displayMetadata['Episode Title'] = metadata.episodeTitle;
    if (metadata.movie) displayMetadata['Movie'] = metadata.movie;
    if (metadata.date) displayMetadata['Year/Date'] = metadata.date;
    if (metadata.genre) displayMetadata['Genre'] = metadata.genre;
    if (metadata.comment) displayMetadata['Description'] = metadata.comment;
    
    // Technical metadata
    if (metadata.duration) {
      const duration = parseFloat(metadata.duration);
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = Math.floor(duration % 60);
      displayMetadata['Duration'] = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (metadata.size) {
      const sizeInMB = (parseInt(metadata.size) / (1024 * 1024)).toFixed(1);
      displayMetadata['File Size'] = `${sizeInMB} MB`;
    }
    
    if (metadata.width && metadata.height) {
      displayMetadata['Resolution'] = `${metadata.width}x${metadata.height}`;
    }
    
    if (metadata.videoCodec) displayMetadata['Video Codec'] = metadata.videoCodec.toUpperCase();
    if (metadata.audioCodec) displayMetadata['Audio Codec'] = metadata.audioCodec.toUpperCase();
    if (metadata.audioChannels) displayMetadata['Audio Channels'] = metadata.audioChannels;
    
    if (metadata.bitRate) {
      const bitRateInKbps = (parseInt(metadata.bitRate) / 1000).toFixed(0);
      displayMetadata['Bit Rate'] = `${bitRateInKbps} kbps`;
    }
    
    if (metadata.encoder) displayMetadata['Encoder'] = metadata.encoder;
    
    return displayMetadata;
  }

  // Check if file has any meaningful metadata
  hasMetadata(metadata) {
    const contentFields = ['title', 'show', 'season', 'episode', 'episodeTitle', 'movie', 'date', 'genre', 'comment'];
    return contentFields.some(field => metadata[field] && metadata[field].toString().trim());
  }

  // Get metadata completeness score (0-1)
  getMetadataCompleteness(metadata, fileType = 'unknown') {
    let totalFields = 0;
    let filledFields = 0;
    
    // Common fields
    const commonFields = ['title', 'date', 'genre'];
    commonFields.forEach(field => {
      totalFields++;
      if (metadata[field]) filledFields++;
    });
    
    // Type-specific fields
    if (fileType === 'tv' || metadata.show) {
      const tvFields = ['show', 'season', 'episode'];
      tvFields.forEach(field => {
        totalFields++;
        if (metadata[field]) filledFields++;
      });
    } else {
      // Assume movie
      totalFields++;
      if (metadata.movie || metadata.title) filledFields++;
    }
    
    return totalFields > 0 ? filledFields / totalFields : 0;
  }
}

export default new MetadataReader();