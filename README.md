# YT-DL Studio

 local-first web GUI for [yt-dlp](https://github.com/yt-dlp/yt-dlp), built with an Express backend and a dependency-light HTML/CSS/JavaScript frontend.

## Features

- Inspect videos and playlists before downloading.
- Select video, audio, subtitle, metadata, and post-processing options.
- Preview the exact server-generated yt-dlp command with secrets redacted.
- Track downloads through Server-Sent Events, with automatic batch-polling fallback.
- View per-download speed history and independent video/audio stream progress.
- Clearly identify combined media streams without double-counting bytes.
- Cancel downloads, view logs, and pause or resume processes on supported Unix systems.
- Use secure defaults: loopback binding, origin checks, request limits, private-address blocking, and server-controlled output paths.

## Requirements

- Node.js 22 or newer
- yt-dlp 2026.06.09 or newer
- FFmpeg in `PATH` for merging and post-processing

Verify the external tools:

```sh
yt-dlp --version
ffmpeg -version
```

Install yt-dlp with the included Python requirements file if needed:

```sh
python -m pip install -r requirements.txt
```

On Windows, `py -m pip install -r requirements.txt` can be used instead. A standalone `yt-dlp.exe` also works when its directory is in `PATH` or `YTDLP_PATH` points to it.

## Quick start

```sh
npm install
npm start
```

The application listens on [http://127.0.0.1:5000](http://127.0.0.1:5000) by default and opens the browser automatically.

For development with automatic backend restarts:

```sh
npm run dev
```

## Configuration

Copy `.env.example` to `.env` to override the defaults. Node loads this file directly; no dotenv package is required.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `5000` | HTTP port |
| `AUTO_OPEN_BROWSER` | `true` | Open the frontend after startup |
| `FRONTEND_ORIGIN` | local development origins | Comma-separated extra browser origins |
| `DOWNLOAD_DIR` | `./downloads` | Server-controlled output directory |
| `LOG_DIR` | `./logs` | Rotating log directory |
| `YTDLP_PATH` | `yt-dlp` | yt-dlp executable name or absolute path |
| `LOG_LEVEL` | `info` | Winston log level |
| `MAX_CONCURRENT_DOWNLOADS` | `3` | Maximum active yt-dlp processes |
| `MAX_DOWNLOAD_DURATION_MS` | `1800000` | Hard timeout per download |
| `YTDLP_CHECK_TIMEOUT_MS` | `15000` | yt-dlp availability-check timeout |
| `INFO_TIMEOUT_MS` | `120000` | Metadata extraction timeout |
| `INFO_MAX_OUTPUT_BYTES` | `16777216` | Metadata process output limit |
| `REQUESTS_PER_MINUTE` | `180` | General API rate limit |
| `DOWNLOAD_REQUESTS_PER_MINUTE` | `20` | Download-action rate limit |

The following settings are intentionally disabled by default:

| Variable | Enables |
| --- | --- |
| `ALLOW_CUSTOM_DOWNLOAD_PATH` | Client-selected output directories |
| `ALLOW_DANGEROUS_OPTIONS` | Options such as `--exec`, `--netrc-cmd`, and `--enable-file-urls` |
| `ALLOW_PRIVATE_URLS` | Requests to private and loopback network addresses |

Only enable these options on a trusted local machine. The server refuses to combine them with a non-loopback `HOST`.

> [!WARNING]
> YT-DL Studio has no user authentication. Do not expose it directly to the public internet.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the production server |
| `npm run dev` | Start with nodemon |
| `npm test` | Run command-builder, progress-model, and HTTP integration tests |
| `npm run check` | Run tests and the backend syntax check |
| `npm run build` | Run the complete validation suite |
| `npm run css:watch` | Rebuild `frontend/styles.css` while editing styles |

## How downloads work

1. The frontend submits structured options rather than a shell command.
2. The backend validates the URL, output path, format selector, and every supported option.
3. yt-dlp is spawned directly with an argument array; no shell is involved.
4. Machine-readable progress events are classified as video, audio, or combined media.
5. Progress is delivered over SSE and displayed with aggregate and per-stream metrics.
6. Terminal state, logs, and cleanup remain available for one hour.

Downloads are written to `DOWNLOAD_DIR`. Custom paths entered by a client are rejected unless `ALLOW_CUSTOM_DOWNLOAD_PATH=true`.

## API

All endpoints are mounted under `/api`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Runtime, platform, yt-dlp, and output-directory health |
| `GET` | `/info?url=...` | Extract normalized video or playlist metadata |
| `GET` | `/downloads` | List tracked downloads |
| `GET` | `/downloads/events` | SSE progress stream |
| `GET` | `/downloads/status/batch?ids=...` | Poll several download states at once |
| `POST` | `/command-preview` | Validate options and return a redacted command preview |
| `POST` | `/download` | Start a download |
| `GET` | `/download/:id/status` | Get aggregate, video, and audio progress |
| `POST` | `/download/:id/cancel` | Cancel an active download |
| `POST` | `/download/:id/pause` | Pause on supported Unix systems |
| `POST` | `/download/:id/resume` | Resume on supported Unix systems |
| `GET` | `/download/:id/log` | Get the in-memory download log |
| `DELETE` | `/download/:id` | Remove a finished download record |
| `GET` | `/list-impersonate-targets` | List yt-dlp impersonation targets |
| `GET` | `/list-ap-msos` | List Adobe Pass providers |

Pause and resume return HTTP 501 on Windows; cancellation remains supported.

## Project structure

```text
backend/
  config.js                    Environment parsing and runtime paths
  server.js                    Express app, security headers, and shutdown
  middleware/rateLimit.js      In-memory API rate limiter
  routes/                      Health, metadata, downloads, and status APIs
  services/commandBuilder.js   Validated yt-dlp argument construction
  services/progressTracker.js  Aggregate and per-stream progress state
  utils/processRunner.js       Bounded child-process execution
  utils/validation.js          URL, path, filename, and option validation
frontend/
  index.html                   Main application
  settings.html                Settings view
  styles.css                   Generated Tailwind and application styles
  js/api.js                    HTTP client and error handling
  js/download-manager.js       SSE, polling, download cards, and controls
  js/speed-chart.js            Canvas speed-history chart
test/
  commandBuilder.test.js
  progressTracker.test.js
  server.test.js
downloads/                     Default output directory
logs/                          Rotating application logs
```

## Troubleshooting

- **yt-dlp is not available:** confirm `yt-dlp --version` works in the same terminal, or configure `YTDLP_PATH`.
- **FFmpeg is missing or merging fails:** install FFmpeg and ensure `ffmpeg -version` works.
- **The page does not open:** browse to `http://127.0.0.1:5000` and inspect `logs/`.
- **CORS request rejected:** use the built-in frontend or add the exact separate frontend origin to `FRONTEND_ORIGIN`.
- **A URL is rejected as private:** this is SSRF protection; only opt in with `ALLOW_PRIVATE_URLS=true` on a trusted loopback deployment.
- **Pause or resume fails on Windows:** use Cancel; process suspension is intentionally unsupported there.

## Legal note

Use yt-dlp only for content you are authorized to access and download. You are responsible for complying with applicable laws and service terms.

## License

MIT
