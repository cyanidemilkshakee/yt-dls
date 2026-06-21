const express = require('express');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');
const { config } = require('../config');
const { activeDownloads, sseClients } = require('../services/progressTracker');
const { runProcess } = require('../utils/processRunner');

const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    node_version: process.version,
    supports_pause_resume: os.platform() !== 'win32',
    yt_dlp_available: false,
    yt_dlp_version: null,
    download_dir: config.DOWNLOAD_DIR,
    download_dir_writable: false,
    active_downloads: activeDownloads.size,
    max_concurrent_downloads: config.MAX_CONCURRENT_DOWNLOADS,
    sse_supported: true,
    sse_clients: sseClients.size,
    capabilities: {
      custom_download_paths: config.ALLOW_CUSTOM_DOWNLOAD_PATH,
      dangerous_options: config.ALLOW_DANGEROUS_OPTIONS,
      private_urls: config.ALLOW_PRIVATE_URLS,
    },
  };

  try {
    const result = await runProcess(config.YTDLP_PATH, ['--version'], { timeoutMs: config.YTDLP_CHECK_TIMEOUT_MS, maxOutputBytes: 64 * 1024 });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `yt-dlp exited with code ${result.code}`);
    health.yt_dlp_available = true;
    health.yt_dlp_version = result.stdout.trim();
  } catch (error) {
    health.yt_dlp_error = error.message;
    logger.warn(`yt-dlp check failed: ${error.message}`);
  }

  try {
    await fs.promises.access(config.DOWNLOAD_DIR, fs.constants.F_OK | fs.constants.W_OK);
    health.download_dir_writable = true;
  } catch (error) {
    health.download_dir_error = error.message;
  }

  if (!health.yt_dlp_available || !health.download_dir_writable) {
    health.status = 'degraded';
    health.status_reason = !health.yt_dlp_available ? 'yt-dlp not available' : 'download directory not writable';
  }
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

async function listYtDlpValues(args, res, label, parseItems) {
  try {
    const result = await runProcess(config.YTDLP_PATH, args, { timeoutMs: config.YTDLP_CHECK_TIMEOUT_MS, maxOutputBytes: 512 * 1024 });
    if (result.code !== 0 && !result.stdout.trim()) throw new Error(result.stderr.trim() || `yt-dlp exited with code ${result.code}`);
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const items = parseItems(lines);
    res.json({ items });
  } catch (error) {
    logger.error(`Could not list ${label}: ${error.message}`);
    res.status(503).json({ error: `Could not list ${label}`, code: 'YTDLP_QUERY_FAILED' });
  }
}

router.get('/list-impersonate-targets', (req, res) => listYtDlpValues(
  ['--list-impersonate-targets'], res, 'impersonation targets',
  (lines) => lines.filter((line) => !line.startsWith('[') && !line.includes('unavailable') && !/^(Client|[-]+$)/i.test(line)).map((line) => line.split(/\s+/)[0])
));
router.get('/list-ap-msos', (req, res) => listYtDlpValues(
  ['--ap-list-mso'], res, 'TV providers',
  (lines) => lines.filter((line) => !/^(Supported TV Providers:|mso\s+mso name)$/i.test(line)).map((line) => line.split(/\s+/)[0])
));

module.exports = router;
