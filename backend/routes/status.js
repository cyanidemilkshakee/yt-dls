/**
 * status.js — GET /api/downloads
 *
 * Fix: previously only read from activeDownloads, so any download that finished
 * (and was removed from activeDownloads) silently disappeared from the list.
 * Now merges both activeDownloads and downloadProgress maps so completed,
 * failed, and cancelled downloads remain visible until cleaned up.
 */

const express = require('express');
const { activeDownloads, downloadProgress } = require('../services/progressTracker');

const router = express.Router();

router.get('/downloads', (req, res) => {
  // Start with every download we have progress data for (active + recently finished)
  const seen      = new Set();
  const downloads = [];

  // Merge: downloadProgress is the authoritative set
  for (const [downloadId, progress] of downloadProgress.entries()) {
    seen.add(downloadId);
    const activeInfo  = activeDownloads.get(downloadId);
    const downloadData = progress.toDict();

    // Supplement with process-level metadata when available
    if (activeInfo) {
      downloadData.url     = activeInfo.url;
    }

    downloads.push(downloadData);
  }

  // Safety net: include activeDownloads entries with no matching progress record
  for (const [downloadId, info] of activeDownloads.entries()) {
    if (seen.has(downloadId)) continue;
    downloads.push({
      download_id: downloadId,
      url:         info.url,
      status:      info.status,
      started_at:  info.started_at,
      error:       info.error || null,
    });
  }

  // Sort newest first
  downloads.sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  });

  res.json({ downloads, total: downloads.length });
});

module.exports = router;
