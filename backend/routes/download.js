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
const path     = require('path');
const fs       = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { isWindows, terminateProcess } = require('../utils/platform');
const {
  activeDownloads,
  downloadProgress,
  sseClients,
  DownloadProgress,
  broadcastUpdate,
  broadcastImmediate,
} = require('../services/progressTracker');

const router = express.Router();

const DOWNLOAD_DIR            = path.join(__dirname, '..', '..', 'downloads');
const YTDLP_CHECK_TIMEOUT_MS  = Number(process.env.YTDLP_CHECK_TIMEOUT_MS || 5000);
const MAX_DOWNLOAD_DURATION_MS = Number(process.env.MAX_DOWNLOAD_DURATION_MS || 30 * 60 * 1000);

// ─── yt-dlp availability cache ────────────────────────────────────────────────
let _ytdlpAvailableAt  = 0;          // timestamp of last successful check
const YTDLP_CACHE_TTL  = 60_000;     // 60 seconds

async function checkYtDlpAvailable() {
  if (Date.now() - _ytdlpAvailableAt < YTDLP_CACHE_TTL) return; // cache hit

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--version'], { stdio: 'pipe' });
    const t    = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      reject(new Error('yt-dlp availability check timeout'));
    }, YTDLP_CHECK_TIMEOUT_MS);

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
  res.writeHead(200, {
    'Content-Type':                'text/event-stream',
    'Cache-Control':               'no-cache',
    'Connection':                  'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Cache-Control',
  });
  res.write('data: {"type":"connected","message":"SSE connected"}\n\n');
  sseClients.add(res);
  const drop = () => sseClients.delete(res);
  req.on('close',   drop);
  req.on('aborted', drop);
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
  const isVideo  = /\.(mp4|mkv|webm|avi)$/i.test(filename) && !/audio/i.test(filename);
  const isAudio  = /\.(mp3|m4a|wav|aac)$/i.test(filename)  || /audio/i.test(filename);

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

    if (isVideo) {
      Object.assign(progress.videoProgress, { status: 'downloading', totalBytes, downloadedBytes, progress: pct, speed, eta });
    } else if (isAudio) {
      Object.assign(progress.audioProgress, { status: 'downloading', totalBytes, downloadedBytes, progress: pct, speed, eta });
    }

    progress.totalBytes      = totalBytes;
    progress.downloadedBytes = downloadedBytes;
    progress.progress        = pct;
    progress.speed           = speed;
    progress.eta             = eta;

    broadcastUpdate(downloadId, progress.toDict()); // throttled

  } else if (status === 'finished') {
    if (isVideo) { progress.videoProgress.status = 'completed'; progress.videoProgress.progress = 100; }
    else if (isAudio) { progress.audioProgress.status = 'completed'; progress.audioProgress.progress = 100; }

    const videoDone = ['completed', 'waiting'].includes(progress.videoProgress.status);
    const audioDone = ['completed', 'waiting'].includes(progress.audioProgress.status);
    progress.status = videoDone && audioDone ? 'completed' : 'processing';
    if (progress.status === 'completed') progress.progress = 100;
    if (d.filename) progress.filename = filename;
    progress.speed = 0;
    progress.eta   = null;

    broadcastUpdate(downloadId, progress.toDict());

  } else if (status === 'error') {
    progress.status = 'failed';
    progress.error  = String(d.error || 'Unknown error');
    progress.speed  = 0;
    progress.eta    = null;
    if (isVideo) progress.videoProgress.status = 'failed';
    else if (isAudio) progress.audioProgress.status = 'failed';
    progress.addLog(`Download failed: ${progress.error}`);
    logger.error(`Download ${downloadId} failed: ${progress.error}`);

    broadcastImmediate(downloadId, progress.toDict()); // terminal — bypass throttle
  }
}

// ─── POST /api/download ───────────────────────────────────────────────────────
router.post('/download', async (req, res) => {
  const downloadId = uuidv4();
  let progress = null;

  try {
    const options = req.body;
    if (!options || typeof options !== 'object')
      return res.status(400).json({ error: 'Invalid request body. Expected JSON object.', code: 'INVALID_REQUEST_BODY' });
    if (!options.url || typeof options.url !== 'string')
      return res.status(400).json({ error: 'URL is required and must be a string.', code: 'MISSING_URL' });

    const url = options.url.trim();
    if (!url)
      return res.status(400).json({ error: 'URL cannot be empty.', code: 'EMPTY_URL' });
    if (!/^https?:\/\//.test(url))
      return res.status(400).json({ error: 'Invalid URL format. Must start with http:// or https://', code: 'INVALID_URL_FORMAT' });
    try { new URL(url); } catch (e) {
      return res.status(400).json({ error: `Invalid URL: ${e.message}`, code: 'MALFORMED_URL' });
    }

    // yt-dlp availability (cached — no spawn overhead if checked recently)
    try {
      await checkYtDlpAvailable();
    } catch (e) {
      logger.error(`yt-dlp availability check failed: ${e.message}`);
      return res.status(503).json({ error: `yt-dlp is not available: ${e.message}`, code: 'YTDLP_UNAVAILABLE' });
    }

    // Download directory
    try { await fs.access(DOWNLOAD_DIR, fs.constants.F_OK | fs.constants.W_OK); }
    catch (dirError) {
      logger.error(`Download dir access failed: ${dirError.message}`);
      return res.status(503).json({ error: `Download directory is not accessible: ${dirError.message}`, code: 'DIRECTORY_INACCESSIBLE' });
    }

    // Progress tracker
    try {
      progress = new DownloadProgress(downloadId);
      downloadProgress.set(downloadId, progress);
    } catch (e) {
      logger.error(`Progress tracker init failed: ${e.message}`);
      return res.status(500).json({ error: `Failed to initialize download tracking: ${e.message}`, code: 'PROGRESS_INIT_FAILED' });
    }

    // Build command
    let command;
    try {
      const { buildYtDlpCommand } = require('../services/commandBuilder');
      command = buildYtDlpCommand(options).command;
    } catch (e) {
      logger.error(`Failed to build yt-dlp command: ${e.message}`);
      downloadProgress.delete(downloadId);
      return res.status(400).json({ error: `Invalid download options: ${e.message}`, code: 'INVALID_OPTIONS' });
    }

    logger.info(`Starting download ${downloadId}: ${command.join(' ')}`);

    // ── Kick off download on next tick so HTTP response is flushed first ────
    process.nextTick(() => {
      try {
        progress.status = 'starting';

        const ytdlpProcess = spawn(command[0], command.slice(1), {
          cwd:   DOWNLOAD_DIR,
          stdio: ['ignore', 'pipe', 'pipe'],
          env:   { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        activeDownloads.set(downloadId, {
          process:    ytdlpProcess,
          status:     'running',
          command:    command.join(' '),
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
        ytdlpProcess.on('close', (code, signal) => {
          rlOut.close();
          rlErr.close();
          logger.info(`Download ${downloadId} closed — code=${code} signal=${signal}`);
          if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);

          if (progress.status === 'cancelled') {
            progress.speed = 0; progress.eta = null;
            progress.addLog('Download was cancelled by user');
          } else if (progress.status === 'failed') {
            progress.speed = 0; progress.eta = null;
            progress.addLog(`Download failed: ${progress.error || 'Unknown error'}`);
          } else if (signal) {
            progress.status = 'failed';
            progress.error  = `Process terminated by signal: ${signal}`;
            progress.speed  = 0; progress.eta = null;
            progress.addLog(`Process terminated by signal: ${signal}`);
            logger.error(`Download ${downloadId} terminated by signal: ${signal}`);
          } else if (code === 0) {
            progress.status      = 'completed';
            progress.completedAt = new Date();
            progress.progress    = 100;
            progress.speed       = 0; progress.eta = null;
            if (progress.videoProgress) progress.videoProgress.progress = 100;
            if (progress.audioProgress) progress.audioProgress.progress = 100;
            progress.addLog('Download completed successfully');
            logger.info(`Download ${downloadId} completed successfully`);
          } else {
            progress.status = 'failed';
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
              terminateProcess(ytdlpProcess);
              progress.status = 'failed';
              progress.error  = 'Download timeout';
              progress.addLog('Download timeout — process terminated');
            } catch (e) {
              logger.error(`Failed to terminate timed-out process ${downloadId}: ${e.message}`);
            }
          }
        }, MAX_DOWNLOAD_DURATION_MS);

        ytdlpProcess.on('close', () => clearTimeout(timeoutHandle));
        ytdlpProcess.on('error', () => clearTimeout(timeoutHandle));

      } catch (spawnError) {
        logger.error(`Failed to spawn download process for ${downloadId}: ${spawnError.message}`);
        progress.status = 'failed';
        progress.error  = `Failed to start download process: ${spawnError.message}`;
        progress.addLog(`SPAWN_ERROR: ${spawnError.message}`);
        if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
      }
    });

    res.json({ status: 'success', message: 'Download started successfully', download_id: downloadId });

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
  const ids    = rawIds.split(',').map(s => s.trim()).filter(Boolean);

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
        progress.status = 'running';
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
router.delete('/download/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  if (activeDownloads.has(downloadId)) {
    const info = activeDownloads.get(downloadId);
    if (info.status === 'running') {
      try { info.process.kill('SIGTERM'); }
      catch (e) { logger.warn(`Failed to kill process for ${downloadId}: ${e.message}`); }
    }
    activeDownloads.delete(downloadId);
  }
  if (downloadProgress.has(downloadId)) downloadProgress.delete(downloadId);
  res.json({ status: 'success', message: 'Download removed' });
});

module.exports = router;
