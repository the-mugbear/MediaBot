class DependencyService {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
    this.dependencyStatus = new Map();
  }

  async checkAllDependencies() {
    const results = {
      ffmpeg: await this.checkFFmpeg(),
      electron: this.checkElectron(),
      nodeApi: this.checkNodeApi()
    };

    // Store results for quick access
    Object.entries(results).forEach(([key, value]) => {
      this.dependencyStatus.set(key, value);
    });

    return results;
  }

  async checkFFmpeg() {
    if (!this.isElectron) {
      return {
        available: false,
        error: 'FFmpeg check only available in Electron environment',
        critical: true
      };
    }

    try {
      const result = await window.electronAPI.checkFFmpeg();
      return {
        ...result,
        critical: true, // FFmpeg is critical for metadata operations
        displayName: 'FFmpeg',
        description: 'Required for reading and writing media file metadata'
      };
    } catch (error) {
      return {
        available: false,
        error: `Failed to check FFmpeg: ${error.message}`,
        critical: true,
        displayName: 'FFmpeg',
        description: 'Required for reading and writing media file metadata'
      };
    }
  }

  checkElectron() {
    const available = this.isElectron;
    let version = null;
    
    // Safely check for process.versions.electron
    try {
      if (available && typeof process !== 'undefined' && process.versions) {
        version = process.versions.electron;
      }
    } catch (error) {
      // process not available in browser context
    }
    
    return {
      available,
      error: available ? null : 'Electron environment not detected',
      critical: true,
      displayName: 'Electron Environment',
      description: 'Required for desktop application functionality',
      version
    };
  }

  checkNodeApi() {
    const available = typeof window !== 'undefined' && window.nodeAPI;
    return {
      available,
      error: available ? null : 'Node.js API bridge not available',
      critical: false,
      displayName: 'Node.js API Bridge',
      description: 'Used for enhanced path operations',
      fallbackAvailable: true
    };
  }

  getDependencyStatus(dependencyName) {
    return this.dependencyStatus.get(dependencyName) || null;
  }

  getAllCriticalIssues() {
    const issues = [];
    for (const [name, status] of this.dependencyStatus) {
      if (status.critical && !status.available) {
        issues.push({
          name,
          ...status
        });
      }
    }
    return issues;
  }

  getInstallationGuide(platform = null) {
    const detectedPlatform = platform || this.detectPlatform();
    
    const guides = {
      windows: {
        ffmpeg: {
          title: 'Install FFmpeg on Windows',
          steps: [
            '1. Visit https://www.gyan.dev/ffmpeg/builds/',
            '2. Download the "release" build (ffmpeg-release-essentials.zip)',
            '3. Extract the zip file to a folder (e.g., C:\\ffmpeg)',
            '4. Add C:\\ffmpeg\\bin to your Windows PATH environment variable',
            '5. Restart MediaBot',
            '',
            'Alternative: Place ffmpeg.exe directly in the MediaBot installation folder'
          ],
          downloadUrl: 'https://www.gyan.dev/ffmpeg/builds/'
        }
      },
      macos: {
        ffmpeg: {
          title: 'Install FFmpeg on macOS',
          steps: [
            '1. Install Homebrew if not already installed: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            '2. Run: brew install ffmpeg',
            '3. Restart MediaBot',
            '',
            'Alternative: Download from https://ffmpeg.org/download.html#build-mac'
          ],
          downloadUrl: 'https://ffmpeg.org/download.html#build-mac'
        }
      },
      linux: {
        ffmpeg: {
          title: 'Install FFmpeg on Linux',
          steps: [
            'Ubuntu/Debian: sudo apt update && sudo apt install ffmpeg',
            'CentOS/RHEL/Fedora: sudo dnf install ffmpeg (or yum install ffmpeg)',
            'Arch Linux: sudo pacman -S ffmpeg',
            'openSUSE: sudo zypper install ffmpeg',
            '',
            'After installation, restart MediaBot'
          ],
          downloadUrl: 'https://ffmpeg.org/download.html#build-linux'
        }
      }
    };

    return guides[detectedPlatform] || guides.linux;
  }

  detectPlatform() {
    if (typeof window === 'undefined') return 'unknown';
    
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes('win')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
    
    // Fallback to process.platform if available
    try {
      if (typeof process !== 'undefined' && process.platform) {
        if (process.platform === 'win32') return 'windows';
        if (process.platform === 'darwin') return 'macos';
        if (process.platform === 'linux') return 'linux';
      }
    } catch (error) {
      // process not available in browser context
    }
    
    return 'linux'; // Default fallback
  }

  async showDependencyDialog(dependencyName) {
    const status = this.getDependencyStatus(dependencyName);
    if (!status || status.available) return;

    const platform = this.detectPlatform();
    const guide = this.getInstallationGuide(platform);
    const dependencyGuide = guide[dependencyName];

    if (!dependencyGuide) {
      alert(`${status.displayName} is not available. Please install it manually.`);
      return;
    }

    const message = [
      `${status.displayName} is required but not found.`,
      '',
      status.description,
      '',
      dependencyGuide.title,
      '',
      ...dependencyGuide.steps,
      '',
      'Would you like to open the download page?'
    ].join('\\n');

    const shouldOpenUrl = confirm(message);
    if (shouldOpenUrl && dependencyGuide.downloadUrl) {
      if (this.isElectron && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(dependencyGuide.downloadUrl);
      } else {
        window.open(dependencyGuide.downloadUrl, '_blank');
      }
    }
  }

  async validateOperation(requiredDependencies) {
    const missingCritical = [];
    
    for (const depName of requiredDependencies) {
      const status = this.getDependencyStatus(depName);
      if (!status) {
        // Dependency not checked yet, check it now
        await this.checkAllDependencies();
        const newStatus = this.getDependencyStatus(depName);
        if (newStatus && newStatus.critical && !newStatus.available) {
          missingCritical.push(depName);
        }
      } else if (status.critical && !status.available) {
        missingCritical.push(depName);
      }
    }

    if (missingCritical.length > 0) {
      const dependencyNames = missingCritical.map(name => {
        const status = this.getDependencyStatus(name);
        return status.displayName || name;
      }).join(', ');

      const shouldShowGuide = confirm(
        `This operation requires: ${dependencyNames}\\n\\n` +
        'One or more dependencies are missing. Would you like to see installation instructions?'
      );

      if (shouldShowGuide) {
        // Show guide for the first missing dependency
        await this.showDependencyDialog(missingCritical[0]);
      }

      return {
        valid: false,
        missingDependencies: missingCritical
      };
    }

    return {
      valid: true,
      missingDependencies: []
    };
  }
}

export default new DependencyService();