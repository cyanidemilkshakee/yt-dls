import { expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RetainedFiles from './RetainedFiles';
import { cleanRetainedFiles, getRetainedFiles } from '../../services/api';

vi.mock('../../services/api', () => ({ cleanRetainedFiles: vi.fn(), getRetainedFiles: vi.fn() }));

it('aborts cleanup on close and does not reload files after the panel is gone', async () => {
  getRetainedFiles.mockResolvedValue({ token: 'current-preview', total_bytes: 5, files: [{ name: 'video.mp4', size: 5 }] });
  let finish;
  cleanRetainedFiles.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const onRefetch = vi.fn(), user = userEvent.setup();
  const { unmount } = render(<RetainedFiles id="job" onRefetch={onRefetch} />);
  await screen.findByText('video.mp4 · 5 B');
  await user.click(screen.getByRole('checkbox', { name: 'Delete these files permanently' }));
  await user.click(screen.getByRole('button', { name: 'Delete previewed files' }));
  const signal = cleanRetainedFiles.mock.calls[0][2].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { finish({ deleted_files: 1 }); });
  expect(onRefetch).not.toHaveBeenCalled();
  expect(getRetainedFiles).toHaveBeenCalledTimes(1);
});
