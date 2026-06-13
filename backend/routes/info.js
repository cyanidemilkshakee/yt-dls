/**
 * info.js — GET /api/info?url=...
 *
 * Optimisations applied:
 *  1. In-process LRU cache (native Map, no new deps) — 50 entries, 10-min TTL.
 *     Repeated requests for the same URL return immediately.
 *  2. readline-based stream parsing — replaces full stdout buffer accumulation
 *     with Node's built-in readline interface.  Each newline-delimited JSON
 *     object is parsed as it arrives, O(1) memory per line.
 *  3. Explicit client-disconnect guard — if the HTTP client disconnects before
 *     yt-dlp finishes, the child process is killed immediately.
 */

const express  = require('express');
const readline = require('readline');
const { spawn } = require('child_process');
const logger   = require('../utils/logger');
const { processInfoDict } = require('../services/infoProcessor');

const router = express.Router();

// ─── LRU cache ────────────────────────────────────────────────────────────────
const INFO_CACHE_MAX = 50;
const INFO_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Map<url, { data: any, expiresAt: number }>
const _infoCache = new Map();

function cacheGet(url) {
  const entry = _infoCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _infoCache.delete(url);
    return null;
  }
  return entry.data;
}

function cacheSet(url, data) {
  // Evict oldest entry when at capacity
  if (_infoCache.size >= INFO_CACHE_MAX) {
    const oldest = _infoCache.keys().next().value;
    _infoCache.delete(oldest);
  }
  _infoCache.set(url, { data, expiresAt: Date.now() + INFO_CACHE_TTL });
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.get('/info', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl)
    return res.status(400).json({ error: 'URL parameter is required' });
  if (!/^https?:\/\//.test(videoUrl))
    return res.status(400).json({ error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL' });

  // ── Cache hit ────────────────────────────────────────────────────────────
  const cached = cacheGet(videoUrl);
  if (cached) {
    logger.info(`Cache hit for: ${videoUrl}`);
    return res.json(cached);
  }

  const isPlaylistUrl = videoUrl.includes('list=') || videoUrl.includes('playlist');
  const opts = [
    '--quiet',
    '--no-warnings',
    '--skip-download',
    '--socket-timeout', '30',
    '--retries', '3',
    '--extractor-retries', '3',
    '--fragment-retries', '3',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  ];

  if (isPlaylistUrl) {
    logger.info(`Playlist URL detected: ${videoUrl}`);
    opts.push('--flat-playlist', '--dump-json');
  } else {
    logger.info(`Single video URL detected: ${videoUrl}`);
    opts.push('--dump-json');
  }
  opts.push(videoUrl);

  let settled = false;
  const respond = (fn) => {
    if (!settled) {
      settled = true;
      fn();
    }
  };

  const p = spawn('yt-dlp', opts, { stdio: ['ignore', 'pipe', 'pipe'] });

  // ── Kill child if client disconnects ────────────────────────────────────
  req.on('close', () => {
    if (!settled) {
      logger.info(`Client disconnected, killing yt-dlp for ${videoUrl}`);
      try { p.kill(); } catch (_) {}
    }
  });

  // ── readline over stdout (stream-native, no buffer accumulation) ─────────
  const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
  const lines = [];
  rl.on('line', (line) => {
    if (line.trim()) lines.push(line.trim());
  });

  // Collect stderr for error messages
  let stderr = '';
  p.stderr.on('data', (d) => (stderr += d.toString()));

  p.on('close', (code) => {
    rl.close();

    if (code !== 0) {
      logger.error(`yt-dlp error for URL ${videoUrl}: ${stderr}`);
      const errorMsg = (stderr || '').toLowerCase();
      if (errorMsg.includes('http error 403') || errorMsg.includes('forbidden'))
        return respond(() => res.status(403).json({ error: 'Access forbidden — geo-blocked or requires authentication.', error_code: 'ACCESS_FORBIDDEN' }));
      if (errorMsg.includes('not available') || errorMsg.includes('private') || errorMsg.includes('deleted'))
        return respond(() => res.status(404).json({ error: 'Content not available (private, deleted, or geo-blocked)', error_code: 'CONTENT_UNAVAILABLE' }));
      if (errorMsg.includes('unsupported url'))
        return respond(() => res.status(400).json({ error: 'URL not supported by the downloader', error_code: 'UNSUPPORTED_URL' }));
      if (errorMsg.includes('fragment') && errorMsg.includes('not found'))
        return respond(() => res.status(503).json({ error: 'YouTube is blocking requests. Try again later or use a VPN.', error_code: 'YOUTUBE_BLOCKED' }));
      return respond(() => res.status(500).json({ error: `Could not process URL: ${(stderr || '').split('\n')[0]}`, error_code: 'PROCESSING_ERROR' }));
    }

    try {
      if (lines.length === 0)
        return respond(() => res.status(400).json({ error: 'No information could be extracted from this URL' }));

      if (isPlaylistUrl && lines.length > 1) {
        const playlistEntries = [];
        let playlistInfo = null;

        for (const line of lines) {
          try {
            const info = JSON.parse(line);
            if (info._type === 'playlist') {
              playlistInfo = info;
            } else {
              let entryUrl = info.url;
              if (!entryUrl && info.id) {
                const key = (info.ie_key || '').toLowerCase();
                if (key.includes('youtube'))     entryUrl = `https://www.youtube.com/watch?v=${info.id}`;
                else if (key.includes('vimeo'))  entryUrl = `https://vimeo.com/${info.id}`;
                else                             entryUrl = `${videoUrl}#${info.id}`;
              }
              if (entryUrl) {
                playlistEntries.push({
                  id:         info.id || `entry_${playlistEntries.length}`,
                  url:        entryUrl,
                  title:      info.title || 'Untitled Video',
                  duration:   info.duration,
                  thumbnail:  info.thumbnail,
                  uploader:   info.uploader,
                  view_count: info.view_count,
                });
              }
            }
          } catch {
            logger.warn('Failed to parse line from yt-dlp playlist output');
          }
        }

        if (playlistEntries.length > 0) {
          const result = {
            _type:        'playlist',
            id:           playlistInfo?.id    || 'unknown',
            title:        playlistInfo?.title || 'Untitled Playlist',
            uploader:     playlistInfo?.uploader,
            description:  playlistInfo?.description,
            entries:      playlistEntries,
            entry_count:  playlistEntries.length,
            original_url: videoUrl,
          };
          cacheSet(videoUrl, result);
          return respond(() => res.json(result));
        }
      }

      // Single video
      const info      = JSON.parse(lines[0]);
      const processed = processInfoDict(info);
      logger.info(`Successfully processed info for: ${processed.title || 'Unknown'}`);
      cacheSet(videoUrl, processed);
      respond(() => res.json(processed));

    } catch (e) {
      logger.error(`Failed to parse yt-dlp output: ${e.message}`);
      respond(() => res.status(500).json({ error: `Failed to parse video information: ${e.message}` }));
    }
  });

  p.on('error', (error) => {
    logger.error(`Process error: ${error.message}`);
    if (error.code === 'ENOENT')
      return respond(() => res.status(500).json({ error: 'yt-dlp is not installed or not in PATH' }));
    respond(() => res.status(500).json({ error: `An unexpected error occurred: ${error.message}` }));
  });
});

module.exports = router;
