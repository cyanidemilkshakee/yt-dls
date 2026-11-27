import { expect, it } from 'vitest';
import { formatDuration, mergeDownloads } from './model';
it('older responses never overwrite newer progress', () => {
  expect(mergeDownloads([{ id: 'job', version: 4, status: 'completed' }], [{ download_id: 'job', version: 3, status: 'downloading' }], true)[0].status).toBe('completed');
});
it('normalizes unknown and fractional durations', () => {
  expect(formatDuration(null)).toBe('—'); expect(formatDuration(NaN)).toBe('—'); expect(formatDuration(62.9)).toBe('1:02'); expect(formatDuration(3600)).toBe('1:00:00');
});
it('clears omitted fields in a newer authoritative snapshot', () => {
  const items = mergeDownloads([{ id: 'job', version: 4, status: 'completed', files: [{ index: 0, name: 'old.mp4' }] }], [{ download_id: 'job', version: 5, status: 'completed' }]);
  expect(items[0].files).toBeUndefined();
});
