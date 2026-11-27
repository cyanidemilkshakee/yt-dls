import { expect, it, vi } from 'vitest';
import { apiRequest, batchStatus, fetchVideoInfo, getAllDownloads, getSettings, saveSettings, startDownload } from './api';
import { unpackSettings, validateSettings } from './settings';

const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
it('sends inspection settings and cancels using the current caller signature', async () => {
  const fetch = vi.fn((_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  const request = fetchVideoInfo('https://example.com/video', { 'socket-timeout': 30 }, { signal: controller.signal });
  expect(fetch.mock.calls[0][0]).toBe('/api/info');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ url: 'https://example.com/video', advancedSettings: { 'socket-timeout': 30 } });
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('polls all IDs using bounded batches instead of truncating at 50', async () => {
  const fetch = vi.fn(url => { const ids = new URL(url, 'http://localhost').searchParams.get('ids').split(','); return Promise.resolve(response(Object.fromEntries(ids.map(id => [id, { download_id: id }])))); });
  vi.stubGlobal('fetch', fetch);
  const statuses = await batchStatus(Array.from({ length: 121 }, (_, index) => `id-${index}`));
  expect(statuses.size).toBe(121); expect(fetch).toHaveBeenCalledTimes(3);
});
it('reads every history page', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ downloads: [{ download_id: 'a' }], total: 2, next_offset: 1 })).mockResolvedValueOnce(response({ downloads: [{ download_id: 'b' }], total: 2, next_offset: 2 }));
  vi.stubGlobal('fetch', fetch); expect((await getAllDownloads()).downloads.map(item => item.download_id)).toEqual(['a', 'b']);
});
it('cancels an in-flight fetch using the caller signal', async () => {
  vi.stubGlobal('fetch', vi.fn((_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
  const controller = new AbortController(), request = apiRequest('/downloads', { signal: controller.signal }); controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
});
it('validates saved JSON shapes, conflicts, and numeric ranges', async () => {
  for (const value of [null, [], 1, 'string']) expect(unpackSettings(value)).toEqual({});
  localStorage.setItem('yt-dls-advanced-settings', 'null'); expect(await getSettings()).toEqual({});
  expect(() => validateSettings({ 'socket-timeout': 0 })).toThrow();
  expect(() => validateSettings({ 'force-ipv4': true, 'force-ipv6': true })).toThrow();
  expect(() => validateSettings({ exec: 'echo hi' }, { capabilities: { dangerous_options: false } })).toThrow();
  expect(() => validateSettings({ password: '😀'.repeat(251) })).toThrow();
});
it('migrates old credentials to session storage and writes versioned settings', async () => {
  localStorage.setItem('yt-dls-advanced-settings', JSON.stringify({ password: 'old-secret', username: 'user' }));
  expect(await getSettings()).toMatchObject({ password: 'old-secret', username: 'user' });
  expect(localStorage.getItem('yt-dls-advanced-settings')).not.toContain('old-secret');
  await saveSettings({ password: 'new-secret', 'socket-timeout': '30' });
  expect(JSON.parse(localStorage.getItem('yt-dls-advanced-settings'))).toEqual({ schema: 1, settings: { 'socket-timeout': 30 } });
  expect(await getSettings()).toMatchObject({ password: 'new-secret' });
});
it('preserves the idempotency key supplied for an uncertain admission', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ id: 'same-job' })); vi.stubGlobal('fetch', fetch);
  await startDownload({ url: 'https://example.com' }, { idempotencyKey: 'stable-key' });
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-key');
});
