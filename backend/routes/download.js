const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { isWindows, terminateProcess } = require('../utils/platform');
const { activeDownloads, downloadProgress, sseClients, DownloadProgress, broadcastUpdate } = require('../services/progressTracker');

const router = express.Router();

const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');
const YTDLP_CHECK_TIMEOUT_MS = Number(process.env.YTDLP_CHECK_TIMEOUT_MS || 5000);
const MAX_DOWNLOAD_DURATION_MS = Number(process.env.MAX_DOWNLOAD_DURATION_MS || 30 * 60 * 1000);

// SSE events
router.get('/downloads/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
  res.write('data: {"type":"connected","message":"SSE connected"}\n\n');
  sseClients.add(res);
  const drop = () => sseClients.delete(res);
  req.on('close', drop); req.on('aborted', drop);
});

function progressHook(data, downloadId) {
  const progress = downloadProgress.get(downloadId);
  if (!progress) return;
  
  let d = data;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return; }
  }
  
  const status = d.status || 'unknown';
  const filename = d.filename || progress.filename || 'download'; // Use existing filename if not provided
  const isVideo = /\.(mp4|mkv|webm|avi)$/i.test(filename) && !/audio/i.test(filename);
  const isAudio = /\.(mp3|m4a|wav|aac)$/i.test(filename) || /audio/i.test(filename);
  
  // Helper function to safely convert to number
  const safeNumber = (value, defaultValue = 0) => {
    if (value === undefined || value === null || value === 'N/A' || value === '') return defaultValue;
    const num = Number(value);
    return Number.isFinite(num) && !Number.isNaN(num) ? num : defaultValue;
  };
  
  // Helper function to safely convert ETA
  const safeEta = (value) => {
    if (value === undefined || value === null || value === 'N/A' || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) && !Number.isNaN(num) && num > 0 ? num : null;
  };
  
  if (status === 'downloading') {
    progress.status = 'downloading';
    if (d.filename) progress.filename = filename; // Only update filename if provided
    
    const totalBytes = safeNumber(d.total_bytes || d.total_bytes_estimate);
    const downloadedBytes = safeNumber(d.downloaded_bytes);
    const speed = safeNumber(d.speed);
    const eta = safeEta(d.eta);
    
    // Debug logging for progress calculations
    logger.info(`Progress calculation for ${downloadId}: downloaded=${downloadedBytes}, total=${totalBytes}, speed=${speed}, eta=${eta}`);
    
    if (isVideo) {
      progress.videoProgress.status = 'downloading';
      progress.videoProgress.totalBytes = totalBytes;
      progress.videoProgress.downloadedBytes = downloadedBytes;
      progress.videoProgress.progress = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100) : 0;
      progress.videoProgress.speed = speed;
      progress.videoProgress.eta = eta;
    } else if (isAudio) {
      progress.audioProgress.status = 'downloading';
      progress.audioProgress.totalBytes = totalBytes;
      progress.audioProgress.downloadedBytes = downloadedBytes;
      progress.audioProgress.progress = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100) : 0;
      progress.audioProgress.speed = speed;
      progress.audioProgress.eta = eta;
    }
    
    progress.totalBytes = totalBytes;
    progress.downloadedBytes = downloadedBytes;
    progress.progress = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100) : 0;
    progress.speed = speed;
    progress.eta = eta;
    
    // Debug logging for final progress state
    logger.info(`Updated progress for ${downloadId}: ${progress.progress.toFixed(2)}%`);
    
  } else if (status === 'finished') {
    if (isVideo) { 
      progress.videoProgress.status = 'completed'; 
      progress.videoProgress.progress = 100; 
    } else if (isAudio) { 
      progress.audioProgress.status = 'completed'; 
      progress.audioProgress.progress = 100; 
    }
    
    const videoDone = ['completed', 'waiting'].includes(progress.videoProgress.status);
    const audioDone = ['completed', 'waiting'].includes(progress.audioProgress.status);
    progress.status = videoDone && audioDone ? 'completed' : 'processing';
    
    if (progress.status === 'completed') {
      progress.progress = 100;
    }
    
    if (d.filename) progress.filename = filename;
    progress.speed = 0;
    progress.eta = null;
    
  } else if (status === 'error') {
    progress.status = 'failed';
    progress.error = String(d.error || 'Unknown error');
    progress.speed = 0;
    progress.eta = null;
    
    if (isVideo) progress.videoProgress.status = 'failed';
    else if (isAudio) progress.audioProgress.status = 'failed';
    
    progress.addLog(`Download failed: ${progress.error}`);
    logger.error(`Download ${progress.downloadId} failed: ${progress.error}`);
  }
  
  try { 
    broadcastUpdate(downloadId, progress.toDict()); 
  } catch (e) { 
    logger.warn(`SSE broadcast failed for ${downloadId}: ${e.message}`); 
  }
}

router.post('/download', async (req, res) => {
  const downloadId = uuidv4();
  let progress = null;
  try {
    const options = req.body;
    if (!options || typeof options !== 'object') return res.status(400).json({ error: 'Invalid request body. Expected JSON object.', code: 'INVALID_REQUEST_BODY' });
    if (!options.url || typeof options.url !== 'string') return res.status(400).json({ error: 'URL is required and must be a string.', code: 'MISSING_URL' });
    const url = options.url.trim();
    if (!url) return res.status(400).json({ error: 'URL cannot be empty.', code: 'EMPTY_URL' });
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Invalid URL format. Must start with http:// or https://', code: 'INVALID_URL_FORMAT' });
    try { new URL(url); } catch (e) { return res.status(400).json({ error: `Invalid URL: ${e.message}`, code: 'MALFORMED_URL' }); }

    // yt-dlp availability
    try {
      await new Promise((resolve, reject) => {
        const ytdlpCheck = spawn('yt-dlp', ['--version'], { stdio: 'pipe' });
        const timeout = setTimeout(() => { try { ytdlpCheck.kill(); } catch (_) {} reject(new Error('yt-dlp availability check timeout')); }, YTDLP_CHECK_TIMEOUT_MS);
        ytdlpCheck.on('close', (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`yt-dlp not available (exit code: ${code})`)); });
        ytdlpCheck.on('error', (err) => { clearTimeout(timeout); reject(new Error(`yt-dlp process error: ${err.message}`)); });
      });
    } catch (e) {
      logger.error(`yt-dlp availability check failed: ${e.message}`);
      return res.status(503).json({ error: `yt-dlp is not available: ${e.message}`, code: 'YTDLP_UNAVAILABLE' });
    }

    // download dir access
    try { await fs.access(DOWNLOAD_DIR, fs.constants.F_OK | fs.constants.W_OK); }
    catch (dirError) { logger.error(`Download dir access failed: ${dirError.message}`); return res.status(503).json({ error: `Download directory is not accessible: ${dirError.message}`, code: 'DIRECTORY_INACCESSIBLE' }); }

    // tracker
    try { progress = new DownloadProgress(downloadId); downloadProgress.set(downloadId, progress); }
    catch (e) { logger.error(`Progress tracker init failed: ${e.message}`); return res.status(500).json({ error: `Failed to initialize download tracking: ${e.message}`, code: 'PROGRESS_INIT_FAILED' }); }

    // Build command - reuse commandBuilder via dynamic import to avoid cycle
    let command;
    try {
      const { buildYtDlpCommand } = require('../services/commandBuilder');
      const result = buildYtDlpCommand(options);
      command = result.command;
    } catch (e) {
      logger.error(`Failed to build yt-dlp command: ${e.message}`);
      downloadProgress.delete(downloadId);
      return res.status(400).json({ error: `Invalid download options: ${e.message}`, code: 'INVALID_OPTIONS' });
    }

    logger.info(`Starting download ${downloadId}: ${command.join(' ')}`);

    const runDownload = () => {
      try {
        progress.status = 'starting';
        const ytdlpProcess = spawn(command[0], command.slice(1), { cwd: DOWNLOAD_DIR, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
        activeDownloads.set(downloadId, { process: ytdlpProcess, status: 'running', command: command.join(' '), url, started_at: new Date().toISOString(), pid: ytdlpProcess.pid });
        progress.status = 'downloading';
        const toNum = (v) => {
          if (v === undefined || v === null || v === 'N/A' || v === '') return 0;
          const n = Number(v);
          return Number.isFinite(n) && !Number.isNaN(n) ? n : 0;
        };

        const tryParseProgressJson = (rawLine) => {
          const clean = rawLine.trim();
          if (!clean) return false;
          
          // Extract first {...} JSON block if present
          const start = clean.indexOf('{');
          const end = clean.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            const maybeJson = clean.slice(start, end + 1);
            try {
              const obj = JSON.parse(maybeJson);
              if (obj && obj.status) {
                // Log the raw progress data for debugging
                logger.info(`Progress data for ${downloadId}: ${JSON.stringify(obj)}`);
                
                // Normalize potential numeric string fields
                if (obj.total_bytes !== undefined) obj.total_bytes = toNum(obj.total_bytes);
                if (obj.downloaded_bytes !== undefined) obj.downloaded_bytes = toNum(obj.downloaded_bytes);
                if (obj.speed !== undefined) obj.speed = toNum(obj.speed);
                if (obj.eta !== undefined) {
                  const etaNum = toNum(obj.eta);
                  obj.eta = etaNum > 0 ? etaNum : null;
                }
                progressHook(obj, downloadId);
                return true;
              }
            } catch (parseError) { 
              // Log JSON parsing failures for debugging
              logger.warn(`Failed to parse progress JSON for ${downloadId}: ${parseError.message}, raw: ${maybeJson}`);
            }
          }
          return false;
        };

        ytdlpProcess.stdout.on('data', (data) => {
          try {
            const lines = data.toString().split('\n');
            for (const line of lines) {
              const cleanLine = line.trim(); if (!cleanLine) continue;
              // Attempt to parse progress JSON from stdout
              if (tryParseProgressJson(cleanLine)) continue;
              progress.addLog(cleanLine);
            }
          } catch (e) { logger.error(`stdout processing error for ${downloadId}: ${e.message}`); progress.addLog(`STDOUT_PROCESSING_ERROR: ${e.message}`); }
        });
        ytdlpProcess.stderr.on('data', (data) => {
          const text = data.toString(); if (!text) return;
          const lines = text.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim(); if (!cleanLine) continue;
            // Many yt-dlp progress lines are written to stderr; parse them too
            if (tryParseProgressJson(cleanLine)) continue;
            progress.addLog(`STDERR: ${cleanLine}`); logger.warn(`Download ${downloadId} stderr: ${cleanLine}`);
            const criticalErrors = [/video unavailable/i, /video has been removed/i, /this video is private/i, /unsupported url/i, /no video formats found/i, /unable to download/i, /http error/i, /network is unreachable/i, /connection timed out/i, /403 forbidden/i, /404 not found/i, /500 internal server error/i, /access denied/i, /permission denied/i, /disk full/i, /no space left/i];
            if (criticalErrors.some((re) => re.test(cleanLine))) { progress.status = 'failed'; progress.error = `Critical error: ${cleanLine}`; progress.speed = 0; progress.eta = null; logger.error(`Critical error in download ${downloadId}: ${cleanLine}`); }
          }
        });
        ytdlpProcess.on('close', (code, signal) => {
          logger.info(`Download ${downloadId} process closed with code ${code}, signal ${signal}`);
          if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
          if (progress.status === 'cancelled') { progress.speed = 0; progress.eta = null; progress.addLog('Download was cancelled by user'); logger.info(`Download ${downloadId} was cancelled by user`); }
          else if (progress.status === 'failed') { progress.speed = 0; progress.eta = null; progress.addLog(`Download failed: ${progress.error || 'Unknown error'}`); logger.error(`Download ${downloadId} failed: ${progress.error || 'Unknown error'}`); }
          else if (signal) { progress.status = 'failed'; progress.error = `Process terminated by signal: ${signal}`; progress.speed = 0; progress.eta = null; progress.addLog(`Process terminated by signal: ${signal}`); logger.error(`Download ${downloadId} terminated by signal: ${signal}`); }
          else if (code === 0) {
            progress.status = 'completed';
            progress.completedAt = new Date();
            progress.progress = 100;
            progress.speed = 0;
            progress.eta = null;
            if (progress.videoProgress) progress.videoProgress.progress = 100;
            if (progress.audioProgress) progress.audioProgress.progress = 100;
            progress.addLog('Download completed successfully');
            logger.info(`Download ${downloadId} completed successfully`);
          }
          else { progress.status = 'failed'; progress.error = `Download failed with exit code ${code}`; progress.speed = 0; progress.eta = null; progress.addLog(`Download failed with exit code ${code}`); logger.error(`Download ${downloadId} failed with exit code ${code}`); }
          try { broadcastUpdate(downloadId, progress.toDict()); } catch (e) { logger.warn(`Failed to broadcast final state for ${downloadId}: ${e.message}`); }
        });
  const timeout = setTimeout(() => {
          if (activeDownloads.has(downloadId)) {
            logger.warn(`Download ${downloadId} timeout, attempting to terminate process`);
            try { terminateProcess(ytdlpProcess); progress.status = 'failed'; progress.error = 'Download timeout'; progress.addLog('Download timeout - process terminated'); } catch (e) { logger.error(`Terminate timed out process ${downloadId} failed: ${e.message}`); }
          }
  }, MAX_DOWNLOAD_DURATION_MS);
        ytdlpProcess.on('close', () => clearTimeout(timeout));
        ytdlpProcess.on('error', () => clearTimeout(timeout));
      } catch (spawnError) {
        logger.error(`Failed to spawn download process for ${downloadId}: ${spawnError.message}`);
        progress.status = 'failed'; progress.error = `Failed to start download process: ${spawnError.message}`; progress.addLog(`SPAWN_ERROR: ${spawnError.message}`);
        if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
      }
    };

    process.nextTick(() => {
      try { runDownload(); }
      catch (runError) { logger.error(`Failed to run download ${downloadId}: ${runError.message}`); progress.status = 'failed'; progress.error = `Failed to execute download: ${runError.message}`; downloadProgress.delete(downloadId); }
    });

    res.json({ status: 'success', message: 'Download started successfully', download_id: downloadId });
  } catch (error) {
    logger.error(`Failed to start download: ${error.message}`);
    if (progress && downloadProgress.has(downloadId)) downloadProgress.delete(downloadId);
    if (activeDownloads.has(downloadId)) activeDownloads.delete(downloadId);
    res.status(500).json({ error: `Failed to start download: ${error.message}`, code: 'DOWNLOAD_START_FAILED', download_id: downloadId });
  }
});

router.get('/download/:downloadId/status', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  res.json(progress.toDict());
});

router.post('/download/:downloadId/cancel', async (req, res) => {
  const { downloadId } = req.params;
  if (!activeDownloads.has(downloadId)) return res.status(404).json({ error: 'Download not found' });
  const downloadInfo = activeDownloads.get(downloadId);
  const progress = downloadProgress.get(downloadId);
  if (['running', 'starting', 'paused'].includes(downloadInfo.status)) {
    try {
      downloadInfo.status = 'cancelled';
      if (progress) { progress.status = 'cancelled'; progress.addLog('Download cancelled by user'); progress.speed = 0; progress.eta = null; try { broadcastUpdate(downloadId, progress.toDict()); } catch {} }
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

router.post('/download/:downloadId/pause', (req, res) => {
  const { downloadId } = req.params;
  if (isWindows) return res.status(501).json({ error: 'Pause/Resume is not supported on Windows. Use cancel instead.', error_code: 'WINDOWS_UNSUPPORTED' });
  if (!activeDownloads.has(downloadId)) return res.status(404).json({ error: 'Download not found or process not started' });
  const downloadInfo = activeDownloads.get(downloadId);
  const progress = downloadProgress.get(downloadId);
  if (downloadInfo.status === 'running') {
    try { downloadInfo.process.kill('SIGSTOP'); downloadInfo.status = 'paused'; if (progress) { progress.status = 'paused'; try { broadcastUpdate(downloadId, progress.toDict()); } catch {} } logger.info(`Download ${downloadId} paused successfully`); res.json({ status: 'success', message: 'Download paused' }); }
    catch (error) { logger.error(`Failed to pause download ${downloadId}: ${error.message}`); res.status(500).json({ error: `Failed to pause download: ${error.message}` }); }
  } else {
    res.status(400).json({ error: `Download is not in a pausable state (status: ${downloadInfo.status})` });
  }
});

router.post('/download/:downloadId/resume', (req, res) => {
  const { downloadId } = req.params;
  if (isWindows) return res.status(501).json({ error: 'Pause/Resume is not supported on Windows. Use cancel instead.', error_code: 'WINDOWS_UNSUPPORTED' });
  if (!activeDownloads.has(downloadId)) return res.status(404).json({ error: 'Download not found or process not started' });
  const downloadInfo = activeDownloads.get(downloadId);
  const progress = downloadProgress.get(downloadId);
  if (downloadInfo.status === 'paused') {
    try { downloadInfo.process.kill('SIGCONT'); downloadInfo.status = 'running'; if (progress) { progress.status = 'running'; try { broadcastUpdate(downloadId, progress.toDict()); } catch {} } logger.info(`Download ${downloadId} resumed successfully`); res.json({ status: 'success', message: 'Download resumed' }); }
    catch (error) { logger.error(`Failed to resume download ${downloadId}: ${error.message}`); res.status(500).json({ error: `Failed to resume download: ${error.message}` }); }
  } else {
    res.status(400).json({ error: `Download is not paused (status: ${downloadInfo.status})` });
  }
});

router.get('/download/:downloadId/log', (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  res.json({ log: progress.log });
});

router.delete('/download/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  if (activeDownloads.has(downloadId)) {
    const downloadInfo = activeDownloads.get(downloadId);
    if (downloadInfo.status === 'running') {
      try { downloadInfo.process.kill('SIGTERM'); } catch (e) { logger.warn(`Failed to kill process for ${downloadId}: ${e.message}`); }
    }
    activeDownloads.delete(downloadId);
  }
  if (downloadProgress.has(downloadId)) downloadProgress.delete(downloadId);
  res.json({ status: 'success', message: 'Download removed' });
});

module.exports = router;
