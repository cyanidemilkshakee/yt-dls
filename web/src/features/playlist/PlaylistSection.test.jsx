import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaylistSection from './PlaylistSection';
it('selects duplicate media occurrences independently and displays unknown duration', async () => {
  const submit = vi.fn(); render(<PlaylistSection info={{ title: 'Playlist', entries: [{ id: 'same', url: 'a', title: 'First', duration: null }, { id: 'same', url: 'b', title: 'Second', duration: 62.9 }] }} onConfigureSelected={submit} />);
  const user = userEvent.setup(); await user.click(screen.getByRole('checkbox', { name: 'Select item 1: First' }));
  await user.click(screen.getByRole('button', { name: 'Download 1 selected' }));
  expect(submit.mock.calls[0][0].map(entry => entry.url)).toEqual(['b']); expect(screen.getByText('1:02')).toBeTruthy(); expect(screen.getByText('—')).toBeTruthy();
});
it('invalidates batch idempotency when the header selection changes', async () => {
  const changed = vi.fn();
  render(<PlaylistSection info={{ entries: [{ id: 'one', title: 'First' }] }} onConfigureSelected={vi.fn()} onSelectionChange={changed} />);
  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select all playlist items' }));
  expect(changed).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Download 0 selected' }).disabled).toBe(true);
});
it('keeps the selected preset when returning to playlist selection', async () => {
  const changed = vi.fn(), submit = vi.fn();
  render(<PlaylistSection info={{ entries: [{ id: 'one', title: 'One' }] }} initialPreset="mp3" onPresetChange={changed} onConfigureSelected={submit} />);
  const user = userEvent.setup();
  const preset = screen.getByRole('combobox', { name: 'Download preset' });
  expect(preset.value).toBe('mp3');
  await user.selectOptions(preset, 'mkv');
  await user.click(screen.getByRole('button', { name: 'Download 1 selected' }));
  expect(changed).toHaveBeenCalledWith('mkv');
  expect(submit.mock.calls.at(-1)[1]).toBe('mkv');
});
it('limits large playlists to a usable batch and lets users exchange selected items', async () => {
  const entries = Array.from({ length: 501 }, (_, index) => ({ id: String(index), title: `Item ${index + 1}` }));
  const submit = vi.fn();
  render(<PlaylistSection info={{ entries }} onConfigureSelected={submit} />);
  const user = userEvent.setup();
  expect(screen.getByRole('button', { name: 'Download 500 selected' }).disabled).toBe(false);
  for (let page = 0; page < 4; page++) await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  await user.click(screen.getByRole('checkbox', { name: 'Select item 500: Item 500' }));
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  await user.click(screen.getByRole('checkbox', { name: 'Select item 501: Item 501' }));
  await user.click(screen.getByRole('button', { name: 'Download 500 selected' }));
  const ids = submit.mock.calls.at(-1)[0].map(entry => entry.id);
  expect(ids).toHaveLength(500);
  expect(ids).toContain('500');
  expect(ids).not.toContain('499');
}, 15000);
