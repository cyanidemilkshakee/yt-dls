const express = require('express');
const logger = require('../utils/logger');
const { config } = require('../config');
const { processInfoDict } = require('../services/infoProcessor');
const { runProcess } = require('../utils/processRunner');
const { validateMediaUrl, ValidationError } = require('../utils/validation');

const router = express.Router();
const INFO_CACHE_MAX = 50;
const INFO_CACHE_TTL = 10 * 60 * 1000;
const infoCache = new Map();

function cacheGet(url) {
  const entry = infoCache.get(url);
  if (!entry || entry.expiresAt <= Date.now()) {
    infoCache.delete(url);
    return null;
  }
  infoCache.delete(url);
  infoCache.set(url, entry);
  return entry.data;
}

function cacheSet(url, data) {
  if (infoCache.has(url)) infoCache.delete(url);
  while (infoCache.size >= INFO_CACHE_MAX) infoCache.delete(infoCache.keys().next().value);
  infoCache.set(url, { data, expiresAt: Date.now() + INFO_CACHE_TTL });
}

function playlistResult(info, originalUrl) {
  const entries = (info.entries || []).filter(Boolean).map((entry, index) => {
    const extractor = String(entry.ie_key || entry.extractor_key || '').toLowerCase();
    let url = entry.webpage_url || (/^https?:\/\//i.test(entry.url || '') ? entry.url : null);
    if (!url && entry.id && extractor.includes('youtube')) url = `https://www.youtube.com/watch?v=${entry.id}`;
    else if (!url && entry.id && extractor.includes('vimeo')) url = `https://vimeo.com/${entry.id}`;
    return {
      id: entry.id || `entry_${index}`,
      url,
      title: entry.title || 'Untitled Video',
      duration: entry.duration ?? null,
      thumbnail: entry.thumbnail || entry.thumbnails?.at?.(-1)?.url || null,
      uploader: entry.uploader || entry.channel || null,
      view_count: entry.view_count ?? null,
    };
  }).filter((entry) => entry.url);
  return {
    _type: 'playlist',
    id: info.id || 'unknown',
    title: info.title || 'Untitled Playlist',
    uploader: info.uploader || info.channel || null,
    description: info.description || null,
    entries,
    entry_count: entries.length,
    original_url: originalUrl,
  };
}

router.get('/info', async (req, res) => {
  let videoUrl;
  try { videoUrl = await validateMediaUrl(req.query.url); }
  catch (error) {
    const status = error instanceof ValidationError ? error.status : 400;
    return res.status(status).json({ error: error.message, error_code: error.code || 'INVALID_URL' });
  }

  const cached = cacheGet(videoUrl);
  if (cached) return res.json(cached);

  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(); });
  const args = [
    '--quiet', '--no-warnings', '--skip-download', '--flat-playlist', '--dump-single-json',
    '--socket-timeout', '30', '--retries', '3', '--extractor-retries', '3',
    '--fragment-retries', '3', videoUrl,
  ];

  try {
    const result = await runProcess(config.YTDLP_PATH, args, {
      timeoutMs: config.INFO_TIMEOUT_MS,
      maxOutputBytes: config.INFO_MAX_OUTPUT_BYTES,
      signal: controller.signal,
    });
    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      const lower = stderr.toLowerCase();
      let status = 502;
      let code = 'PROCESSING_ERROR';
      if (lower.includes('unsupported url')) { status = 400; code = 'UNSUPPORTED_URL'; }
      else if (lower.includes('private') || lower.includes('not available') || lower.includes('deleted')) { status = 404; code = 'CONTENT_UNAVAILABLE'; }
      else if (lower.includes('403') || lower.includes('forbidden')) { status = 403; code = 'ACCESS_FORBIDDEN'; }
      logger.warn(`yt-dlp metadata request failed for ${new URL(videoUrl).hostname}: ${stderr.split(/\r?\n/)[0] || `exit ${result.code}`}`);
      return res.status(status).json({ error: 'Could not retrieve media information.', error_code: code });
    }

    const info = JSON.parse(result.stdout);
    const processed = info._type === 'playlist' || Array.isArray(info.entries)
      ? playlistResult(info, videoUrl)
      : processInfoDict(info);
    cacheSet(videoUrl, processed);
    return res.json(processed);
  } catch (error) {
    if (error.code === 'PROCESS_ABORTED') return;
    logger.error(`Metadata request failed: ${error.message}`);
    const status = error.code === 'PROCESS_TIMEOUT' ? 504 : 502;
    return res.status(status).json({ error: error.code === 'PROCESS_TIMEOUT' ? 'Metadata request timed out.' : 'Could not process the media URL.', error_code: error.code || 'PROCESSING_ERROR' });
  }
});

module.exports = router;
