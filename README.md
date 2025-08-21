# MediaBot

A modern media file renaming and organization tool built with Electron and React. MediaBot is inspired by FileBot and provides an easy-to-use interface for organizing your movie and TV show collections.

## Features

- **Cross-platform**: Runs on Windows, macOS, and Linux
- **Modern UI**: Clean, intuitive interface built with React
- **Multiple APIs**: Supports TheMovieDB, TheTVDB, OMDb, and OpenSubtitles
- **Batch Processing**: Rename multiple files at once
- **Preview Mode**: See changes before applying them
- **Flexible Naming**: Customizable file naming patterns
- **Drag & Drop**: Easy file selection

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Development Mode**
   ```bash
   npm run electron-dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   npm run electron-pack
   ```

## Configuration

### API Keys

MediaBot requires API keys from metadata services:

1. **TheMovieDB**: Get your API key from [TheMovieDB](https://www.themoviedb.org/settings/api)
2. **TheTVDB**: Get your API key from [TheTVDB](https://thetvdb.com/api-information)
3. **OMDb**: Get your API key from [OMDb](http://www.omdbapi.com/apikey.aspx)
4. **OpenSubtitles**: (Optional) Get your API key from [OpenSubtitles](https://www.opensubtitles.com/en/consumers)

Configure these in the Settings panel within the application.

### FileBot Compatibility

MediaBot can use the same API keys as the original FileBot application. If you have existing FileBot API keys, you can use them directly.

## Usage

1. **Add Files**: Use File → Open Files/Folder or drag and drop media files
2. **Select Files**: Choose which files to process
3. **Configure Naming**: Set your preferred naming format in the Rename panel
4. **Preview**: Generate a preview of the new file names
5. **Execute**: Apply the changes to rename your files

## Naming Formats

MediaBot supports flexible naming patterns:

- `{n}` - Series/Movie name
- `{s}` - Season number
- `{e}` - Episode number
- `{t}` - Episode/Movie title
- `{y}` - Year
- `{s00e00}` - Season and episode with zero-padding

Example formats:
- `{n} - {s00e00} - {t}` → "Breaking Bad - S01E01 - Pilot"
- `{n} ({y}) - {t}` → "The Matrix (1999) - The Matrix"

## Technical Stack

- **Electron**: Desktop application framework
- **React**: User interface library
- **Node.js**: Backend runtime
- **Axios**: HTTP client for API requests
- **SQLite**: Local metadata caching

## Development

### Project Structure

```
src/
├── components/     # React components
├── services/      # API and business logic
├── utils/         # Utility functions
└── App.js         # Main application component

public/
├── electron.js    # Electron main process
└── preload.js     # Electron preload script
```

### Available Scripts

- `npm start` - Start React development server
- `npm run electron-dev` - Start Electron in development mode
- `npm run build` - Build React app for production
- `npm run electron-pack` - Package Electron app
- `npm test` - Run tests

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

If you encounter issues or have questions:

1. Check the existing issues on GitHub
2. Create a new issue with detailed information
3. Include your OS, version, and steps to reproduce

## Acknowledgments

- Uses metadata from TheMovieDB, TheTVDB, OMDb, and other services
- Built with the Electron and React communities' excellent tools and libraries