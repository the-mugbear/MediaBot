// Service for movie/TV metadata lookup and file name parsing

class MetadataService {
  constructor() {
    this.apiKeys = {};
  }

  setApiKeys(keys) {
    this.apiKeys = keys;
  }

  // Parse filename to extract movie/show information
  parseFileName(filename, fullPath) {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    // Check if this is a template filename that wasn't processed
    if (nameWithoutExt.includes('{n}') || nameWithoutExt.includes('{s') || nameWithoutExt.includes('{t}')) {
      // Try to extract info from the directory path instead
      if (fullPath) {
        const pathParts = fullPath.split('/');
        const parentDir = pathParts[pathParts.length - 2]; // Get parent directory name
        if (parentDir) {
          return this.parseFileName(parentDir + '.mkv'); // Recursively parse the directory name
        }
      }
      // Fallback if no path info available
      return {
        type: 'unknown',
        title: 'Unknown',
        original: filename
      };
    }
    
    // Common patterns for movie names
    const moviePatterns = [
      // Already formatted: Movie Name (2020) - Title
      /^(.+?)\s*\((\d{4})\)\s*-\s*(.+)/,
      // Movie.Name.2020.1080p.BluRay.x264.mkv
      /^(.+?)\.(\d{4})\./,
      // Movie Name (2020) [quality]
      /^(.+?)\s*\((\d{4})\)/,
      // Movie.Name.2020
      /^(.+?)\.(\d{4})$/,
      // Movie Name 2020
      /^(.+?)\s+(\d{4})/
    ];

    // TV show patterns
    const tvPatterns = [
      // Already formatted: Show Name - S01E01 - Episode Title
      /^(.+?)\s*-\s*S(\d+)E(\d+)\s*-\s*(.+)/i,
      // Show.Name.Year.S01E01.Episode.Title (like Mr.and.Mrs.Smith.2024.S01E01.First.Date)
      /^(.+?)\.(\d{4})\.S(\d+)E(\d+)\.(.+?)\.(?:\d+p|BluRay|WEB-DL|HDTV)/i,
      // Show.Name.S01E01.Episode.Title
      /^(.+?)\.S(\d+)E(\d+)\.(.+?)\.(?:\d+p|BluRay|WEB-DL|HDTV)/i,
      // Show.Name.S01E01 (basic)
      /^(.+?)\.S(\d+)E(\d+)/i,
      // Show Name - 1x01
      /^(.+?)\s*-\s*(\d+)x(\d+)/,
      // Show.Name.Season.1.Episode.1
      /^(.+?)\.Season\.(\d+)\.Episode\.(\d+)/i
    ];

    // Try both TV and movie patterns, then choose the best match based on confidence
    const candidates = [];
    
    // Check TV patterns
    for (let i = 0; i < tvPatterns.length; i++) {
      const pattern = tvPatterns[i];
      const match = nameWithoutExt.match(pattern);
      if (match) {
        console.log(`Matched TV pattern ${i}:`, match);
        
        let result;
        let confidence = 0.5; // Base confidence
        
        if (i === 1) {
          // Show.Name.Year.S01E01.Episode.Title pattern
          result = {
            type: 'tv',
            title: this.cleanTitle(match[1]),
            year: parseInt(match[2]),
            season: parseInt(match[3]),
            episode: parseInt(match[4]),
            original: filename
          };
          if (match[5]) {
            result.episodeTitle = this.cleanTitle(match[5]);
          }
          confidence = 0.9; // Very high confidence - has year, season, episode, and title
        } else if (i === 2) {
          // Show.Name.S01E01.Episode.Title pattern
          result = {
            type: 'tv',
            title: this.cleanTitle(match[1]),
            season: parseInt(match[2]),
            episode: parseInt(match[3]),
            original: filename
          };
          if (match[4]) {
            result.episodeTitle = this.cleanTitle(match[4]);
          }
          confidence = 0.85; // High confidence - has season, episode, and title
        } else if (i === 0) {
          // Already formatted: Show Name - S01E01 - Episode Title
          result = {
            type: 'tv',
            title: this.cleanTitle(match[1]),
            season: parseInt(match[2]),
            episode: parseInt(match[3]),
            original: filename
          };
          if (match[4]) {
            result.episodeTitle = this.cleanTitle(match[4]);
          }
          confidence = 0.95; // Highest confidence - already properly formatted
        } else {
          // Basic patterns
          result = {
            type: 'tv',
            title: this.cleanTitle(match[1]),
            season: parseInt(match[2]),
            episode: parseInt(match[3]),
            original: filename
          };
          if (match[4]) {
            result.episodeTitle = this.cleanTitle(match[4]);
          }
          confidence = 0.75; // Good confidence - has basic TV structure
        }
        
        result.confidence = confidence;
        candidates.push(result);
        
        // Send to Electron console if available
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.debugLog) {
          window.electronAPI.debugLog(`TV candidate ${i} for "${nameWithoutExt}"`, {
            pattern: pattern.toString(),
            confidence: confidence,
            result: result
          });
        }
      }
    }
    
    // Check movie patterns
    for (let i = 0; i < moviePatterns.length; i++) {
      const pattern = moviePatterns[i];
      const match = nameWithoutExt.match(pattern);
      if (match) {
        let confidence = 0.5; // Base confidence
        
        const result = {
          type: 'movie',
          title: this.cleanTitle(match[1]),
          year: parseInt(match[2]),
          original: filename
        };
        
        // If the pattern captured movie title (3rd group), include it
        if (match[3]) {
          result.movieTitle = this.cleanTitle(match[3]);
          confidence = 0.8; // Higher confidence if we have specific movie title
        } else {
          confidence = 0.6; // Lower confidence for basic year pattern
        }
        
        // Reduce confidence if filename contains TV indicators
        if (nameWithoutExt.match(/S\d+E\d+/i)) {
          confidence *= 0.3; // Severely penalize movie match if S##E## is present
        }
        
        result.confidence = confidence;
        candidates.push(result);
        
        // Send to Electron console if available
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.debugLog) {
          window.electronAPI.debugLog(`Movie candidate ${i} for "${nameWithoutExt}"`, {
            pattern: pattern.toString(),
            confidence: confidence,
            result: result
          });
        }
      }
    }
    
    // Choose the candidate with the highest confidence
    if (candidates.length > 0) {
      const bestMatch = candidates.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      // Send final result to Electron console
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.debugLog) {
        window.electronAPI.debugLog(`Best match for "${nameWithoutExt}"`, {
          winner: bestMatch,
          allCandidates: candidates
        });
      }
      
      console.log(`Best parsed result:`, bestMatch);
      return bestMatch;
    }

    // Fallback - try to extract just a title
    const cleanName = this.cleanTitle(nameWithoutExt);
    return {
      type: 'unknown',
      title: cleanName,
      original: filename
    };
  }

  // Clean up title by removing common release artifacts
  cleanTitle(title) {
    return title
      // Replace dots and underscores with spaces
      .replace(/[._]/g, ' ')
      // Remove episode patterns to prevent duplication (case insensitive)
      .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '')
      .replace(/\bSeason\s*\d{1,2}\s*Episode\s*\d{1,2}\b/gi, '')
      .replace(/\bEp\s*\d{1,2}\b/gi, '')
      .replace(/\bEpisode\s*\d{1,2}\b/gi, '')
      // Remove quality indicators
      .replace(/\b(1080p|720p|2160p|4K|BluRay|WEBRip|DVDRip|WEB-DL|HDTV|x264|x265|H\.264|HEVC|HDR|DDP5\.1|AMZN)\b/gi, '')
      // Remove release groups (at the end)
      .replace(/\[([^\]]+)\]/g, '')
      .replace(/-([A-Z0-9]+)$/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Search for movie metadata
  async searchMovie(title, year) {
    try {
      const apiKey = this.apiKeys.themoviedb;
      if (!apiKey) {
        throw new Error('TheMovieDB API key not configured');
      }

      const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const matches = data.results.slice(0, 10).map(movie => ({
          id: movie.id,
          title: movie.title,
          name: movie.title,
          release_date: movie.release_date,
          year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
          overview: movie.overview,
          confidence: this.calculateConfidence(title, movie.title, year, movie.release_date),
          source: 'TheMovieDB',
          poster_path: movie.poster_path
        }));
        
        // Sort by confidence score (highest first)
        matches.sort((a, b) => b.confidence - a.confidence);
        
        return {
          success: true,
          matches,
          bestMatch: matches[0] // Keep best match for backward compatibility
        };
      }

      return { success: false, error: 'No results found' };
    } catch (error) {
      console.error('Movie search error:', error);
      return { success: false, error: error.message };
    }
  }

  // Search for TV show metadata
  async searchTVShow(title, season, episode) {
    try {
      const apiKey = this.apiKeys.themoviedb;
      if (!apiKey) {
        throw new Error('TheMovieDB API key not configured');
      }

      const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(title)}`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const matches = [];
        
        // Process up to 10 results
        for (const show of data.results.slice(0, 10)) {
          // Get episode details if season/episode provided
          let episodeTitle = null;
          if (season && episode) {
            try {
              const episodeUrl = `https://api.themoviedb.org/3/tv/${show.id}/season/${season}/episode/${episode}?api_key=${apiKey}`;
              const episodeResponse = await fetch(episodeUrl);
              if (episodeResponse.ok) {
                const episodeData = await episodeResponse.json();
                episodeTitle = episodeData.name;
              }
            } catch (e) {
              console.warn('Could not fetch episode details for', show.name, e);
            }
          }
          
          matches.push({
            id: show.id,
            name: show.name,
            title: show.name,
            first_air_date: show.first_air_date,
            year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : null,
            season,
            episode,
            episodeTitle,
            overview: show.overview,
            confidence: this.calculateConfidence(title, show.name),
            source: 'TheMovieDB',
            poster_path: show.poster_path
          });
        }
        
        // Sort by confidence score (highest first)
        matches.sort((a, b) => b.confidence - a.confidence);

        return {
          success: true,
          matches,
          bestMatch: matches[0] // Keep best match for backward compatibility
        };
      }

      return { success: false, error: 'No results found' };
    } catch (error) {
      console.error('TV search error:', error);
      return { success: false, error: error.message };
    }
  }

  // Calculate confidence score based on title similarity
  calculateConfidence(originalTitle, foundTitle, originalYear, foundDate) {
    let confidence = 0.5; // Base confidence

    // Title similarity (simple approach)
    const original = originalTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = foundTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (original === found) {
      confidence += 0.4;
    } else if (found.includes(original) || original.includes(found)) {
      confidence += 0.3;
    } else {
      // Calculate basic string similarity
      const similarity = this.stringSimilarity(original, found);
      confidence += similarity * 0.3;
    }

    // Year match bonus
    if (originalYear && foundDate) {
      const foundYear = new Date(foundDate).getFullYear();
      if (originalYear === foundYear) {
        confidence += 0.1;
      }
    }

    return Math.min(1.0, confidence);
  }

  // Simple string similarity calculation
  stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  // Levenshtein distance for string similarity
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Sanitize filename to remove invalid characters
  sanitizeFileName(filename) {
    return filename
      // Remove or replace invalid characters for cross-platform compatibility
      .replace(/[<>:"/\\|?*]/g, '') // Remove common invalid characters
      .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Remove control characters
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim(); // Remove leading/trailing whitespace
  }

  // Clean existing episode patterns from titles to prevent duplication
  cleanTitleForFormatting(title) {
    return title
      // Remove existing episode patterns (case insensitive)
      .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '') // S01E01, S1E1, etc.
      .replace(/\bSeason\s*\d{1,2}\s*Episode\s*\d{1,2}\b/gi, '') // Season 1 Episode 1
      .replace(/\bEp\s*\d{1,2}\b/gi, '') // Ep01, Ep1, etc.
      .replace(/\bEpisode\s*\d{1,2}\b/gi, '') // Episode 01, Episode 1
      // Remove quality indicators and release artifacts
      .replace(/\b(1080p|720p|2160p|4K|BluRay|WEBRip|DVDRip|WEB-DL|HDTV|x264|x265|H\.264|HEVC|HDR|DDP5\.1|AMZN)\b/gi, '')
      // Remove release groups and brackets
      .replace(/\[([^\]]+)\]/g, '')
      .replace(/\(([^)]+)\)/g, '')
      .replace(/-([A-Z0-9]+)$/gi, '')
      // Replace dots and underscores with spaces
      .replace(/[._-]/g, ' ')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Generate clean filename and path based on format and metadata
  generateFileName(metadata, format, originalExtension, originalPath) {
    let cleanName = format;

    if (metadata.type === 'movie') {
      const cleanMovieTitle = this.cleanTitleForFormatting(metadata.title || 'Unknown Movie');
      cleanName = cleanName
        .replace(/{n}/g, this.sanitizeFileName(cleanMovieTitle))
        .replace(/{y}/g, metadata.year || 'Unknown')
        .replace(/{t}/g, this.sanitizeFileName(cleanMovieTitle));
      
      // For movies, just return the filename (no folder organization)
      cleanName = this.sanitizeFileName(cleanName);
      const ext = originalExtension.startsWith('.') ? originalExtension : `.${originalExtension}`;
      return {
        filename: cleanName + ext,
        needsDirectoryCreation: false,
        seasonFolder: null
      };

    } else if (metadata.type === 'tv') {
      const season = metadata.season ? metadata.season.toString().padStart(2, '0') : '00';
      const episode = metadata.episode ? metadata.episode.toString().padStart(2, '0') : '00';
      
      // Clean titles to remove existing episode patterns
      const cleanSeriesTitle = this.cleanTitleForFormatting(metadata.title || 'Unknown Show');
      const cleanEpisodeTitle = this.cleanTitleForFormatting(metadata.episodeTitle || 'Unknown Episode');
      
      cleanName = cleanName
        .replace(/{n}/g, this.sanitizeFileName(cleanSeriesTitle))
        .replace(/{s}/g, metadata.season || 0)
        .replace(/{e}/g, metadata.episode || 0)
        .replace(/{s00e00}/g, `S${season}E${episode}`)
        .replace(/{t}/g, this.sanitizeFileName(cleanEpisodeTitle))
        .replace(/{y}/g, metadata.year || 'Unknown');

      // For TV shows, organize into series/season folder hierarchy
      cleanName = this.sanitizeFileName(cleanName);
      const ext = originalExtension.startsWith('.') ? originalExtension : `.${originalExtension}`;
      const seriesName = this.sanitizeFileName(cleanSeriesTitle);
      const seasonFolder = `Season ${metadata.season || 1}`;
      
      return {
        filename: cleanName + ext,
        needsDirectoryCreation: true,
        seasonFolder: seasonFolder,
        seriesFolder: seriesName,
        season: metadata.season || 1
      };
    }

    // Fallback for unknown types
    cleanName = this.sanitizeFileName(cleanName);
    const ext = originalExtension.startsWith('.') ? originalExtension : `.${originalExtension}`;
    return {
      filename: cleanName + ext,
      needsDirectoryCreation: false,
      seasonFolder: null
    };
  }

  // Generic search function that routes to appropriate service
  async searchMedia(title, type, year) {
    // Load API keys from file storage or localStorage fallback
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
      
      if (settings && settings.apiKeys) {
        this.setApiKeys(settings.apiKeys);
        console.log('API keys loaded successfully');
      } else {
        console.warn('No API keys found in settings');
      }
    } catch (error) {
      console.warn('Could not load API keys:', error);
    }

    if (type === 'movie') {
      const result = await this.searchMovie(title, year);
      return {
        success: result.success,
        results: result.success ? [result] : [],
        source: result.source
      };
    } else if (type === 'tv') {
      const result = await this.searchTVShow(title);
      return {
        success: result.success,
        results: result.success ? [result] : [],
        source: result.source
      };
    }

    return {
      success: false,
      error: 'Unknown media type',
      results: []
    };
  }

  // Get episode details for a TV show
  async getEpisodeDetails(showId, season, episode) {
    try {
      const apiKey = this.apiKeys.themoviedb;
      if (!apiKey) {
        throw new Error('TheMovieDB API key not configured');
      }

      const episodeUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${season}/episode/${episode}?api_key=${apiKey}`;
      
      const response = await fetch(episodeUrl);
      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: `Episode S${season}E${episode} not found`
          };
        }
        throw new Error(`API request failed: ${response.status}`);
      }

      const episodeData = await response.json();
      
      return {
        success: true,
        episode: {
          name: episodeData.name,
          title: episodeData.name,
          overview: episodeData.overview,
          air_date: episodeData.air_date,
          episode_number: episodeData.episode_number,
          season_number: episodeData.season_number
        }
      };
    } catch (error) {
      console.error('Episode details error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new MetadataService();