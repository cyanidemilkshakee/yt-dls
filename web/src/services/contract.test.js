import { expect, it } from 'vitest';
import schema from '../../../api/contract.json';
import { assertContract } from './contract';
import { DEFAULT_SETTINGS } from './settings';
import { buildOptions, createConfiguration } from '../features/config/model';

it('matches all advanced setting fields and validates representative frontend requests', () => {
  expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(Object.keys(schema.$defs.AdvancedSettings.properties).sort());
  const info = { original_url: 'https://example.com/video' };
  const options = buildOptions(info, { ...createConfiguration(info), remuxCheck: true, remuxFormat: 'alac', subtitleFormat: 'lrc', audioQuality: '10' });
  expect(assertContract('DownloadOptions', options)).toBe(options);
  expect(() => assertContract('DownloadOptions', { ...options, typo: true })).toThrow('unknown');
  expect(() => assertContract('DownloadOptions', { ...options, audioFormat: 'invalid' })).toThrow('unsupported');
  expect(() => assertContract('DownloadOptions', { ...options, playlistItems: [1, 1] })).toThrow('invalid items');
});
it('enforces backend byte limits and handles optional batch source fields', () => {
  const request = { entries: [{ url: 'https://example.com/video', filename: '%(title)s_%(id)s' }], options: { downloadMode: 'both' } };
  expect(assertContract('BatchRequest', request)).toBe(request);
  expect(() => assertContract('InfoRequest', { url: 'https://example.com', advancedSettings: { password: '😀'.repeat(251) } })).toThrow('length');
  expect(() => assertContract('DownloadOptions', { url: 'https://example.com', downloadMode: 'both', filename: 'x'.repeat(201) })).toThrow('long');
  expect(() => assertContract('CleanupRequest', { token: 'short' })).toThrow('length');
  expect(() => assertContract('InfoRequest', JSON.parse('{"url":"https://example.com","__proto__":{}}'))).toThrow('unknown');
});
