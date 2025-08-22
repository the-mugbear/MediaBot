import React, { useState, useEffect } from 'react';
import { logger } from '../hooks/useLogger';

const SettingsPanel = () => {
  const [settings, setSettings] = useState({
    apiKeys: {
      themoviedb: '',
      thetvdb: '',
      omdb: '',
      opensubtitles: ''
    },
    preferences: {
      language: 'en',
      autoRename: false,
      createBackup: false,
      writeMetadata: true,
      outputDirectory: '',
      conflictResolution: 'skip'
    }
  });

  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [ffmpegStatus, setFfmpegStatus] = useState(null);

  useEffect(() => {
    // Load settings from storage
    loadSettings();
    // Check FFmpeg availability
    checkFFmpegAvailability();
  }, []);

  const checkFFmpegAvailability = async () => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.checkFFmpeg();
        setFfmpegStatus(result);
      } catch (error) {
        console.error('Failed to check FFmpeg:', error);
        setFfmpegStatus({ available: false, error: 'Failed to check FFmpeg availability' });
      }
    }
  };

  const loadSettings = async () => {
    try {
      if (window.electronAPI && window.electronAPI.loadSettings) {
        const result = await window.electronAPI.loadSettings();
        if (result.success && result.settings) {
          setSettings(result.settings);
          console.log('Settings loaded from file storage');
        } else {
          console.log('No saved settings found, using defaults');
        }
      } else {
        // Fallback to localStorage for web mode
        const savedSettings = localStorage.getItem('mediabot-settings');
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      if (window.electronAPI && window.electronAPI.saveSettings) {
        const result = await window.electronAPI.saveSettings(settings);
        if (result.success) {
          alert('Settings saved successfully to file storage!');
          console.log('Settings saved to:', result.path);
        } else {
          throw new Error(result.error);
        }
      } else {
        // Fallback to localStorage for web mode
        localStorage.setItem('mediabot-settings', JSON.stringify(settings));
        alert('Settings saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + error.message);
    }
  };

  const handleApiKeyChange = (service, value) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [service]: value
      }
    }));
  };

  const handlePreferenceChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [key]: value
      }
    }));
  };

  const selectOutputDirectory = async () => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.showOpenDialog({
          properties: ['openDirectory']
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          handlePreferenceChange('outputDirectory', result.filePaths[0]);
        }
      } catch (error) {
        console.error('Failed to select directory:', error);
      }
    }
  };

  const testApiKey = async (service) => {
    const apiKey = settings.apiKeys[service];
    
    if (!apiKey && service !== 'opensubtitles') {
      alert(`Please enter a ${service.toUpperCase()} API key first`);
      return;
    }

    setTesting(prev => ({ ...prev, [service]: true }));
    setTestResults(prev => ({ ...prev, [service]: null }));

    try {
      console.log(`Testing ${service} API key...`);
      const result = await window.electronAPI.testApiKey(service, apiKey);
      
      setTestResults(prev => ({
        ...prev,
        [service]: result
      }));

      if (result.success) {
        console.log(`${service} API key test successful:`, result);
      } else {
        console.error(`${service} API key test failed:`, result.error);
      }
    } catch (error) {
      console.error(`Error testing ${service} API key:`, error);
      setTestResults(prev => ({
        ...prev,
        [service]: { success: false, error: 'Test failed: ' + error.message }
      }));
    } finally {
      setTesting(prev => ({ ...prev, [service]: false }));
    }
  };

  const getTestButtonText = (service) => {
    if (testing[service]) return 'Testing...';
    const result = testResults[service];
    if (!result) return 'Test';
    return result.success ? '✓ Valid' : '✗ Invalid';
  };

  const getTestButtonClass = (service) => {
    if (testing[service]) return 'btn btn-secondary';
    const result = testResults[service];
    if (!result) return 'btn btn-secondary';
    return result.success ? 'btn btn-success' : 'btn btn-danger';
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        <p>Configure API keys and application preferences</p>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>API Keys</h3>
          <p>Configure API keys for metadata services. These are the same keys used by the original FileBot.</p>
          
          <div className="api-keys">
            <div className="api-key-field">
              <label htmlFor="themoviedb-key">TheMovieDB API Key:</label>
              <div className="api-key-input-group">
                <input
                  id="themoviedb-key"
                  type="password"
                  value={settings.apiKeys.themoviedb}
                  onChange={(e) => handleApiKeyChange('themoviedb', e.target.value)}
                  placeholder="Enter TheMovieDB API key"
                />
                <button 
                  className={getTestButtonClass('themoviedb')}
                  onClick={() => testApiKey('themoviedb')}
                  disabled={testing.themoviedb}
                >
                  {getTestButtonText('themoviedb')}
                </button>
              </div>
              {testResults.themoviedb && (
                <div className={`test-result ${testResults.themoviedb.success ? 'success' : 'error'}`}>
                  {testResults.themoviedb.success 
                    ? `✓ ${testResults.themoviedb.message}` 
                    : `✗ ${testResults.themoviedb.error}`
                  }
                </div>
              )}
              <small>Get your API key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">TheMovieDB</a></small>
            </div>

            <div className="api-key-field">
              <label htmlFor="thetvdb-key">TheTVDB API Key:</label>
              <div className="api-key-input-group">
                <input
                  id="thetvdb-key"
                  type="password"
                  value={settings.apiKeys.thetvdb}
                  onChange={(e) => handleApiKeyChange('thetvdb', e.target.value)}
                  placeholder="Enter TheTVDB API key"
                />
                <button 
                  className={getTestButtonClass('thetvdb')}
                  onClick={() => testApiKey('thetvdb')}
                  disabled={testing.thetvdb}
                >
                  {getTestButtonText('thetvdb')}
                </button>
              </div>
              {testResults.thetvdb && (
                <div className={`test-result ${testResults.thetvdb.success ? 'success' : 'error'}`}>
                  {testResults.thetvdb.success 
                    ? `✓ ${testResults.thetvdb.message}` 
                    : `✗ ${testResults.thetvdb.error}`
                  }
                </div>
              )}
              <small>Get your API key from <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer">TheTVDB</a></small>
            </div>

            <div className="api-key-field">
              <label htmlFor="omdb-key">OMDb API Key:</label>
              <div className="api-key-input-group">
                <input
                  id="omdb-key"
                  type="password"
                  value={settings.apiKeys.omdb}
                  onChange={(e) => handleApiKeyChange('omdb', e.target.value)}
                  placeholder="Enter OMDb API key"
                />
                <button 
                  className={getTestButtonClass('omdb')}
                  onClick={() => testApiKey('omdb')}
                  disabled={testing.omdb}
                >
                  {getTestButtonText('omdb')}
                </button>
              </div>
              {testResults.omdb && (
                <div className={`test-result ${testResults.omdb.success ? 'success' : 'error'}`}>
                  {testResults.omdb.success 
                    ? `✓ ${testResults.omdb.message}` 
                    : `✗ ${testResults.omdb.error}`
                  }
                </div>
              )}
              <small>Get your API key from <a href="http://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer">OMDb</a></small>
            </div>

            <div className="api-key-field">
              <label htmlFor="opensubtitles-key">OpenSubtitles API Key:</label>
              <div className="api-key-input-group">
                <input
                  id="opensubtitles-key"
                  type="password"
                  value={settings.apiKeys.opensubtitles}
                  onChange={(e) => handleApiKeyChange('opensubtitles', e.target.value)}
                  placeholder="Enter OpenSubtitles API key (optional)"
                />
                <button 
                  className={getTestButtonClass('opensubtitles')}
                  onClick={() => testApiKey('opensubtitles')}
                  disabled={testing.opensubtitles}
                >
                  {getTestButtonText('opensubtitles')}
                </button>
              </div>
              {testResults.opensubtitles && (
                <div className={`test-result ${testResults.opensubtitles.success ? 'success' : 'error'}`}>
                  {testResults.opensubtitles.success 
                    ? `✓ ${testResults.opensubtitles.message}` 
                    : `✗ ${testResults.opensubtitles.error}`
                  }
                </div>
              )}
              <small>Get your API key from <a href="https://www.opensubtitles.com/en/consumers" target="_blank" rel="noopener noreferrer">OpenSubtitles</a></small>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>General Preferences</h3>
          
          <div className="preference-field">
            <label htmlFor="language">Language:</label>
            <select
              id="language"
              value={settings.preferences.language}
              onChange={(e) => handlePreferenceChange('language', e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="ja">Japanese</option>
            </select>
          </div>

          <div className="preference-field">
            <label>
              <input
                type="checkbox"
                checked={settings.preferences.autoRename}
                onChange={(e) => handlePreferenceChange('autoRename', e.target.checked)}
              />
              Auto-rename files after processing
            </label>
          </div>

          <div className="preference-field">
            <label>
              <input
                type="checkbox"
                checked={settings.preferences.createBackup}
                onChange={(e) => handlePreferenceChange('createBackup', e.target.checked)}
              />
              Create backup before renaming (disabled by default for direct renaming)
            </label>
          </div>

          <div className="preference-field">
            <label>
              <input
                type="checkbox"
                checked={settings.preferences.writeMetadata}
                onChange={(e) => handlePreferenceChange('writeMetadata', e.target.checked)}
                disabled={ffmpegStatus && !ffmpegStatus.available}
              />
              Write metadata to media files (requires FFmpeg)
            </label>
            {ffmpegStatus && (
              <div className={`ffmpeg-status ${ffmpegStatus.available ? 'success' : 'error'}`}>
                {ffmpegStatus.available 
                  ? '✓ FFmpeg is available' 
                  : `✗ ${ffmpegStatus.error}`
                }
              </div>
            )}
          </div>

          <div className="preference-field">
            <label htmlFor="output-directory">Output Directory:</label>
            <div className="directory-selector">
              <input
                id="output-directory"
                type="text"
                value={settings.preferences.outputDirectory}
                onChange={(e) => handlePreferenceChange('outputDirectory', e.target.value)}
                placeholder="Leave empty to rename in place"
                readOnly
              />
              <button className="btn btn-secondary" onClick={selectOutputDirectory}>
                Browse
              </button>
            </div>
          </div>

          <div className="preference-field">
            <label htmlFor="conflict-resolution">Conflict Resolution:</label>
            <select
              id="conflict-resolution"
              value={settings.preferences.conflictResolution}
              onChange={(e) => handlePreferenceChange('conflictResolution', e.target.value)}
            >
              <option value="skip">Skip existing files</option>
              <option value="overwrite">Overwrite existing files</option>
              <option value="rename">Rename with suffix</option>
              <option value="ask">Ask for each file</option>
            </select>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={saveSettings}>
            Save Settings
          </button>
          <button className="btn btn-secondary" onClick={loadSettings}>
            Reset to Saved
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;