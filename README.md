# YT-DL Studio

A local download studio powered by yt-dlp, a Go server, and React. Inspect media, choose formats or presets, submit playlists, monitor progress, cancel work, retry failed jobs, and retrieve completed files.

## Setup

Requirements: Go 1.26.6+, Node.js 22.12+, Python 3.10+ (for the optional project runtime), and FFmpeg/ffprobe on PATH.

```sh
npm run setup
npm run setup:runtime
npm run dev
```

Open http://localhost:5173. The frontend proxies `/api` to the backend's configured port. `npm run setup:runtime` installs the pinned downloader and EJS solver in `.venv`; it does not modify global Python packages. A working Node.js or Deno runtime is also needed for YouTube. See the [yt-dlp EJS installation guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS). Use **System Health** to check the actual dependency versions and download-directory access.

Alternatively, install an official standalone yt-dlp build and set `YTDLP_PATH`. FFmpeg and its dependencies remain external to the server binary. System Health verifies the Python EJS package; a standalone executable's bundled EJS is reported as unverified. This project does not download or execute a JavaScript solver from the internet at request time.

Copy `.env.example` to `.env` if you need custom configuration. Empty downloader/runtime values mean automatic discovery. Malformed environment values fail at startup with an actionable error. The API accepts loopback hosts and configured browser origins; private-network media URLs, custom paths, file/credential access, and executable options require explicit opt-ins.

## Production build

```sh
npm run build
```

Run `dist/yt-dls.exe` on Windows or `dist/yt-dls` on Linux/macOS. The build compiles and embeds the frontend, includes version/commit/build-time metadata, and writes SHA-256 checksums in `dist/SHA256SUMS`.

```sh
npm run build:all
```

Produces Windows amd64, Linux amd64/arm64, and macOS amd64/arm64 binaries. Cross-compilation proves they compile; the CI matrix runs native tests on Windows, Linux, and macOS. The release workflow requires all native, race, installed-tool, and browser verification jobs to pass before uploading build artifacts. It does not automatically publish a GitHub release.

## Downloads and history

Each job writes to `<DOWNLOAD_DIR>/<job-id>/`, so simultaneous jobs with the same title or filename cannot share partial files. Presets specify the requested container; remuxing may fail when selected codecs cannot fit that container. Choose MKV or compatible formats in that case.

Playlist selection accepts up to 500 occurrences. Choose a preset, then configure all shared output options and optional per-item filename templates before submitting. Admission continues on the server after the browser closes. Cancel a batch to stop pending admission and cancel its children. Finished child records remain available until the batch finishes.

For one joined output, select **Concatenate selected items** in the playlist configuration. The server runs the original playlist once with explicit indexes in playlist order, keeps intermediate filenames distinct, and applies your filename template to the joined output. FFmpeg requires compatible codecs; a common recoding or audio conversion format may be needed. The `multi_video` policy joins only extractor multi-video sources, as defined by yt-dlp.

The configuration offers custom format/subtitle selectors, all supported backend containers and audio formats, arbitrary validated quality/bitrate, separate download/postprocessing overwrite policies, and browser-local saved output presets. Saved presets exclude paths, source-specific format IDs, credentials, and raw postprocessor arguments. System Health shows dependency versions, readiness, server policy, directory access, and concurrency.

Downloads use live SSE updates, reconnect snapshots, version-aware resync, and polling fallback. Expand **Stream details** for per-stream bytes, speed, ETA, and status. Logs and action failures remain visible. Every terminal job can be retried with an optional replacement URL and current session settings into a new isolated directory. Pause/resume is unavailable; cancellation followed by retry starts a new job.

History is stored atomically in `.yt-dls/history.json` (configurable through `STATE_DIR`). The server keeps up to 200 finished records and seven days of finished history, plus children of active batches, with a hard admission limit of 1,000 retained records. Active jobs become failed records after restart and require explicit retry. Corrupt history produces a startup error; preserve or rename that file before starting with empty history.

Removing a record **does not delete downloaded media or partial files**. Before removing history, use **Manage files** to preview that job’s outputs, sidecars, and partial files, confirm permanent deletion, then select **Delete previewed files**. Cleanup rejects active jobs/batches, symlinks, changed previews, and files outside owned directories, and waits for workers/file transfers to finish. No automatic media deletion is performed.

The interface provides links to up to 5,000 media, subtitle, thumbnail, and JSON sidecar files per job, showing 20 links at a time. Any further files remain in that job’s directory and a log notice explains the result-link limit. Cleanup previews are also bounded to 5,000 files and reject larger directories for manual review. A configured `YTDLP_PATH` remains authoritative; leave it empty to use the project-local runtime installed by `npm run setup:runtime`.

## Privacy

Passwords and proxy URLs live in browser session storage and active process memory; ordinary advanced settings and appearance preferences use local storage. Diagnostic logs are redacted and limited to 64 KiB per job, with a short tail saved in history. Saved retry options omit advanced credentials and executable/file settings. History redacts source URL queries; a retry of a signed source may require the original URL and current session credentials again.

The interface uses system fonts and includes no analytics or advertising. Source metadata, thumbnails, and media downloads contact the chosen services. Optional SponsorBlock settings also contact SponsorBlock. Anyone with local access to the machine can read its downloaded files; the service is intended for trusted local use.

## Verification and contributing

```sh
npm test
npm run lint
npm run test:race
npx playwright install chromium firefox webkit
npm run test:browser
npm run api:check
npm audit
npm audit --prefix web
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
```

Race tests require CGO and a compatible C compiler. CI runs them on Linux and macOS. The suite includes real subprocess fixtures for progress, cancellation of descendants, output limits, metadata, queue/batch lifecycle, file containment, SSE frames, and history recovery; frontend tests cover API pagination/cancellation, settings migration, presets, sizes, focus, duplicate playlist entries, and action failures. Browser CI runs Chromium, mobile Chromium, Firefox, and WebKit against the real Go API with deterministic downloader fixtures; it checks inspection/configuration, keyboard focus, automated accessibility/contrast, live updates and fallback, settings privacy, batch/concatenation, cancellation/retry, results, and confirmed cleanup. Optional installed-tool tests verify generated media conversion and selected playlist concatenation with actual yt-dlp/FFmpeg. External source support still depends on yt-dlp and the source service.

The canonical [API contract](api/contract.json) supplies Go/frontend option enums, byte limits, settings fields, request/response shapes, capabilities, and generated [client types](web/src/services/api-types.d.ts). After changing it, run `npm run api:generate`; CI rejects stale types and mismatched Go fields or actual API fixture responses.

Frontend builds enforce gzip budgets of 160 KiB for application JavaScript, 25 KiB for stylesheets, and 125 KiB for application chunks. The deferred Three.js background has its own 250 KiB budget; it starts when the browser is idle and stays off in reduced-effects mode or when the system requests reduced motion. A static CSS gradient remains visible as a fallback.

See [LICENSE](LICENSE).
