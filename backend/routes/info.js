const express = require('express');
const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { processInfoDict } = require('../services/infoProcessor');

const router = express.Router();

router.get('/info', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ error: 'URL parameter is required' });
  if (!/^https?:\/\//.test(videoUrl)) return res.status(400).json({ error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL' });

  try {
    const isPlaylistUrl = videoUrl.includes('list=') || videoUrl.includes('playlist');
    const opts = [
      '--quiet',
      '--no-warnings',
      '--skip-download',
      '--socket-timeout', '30',
      '--retries', '3',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      '--extractor-retries', '3',
      '--fragment-retries', '3',
    ];
    if (isPlaylistUrl) {
      logger.info(`Playlist URL detected: ${videoUrl}`);
      opts.push('--flat-playlist', '--dump-json');
    } else {
      logger.info(`Single video URL detected: ${videoUrl}`);
      opts.push('--dump-json');
    }
    opts.push(videoUrl);

    const p = spawn('yt-dlp', opts, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('close', (code) => {
      if (code !== 0) {
        logger.error(`yt-dlp error for URL ${videoUrl}: ${stderr}`);
        const errorMsg = (stderr || '').toLowerCase();
        if (errorMsg.includes('http error 403') || errorMsg.includes('forbidden')) return res.status(403).json({ error: 'Access forbidden - This content may be geo-blocked or require authentication. Try using a VPN or different video.', error_code: 'ACCESS_FORBIDDEN' });
        if (errorMsg.includes('not available') || errorMsg.includes('private') || errorMsg.includes('deleted')) return res.status(404).json({ error: 'This content is not available (private, deleted, or geo-blocked)', error_code: 'CONTENT_UNAVAILABLE' });
        if (errorMsg.includes('unsupported url')) return res.status(400).json({ error: 'This URL is not supported by the downloader', error_code: 'UNSUPPORTED_URL' });
        if (errorMsg.includes('fragment') && errorMsg.includes('not found')) return res.status(503).json({ error: 'YouTube is currently blocking requests. Please try again later or use a VPN.', error_code: 'YOUTUBE_BLOCKED' });
        return res.status(500).json({ error: `Could not process URL: ${(stderr || '').split('\n')[0]}`, error_code: 'PROCESSING_ERROR' });
      }
      try {
        const lines = stdout.trim().split('\n').filter((l) => l.trim());
        if (lines.length === 0) return res.status(400).json({ error: 'No information could be extracted from this URL' });
        if (isPlaylistUrl && lines.length > 1) {
          const playlistEntries = []; let playlistInfo = null;
          for (const line of lines) {
            try {
              const info = JSON.parse(line);
              if (info._type === 'playlist') playlistInfo = info;
              else {
                let entryUrl = info.url;
                if (!entryUrl && info.id) {
                  if (info.ie_key && info.ie_key.toLowerCase().includes('youtube')) entryUrl = `https://www.youtube.com/watch?v=${info.id}`;
                  else if (info.ie_key && info.ie_key.toLowerCase().includes('vimeo')) entryUrl = `https://vimeo.com/${info.id}`;
                  else entryUrl = `${videoUrl}#${info.id}`;
                }
                if (entryUrl) playlistEntries.push({ id: info.id || `entry_${playlistEntries.length}`, url: entryUrl, title: info.title || 'Untitled Video', duration: info.duration, thumbnail: info.thumbnail, uploader: info.uploader, view_count: info.view_count });
              }
            } catch { logger.warn(`Failed to parse line from yt-dlp playlist output`); }
          }
          if (playlistEntries.length > 0) return res.json({ _type: 'playlist', id: playlistInfo?.id || 'unknown', title: playlistInfo?.title || 'Untitled Playlist', uploader: playlistInfo?.uploader, description: playlistInfo?.description, entries: playlistEntries, entry_count: playlistEntries.length, original_url: videoUrl });
        }
        const info = JSON.parse(lines[0]);
        const processed = processInfoDict(info);
        logger.info(`Successfully processed info for: ${processed.title || 'Unknown'}`);
        res.json(processed);
      } catch (e) {
        logger.error(`Failed to parse yt-dlp output: ${e.message}`);
        res.status(500).json({ error: `Failed to parse video information: ${e.message}` });
      }
    });
    p.on('error', (error) => {
      logger.error(`Process error: ${error.message}`);
      if (error.code === 'ENOENT') return res.status(500).json({ error: 'yt-dlp is not installed or not in PATH' });
      res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    });
  } catch (error) {
    logger.error(`Unexpected error for URL ${videoUrl}: ${error.message}`);
    res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
  }
});

module.exports = router;
