## YT-DL Studio (yt-dls)

A modern GUI for yt-dlp with an Express (Node.js) backend and a static HTML/CSS/JS frontend. Works well on Windows, macOS, and Linux.

## Quick start

Prerequisites
- Node.js 22 or newer
- yt-dlp installed and in your PATH
- FFmpeg installed and in your PATH (for muxing/post-processing)

Windows tips
- yt-dlp: install via Python pip (py -m pip install yt-dlp) or download the standalone yt-dlp.exe and put it in PATH
- FFmpeg: download from ffmpeg.org (or gyan.dev builds), unzip, and add the bin folder to PATH

Install and run
```cmd
npm install
npm start
```
Then open http://localhost:5000 if your browser doesn’t open automatically.

Development mode (auto-restart)
```cmd
npm run dev
```

Verify tools
```cmd
yt-dlp --version
ffmpeg -version
```

## What this app does
- Serves the frontend from the backend at the root URL
- Calls yt-dlp as a child process to fetch info and download media
- Streams real-time progress via Server-Sent Events (SSE) and falls back to polling
- Saves downloads into the downloads/ folder (configurable from the UI)
- Writes rotating logs to logs/ytdl-YYYY-MM-DD.log

## Run-time configuration
Copy `.env.example` to `.env`, or set environment variables before starting:
- PORT: HTTP port (default 5000)
- HOST: bind address (default 127.0.0.1; loopback-only)
- FRONTEND_ORIGIN: CSV list of extra allowed origins when using a separate frontend
- DOWNLOAD_DIR: server-controlled download root (default `./downloads`)
- YTDLP_PATH: custom yt-dlp executable path
- LOG_LEVEL: Winston log level (default `info`)
- YTDLP_CHECK_TIMEOUT_MS: Timeout for yt-dlp availability checks (default 15000)
- MAX_DOWNLOAD_DURATION_MS: Per-download timeout guard (default 1800000 = 30 minutes)
- MAX_CONCURRENT_DOWNLOADS: process concurrency guard (default 3)

Security-sensitive options are disabled by default. `ALLOW_CUSTOM_DOWNLOAD_PATH`,
`ALLOW_DANGEROUS_OPTIONS` (`--exec`, `--netrc-cmd`, and `--enable-file-urls`),
and `ALLOW_PRIVATE_URLS` must be explicitly enabled on a trusted local machine.

Examples (Windows cmd)
```cmd
set PORT=5001 && npm start
```

## Scripts
- npm start: run backend/server.js
- npm run dev: run with nodemon (auto-restart)
- npm run build: run the production validation suite
- npm run css:watch: regenerate frontend/styles.css while developing styles
- npm test: run backend command and HTTP integration tests

## Project structure
```
backend/
  server.js              # Express app (serves frontend and API)
  routes/
    health.js            # Health/system checks and helper listings
    info.js              # GET /api/info?url=... (metadata)
    download.js          # Start/cancel/pause/resume/status + SSE
    status.js            # List downloads
  services/
    commandBuilder.js    # Builds yt-dlp command based on options
    infoProcessor.js     # Normalizes yt-dlp info response
    progressTracker.js   # In-memory progress store + SSE broadcast
  utils/
    logger.js            # Winston with daily rotation
    platform.js          # Windows-safe process termination
    sanitize.js          # Filenames sanitization
frontend/
  index.html             # Main UI (modules in frontend/js)
  styles.css             # Tailwind-based stylesheet
  js/                    # ES modules (app, api, config, etc.)
downloads/               # Default download output (gitignored)
logs/                    # Rotating logs (gitignored)
package.json             # Node scripts and deps
```

## API overview (mounted under /api)
- GET /api/health: server/platform status and yt-dlp/dir checks
- GET /api/info?url=<url>: metadata for a URL or playlist (normalized)
- GET /api/downloads: list current downloads
- GET /api/downloads/events: SSE stream of progress updates
- POST /api/command-preview: validate options and return the exact redacted yt-dlp command
- POST /api/download: start a download; body: { url, formatCode, filename, downloadPath, ... }
- GET /api/download/:downloadId/status: progress snapshot
- POST /api/download/:downloadId/cancel: cancel
- POST /api/download/:downloadId/pause: pause (Unix only)
- POST /api/download/:downloadId/resume: resume (Unix only)
- GET /api/download/:downloadId/log: log lines for a download
- GET /api/list-impersonate-targets: yt-dlp --list-impersonate-targets
- GET /api/list-ap-msos: yt-dlp --ap-list-mso

Notes for Windows
- Pause/Resume endpoints return 501 (not supported on Windows); use Cancel instead
- The server uses taskkill as a fallback when terminating processes

## Troubleshooting
- “yt-dlp is not available”: ensure yt-dlp is in PATH and run yt-dlp --version
- “FFmpeg not found” or merge errors: install FFmpeg and add bin to PATH
- Frontend doesn’t load: check http://localhost:5000 and logs in logs/
- CORS errors: either open the built-in frontend at the root or set FRONTEND_ORIGIN when using a separate frontend origin

## License
MIT

- `POST /api/download/:id/resume` - Resume download (Unix only)

