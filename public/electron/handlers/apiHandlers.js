const { ipcMain } = require('electron');
const { getLogger } = require('../services/logger');

const logger = getLogger();

function registerApiHandlers() {
  // API key testing
  ipcMain.handle('test-api-key', testApiKey);
  
  // Debug logging from renderer
  ipcMain.handle('debug-log', handleDebugLog);
  
  // Enhanced logging from renderer
  ipcMain.handle('renderer-log', handleRendererLog);
  
  logger.info('API testing IPC handlers registered');
}

async function testApiKey(event, service, apiKey) {
  logger.info(`Testing API key for service: ${service}`);
  
  try {
    let result = { success: false, error: 'Service not supported' };
    
    switch (service.toLowerCase()) {
      case 'themoviedb':
        result = await testTheMovieDBKey(apiKey);
        break;
      case 'thetvdb':
        result = await testTheTVDBKey(apiKey);
        break;
      case 'omdb':
        result = await testOMDBKey(apiKey);
        break;
      case 'opensubtitles':
        result = await testOpenSubtitlesKey(apiKey);
        break;
      default:
        result = { success: false, error: `Unknown service: ${service}` };
    }
    
    logger.info(`API key test result for ${service}:`, { 
      success: result.success, 
      hasMessage: !!result.message,
      hasError: !!result.error 
    });
    
    return result;
  } catch (error) {
    logger.error(`API key test failed for ${service}`, error);
    return { success: false, error: error.message };
  }
}

async function testTheMovieDBKey(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`,
      { timeout: 5000 }
    );
    
    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: 'TheMovieDB API key is valid',
        data: { hasImageConfig: !!data.images }
      };
    } else {
      const errorData = await response.json();
      return { 
        success: false, 
        error: errorData.status_message || `HTTP ${response.status}` 
      };
    }
  } catch (error) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

async function testTheTVDBKey(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    const fetch = require('node-fetch');
    
    // TheTVDB v4 API uses a different authentication method
    const response = await fetch('https://api4.thetvdb.com/v4/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apikey: apiKey }),
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: 'TheTVDB API key is valid',
        data: { hasToken: !!data.data?.token }
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.message || `HTTP ${response.status}` 
      };
    }
  } catch (error) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

async function testOMDBKey(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    const fetch = require('node-fetch');
    
    // Test with a known movie
    const response = await fetch(
      `http://www.omdbapi.com/?apikey=${apiKey}&i=tt0111161`,
      { timeout: 5000 }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.Response === 'True') {
        return { 
          success: true, 
          message: 'OMDb API key is valid',
          data: { testMovie: data.Title }
        };
      } else {
        return { success: false, error: data.Error || 'Invalid response' };
      }
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

async function testOpenSubtitlesKey(apiKey) {
  // OpenSubtitles API key is optional
  if (!apiKey) {
    return { 
      success: true, 
      message: 'OpenSubtitles will work without API key (with limitations)' 
    };
  }

  try {
    const fetch = require('node-fetch');
    
    // Test the API key with user info endpoint
    const response = await fetch('https://api.opensubtitles.com/api/v1/infos/user', {
      headers: {
        'Api-Key': apiKey,
        'User-Agent': 'MediaBot v1.0'
      },
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: 'OpenSubtitles API key is valid',
        data: { userLevel: data.data?.level }
      };
    } else {
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    return { success: false, error: `Network error: ${error.message}` };
  }
}

async function handleDebugLog(event, message, data = null) {
  logger.debug(`Renderer: ${message}`, data);
  return { success: true };
}

// Enhanced logging handlers for renderer process
async function handleRendererLog(event, level, message, data = null) {
  switch (level.toLowerCase()) {
    case 'error':
      logger.error(`Renderer: ${message}`, data);
      break;
    case 'warn':
      logger.warn(`Renderer: ${message}`, data);
      break;
    case 'info':
      logger.info(`Renderer: ${message}`, data);
      break;
    case 'success':
      logger.success(`Renderer: ${message}`, data);
      break;
    case 'debug':
    default:
      logger.debug(`Renderer: ${message}`, data);
      break;
  }
  return { success: true };
}

module.exports = { registerApiHandlers };