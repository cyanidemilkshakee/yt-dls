import { useState, useEffect, useCallback } from 'react';
import { getAllDownloads, batchStatus } from '../../services/api';

export function useDownloads() {
  const [downloads, setDownloads] = useState([]);
  const [downloadIds, setDownloadIds] = useState([]);

  // Fetch full download list initially
  const fetchDownloads = useCallback(async () => {
    try {
      const data = await getAllDownloads();
      const rawDownloads = Array.isArray(data)
        ? data
        : Array.isArray(data?.downloads)
          ? data.downloads
          : Object.entries(data || {}).map(([id, info]) => ({ id, ...info }));
      const list = rawDownloads
        .filter(Boolean)
        .map(download => ({
          ...download,
          id: download.download_id || download.id
        }))
        .filter(download => download.id);
      setDownloads(list);
      setDownloadIds(list.map(d => d.id));
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    }
  }, []);

  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  // Poll for status updates
  useEffect(() => {
    if (downloadIds.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const statuses = await batchStatus(downloadIds);
        setDownloads(prev => prev.map(dl => {
          if (statuses.has(dl.id)) {
            return { ...dl, ...statuses.get(dl.id) };
          }
          return dl;
        }));
      } catch (err) {
        console.error('Failed to update download statuses:', err);
      }
    }, 1000); // 1-second polling interval

    return () => clearInterval(interval);
  }, [downloadIds]);

  return { downloads, refetch: fetchDownloads };
}
