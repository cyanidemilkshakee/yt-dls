const logger = require('../utils/logger');

// Global storages
const activeDownloads = new Map();
const downloadProgress = new Map();
const sseClients = new Set();

class DownloadProgress {
  constructor(downloadId) {
    this.downloadId = downloadId;
    this.status = 'initializing';
    this.progress = 0.0;
    this.speed = 0;
    this.eta = null;
    this.downloadedBytes = 0;
    this.totalBytes = 0;
    this.filename = null;
    this.error = null;
    this.startedAt = new Date();
    this.completedAt = null;
    this.log = [];
    this.videoProgress = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
    this.audioProgress = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
  }

  toDict() {
    // Ensure progress is a valid number between 0 and 100
    const getValidProgress = (value) => {
      if (value === null || value === undefined || isNaN(value)) return 0;
      return Math.max(0, Math.min(100, Number(value)));
    };

    return {
      download_id: this.downloadId,
      status: this.status,
      progress: getValidProgress(this.progress),
      speed: this.speed || 0,
      eta: this.eta,
      downloaded_bytes: this.downloadedBytes || 0,
      total_bytes: this.totalBytes || 0,
      filename: this.filename,
      error: this.error,
      started_at: this.startedAt?.toISOString(),
      completed_at: this.completedAt?.toISOString(),
      video_progress: {
        ...this.videoProgress,
        progress: getValidProgress(this.videoProgress.progress)
      },
      audio_progress: {
        ...this.audioProgress,
        progress: getValidProgress(this.audioProgress.progress)
      },
    };
  }

  addLog(message) {
    this.log.push(message);
    if (this.log.length > 500) this.log.shift();
  }
}

function broadcastUpdate(downloadId, progressData) {
  const message = JSON.stringify({ type: 'progress', downloadId, data: progressData });
  sseClients.forEach((client) => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  });
}

function cleanupOldDownloads() {
  const currentTime = new Date();
  const toRemove = [];
  for (const [downloadId, info] of activeDownloads.entries()) {
    try {
      const startedAt = new Date(info.started_at);
      if (currentTime - startedAt > 86400000) toRemove.push(downloadId);
    } catch {
      toRemove.push(downloadId);
    }
  }
  for (const id of toRemove) {
    activeDownloads.delete(id);
    downloadProgress.delete(id);
  }
  if (toRemove.length > 0) logger.info(`Cleaned up ${toRemove.length} old download records`);
}

module.exports = {
  activeDownloads,
  downloadProgress,
  sseClients,
  DownloadProgress,
  broadcastUpdate,
  cleanupOldDownloads,
};
