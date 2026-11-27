import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home';
import { fetchVideoInfo, startBatch } from '../services/api';

vi.mock('../services/api', () => ({
  fetchVideoInfo: vi.fn(), getSettings: vi.fn().mockResolvedValue({}),
  getSystemHealth: vi.fn().mockResolvedValue({ capabilities: { dangerous_options: false, custom_download_path: false } }),
  startBatch: vi.fn().mockResolvedValue({ id: 'batch' }), startDownload: vi.fn().mockResolvedValue({ id: 'job' }),
  previewCommand: vi.fn().mockResolvedValue({ command: 'preview' }),
}));
vi.mock('../features/downloads/DownloadsSection', () => ({ default: () => <section>Download list</section> }));
vi.mock('../components/HealthDiagnostics', () => ({ default: () => <section>Diagnostics ready</section> }));
beforeEach(() => vi.clearAllMocks());

it('renders system diagnostics without a missing loading-state variable', async () => {
  render(<Home />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'System Health' }));
  expect(screen.getByText('Diagnostics ready')).toBeTruthy();
});

it('preserves a playlist preset, shared settings and each occurrence filename across reconfiguration', async () => {
  fetchVideoInfo.mockResolvedValue({ _type: 'playlist', title: 'Playlist', original_url: 'https://example.com/playlist', entries: [
    { id: 'same', title: 'First', url: 'https://example.com/one', playlist_index: 2 },
    { id: 'same', title: 'Second', url: 'https://example.com/two', playlist_index: 5 },
  ] });
  render(<Home />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Video or playlist URL' }), 'https://example.com/playlist');
  await user.click(screen.getByRole('button', { name: 'Fetch video info' }));
  const configure = await screen.findByRole('button', { name: 'Download 2 selected' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Download preset' }), 'mp3');
  await user.click(configure);
  const audio = await screen.findByRole('combobox', { name: 'Audio format' });
  await user.selectOptions(audio, 'aac');
  await user.click(screen.getByText('Per-item filename templates (2)'));
  await user.type(screen.getByRole('textbox', { name: 'Filename for item 2' }), 'Second_%(id)s');
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await screen.findByRole('button', { name: 'Download 2 selected' });
  expect(screen.getByRole('combobox', { name: 'Download preset' }).value).toBe('mp3');
  await user.click(screen.getByRole('checkbox', { name: 'Select item 1: First' }));
  await user.click(screen.getByRole('button', { name: 'Download 1 selected' }));
  expect((await screen.findByRole('combobox', { name: 'Audio format' })).value).toBe('aac');
  await user.click(screen.getByText('Per-item filename templates (1)'));
  expect(screen.getByRole('textbox', { name: 'Filename for item 1' }).value).toBe('Second_%(id)s');
  await user.click(screen.getByRole('button', { name: 'Start batch' }));
  await waitFor(() => expect(startBatch).toHaveBeenCalledOnce());
  expect(startBatch.mock.calls[0][0]).toEqual([expect.objectContaining({ url: 'https://example.com/two', filename: 'Second_%(id)s' })]);
  expect(startBatch.mock.calls[0][1]).toMatchObject({ downloadMode: 'audio', audioFormat: 'aac' });
  await screen.findByText('Download list');
}, 15000);
