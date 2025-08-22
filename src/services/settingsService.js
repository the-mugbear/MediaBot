class SettingsService {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
    this.cachedSettings = null;
    this.settingsListeners = new Set();
  }

  // Load settings from the appropriate storage
  async loadSettings() {
    try {
      if (this.isElectron && window.electronAPI.loadSettings) {
        const result = await window.electronAPI.loadSettings();
        if (result.success && result.settings) {
          this.cachedSettings = result.settings;
          return result.settings;
        }
      }
      
      // Fallback to localStorage
      const settingsString = localStorage.getItem('mediabot-settings');
      if (settingsString) {
        const settings = JSON.parse(settingsString);
        this.cachedSettings = settings;
        return settings;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return null;
    }
  }

  // Save settings to the appropriate storage
  async saveSettings(settings) {
    try {
      this.cachedSettings = settings;
      
      if (this.isElectron && window.electronAPI.saveSettings) {
        const result = await window.electronAPI.saveSettings(settings);
        if (result.success) {
          this.notifyListeners('settingsChanged', settings);
          return true;
        }
      }
      
      // Fallback to localStorage
      localStorage.setItem('mediabot-settings', JSON.stringify(settings));
      this.notifyListeners('settingsChanged', settings);
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  // Get cached settings without async call
  getCachedSettings() {
    return this.cachedSettings;
  }

  // Get a specific setting value
  async getSetting(path, defaultValue = null) {
    const settings = await this.loadSettings();
    if (!settings) return defaultValue;
    
    const keys = path.split('.');
    let value = settings;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  // Set a specific setting value
  async setSetting(path, value) {
    let settings = await this.loadSettings() || {};
    
    const keys = path.split('.');
    let current = settings;
    
    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    current[keys[keys.length - 1]] = value;
    
    return await this.saveSettings(settings);
  }

  // Get API keys
  async getApiKeys() {
    return await this.getSetting('apiKeys', {});
  }

  // Set API keys
  async setApiKeys(apiKeys) {
    return await this.setSetting('apiKeys', apiKeys);
  }

  // Get preferences
  async getPreferences() {
    return await this.getSetting('preferences', {
      createBackup: false,
      writeMetadata: true
    });
  }

  // Set preferences
  async setPreferences(preferences) {
    return await this.setSetting('preferences', preferences);
  }

  // Add a listener for settings changes
  addSettingsListener(listener) {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  // Notify all listeners of settings changes
  notifyListeners(event, data) {
    this.settingsListeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Settings listener error:', error);
      }
    });
  }

  // Refresh cached settings
  async refresh() {
    const settings = await this.loadSettings();
    return settings;
  }
}

export default new SettingsService();