# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediaBot is an Electron-based desktop application for media file renaming and organization, inspired by FileBot. It features a React frontend with a modular Electron backend architecture.

## Development Commands

### Core Development
- `npm run electron-dev` - Start development mode (React dev server + Electron)
- `npm start` - Start React development server only
- `npm run build` - Build React app for production
- `npm run electron-pack` - Package Electron app for distribution
- `npm test` - Run tests

### Package Management
- `npm install` - Install all dependencies
- `npm audit` - Check for security vulnerabilities

## Architecture Overview

### Frontend Architecture (React)
- **Main App Component**: `src/App.js` - Central state management for files, selected files, and tab navigation
- **Component Structure**: Modular components in `src/components/` including FileList, RenamePanel, SettingsPanel, Sidebar
- **Services Layer**: `src/services/` contains metadata handling, API services, and file operations
- **State Flow**: App.js manages global state, components communicate via props and callbacks

### Backend Architecture (Electron)
- **Main Process**: `public/electron.js` - Application lifecycle, window management, security policies
- **Modular IPC Handlers**: `public/electron/handlers/` separates concerns:
  - `fileHandlers.js` - File operations, folder scanning, rename operations
  - `metadataHandlers.js` - Metadata reading/writing via FFmpeg
  - `settingsHandlers.js` - Settings persistence and management
  - `apiHandlers.js` - External API communication
- **Services**: `public/electron/services/logger.js` - Centralized logging with Winston
- **Utils**: `public/electron/utils/fileUtils.js` - File system utilities and safety checks

### Key Design Patterns
- **IPC Communication**: Electron main/renderer process communication via `window.electronAPI`
- **Modular Handlers**: Each functional area has dedicated IPC handlers for maintainability
- **Error Handling**: Comprehensive error handling with logging throughout the application
- **Security**: Strict CSP, context isolation, disabled node integration in renderer

## Data Flow and File Processing

### File Processing Pipeline
1. **File Selection**: Via drag-drop, file dialog, or folder scanning
2. **Metadata Detection**: Uses FFmpeg to read existing metadata from media files
3. **API Integration**: Fetches metadata from TheMovieDB, TheTVDB, OMDb APIs
4. **Metadata Staging**: Stores fetched metadata temporarily before writing
5. **File Operations**: Rename/move files with directory structure creation

### Metadata System
- **Reading**: `src/services/metadataReader.js` - FFmpeg-based metadata extraction
- **Writing**: `src/services/metadataWriter.js` - FFmpeg-based metadata writing with backups
- **API Service**: `src/services/apiMetadataService.js` - Batch API operations with progress tracking
- **Caching**: Staged metadata system prevents redundant API calls

## External Dependencies and APIs

### Required API Keys (configured in Settings)
- **TheMovieDB**: Primary metadata source for movies and TV shows
- **TheTVDB**: Alternative TV show metadata source
- **OMDb**: Additional movie/TV metadata
- **OpenSubtitles**: Optional subtitle services

### Key External Libraries
- **FFmpeg**: Required system dependency for metadata operations
- **axios**: HTTP client for API requests
- **chokidar**: File system watching
- **fluent-ffmpeg**: FFmpeg wrapper for Node.js
- **sqlite3**: Local metadata caching
- **winston**: Logging framework

## File Naming and Organization

### Supported Formats
Media file extensions: mp4, mkv, avi, mov, wmv, flv, webm, m4v, mpg, mpeg, ts, mts, m2ts, 3gp, asf, rm, rmvb

### Naming Pattern Variables
- `{n}` - Series/Movie name
- `{s}` - Season number  
- `{e}` - Episode number
- `{t}` - Episode/Movie title
- `{y}` - Year
- `{s00e00}` - Zero-padded season/episode

## Recent Improvements (2024)

### Component Architecture Enhancements
- **FileList Decomposition**: Large FileList component split into smaller, focused components:
  - `FileListItem.js` - Individual file display and actions
  - `BulkActions.js` - Bulk operation controls
  - `ProgressDisplay.js` - Progress visualization
  - `FileOperations.js` - File/folder selection operations
- **Dependency Management**: New `DependencyChecker.js` provides system-wide dependency validation
- **Settings Service**: Centralized `settingsService.js` replaces localStorage usage patterns

### Dependency Management System
- **Comprehensive Checking**: Validates FFmpeg, Electron environment, and Node.js API availability
- **User Guidance**: Platform-specific installation instructions for missing dependencies
- **Graceful Degradation**: Non-critical dependencies show warnings but allow continued operation
- **Validation Integration**: Operations validate required dependencies before execution

### Code Quality Improvements
- **Eliminated localStorage**: RenamePanel now uses centralized settings service
- **Removed Hard Reloads**: Replaced `window.location.reload()` with proper state management
- **Enhanced Error Handling**: Dependency validation prevents operations when critical components missing
- **Modular Components**: Better separation of concerns and reusability

## Development Guidelines

### Adding New Features
1. **IPC Handlers**: Add new handlers in appropriate `public/electron/handlers/` file
2. **Frontend Services**: Create services in `src/services/` for complex logic
3. **Components**: Follow modular patterns - break large components into focused sub-components
4. **Error Handling**: Always include try-catch blocks and proper logging
5. **Dependency Validation**: Use `dependencyService.validateOperation()` for operations requiring external tools

### Settings Management
- **Use SettingsService**: Always use `src/services/settingsService.js` for configuration
- **Avoid localStorage**: Settings service handles Electron vs browser storage automatically
- **Reactive Updates**: Settings changes are propagated to listeners

### Component Development
- **Single Responsibility**: Each component should have one clear purpose
- **Props Interface**: Use clear, typed prop interfaces
- **Error Boundaries**: Handle component errors gracefully
- **Accessibility**: Include proper ARIA labels and keyboard navigation

### Security Considerations
- Never expose API keys in frontend code
- All file operations go through Electron main process
- Settings are stored securely via Electron's file system access
- Dependency checks prevent execution of unsafe operations

### Testing and Debugging
- Development mode enables DevTools automatically
- Comprehensive logging system available via logger service
- File operations include safety checks and backup creation
- Dependency checker provides detailed diagnostic information

## Common Issues and Solutions

### FFmpeg Dependency
- FFmpeg must be installed system-wide and available in PATH
- Used for all metadata read/write operations
- Failure to find FFmpeg will break metadata functionality

### API Rate Limiting
- Built-in delays between API calls (configurable)
- Staged metadata system reduces redundant API requests
- Batch operations include progress tracking and error recovery