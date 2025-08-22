import React, { useState, useEffect, useRef } from 'react';
import metadataService from '../services/metadataService';
import { logger } from '../hooks/useLogger';

const MetadataRefinement = ({ 
  failedFiles = [], 
  onRetryComplete, 
  onCancel, 
  isVisible = false 
}) => {
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('auto');
  const [searchYear, setSearchYear] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [refinedResults, setRefinedResults] = useState([]);
  const searchInputRef = useRef(null);

  const currentFile = failedFiles[currentFileIndex];

  // Initialize form when file changes
  useEffect(() => {
    if (currentFile) {
      // Extract search terms from filename
      const parsed = metadataService.parseFileName(currentFile.name, currentFile.path);
      setSearchQuery(parsed.title || '');
      setSearchType(parsed.type === 'unknown' ? 'auto' : parsed.type);
      setSearchYear(parsed.year ? parsed.year.toString() : '');
      setSeason(parsed.season ? parsed.season.toString() : '');
      setEpisode(parsed.episode ? parsed.episode.toString() : '');
      setSearchResults([]);
      setSuggestions(generateSuggestions(currentFile.name, parsed));
      
      logger.info(`Initializing refinement for: ${currentFile.name}`, {
        parsedTitle: parsed.title,
        parsedType: parsed.type,
        parsedYear: parsed.year
      });
    }
  }, [currentFile]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isVisible && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isVisible, currentFileIndex]);

  // Generate helpful suggestions based on filename
  const generateSuggestions = (filename, parsed) => {
    const suggestions = [];
    
    // Clean up common filename artifacts
    const cleanTitle = filename
      .replace(/\.[^.]+$/, '') // Remove extension
      .replace(/[._]/g, ' ') // Replace dots and underscores with spaces
      .replace(/\b(19|20)\d{2}\b/g, '') // Remove years
      .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '') // Remove season/episode
      .replace(/\b(1080p|720p|480p|4K|HDTV|BluRay|WEB-DL|x264|x265)\b/gi, '') // Remove quality markers
      .replace(/\[.*?\]/g, '') // Remove brackets
      .replace(/\(.*?\)/g, '') // Remove parentheses
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();

    if (cleanTitle && cleanTitle !== parsed.title) {
      suggestions.push({
        type: 'title',
        label: 'Try cleaned filename',
        value: cleanTitle,
        description: 'Remove technical terms and formatting'
      });
    }

    // Suggest removing common prefixes/suffixes
    const commonPrefixes = ['The', 'A', 'An'];
    const withoutPrefix = parsed.title?.replace(/^(The|A|An)\s+/i, '');
    if (withoutPrefix && withoutPrefix !== parsed.title) {
      suggestions.push({
        type: 'title',
        label: `Try without "The/A/An"`,
        value: withoutPrefix,
        description: 'Some databases list titles without articles'
      });
    }

    // Suggest with prefix if not present
    if (parsed.title && !parsed.title.match(/^(The|A|An)\s+/i)) {
      suggestions.push({
        type: 'title',
        label: `Try with "The"`,
        value: `The ${parsed.title}`,
        description: 'Add article if missing'
      });
    }

    // Year suggestions
    if (!parsed.year) {
      // Extract years from filename
      const yearMatches = filename.match(/\b(19|20)\d{2}\b/g);
      if (yearMatches && yearMatches.length > 0) {
        yearMatches.forEach(year => {
          suggestions.push({
            type: 'year',
            label: `Add year ${year}`,
            value: year,
            description: 'Year found in filename'
          });
        });
      }
    }

    // Type suggestions
    if (parsed.type === 'unknown') {
      if (filename.match(/\bS\d{1,2}E\d{1,2}\b/i)) {
        suggestions.push({
          type: 'mediaType',
          label: 'Search as TV Show',
          value: 'tv',
          description: 'Season/episode pattern detected'
        });
      } else {
        suggestions.push({
          type: 'mediaType',
          label: 'Search as Movie',
          value: 'movie',
          description: 'No episode pattern found'
        });
      }
    }

    return suggestions;
  };

  // Apply a suggestion
  const applySuggestion = (suggestion) => {
    logger.info(`Applying suggestion: ${suggestion.label}`, suggestion);
    
    switch (suggestion.type) {
      case 'title':
        setSearchQuery(suggestion.value);
        break;
      case 'year':
        setSearchYear(suggestion.value);
        break;
      case 'mediaType':
        setSearchType(suggestion.value);
        break;
    }
  };

  // Perform metadata search
  const performSearch = async () => {
    if (!searchQuery.trim()) {
      alert('Please enter a search term');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      logger.info(`Performing manual search`, {
        query: searchQuery,
        type: searchType,
        year: searchYear,
        season: season,
        episode: episode
      });

      let result;
      
      if (searchType === 'movie' || (searchType === 'auto' && !season && !episode)) {
        result = await metadataService.searchMovie(searchQuery, searchYear ? parseInt(searchYear) : null);
      } else if (searchType === 'tv' || (searchType === 'auto' && (season || episode))) {
        if (season && episode) {
          result = await metadataService.searchTVShow(searchQuery, parseInt(season), parseInt(episode));
        } else {
          // Search for TV series without specific episode
          result = await metadataService.searchMedia(searchQuery, 'tv', searchYear ? parseInt(searchYear) : null);
        }
      } else {
        // Auto-detect - search both
        const [movieResult, tvResult] = await Promise.all([
          metadataService.searchMovie(searchQuery, searchYear ? parseInt(searchYear) : null),
          metadataService.searchMedia(searchQuery, 'tv', searchYear ? parseInt(searchYear) : null)
        ]);

        // Combine results
        const allResults = [];
        if (movieResult.success && movieResult.matches) {
          allResults.push(...movieResult.matches);
        }
        if (tvResult.success && tvResult.results) {
          allResults.push(...tvResult.results.map(r => ({ ...r, type: 'tv' })));
        }

        result = {
          success: allResults.length > 0,
          matches: allResults
        };
      }

      if (result.success && (result.matches || result.results)) {
        const matches = result.matches || result.results || [];
        setSearchResults(matches);
        
        logger.success(`Found ${matches.length} results for manual search`, {
          query: searchQuery,
          resultsCount: matches.length
        });
      } else {
        setSearchResults([]);
        logger.warn(`No results found for manual search`, { query: searchQuery });
      }

    } catch (error) {
      logger.error(`Manual search failed`, { query: searchQuery, error: error.message });
      alert(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Select a search result
  const selectResult = (selectedResult) => {
    logger.info(`User selected result for ${currentFile.name}`, selectedResult);

    // Enhance the result with episode details if needed
    let finalMetadata = { ...selectedResult };
    
    if (searchType === 'tv' && season && episode) {
      finalMetadata = {
        ...selectedResult,
        season: parseInt(season),
        episode: parseInt(episode),
        type: 'tv'
      };
    }

    // Add to refined results
    const newRefinedResult = {
      fileId: currentFile.id,
      fileName: currentFile.name,
      metadata: finalMetadata,
      searchQuery: searchQuery,
      searchType: searchType,
      userRefined: true
    };

    setRefinedResults(prev => [...prev, newRefinedResult]);

    // Move to next file or complete
    if (currentFileIndex < failedFiles.length - 1) {
      setCurrentFileIndex(prev => prev + 1);
    } else {
      // All files processed
      handleComplete();
    }
  };

  // Skip current file
  const skipFile = () => {
    logger.info(`User skipped refinement for ${currentFile.name}`);
    
    const skippedResult = {
      fileId: currentFile.id,
      fileName: currentFile.name,
      metadata: null,
      skipped: true,
      userRefined: false
    };

    setRefinedResults(prev => [...prev, skippedResult]);

    if (currentFileIndex < failedFiles.length - 1) {
      setCurrentFileIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  // Complete refinement process
  const handleComplete = () => {
    logger.info(`Metadata refinement completed`, {
      totalFiles: failedFiles.length,
      refinedCount: refinedResults.filter(r => !r.skipped).length,
      skippedCount: refinedResults.filter(r => r.skipped).length
    });

    onRetryComplete(refinedResults);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isSearching) {
      e.preventDefault();
      performSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  if (!isVisible || !currentFile) return null;

  return (
    <div className="refinement-overlay">
      <div className="refinement-modal">
        <div className="refinement-header">
          <h2>🔍 Refine Metadata Search</h2>
          <div className="refinement-progress">
            File {currentFileIndex + 1} of {failedFiles.length}
          </div>
          <button className="close-btn" onClick={onCancel}>❌</button>
        </div>

        <div className="refinement-content">
          <div className="current-file-section">
            <div className="file-info">
              <span className="file-icon">📄</span>
              <div className="file-details">
                <div className="file-name">{currentFile.name}</div>
                <div className="file-path">{currentFile.path}</div>
              </div>
            </div>
            <div className="failure-reason">
              <span className="warning-icon">⚠️</span>
              <span>No metadata matches found. Please refine your search below.</span>
            </div>
          </div>

          <div className="search-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="search-query">Title / Search Query</label>
                <input
                  ref={searchInputRef}
                  id="search-query"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter movie/TV show title..."
                  className="search-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="search-type">Media Type</label>
                <select
                  id="search-type"
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="search-select"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="movie">Movie</option>
                  <option value="tv">TV Show</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="search-year">Year (optional)</label>
                <input
                  id="search-year"
                  type="number"
                  value={searchYear}
                  onChange={(e) => setSearchYear(e.target.value)}
                  placeholder="2023"
                  min="1900"
                  max="2030"
                  className="search-input year-input"
                />
              </div>
              {(searchType === 'tv' || (searchType === 'auto' && (season || episode))) && (
                <>
                  <div className="form-group">
                    <label htmlFor="search-season">Season</label>
                    <input
                      id="search-season"
                      type="number"
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                      placeholder="1"
                      min="1"
                      className="search-input season-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="search-episode">Episode</label>
                    <input
                      id="search-episode"
                      type="number"
                      value={episode}
                      onChange={(e) => setEpisode(e.target.value)}
                      placeholder="1"
                      min="1"
                      className="search-input episode-input"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="search-actions">
              <button
                className="btn btn-primary"
                onClick={performSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? '🔍 Searching...' : '🔍 Search'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={skipFile}
                disabled={isSearching}
              >
                ⏭️ Skip This File
              </button>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <h3>💡 Suggestions</h3>
              <div className="suggestions-list">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="suggestion-btn"
                    onClick={() => applySuggestion(suggestion)}
                    disabled={isSearching}
                  >
                    <span className="suggestion-label">{suggestion.label}</span>
                    <span className="suggestion-description">{suggestion.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="results-section">
              <h3>🎬 Search Results ({searchResults.length})</h3>
              <div className="results-list">
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    className="result-item"
                    onClick={() => selectResult(result)}
                  >
                    <div className="result-info">
                      <div className="result-title">
                        {result.type === 'tv' ? '📺' : '🎥'} {result.title || result.name}
                      </div>
                      <div className="result-details">
                        {result.year || result.first_air_date?.substring(0, 4)} • 
                        {result.type === 'tv' ? ' TV Series' : ' Movie'}
                        {result.source && ` • ${result.source}`}
                      </div>
                      {result.overview && (
                        <div className="result-overview">
                          {result.overview.substring(0, 150)}
                          {result.overview.length > 150 ? '...' : ''}
                        </div>
                      )}
                    </div>
                    <div className="result-select">
                      <span className="select-icon">✅</span>
                      <span className="select-text">Select</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !isSearching && (
            <div className="no-results">
              <div className="no-results-icon">❌</div>
              <div className="no-results-text">
                No results found for "{searchQuery}"
              </div>
              <div className="no-results-suggestions">
                Try adjusting your search terms or check the suggestions above
              </div>
            </div>
          )}
        </div>

        <div className="refinement-footer">
          <div className="progress-info">
            {refinedResults.length > 0 && (
              <span>✅ {refinedResults.filter(r => !r.skipped).length} refined, {refinedResults.filter(r => r.skipped).length} skipped</span>
            )}
          </div>
          <div className="footer-actions">
            <button className="btn btn-outline" onClick={onCancel}>
              Cancel All
            </button>
            {currentFileIndex === failedFiles.length - 1 && refinedResults.length === failedFiles.length - 1 && (
              <button className="btn btn-success" onClick={handleComplete}>
                Complete Refinement
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetadataRefinement;