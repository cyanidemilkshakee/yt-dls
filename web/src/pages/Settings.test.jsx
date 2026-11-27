import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Settings from './Settings';
import { getSettings, getSystemHealth, saveSettings } from '../services/api';

vi.mock('../services/api', () => ({ getSettings: vi.fn(), getSystemHealth: vi.fn(), saveSettings: vi.fn() }));

it('waits for saved settings and server policy before allowing edits', async () => {
  getSettings.mockResolvedValue({ impersonate: 'chrome-110', password: 'session-secret' });
  let ready;
  getSystemHealth.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
  render(<Settings />);
  expect(screen.getByLabelText('Impersonate Client', { exact: true }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Save All Settings' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Loading settings');
  await act(async () => { ready({ capabilities: { dangerous_options: false, network_guard: true } }); });
  expect(screen.getByLabelText('Impersonate Client', { exact: true }).value).toBe('chrome-110');
  expect(screen.getByLabelText('Password', { exact: true }).value).toBe('session-secret');
  expect(screen.getByRole('button', { name: 'Save All Settings' }).matches(':disabled')).toBe(false);
  expect(screen.getByRole('checkbox', { name: 'Use .netrc', exact: true }).matches(':disabled')).toBe(true);
});

it('loads and preserves saved preferences when server policy is unavailable', async () => {
  getSettings.mockResolvedValue({ impersonate: 'chrome-110', proxy: 'http://user:pass@localhost:8080' });
  getSystemHealth.mockRejectedValue(new Error('server unavailable'));
  render(<Settings />);

  await waitFor(() => expect(screen.getByLabelText('Impersonate Client', { exact: true }).value).toBe('chrome-110'));
  expect(screen.getByLabelText('Proxy URL', { exact: true }).value).toBe('http://user:pass@localhost:8080');
  expect(screen.getByLabelText('Proxy URL', { exact: true }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Could not load server policy');

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save All Settings' })); });
  expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
    impersonate: 'chrome-110',
    proxy: 'http://user:pass@localhost:8080'
  }), undefined);
});

it('keeps saving disabled when saved preferences could not be loaded', async () => {
  getSettings.mockRejectedValue(new Error('storage unavailable'));
  getSystemHealth.mockResolvedValue({ capabilities: { dangerous_options: false, network_guard: true } });
  render(<Settings />);

  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not load saved settings'));
  expect(screen.getByRole('button', { name: 'Save All Settings' }).matches(':disabled')).toBe(true);
});
