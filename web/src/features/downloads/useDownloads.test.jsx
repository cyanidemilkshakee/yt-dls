import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDownloads } from './useDownloads';
import { getAllDownloads, batchStatus, openDownloadEvents } from '../../services/api';
vi.mock('../../services/api', () => ({ getAllDownloads: vi.fn(), batchStatus: vi.fn(), openDownloadEvents: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it('serializes refreshes and aborts work after unmount', async () => {
  let resolve;
  getAllDownloads.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ downloads: [] });
  batchStatus.mockResolvedValue(new Map());
  const hook = renderHook(() => useDownloads());
  act(() => { hook.result.current.refetch(); });
  expect(getAllDownloads).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ downloads: [{ download_id: 'job', status: 'downloading', version: 1 }] }));
  await waitFor(() => expect(getAllDownloads).toHaveBeenCalledTimes(2));
  const signal = getAllDownloads.mock.calls[1][0].signal;
  hook.unmount(); expect(signal.aborted).toBe(true);
});

it('merges live events by version, preserves in-flight updates, and closes the stream', async () => {
  vi.stubGlobal('EventSource', class {});
  let resolve, events;
  const close = vi.fn();
  openDownloadEvents.mockImplementation(handlers => { events = handlers; return { close }; });
  getAllDownloads.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ downloads: [] });
  const hook = renderHook(() => useDownloads());
  act(() => events.onEvent({ type: 'progress', data: { download_id: 'new', status: 'downloading', version: 3, progress: 30 } }));
  await act(async () => resolve({ downloads: [] }));
  expect(hook.result.current.downloads[0].progress).toBe(30);
  act(() => events.onEvent({ type: 'progress', data: { download_id: 'new', status: 'downloading', version: 2, progress: 10 } }));
  expect(hook.result.current.downloads[0].progress).toBe(30);
  act(() => events.onOpen());
  await waitFor(() => expect(hook.result.current.connection).toBe('live'));
  act(() => events.onError());
  expect(hook.result.current.connection).toBe('polling');
  hook.unmount(); expect(close).toHaveBeenCalledOnce();
});

it('retains an authoritative SSE snapshot received during an older HTTP request', async () => {
  vi.stubGlobal('EventSource', class {});
  let resolve, events;
  openDownloadEvents.mockImplementation(handlers => { events = handlers; return { close: vi.fn() }; });
  getAllDownloads.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(() => useDownloads());
  act(() => events.onEvent({ type: 'snapshot', downloads: [{ download_id: 'finished', version: 4, status: 'completed', progress: 100 }] }));
  await act(async () => resolve({ downloads: [] }));
  expect(hook.result.current.downloads).toHaveLength(1);
  expect(hook.result.current.downloads[0].status).toBe('completed');
  hook.unmount();
});

it('recreates closed event streams with bounded backoff and resets after a successful connection', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', class {});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const sources = [];
  openDownloadEvents.mockImplementation(handlers => {
    const source = { handlers, close: vi.fn() };
    sources.push(source);
    return source;
  });
  getAllDownloads.mockResolvedValue({ downloads: [{ download_id: 'job', status: 'downloading', version: 1, progress: 25 }] });
  batchStatus.mockResolvedValue(new Map());
  const hook = renderHook(() => useDownloads());
  await act(async () => {});
  act(() => sources[0].handlers.onError());
  expect(sources[0].close).toHaveBeenCalledOnce();
  expect(hook.result.current.connection).toBe('polling');
  act(() => sources[0].handlers.onEvent({ type: 'progress', data: { download_id: 'stale', status: 'completed', version: 99 } }));
  expect(hook.result.current.downloads.some(item => item.id === 'stale')).toBe(false);
  act(() => sources[0].handlers.onOpen());
  expect(hook.result.current.connection).toBe('polling');
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(sources).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(sources).toHaveLength(2);

  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    act(() => sources.at(-1).handlers.onError());
    const count = sources.length;
    await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
    expect(sources).toHaveLength(count);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(sources).toHaveLength(count + 1);
  }
  act(() => sources.at(-1).handlers.onOpen());
  expect(hook.result.current.connection).toBe('live');
  act(() => sources.at(-1).handlers.onError());
  const count = sources.length;
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(sources).toHaveLength(count);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(sources).toHaveLength(count + 1);
  hook.unmount();
});

it('cancels reconnect timers while hidden and after unmount, then reconnects on visibility', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', class {});
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const sources = [];
  openDownloadEvents.mockImplementation(handlers => {
    const source = { handlers, close: vi.fn() };
    sources.push(source);
    return source;
  });
  getAllDownloads.mockResolvedValue({ downloads: [] });
  const hook = renderHook(() => useDownloads());
  await act(async () => {});
  act(() => sources[0].handlers.onError());
  act(() => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(sources).toHaveLength(1);
  expect(sources[0].close).toHaveBeenCalledOnce();
  act(() => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
  expect(sources).toHaveLength(2);
  act(() => sources[1].handlers.onOpen());
  expect(hook.result.current.connection).toBe('live');
  act(() => sources[0].handlers.onError());
  expect(hook.result.current.connection).toBe('live');
  act(() => sources[1].handlers.onError());
  hook.unmount();
  act(() => sources[1].handlers.onOpen());
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(sources).toHaveLength(2);
  expect(sources[1].close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
