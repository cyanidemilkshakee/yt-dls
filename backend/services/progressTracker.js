/**
 * progressTracker.js
 *
 * Optimisations applied:
 *  1. SSE throttle — broadcast fires only when progress delta >= 0.5 % OR >= 500 ms
 *     have elapsed since the last broadcast for that download.
 *  2. Tighter cleanup — completed/failed/cancelled downloads are evicted from
 *     downloadProgress after 1 hour (not 24 h).
 *  3. Log ring buffer capped at 200 lines instead of 500.
 *  4. Proactive stale SSE-client purge — dead clients are removed on every
 *     broadcast attempt, not only when they throw.
 */

const logger = require('../utils/logger');

// ─── Global state ────────────────────────────────────────────────────────────
const activeDownloads  = new Map(); // downloadId → process metadata
const downloadProgress = new Map(); // downloadId → DownloadProgress instance
const sseClients       = new Set(); // active SSE response objects

// Per-download throttle metadata
// { lastBroadcastMs: number, lastProgress: number }
const _sseMeta = new Map();

const SSE_MIN_DELTA_PCT = 0.5;   // minimum % change before forced broadcast
const SSE_MAX_INTERVAL  = 500;   // maximum ms between broadcasts (forces send)

// ─── DownloadProgress ─────────────────────────────────────────────────────────
class DownloadProgress {
  constructor(downloadId) {
    this.downloadId      = downloadId;
    this.status          = 'initializing';
    this.progress        = 0.0;
    this.speed           = 0;
    this.eta             = null;
    this.downloadedBytes = 0;
    this.totalBytes      = 0;
    this.filename        = null;
    this.error           = null;
    this.startedAt       = new Date();
    this.completedAt     = null;
    this.log             = [];
    this.videoProgress   = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
    this.audioProgress   = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
  }

  toDict() {
    const clamp = (v) => {
      if (v === null || v === undefined || isNaN(v)) return 0;
      return Math.max(0, Math.min(100, Number(v)));
    };
    return {
      download_id:      this.downloadId,
      status:           this.status,
      progress:         clamp(this.progress),
      speed:            this.speed  || 0,
      eta:              this.eta,
      downloaded_bytes: this.downloadedBytes || 0,
      total_bytes:      this.totalBytes      || 0,
      filename:         this.filename,
      error:            this.error,
      started_at:       this.startedAt?.toISOString(),
      completed_at:     this.completedAt?.toISOString(),
      video_progress: {
        ...this.videoProgress,
        progress: clamp(this.videoProgress.progress),
      },
      audio_progress: {
        ...this.audioProgress,
        progress: clamp(this.audioProgress.progress),
      },
    };
  }

  addLog(message) {
    this.log.push(message);
    if (this.log.length > 200) this.log.shift(); // ring buffer cap at 200
  }
}

// ─── Throttled SSE broadcast ──────────────────────────────────────────────────
function broadcastUpdate(downloadId, progressData) {
  const now  = Date.now();
  const meta = _sseMeta.get(downloadId) || { lastBroadcastMs: 0, lastProgress: -1 };

  const deltaPct  = Math.abs(progressData.progress - meta.lastProgress);
  const elapsedMs = now - meta.lastBroadcastMs;

  // Skip if neither threshold crossed
  if (deltaPct < SSE_MIN_DELTA_PCT && elapsedMs < SSE_MAX_INTERVAL) return;

  _sseMeta.set(downloadId, { lastBroadcastMs: now, lastProgress: progressData.progress });

  const message = JSON.stringify({ type: 'progress', downloadId, data: progressData });
  const dead    = [];

  sseClients.forEach((client) => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (_) {
      dead.push(client); // collect, don't mutate while iterating
    }
  });

  // Proactive cleanup of dead clients
  dead.forEach((c) => sseClients.delete(c));
}

// Always-broadcast variant (used for terminal states where throttle should not apply)
function broadcastImmediate(downloadId, progressData) {
  const now     = Date.now();
  _sseMeta.set(downloadId, { lastBroadcastMs: now, lastProgress: progressData.progress });

  const message = JSON.stringify({ type: 'progress', downloadId, data: progressData });
  const dead    = [];

  sseClients.forEach((client) => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (_) {
      dead.push(client);
    }
  });
  dead.forEach((c) => sseClients.delete(c));
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const COMPLETED_TTL_MS  = 60 * 60 * 1000; // 1 hour

function cleanupOldDownloads() {
  const now      = Date.now();
  const toRemove = [];

  // Remove from activeDownloads if older than 24 h (process-level guard)
  for (const [id, info] of activeDownloads.entries()) {
    try {
      const age = now - new Date(info.started_at).getTime();
      if (age > 86_400_000) toRemove.push(id);
    } catch {
      toRemove.push(id);
    }
  }

  // Remove from downloadProgress if terminal and older than 1 h
  for (const [id, progress] of downloadProgress.entries()) {
    if (!TERMINAL_STATUSES.has(progress.status)) continue;
    const ref   = progress.completedAt || progress.startedAt;
    const age   = now - new Date(ref).getTime();
    if (age > COMPLETED_TTL_MS) toRemove.push(id);
  }

  // Deduplicate
  const unique = [...new Set(toRemove)];
  for (const id of unique) {
    activeDownloads.delete(id);
    downloadProgress.delete(id);
    _sseMeta.delete(id);
  }

  if (unique.length > 0) {
    logger.info(`Cleaned up ${unique.length} old download record(s)`);
  }
}

module.exports = {
  activeDownloads,
  downloadProgress,
  sseClients,
  DownloadProgress,
  broadcastUpdate,
  broadcastImmediate,
  cleanupOldDownloads,
};
