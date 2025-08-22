// Cross-platform path utilities service
// Provides consistent path handling across Electron and browser environments

class PathUtils {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.nodeAPI;
  }

  /**
   * Get the directory portion of a file path
   * @param {string} filePath - The file path
   * @returns {string} The directory path
   */
  getDirectory(filePath) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.dirname(filePath);
    }
    
    // Fallback for browser environment
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash >= 0 ? filePath.substring(0, lastSlash) : filePath;
  }

  /**
   * Get the filename (basename) from a file path
   * @param {string} filePath - The file path
   * @returns {string} The filename
   */
  getBasename(filePath) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.basename(filePath);
    }
    
    // Fallback for browser environment
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
    return fileName;
  }

  /**
   * Get the filename without extension
   * @param {string} filePath - The file path
   * @returns {string} The filename without extension
   */
  getBasenameWithoutExt(filePath) {
    const basename = this.getBasename(filePath);
    const lastDot = basename.lastIndexOf('.');
    return lastDot > 0 ? basename.substring(0, lastDot) : basename;
  }

  /**
   * Get the file extension
   * @param {string} filePath - The file path
   * @returns {string} The file extension (including the dot)
   */
  getExtension(filePath) {
    const basename = this.getBasename(filePath);
    const lastDot = basename.lastIndexOf('.');
    return lastDot > 0 ? basename.substring(lastDot) : '';
  }

  /**
   * Join multiple path segments
   * @param {...string} paths - Path segments to join
   * @returns {string} The joined path
   */
  join(...paths) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.join(...paths);
    }
    
    // Fallback for browser environment
    return paths
      .filter(path => path && path.length > 0)
      .map((path, index) => {
        // Remove leading slashes from all except first segment
        if (index > 0) {
          path = path.replace(/^[\/\\]+/, '');
        }
        // Remove trailing slashes from all except last segment
        if (index < paths.length - 1) {
          path = path.replace(/[\/\\]+$/, '');
        }
        return path;
      })
      .join('/');
  }

  /**
   * Normalize a path for cross-platform comparison
   * @param {string} filePath - The file path to normalize
   * @returns {string} The normalized path
   */
  normalize(filePath) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.normalize(filePath);
    }
    
    // Fallback: convert all separators to forward slashes
    return filePath.replace(/\\/g, '/');
  }

  /**
   * Get the relative path from one path to another
   * @param {string} from - The base path
   * @param {string} to - The target path
   * @returns {string} The relative path
   */
  relative(from, to) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.relative(from, to);
    }
    
    // Basic fallback implementation
    const fromParts = this.normalize(from).split('/').filter(part => part);
    const toParts = this.normalize(to).split('/').filter(part => part);
    
    // Find common base
    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }
    
    // Calculate relative path
    const upCount = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);
    
    const relativeParts = [];
    for (let i = 0; i < upCount; i++) {
      relativeParts.push('..');
    }
    relativeParts.push(...downParts);
    
    return relativeParts.join('/') || '.';
  }

  /**
   * Check if a path is absolute
   * @param {string} filePath - The file path to check
   * @returns {boolean} True if the path is absolute
   */
  isAbsolute(filePath) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.isAbsolute(filePath);
    }
    
    // Fallback: check common absolute path patterns
    return /^([a-zA-Z]:|[\/\\])/.test(filePath);
  }

  /**
   * Resolve a path to an absolute path
   * @param {...string} paths - Path segments to resolve
   * @returns {string} The absolute path
   */
  resolve(...paths) {
    if (this.isElectron && window.nodeAPI?.path) {
      return window.nodeAPI.path.resolve(...paths);
    }
    
    // Basic fallback - not perfect but workable
    return this.join(...paths);
  }

  /**
   * Compare two paths for equality (cross-platform safe)
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {boolean} True if paths are equal
   */
  pathsEqual(path1, path2) {
    const normalized1 = this.normalize(path1).toLowerCase();
    const normalized2 = this.normalize(path2).toLowerCase();
    return normalized1 === normalized2;
  }

  /**
   * Get the parent directory name from a path
   * @param {string} dirPath - The directory path
   * @returns {string} The parent directory name
   */
  getParentDirName(dirPath) {
    const parentPath = this.getDirectory(dirPath);
    return this.getBasename(parentPath);
  }

  /**
   * Check if a path represents a season folder (e.g., "Season 1", "Season 01")
   * @param {string} folderName - The folder name to check
   * @returns {object|null} Object with season number if it's a season folder, null otherwise
   */
  parseSeasonFolder(folderName) {
    const seasonPattern = /^Season\s+(\d+)$/i;
    const match = folderName.match(seasonPattern);
    return match ? { seasonNumber: parseInt(match[1]) } : null;
  }

  /**
   * Create a season folder name
   * @param {number} seasonNumber - The season number
   * @returns {string} The season folder name
   */
  createSeasonFolderName(seasonNumber) {
    return `Season ${seasonNumber}`;
  }

  /**
   * Check if a filename appears to be from a release group (has dots, brackets, etc.)
   * @param {string} fileName - The filename to check
   * @returns {boolean} True if it looks like a release filename
   */
  isReleaseFileName(fileName) {
    return fileName.includes('.') && (
      fileName.includes('[') ||
      fileName.includes('(') ||
      fileName.includes('S01') ||
      fileName.length > 50 ||
      /\b(HDTV|BluRay|WEB-DL|x264|x265|1080p|720p|480p)\b/i.test(fileName)
    );
  }

  /**
   * Sanitize a filename for safe filesystem usage
   * @param {string} fileName - The filename to sanitize
   * @returns {string} The sanitized filename
   */
  sanitizeFileName(fileName) {
    // Remove or replace invalid characters
    return fileName
      .replace(/[<>:"\/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim()
      .substring(0, 255); // Limit length
  }

  /**
   * Extract media info from filename patterns
   * @param {string} fileName - The filename to analyze
   * @returns {object} Object with extracted info (season, episode, etc.)
   */
  extractMediaInfo(fileName) {
    const patterns = {
      // S01E01, S1E1 patterns
      seasonEpisode: /[Ss](\d{1,2})[Ee](\d{1,2})/,
      // 1x01, 1x1 patterns
      seasonEpisodeX: /(\d{1,2})x(\d{1,2})/,
      // Year patterns
      year: /\b(19|20)\d{2}\b/,
      // Resolution patterns
      resolution: /\b(480p|720p|1080p|2160p|4K)\b/i,
      // Quality patterns
      quality: /\b(HDTV|BluRay|WEB-DL|WEBRip|DVDRip|BDRip)\b/i
    };

    const result = {};

    // Extract season and episode
    let match = fileName.match(patterns.seasonEpisode);
    if (match) {
      result.season = parseInt(match[1]);
      result.episode = parseInt(match[2]);
    } else {
      match = fileName.match(patterns.seasonEpisodeX);
      if (match) {
        result.season = parseInt(match[1]);
        result.episode = parseInt(match[2]);
      }
    }

    // Extract year
    match = fileName.match(patterns.year);
    if (match) {
      result.year = parseInt(match[0]);
    }

    // Extract resolution
    match = fileName.match(patterns.resolution);
    if (match) {
      result.resolution = match[0];
    }

    // Extract quality
    match = fileName.match(patterns.quality);
    if (match) {
      result.quality = match[0];
    }

    return result;
  }
}

// Export singleton instance
export default new PathUtils();