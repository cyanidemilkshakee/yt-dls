import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadItem from './DownloadItem';
vi.mock('../../services/api', () => ({ cancelDownload: vi.fn().mockRejectedValue(new Error('Cancel failed')), removeDownload: vi.fn(), getDownloadLog: vi.fn().mockResolvedValue({ log: [] }), retryDownload: vi.fn(), resultFileURL: () => '/api/download/id/file/0' }));
it('reports a failed cancel and exposes progress to assistive technology', async () => {
  render(<DownloadItem download={{ id: 'id', status: 'downloading', filename: 'video.mp4', progress: 42 }} onRefetch={vi.fn()} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Cancel failed'); expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
});
