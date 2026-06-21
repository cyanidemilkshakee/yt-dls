const test = require('node:test');
const assert = require('node:assert/strict');

const logger = require('../backend/utils/logger');
const {
  DownloadProgress,
  recalculateAggregate,
  markIncompleteStreams,
} = require('../backend/services/progressTracker');

test.after(() => logger.close());

test('tracks video and audio independently without reporting premature completion', () => {
  const progress = new DownloadProgress('separate-streams');
  Object.assign(progress.videoProgress, {
    status: 'completed',
    progress: 100,
    downloadedBytes: 100,
    totalBytes: 100,
  });

  recalculateAggregate(progress);
  assert.equal(progress.progress, 50);
  assert.equal(progress.videoProgress.status, 'completed');
  assert.equal(progress.audioProgress.status, 'waiting');

  Object.assign(progress.audioProgress, {
    status: 'downloading',
    progress: 50,
    downloadedBytes: 50,
    totalBytes: 100,
  });
  recalculateAggregate(progress);
  assert.equal(progress.progress, 75);
  assert.equal(progress.downloadedBytes, 150);
  assert.equal(progress.totalBytes, 200);
});

test('ignores streams that were not requested', () => {
  const progress = new DownloadProgress('video-only', { expectedVideo: true, expectedAudio: false });
  Object.assign(progress.videoProgress, {
    status: 'downloading',
    progress: 40,
    downloadedBytes: 40,
    totalBytes: 100,
  });

  recalculateAggregate(progress);
  assert.equal(progress.progress, 40);
  assert.equal(progress.audioProgress.status, 'not_requested');
  assert.equal(progress.toDict().audio_progress.expected, false);
});

test('terminal failures update only expected incomplete streams', () => {
  const progress = new DownloadProgress('audio-only', { expectedVideo: false, expectedAudio: true });
  markIncompleteStreams(progress, 'failed');

  assert.equal(progress.videoProgress.status, 'not_requested');
  assert.equal(progress.audioProgress.status, 'failed');
});

test('does not double-count byte totals for a combined media stream', () => {
  const progress = new DownloadProgress('combined');
  for (const stream of [progress.videoProgress, progress.audioProgress]) {
    Object.assign(stream, {
      combined: true,
      status: 'downloading',
      progress: 30,
      downloadedBytes: 30,
      totalBytes: 100,
    });
  }

  recalculateAggregate(progress);
  assert.equal(progress.progress, 30);
  assert.equal(progress.downloadedBytes, 30);
  assert.equal(progress.totalBytes, 100);
});
