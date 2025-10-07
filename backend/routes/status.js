const express = require('express');
const { activeDownloads, downloadProgress } = require('../services/progressTracker');

const router = express.Router();

router.get('/downloads', (req, res) => {
  const downloads = [];
  for (const [downloadId, info] of activeDownloads.entries()) {
    const progress = downloadProgress.get(downloadId);
    const downloadData = { download_id: downloadId, url: info.url, status: info.status, started_at: info.started_at, command: info.command, error: info.error };
    if (progress) Object.assign(downloadData, progress.toDict());
    downloads.push(downloadData);
  }
  res.json({ downloads, total: downloads.length });
});

module.exports = router;
