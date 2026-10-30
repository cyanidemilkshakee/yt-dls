import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfigSection from './ConfigSection';
import { startDownload, startBatch } from '../../services/api';
vi.mock('../../services/api', () => ({ getSettings: vi.fn().mockResolvedValue({}), getSystemHealth: vi.fn().mockResolvedValue({ capabilities: { dangerous_options: false, custom_download_path: false } }), startDownload: vi.fn().mockResolvedValue({ id: 'job' }), startBatch: vi.fn().mockResolvedValue({ id: 'batch' }), previewCommand: vi.fn().mockResolvedValue({ command: 'preview' }) }));
const info = { title: 'Test video', suggested_filename: 'Test_video', original_url: 'https://example.com/video', best_video_ids: ['v'], best_audio_ids: ['a'], video_formats: [{ id: 'v', type: 'video', resolution: '1080p', ext: 'mp4', filesize: 100 }], audio_formats: [{ id: 'a', ext: 'm4a', filesize: 30 }], subtitles: [] };
beforeEach(() => vi.clearAllMocks());
it('keeps the same focused select across configuration updates', async () => {
  render(<ConfigSection info={info} onClose={() => {}} />);
  const user = userEvent.setup(), select = screen.getByRole('combobox', { name: 'Container' });
  await user.selectOptions(select, 'mp4'); expect(screen.getByRole('combobox', { name: 'Container' })).toBe(select); expect(document.activeElement).toBe(select);
});

it('configures batches with shared options and per-entry filename overrides', async () => {
  const entries = [{ url: 'https://example.com/one', title: 'One', playlist_index: 2 }, { url: 'https://example.com/two', title: 'Two', playlist_index: 5 }];
  render(<ConfigSection info={{ title: 'Playlist', _type: 'playlist', original_url: 'https://example.com/playlist' }} batchEntries={entries} onClose={() => {}} initialPreset="mp3" />);
  const user = userEvent.setup();
  await user.click(screen.getByText('Per-item filename templates (2)'));
  await user.type(screen.getByRole('textbox', { name: 'Filename for item 2' }), 'Second_%(id)s');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Audio format' }), 'alac');
  await user.click(screen.getByRole('checkbox', { name: 'Overwrite postprocessed files' }));
  await user.click(screen.getByRole('button', { name: 'Start batch' }));
  expect(startBatch).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ filename: 'Second_%(id)s' })]), expect.objectContaining({ audioFormat: 'alac', postOverwrites: true, overwrite: false }), expect.any(Object));
});

it('shows unknown size and disables individual selections for a custom format selector', async () => {
  render(<ConfigSection info={info} onClose={() => {}} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Custom format selector' }), 'best[[height<=720]');
  expect(screen.getByRole('radio', { name: 'Select video format v' }).matches(':disabled')).toBe(true);
  expect(screen.getByText('Unknown')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
  expect(startDownload.mock.calls.at(-1)[0].formatCode).toBe('best[height<=720]');
});

it('enabling subtitles chooses an available language and clearing languages disables dependent options', async () => {
  render(<ConfigSection info={{ ...info, subtitle_languages: ['en'] }} onClose={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Subtitles', exact: true }));
  await user.click(screen.getByRole('checkbox', { name: 'Download subtitles' }));
  expect(screen.getByRole('combobox', { name: 'Subtitle language' }).value).toBe('en');
  await user.click(screen.getByRole('checkbox', { name: 'Embed subtitles into file' }));
  await user.type(screen.getByRole('textbox', { name: 'Custom subtitle languages' }), 'ja');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Subtitle language' }), 'none');
  expect(screen.getByRole('textbox', { name: 'Custom subtitle languages' }).value).toBe('');
  await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
  expect(startDownload.mock.calls.at(-1)[0]).toMatchObject({ enableSubtitles: false, embedSubs: false, convertSubs: '' });
});

it('keeps live batch settings in the close callback and can restore the draft', async () => {
  const closed = vi.fn();
  const props = { info: { title: 'Playlist', entries: [], original_url: 'https://example.com/playlist' }, batchEntries: [{ title: 'One', url: 'https://example.com/one', playlist_index: 1 }], onClose: closed };
  const { unmount } = render(<ConfigSection {...props} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Container' }), 'mov');
  await user.click(screen.getByText('Per-item filename templates (1)'));
  await user.type(screen.getByRole('textbox', { name: 'Filename for item 1' }), 'One_%(id)s');
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  const draft = closed.mock.calls[0][0];
  unmount();
  render(<ConfigSection {...props} initialConfiguration={draft.configuration} initialEntryNames={draft.entryNames} />);
  expect(screen.getByRole('combobox', { name: 'Container' }).value).toBe('mov');
  await user.click(screen.getByText('Per-item filename templates (1)'));
  expect(screen.getByRole('textbox', { name: 'Filename for item 1' }).value).toBe('One_%(id)s');
});

it('ignores malformed stored presets and saves only portable output preferences', async () => {
  localStorage.setItem('yt-dls-output-presets', JSON.stringify([null, { name: 'Broken', configuration: { outputFormat: 'invalid', downloadMode: 'audio', audioFormat: 'vorbis' } }]));
  render(<ConfigSection info={info} onClose={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByText('Saved output presets'));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Saved preset' }), 'Broken');
  await user.click(screen.getByRole('button', { name: 'Apply saved preset' }));
  expect(screen.getByRole('combobox', { name: 'Container' }).value).toBe('default');
  expect(screen.getByRole('button', { name: 'Audio Only' }).getAttribute('aria-pressed')).toBe('true');
  await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Portable');
  await user.click(screen.getByRole('button', { name: 'Save preset' }));
  const saved = JSON.parse(localStorage.getItem('yt-dls-output-presets')).find(preset => preset.name === 'Portable').configuration;
  expect(saved).toMatchObject({ downloadMode: 'audio', extractAudio: true, audioFormat: 'vorbis' });
  expect(saved).not.toHaveProperty('filenameBase');
  expect(saved).not.toHaveProperty('selectedVideoIds');
  expect(saved).not.toHaveProperty('downloadPath');
  await user.click(screen.getByRole('button', { name: 'Delete preset' }));
  await waitFor(() => expect(screen.queryByRole('option', { name: 'Portable' })).toBeNull());
});

it('concatenates selected playlist indexes in one job', async () => {
  startDownload.mockClear();
  render(<ConfigSection info={{ title: 'Playlist', _type: 'playlist', original_url: 'https://example.com/playlist' }} batchEntries={[{ url: 'https://example.com/one', playlist_index: 2 }, { url: 'https://example.com/two', playlist_index: 5 }]} onClose={() => {}} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Playlist workflow' }), 'always');
  await user.click(screen.getByRole('button', { name: 'Concatenate selected items' }));
  expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/playlist', concatPlaylist: 'always', playlistItems: [2, 5] }), expect.any(Object));
});
it('audio-only mode always extracts audio and submits once', async () => {
  render(<ConfigSection info={info} onClose={() => {}} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Audio Only' })); await user.click(screen.getByRole('button', { name: 'Download', exact: true }));
  expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ downloadMode: 'audio', extractAudio: true }), expect.any(Object));
});
it('aborts a pending admission and ignores its late result after closing', async () => {
  let resolve;
  startDownload.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const started = vi.fn();
  const { unmount } = render(<ConfigSection info={info} onClose={() => {}} onDownloadStarted={started} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Download', exact: true }));
  const signal = startDownload.mock.calls.at(-1)[1].signal;
  expect(signal.aborted).toBe(false);
  unmount(); expect(signal.aborted).toBe(true);
  resolve({ id: 'late-job' }); await Promise.resolve();
  expect(started).not.toHaveBeenCalled();
});
