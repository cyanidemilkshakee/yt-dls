import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllDownloads, batchStatus, openDownloadEvents } from '../../services/api';
import { isTerminal, mergeDownloads } from './model';

export function useDownloads() {
  const [downloads, setDownloads] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState('polling');
  const refresh = useRef(async () => {});
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    let active = true, list = [], lastFull = 0, timer, pending, queuedFull, controller, source, connected = false;
    let reconnectTimer, reconnectDelay = 1000, sourceGeneration = 0;
    let duringFetch = [];
    const closeSource = () => {
      sourceGeneration++;
      const previous = source;
      source = null;
      connected = false;
      previous?.close();
    };
    const publish = () => { if (active) { setDownloads(list); setLoading(false); setError(''); } };
    const schedule = () => {
      clearTimeout(timer);
      if (active && document.visibilityState !== 'hidden') timer = setTimeout(poll, connected ? 30000 : list.some(item => !isTerminal(item.status)) ? 1000 : 10000);
    };
    const poll = (full = false) => {
      if (!active) return Promise.resolve();
      if (pending) {
        if (!full) return pending;
        queuedFull ||= pending.then(() => { queuedFull = null; return poll(true); });
        return queuedFull;
      }
      clearTimeout(timer);
      controller = new AbortController(); duringFetch = [];
      const run = async () => {
        try {
          if (document.visibilityState === 'hidden' && !full) return;
          const ids = list.filter(item => !isTerminal(item.status)).map(item => item.id);
          if (full || connected || Date.now() - lastFull >= 10000) {
            const data = await getAllDownloads({ signal: controller.signal });
            if (!active) return;
            list = mergeDownloads(list, data.downloads, true);
            // Preserve events newer than the HTTP snapshot in flight.
            for (const event of duringFetch) list = mergeDownloads(list, event.type === 'snapshot' ? event.downloads : [event.data], event.type === 'snapshot');
            lastFull = Date.now();
          } else if (ids.length) {
            const statuses = await batchStatus(ids, { signal: controller.signal });
            if (!active) return;
            list = mergeDownloads(list, [...statuses.values()].filter(Boolean));
            list = list.filter(item => !statuses.has(item.id) || statuses.get(item.id));
          }
          publish();
        } catch (err) { if (active && err.name !== 'AbortError') setError(err.message || 'Could not refresh downloads'); }
        finally { if (active) setLoading(false); }
      };
      pending = run().finally(() => { pending = null; schedule(); });
      return pending;
    };
    const reconnect = () => {
      if (!active || reconnectTimer != null || document.visibilityState === 'hidden') return;
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      reconnectTimer = setTimeout(() => { reconnectTimer = undefined; connect(); }, delay);
    };
    const connect = () => {
      if (!active || source || reconnectTimer != null || document.visibilityState === 'hidden' || !('EventSource' in window)) return;
      const generation = ++sourceGeneration;
      const current = () => active && sourceGeneration === generation && document.visibilityState !== 'hidden';
      const onError = () => {
        if (!current()) return;
        // A failed EventSource may be CLOSED permanently in some browsers.
        // Own reconnection so a closed source cannot strand the live feed.
        closeSource();
        setConnection('polling');
        poll(true);
        reconnect();
      };
      try {
        const candidate = openDownloadEvents({
          onOpen: () => { if (current()) { reconnectDelay = 1000; connected = true; setConnection('live'); poll(true); } },
          onError,
          onEvent: event => {
            if (!current()) return;
            if (event.type === 'resync') { poll(true); return; }
            if (event.type === 'snapshot' && Array.isArray(event.downloads)) {
              list = mergeDownloads(list, event.downloads, true); lastFull = Date.now();
              if (pending) duringFetch.push(event);
            } else if (event.type === 'progress' && event.data?.download_id) {
              list = mergeDownloads(list, [event.data]);
              if (pending) duringFetch.push(event);
            } else return;
            publish();
          }
        });
        if (current()) source = candidate;
        else candidate?.close();
      } catch { onError(); }
    };
    refresh.current = () => poll(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { closeSource(); setConnection('polling'); clearTimeout(timer); clearTimeout(reconnectTimer); reconnectTimer = undefined; }
      else { poll(true); connect(); }
    };
    const onFocus = () => { if (document.visibilityState !== 'hidden') { poll(true); connect(); } };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    poll(true); connect();
    return () => { active = false; clearTimeout(timer); clearTimeout(reconnectTimer); controller?.abort(); closeSource(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); refresh.current = async () => {}; };
  }, []);
  return { downloads, refetch, error, loading, connection };
}
