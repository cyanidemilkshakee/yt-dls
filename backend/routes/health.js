const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');
const { activeDownloads, sseClients } = require('../services/progressTracker');

const router = express.Router();

router.get('/health', async (req, res) => {
  const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');
  const YTDLP_CHECK_TIMEOUT_MS = Number(process.env.YTDLP_CHECK_TIMEOUT_MS || 10000);
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      platform: os.platform(),
      node_version: process.version,
  supports_pause_resume: os.platform() !== 'win32',
      yt_dlp_available: false,
      yt_dlp_version: null,
      download_dir: DOWNLOAD_DIR,
      download_dir_writable: false,
  active_downloads: activeDownloads.size || 0,
  sse_supported: true,
  sse_clients: sseClients.size || 0,
    };

    try {
      const ytdlpVersion = await new Promise((resolve, reject) => {
        const ytdlp = spawn('yt-dlp', ['--version'], { stdio: 'pipe' });
        let version = '';
        ytdlp.stdout.on('data', (d) => (version += d.toString().trim()));
        ytdlp.on('close', (code) => (code === 0 ? resolve(version) : reject(new Error(`yt-dlp not working (code ${code})`))));
        ytdlp.on('error', (err) => reject(new Error(`yt-dlp process error: ${err.message}`)));
        setTimeout(() => reject(new Error('yt-dlp check timeout')), YTDLP_CHECK_TIMEOUT_MS);
      });
      health.yt_dlp_available = true;
      health.yt_dlp_version = ytdlpVersion;
    } catch (error) {
      health.yt_dlp_error = error.message;
      logger.warn(`yt-dlp check failed: ${error.message}`);
    }

    try {
      await fs.access(DOWNLOAD_DIR, fs.constants.F_OK | fs.constants.W_OK);
      health.download_dir_writable = true;
    } catch (error) {
      health.download_dir_error = error.message;
      logger.warn(`Download directory check failed: ${error.message}`);
    }

    if (!health.yt_dlp_available) {
      health.status = 'degraded';
      health.status_reason = 'yt-dlp not available';
    } else if (!health.download_dir_writable) {
      health.status = 'degraded';
      health.status_reason = 'download directory not writable';
    }

    res.json(health);
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
    res.status(500).json({ status: 'error', timestamp: new Date().toISOString(), error: error.message });
  }
});

router.get('/list-impersonate-targets', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const p = require('child_process').spawn('yt-dlp', ['--list-impersonate-targets'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; let err = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('close', (code) => {
        if (code !== 0) return reject(new Error(err || `exit ${code}`));
        const items = out.trim().split('\n').filter((l) => l && !l.toLowerCase().startsWith('['));
        resolve({ items });
      });
      p.on('error', (e) => reject(e));
    });
    res.json(result);
  } catch (error) {
    logger.error(`Error listing impersonate targets: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

router.get('/list-ap-msos', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const p = require('child_process').spawn('yt-dlp', ['--ap-list-mso'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; let err = '';
      p.stdout.on('data', (d) => (out += d.toString()));
      p.stderr.on('data', (d) => (err += d.toString()));
      p.on('close', (code) => {
        if (code !== 0) return reject(new Error(err || `exit ${code}`));
        const items = out.trim().split('\n').filter((l) => l && !l.toLowerCase().startsWith('['));
        resolve({ items });
      });
      p.on('error', (e) => reject(e));
    });
    res.json(result);
  } catch (error) {
    logger.error(`Error listing AP MSOs: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
