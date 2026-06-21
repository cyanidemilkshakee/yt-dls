/**
 * download.js — Download lifecycle routes
 *
 * Optimisations applied:
 *  1. readline stream parsing — replaces manual split('\n') on raw data chunks.
 *     Node's readline fires one 'line' event per newline, zero buffer splitting.
 *  2. yt-dlp availability cache — the spawn('yt-dlp', ['--version']) check is
 *     cached for 60 s so repeated downloads don't pay this overhead each time.
 *  3. Demoted verbose progress logs to logger.debug (silent at default 'info'
 *     level) — eliminates disk writes on every progress tick.
 *  4. broadcastImmediate used for terminal state transitions so throttle never
 *     suppresses a completed/failed/cancelled event.
 *  5. Batch status endpoint: GET /api/downloads/status/batch?ids=id1,id2,...
 */

const express  = require('express');
const readline = require('readline');
const { spawn } = require('child_process');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { config } = require('../config');
const { isWindows, terminateProcess } = require('../utils/platform');
const { validateMediaUrl, resolveDownloadDirectory } = require('../utils/validation');
const { buildYtDlpCommand, redactCommand, formatCommand } = require('../services/commandBuilder');
const {
  activeDownloads,
  downloadProgress,
  sseClients,
  DownloadProgress,
  recalculateAggregate,
  markIncompleteStreams,
  broadcastUpdate,
  broadcastImmediate,
} = require('../services/progressTracker');

const router = express.Router();

// ─── yt-dlp availability cache ────────────────────────────────────────────────
let _ytdlpAvailableAt  = 0;          // timestamp of last successful check
const YTDLP_CACHE_TTL  = 60_000;     // 60 seconds

async function checkYtDlpAvailable() {
  if (Date.now() - _ytdlpAvailableAt < YTDLP_CACHE_TTL) return; // cache hit

  await new Promise((resolve, reject) => {
    const proc = spawn(config.YTDLP_PATH, ['--version'], { stdio: 'pipe', windowsHide: true });
    const t    = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      reject(new Error('yt-dlp availability check timeout'));
    }, config.YTDLP_CHECK_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) { _ytdlpAvailableAt = Date.now(); resolve(); }
      else reject(new Error(`yt-dlp not available (exit code: ${code})`));
    });
    proc.on('error', (err) => {
      clearTimeout(t);
      reject(new Error(`yt-dlp process error: ${err.message}`));
    });
  });
}

// ─── SSE events ──────────────────────────────────────────────────────────────
router.get('/downloads/events', (req, res) => {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  res.write('data: {"type":"connected","message":"SSE connected"}\n\n');
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
  }, 15_000);
  heartbeat.unref?.();
  const drop = () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  };
  req.on('close',   drop);
  req.on('aborted', drop);
  res.on('close',   drop);
  res.on('error',   drop);
});

// ─── Progress hook ────────────────────────────────────────────────────────────
function progressHook(data, downloadId) {
  const progress = downloadProgress.get(downloadId);
  if (!progress) return;

  let d = data;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return; }
  }

  const status   = d.status || 'unknown';
  const filename = d.filename || progress.filename || 'download';
  const hasCodec = (codec) => codec && !['none', 'n/a', 'na', 'null'].includes(String(codec).toLowerCase());
  const hasVideo = hasCodec(d.vcodec);
  const hasAudio = hasCodec(d.acodec);
  const videoByName = /\.(mp4|mkv|webm|avi|mov|flv|m4v|ts)$/i.test(filename) && !/audio/i.test(filename);
  const audioByName = /\.(mp3|m4a|wav|aac|flac|ogg|opus|alac|vorbis)$/i.test(filename) || /audio/i.test(filename);
  let streams;
  if (hasVideo && hasAudio && progress.videoProgress.expected && progress.audioProgress.expected) {
    streams = [progress.videoProgress, progress.audioProgress];
  } else if ((hasAudio && !hasVideo) || audioByName) {
    streams = [progress.audioProgress];
  } else if ((hasVideo && !hasAudio) || videoByName) {
    streams = [progress.videoProgress];
  } else if (progress.videoProgress.expected && !progress.audioProgress.expected) {
    streams = [progress.videoProgress];
  } else if (progress.audioProgress.expected && !progress.videoProgress.expected) {
    streams = [progress.audioProgress];
  } else if (progress.videoProgress.status === 'downloading') {
    streams = [progress.videoProgress];
  } else if (progress.audioProgress.status === 'downloading') {
    streams = [progress.audioProgress];
  } else {
    streams = [progress.videoProgress];
  }
  const combined = streams.length > 1;
  if (!combined) {
    progress.videoProgress.combined = false;
    progress.audioProgress.combined = false;
  }

  const safeNum = (v, def = 0) => {
    if (v === undefined || v === null || v === 'N/A' || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) && !Number.isNaN(n) ? n : def;
  };
  const safeEta = (v) => {
    if (v === undefined || v === null || v === 'N/A' || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && !Number.isNaN(n) && n > 0 ? n : null;
  };

  if (status === 'downloading') {
    progress.status = 'downloading';
    if (d.filename) progress.filename = filename;

    const totalBytes      = safeNum(d.total_bytes) || safeNum(d.total_bytes_estimate);
    const downloadedBytes = safeNum(d.downloaded_bytes);
    const speed           = safeNum(d.speed);
    const eta             = safeEta(d.eta);

    // ── debug-level only — no disk I/O at default log level ────────────────
    logger.debug(`Progress ${downloadId}: ${downloadedBytes}/${totalBytes} @ ${speed} B/s eta=${eta}`);

    const pct = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100) : 0;

    for (const stream of streams) {
      Object.assign(stream, { combined, status: 'downloading', totalBytes, downloadedBytes, progress: pct, speed, eta });
    }
    recalculateAggregate(progress);
    progress.speed           = speed;
    progress.eta             = eta;

    broadcastUpdate(downloadId, progress.toDict()); // throttled

  } else if (status === 'finished') {
    for (const stream of streams) {
      stream.combined = combined;
      stream.status = 'completed';
      stream.progress = 100;
      stream.speed = 0;
      stream.eta = null;
      if (stream.totalBytes > 0) stream.downloadedBytes = stream.totalBytes;
    }
    recalculateAggregate(progress);
    progress.status = 'processing';
    if (d.filename) progress.filename = filename;
    progress.speed = 0;
    progress.eta   = null;

    broadcastUpdate(downloadId, progress.toDict());

  } else if (status === 'error') {
    progress.status = 'failed';
    progress.completedAt = new Date();
    progress.error  = String(d.error || 'Unknown error');
    progress.speed  = 0;
    progress.eta    = null;
    for (const stream of streams) stream.status = 'failed';
    markIncompleteStreams(progress, 'failed');
    progress.addLog(`Download failed: ${progress.error}`);
    logger.error(`Download ${downloadId} failed: ${progress.error}`);

    broadcastImmediate(downloadId, progress.toDict()); // terminal — bypass throttle
  }
}

function expectedStreams(options) {
  if (options.extractAudio || options.downloadMode === 'audio') return { expectedVideo: false, expectedAudio: true };
  if (options.downloadMode === 'video') return { expectedVideo: true, expectedAudio: false };
  if (options.downloadMode === 'both') return { expectedVideo: true, expectedAudio: true };
  const format = String(options.formatCode || '').toLowerCase();
  if (format.includes('audio') && !format.includes('video') && !format.includes('+')) return { expectedVideo: false, expectedAudio: true };
  if (format.includes('video') && !format.includes('audio') && !format.includes('+')) return { expectedVideo: true, expectedAudio: false };
  return { expectedVideo: true, expectedAudio: true };
}

// ─── POST /api/download ───────────────────────────────────────────────────────
router.post('/command-preview', (req, res) => {
  try {
    const options = { ...(req.body || {}) };
    if (!options.url) options.url = 'https://example.com/video';
    const downloadDirectory = resolveDownloadDirectory(options.downloadPath);
    const { command } = buildYtDlpCommand(options, { downloadDirectory });
    res.json({ command: formatCommand(redactCommand(command)) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, code: error.code || 'INVALID_OPTIONS' });
  }
});

router.post('/download', async (req, res) => {
  const downloadId = uuidv4();
  let progress = null;

  try {
    const options = req.body;
    if (!options || typeof options !== 'object')
      return res.status(400).json({ error: 'Invalid request body. Expected JSON object.', code: 'INVALID_REQUEST_BODY' });
    if (!options.url || typeof options.url !== 'string')
      return res.status(400).json({ error: 'URL is required and must be a string.', code: 'MISSING_URL' });

    let url;
    try { url = await validateMediaUrl(options.url); }
    catch (error) {
      return res.status(error.status || 400).json({ error: error.message, code: error.code || 'INVALID_URL' });
    }
    options.url = url;

    if (activeDownloads.size >= config.MAX_CONCURRENT_DOWNLOADS) {
      return res.status(429).json({
        error: `The download queue is full (${config.MAX_CONCURRENT_DOWNLOADS} active).`,
        code: 'DOWNLOAD_LIMIT_REACHED',
      });
    }

    // yt-dlp availability (cached — no spawn overhead if checked recently)
    try {
      await checkYtDlpAvailable();
    } catch (e) {
      logger.error(`yt-dlp availability check failed: ${e.message}`);
      return res.status(503).json({ error: `yt-dlp is not available: ${e.message}`, code: 'YTDLP_UNAVAILABLE' });
    }

    let downloadDirectory;
    try { downloadDirectory = resolveDownloadDirectory(options.downloadPath); }
    catch (error) {
      return res.status(error.status || 400).json({ error: error.message, code: error.code || 'INVALID_DOWNLOAD_PATH' });
    }
    try {
      await fs.promises.mkdir(downloadDirectory, { recursive: true });
      await fs.promises.access(downloadDirectory, fs.constants.F_OK | fs.constants.W_OK);
    }
    catch (dirError) {
      logger.error(`Download dir access failed: ${dirError.message}`);
      return res.status(503).json({ error: `Download directory is not accessible: ${dirError.message}`, code: 'DIRECTORY_INACCESSIBLE' });
    }

    // Progress tracker
    try {
      progress = new DownloadProgress(downloadId, expectedStreams(options));
      downloadProgress.set(downloadId, progress);
    } catch (e) {
      logger.error(`Progress tracker init failed: ${e.message}`);
      return res.status(500).json({ error: `Failed to initialize download tracking: ${e.message}`, code: 'PROGRESS_INIT_FAILED' });
    }

    // Build command
    let command;
    try {
      command = buildYtDlpCommand(options, { downloadDirectory }).command;
    } catch (e) {
      logger.error(`Failed to build yt-dlp command: ${e.message}`);
      downloadProgress.delete(downloadId);
      return res.status(400).json({ error: `Invalid download options: ${e.message}`, code: 'INVALID_OPTIONS' });
    }

    logger.info(`Starting download ${downloadId} from ${new URL(url).hostname}`);

    // ── Kick off download on next tick so HTTP response is flushed first ────
    process.nextTick(() => {
      try {
        progress.status = 'starting';

        const ytdlpProcess = spawn(command[0], command.slice(1), {
          cwd:   downloadDirectory,
          stdio: ['ignore', 'pipe', 'pipe'],
          env:   { ...process.env, PYTHONUNBUFFERED: '1' },
          windowsHide: true,
        });

        activeDownloads.set(downloadId, {
          process:    ytdlpProcess,
          status:     'running',
          url,
          started_at: new Date().toISOString(),
          pid:        ytdlpProcess.pid,
        });

        progress.status = 'downloading';

        // Numeric normaliser (reused inside readline handlers)
        const toNum = (v) => {
          if (v === undefined || v === null || v === 'N/A' || v === '') return 0;
          const n = Number(v);
          return Number.isFinite(n) && !Number.isNaN(n) ? n : 0;
        };

        // ── readline on stdout — one 'line' event per JSON object ───────────
        const rlOut = readline.createInterface({ input: ytdlpProcess.stdout, crlfDelay: Infinity });
        rlOut.on('line', (rawLine) => {
          try {
            const clean = rawLine.trim();
            if (!clean) return;

            const start = clean.indexOf('{');
            const end   = clean.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) {
              const maybeJson = clean.slice(start, end + 1);
              try {
                const obj = JSON.parse(maybeJson);
                if (obj && obj.status) {
                  logger.debug(`Progress data ${downloadId}: ${JSON.stringify(obj)}`);
                  obj.total_bytes      = toNum(obj.total_bytes);
                  // Fall back to estimate when exact size not yet known
                  if (!obj.total_bytes && obj.total_bytes_estimate)
                    obj.total_bytes = toNum(obj.total_bytes_estimate);
                  obj.downloaded_bytes = toNum(obj.downloaded_bytes);
                  obj.speed            = toNum(obj.speed);
                  const etaNum = toNum(obj.eta);
                  obj.eta = etaNum > 0 ? etaNum : null;
                  // Keep filename as string (not numeric)
                  if (obj.filename === undefined || obj.filename === 'NA' || obj.filename === '') obj.filename = null;
                  progressHook(obj, downloadId);
                  return;
                }
              } catch (parseErr) {
                logger.debug(`JSON parse failed for ${downloadId}: ${parseErr.message}`);
              }
            }
            progress.addLog(clean);
          } catch (e) {
            logger.error(`stdout processing error for ${downloadId}: ${e.message}`);
          }
        });

        // ── readline on stderr ──────────────────────────────────────────────
        const rlErr = readline.createInterface({ input: ytdlpProcess.stderr, crlfDelay: Infinity });
        rlErr.on('line', (rawLine) => {
          const cleanLine = rawLine.trim();
          if (!cleanLine) return;

          // stderr can also carry progress JSON from some yt-dlp builds
          const start = cleanLine.indexOf('{');
          const end   = cleanLine.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            const maybeJson = cleanLine.slice(start, end + 1);
            try {
              const obj = JSON.parse(maybeJson);
              if (obj && obj.status) {
                progressHook(obj, downloadId);
                return;
              }
            } catch (_) { /* not JSON */ }
          }

          progress.addLog(`STDERR: ${cleanLine}`);
          logger.warn(`Download ${downloadId} stderr: ${cleanLine}`);

          const criticalErrors = [
            /video unavailable/i, /video has been removed/i,
            /this video is private/i, /unsupported url/i,
            /no video formats found/i, /unable to download/i,
            /http error/i, /network is unreachable/i,
            /connection timed out/i, /403 forbidden/i,
            /404 not found/i, /500 internal server error/i,
            /access denied/i, /permission denied/i,
            /disk full/i, /no space left/i,
          ];
          if (criticalErrors.some((re) => re.test(cleanLine))) {
            progress.status = 'failed';
            progress.error  = `Critical error: ${cleanLine}`;
            progress.speed  = 0;
            progress.eta    = null;
            logger.error(`Critical error in download ${downloadId}: ${cleanLine}`);
          }
        });

        // ── Process close ───────────────────────────────────────────────────
        ytdlpProcess.once('close', (code, signal) => {
          rlOut.close();
          rlErr.close();
          logger.info(`Download ${downloadId} closed — code=${code} signal=${signal}`);
          if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);

          if (progress.status === 'cancelled') {
            markIncompleteStreams(progress, 'cancelled');
            progress.speed = 0; progress.eta = null;
            progress.completedAt = progress.completedAt || new Date();
            progress.addLog('Download was cancelled by user');
          } else if (progress.status === 'failed') {
            markIncompleteStreams(progress, 'failed');
            progress.speed = 0; progress.eta = null;
            progress.completedAt = progress.completedAt || new Date();
            progress.addLog(`Download failed: ${progress.error || 'Unknown error'}`);
          } else if (signal) {
            progress.status = 'failed';
            markIncompleteStreams(progress, 'failed');
            progress.completedAt = new Date();
            progress.error  = `Process terminated by signal: ${signal}`;
            progress.speed  = 0; progress.eta = null;
            progress.addLog(`Process terminated by signal: ${signal}`);
            logger.error(`Download ${downloadId} terminated by signal: ${signal}`);
          } else if (code === 0) {
            progress.status      = 'completed';
            progress.completedAt = new Date();
            progress.progress    = 100;
            progress.speed       = 0; progress.eta = null;
            for (const streamProgress of [progress.videoProgress, progress.audioProgress]) {
              if (streamProgress.expected) {
                streamProgress.status = 'completed';
                streamProgress.progress = 100;
                streamProgress.speed = 0;
                streamProgress.eta = null;
                if (streamProgress.totalBytes > 0) streamProgress.downloadedBytes = streamProgress.totalBytes;
              }
            }
            progress.addLog('Download completed successfully');
            logger.info(`Download ${downloadId} completed successfully`);
          } else {
            progress.status = 'failed';
            markIncompleteStreams(progress, 'failed');
            progress.completedAt = new Date();
            progress.error  = `Download failed with exit code ${code}`;
            progress.speed  = 0; progress.eta = null;
            progress.addLog(`Download failed with exit code ${code}`);
            logger.error(`Download ${downloadId} failed with exit code ${code}`);
          }

          // Always use immediate broadcast for terminal state
          try { broadcastImmediate(downloadId, progress.toDict()); }
          catch (e) { logger.warn(`Failed to broadcast final state for ${downloadId}: ${e.message}`); }
        });

        // ── Absolute timeout guard ──────────────────────────────────────────
        const timeoutHandle = setTimeout(() => {
          if (activeDownloads.has(downloadId)) {
            logger.warn(`Download ${downloadId} hit hard timeout — terminating`);
            try {
              progress.status = 'failed';
              markIncompleteStreams(progress, 'failed');
              progress.error  = 'Download timeout';
              progress.completedAt = new Date();
              broadcastImmediate(downloadId, progress.toDict());
              terminateProcess(ytdlpProcess).catch((error) => logger.error(`Failed to terminate timed-out process ${downloadId}: ${error.message}`));
              progress.addLog('Download timeout — process terminated');
            } catch (e) {
              logger.error(`Failed to terminate timed-out process ${downloadId}: ${e.message}`);
            }
          }
        }, config.MAX_DOWNLOAD_DURATION_MS);
        timeoutHandle.unref?.();

        ytdlpProcess.once('close', () => clearTimeout(timeoutHandle));
        ytdlpProcess.once('error', (error) => {
          clearTimeout(timeoutHandle);
          activeDownloads.delete(downloadId);
          progress.status = 'failed';
          markIncompleteStreams(progress, 'failed');
          progress.error = `Failed to start yt-dlp: ${error.message}`;
          progress.completedAt = new Date();
          progress.addLog(progress.error);
          broadcastImmediate(downloadId, progress.toDict());
        });

      } catch (spawnError) {
        logger.error(`Failed to spawn download process for ${downloadId}: ${spawnError.message}`);
        progress.status = 'failed';
        markIncompleteStreams(progress, 'failed');
        progress.error  = `Failed to start download process: ${spawnError.message}`;
        progress.completedAt = new Date();
        progress.addLog(`SPAWN_ERROR: ${spawnError.message}`);
        if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
        broadcastImmediate(downloadId, progress.toDict());
      }
    });

    res.status(202).json({ status: 'success', message: 'Download queued successfully', download_id: downloadId });

  } catch (error) {
    logger.error(`Failed to start download: ${error.message}`);
    if (progress && downloadProgress.has(downloadId)) downloadProgress.delete(downloadId);
    if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
    res.status(500).json({ error: `Failed to start download: ${error.message}`, code: 'DOWNLOAD_START_FAILED', download_id: downloadId });
  }
});

// ─── GET /api/download/:downloadId/status ─────────────────────────────────────
router.get('/download/:downloadId/status', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  res.json(progress.toDict());
});

// ─── GET /api/downloads/status/batch ─────────────────────────────────────────
// Frontend polling fallback uses this to get all active statuses in 1 request.
// Query: ?ids=id1,id2,id3
router.get('/downloads/status/batch', (req, res) => {
  const rawIds = req.query.ids || '';
  const ids    = rawIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);

  const result = {};
  for (const id of ids) {
    const progress = downloadProgress.get(id);
    result[id] = progress ? progress.toDict() : null;
  }
  res.json(result);
});

// ─── POST /api/download/:downloadId/cancel ────────────────────────────────────
router.post('/download/:downloadId/cancel', async (req, res) => {
  const { downloadId } = req.params;
  if (!activeDownloads.has(downloadId))
    return res.status(404).json({ error: 'Download not found' });

  const downloadInfo = activeDownloads.get(downloadId);
  const progress     = downloadProgress.get(downloadId);

  if (['running', 'starting', 'paused'].includes(downloadInfo.status)) {
    try {
      downloadInfo.status = 'cancelled';
      if (progress) {
        progress.status = 'cancelled';
        markIncompleteStreams(progress, 'cancelled');
        progress.completedAt = new Date();
        progress.addLog('Download cancelled by user');
        progress.speed = 0; progress.eta = null;
        try { broadcastImmediate(downloadId, progress.toDict()); } catch (_) {}
      }
      await terminateProcess(downloadInfo.process);
      logger.info(`Download ${downloadId} cancelled successfully`);
      res.json({ status: 'success', message: 'Download cancelled successfully' });
    } catch (error) {
      logger.error(`Failed to cancel download ${downloadId}: ${error.message}`);
      res.status(500).json({ error: `Failed to cancel download: ${error.message}` });
    }
  } else {
    res.status(400).json({ error: `Download is not running (status: ${downloadInfo.status})` });
  }
});

// ─── POST /api/download/:downloadId/pause ─────────────────────────────────────
router.post('/download/:downloadId/pause', (req, res) => {
  const { downloadId } = req.params;
  if (isWindows)
    return res.status(501).json({ error: 'Pause/Resume is not supported on Windows. Use cancel instead.', error_code: 'WINDOWS_UNSUPPORTED' });
  if (!activeDownloads.has(downloadId))
    return res.status(404).json({ error: 'Download not found or process not started' });

  const downloadInfo = activeDownloads.get(downloadId);
  const progress     = downloadProgress.get(downloadId);

  if (downloadInfo.status === 'running') {
    try {
      downloadInfo.process.kill('SIGSTOP');
      downloadInfo.status = 'paused';
      if (progress) {
        progress.status = 'paused';
        try { broadcastImmediate(downloadId, progress.toDict()); } catch (_) {}
      }
      logger.info(`Download ${downloadId} paused`);
      res.json({ status: 'success', message: 'Download paused' });
    } catch (error) {
      logger.error(`Failed to pause download ${downloadId}: ${error.message}`);
      res.status(500).json({ error: `Failed to pause download: ${error.message}` });
    }
  } else {
    res.status(400).json({ error: `Download is not in a pausable state (status: ${downloadInfo.status})` });
  }
});

// ─── POST /api/download/:downloadId/resume ────────────────────────────────────
router.post('/download/:downloadId/resume', (req, res) => {
  const { downloadId } = req.params;
  if (isWindows)
    return res.status(501).json({ error: 'Pause/Resume is not supported on Windows. Use cancel instead.', error_code: 'WINDOWS_UNSUPPORTED' });
  if (!activeDownloads.has(downloadId))
    return res.status(404).json({ error: 'Download not found or process not started' });

  const downloadInfo = activeDownloads.get(downloadId);
  const progress     = downloadProgress.get(downloadId);

  if (downloadInfo.status === 'paused') {
    try {
      downloadInfo.process.kill('SIGCONT');
      downloadInfo.status = 'running';
      if (progress) {
        progress.status = 'downloading';
        try { broadcastImmediate(downloadId, progress.toDict()); } catch (_) {}
      }
      logger.info(`Download ${downloadId} resumed`);
      res.json({ status: 'success', message: 'Download resumed' });
    } catch (error) {
      logger.error(`Failed to resume download ${downloadId}: ${error.message}`);
      res.status(500).json({ error: `Failed to resume download: ${error.message}` });
    }
  } else {
    res.status(400).json({ error: `Download is not paused (status: ${downloadInfo.status})` });
  }
});

// ─── GET /api/download/:downloadId/log ────────────────────────────────────────
router.get('/download/:downloadId/log', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  res.json({ log: progress.log });
});

// ─── DELETE /api/download/:downloadId ─────────────────────────────────────────
router.delete('/download/:downloadId', async (req, res) => {
  const { downloadId } = req.params;
  if (activeDownloads.has(downloadId)) {
    const info = activeDownloads.get(downloadId);
    if (['running', 'starting', 'paused'].includes(info.status)) {
      try { await terminateProcess(info.process); }
      catch (e) { logger.warn(`Failed to stop process for ${downloadId}: ${e.message}`); }
    }
    activeDownloads.delete(downloadId);
  }
  if (downloadProgress.has(downloadId)) downloadProgress.delete(downloadId);
  res.json({ status: 'success', message: 'Download removed' });
});

module.exports = router;
