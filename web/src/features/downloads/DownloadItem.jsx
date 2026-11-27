import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cancelDownload, removeDownload, getDownloadLog, retryDownload, resultFileURL } from '../../services/api';
import { isTerminal, formatBytes, formatDuration } from './model';
import StreamDetails from './StreamDetails';
import RetainedFiles from './RetainedFiles';
import ContentRegion from '../../components/ContentRegion';

export default function DownloadItem({ download, onRefetch, removalBlocked = false }) {
  const [showLog, setShowLog] = useState(false), [logLines, setLogLines] = useState([]), [logLoading, setLogLoading] = useState(false);
  const [actionError, setActionError] = useState(''), [logError, setLogError] = useState(''), [busy, setBusy] = useState(false), [thumbnailFailed, setThumbnailFailed] = useState(false);
  const busyRef = useRef(false), retryKey = useRef(crypto.randomUUID());
  const [showFiles, setShowFiles] = useState(false), [showRetry, setShowRetry] = useState(false), [retryURL, setRetryURL] = useState('');
  const [visibleFiles, setVisibleFiles] = useState(20);
  const { id, filename, status, progress, url, thumbnail, error, downloaded_bytes, total_bytes, speed, eta, files = [], batch, kind } = download;
  const terminal = isTerminal(status), completed = status === 'completed';
  const percentage = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const title = filename?.split(/[\\/]/).pop() || url || 'Download';
  useEffect(() => {
    if (!showLog) return;
    let active = true, timer, first = true;
    const controller = new AbortController();
    const poll = async () => {
      try {
        if (document.visibilityState === 'hidden') return;
        if (active && first) setLogLoading(true);
        const data = await getDownloadLog(id, { signal: controller.signal });
        if (active) { setLogLines(Array.isArray(data?.log) ? data.log : []); setLogError(''); }
      } catch (err) { if (active && err.name !== 'AbortError') setLogError(err.message); }
      finally { if (active) { first = false; setLogLoading(false); if (!terminal) timer = setTimeout(poll, 2000); } }
    };
    poll();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [id, showLog, terminal]);
  const action = async (operation) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError('');
    try { await operation(); await onRefetch(); }
    catch (err) { setActionError(err.message || 'Action failed. Please retry.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const retry = () => {
    if (download.retry_needs_url && !retryURL.trim()) { setActionError('Enter the original URL including signed parameters.'); return; }
    action(async () => { await retryDownload(id, retryURL.trim(), retryKey.current); retryKey.current = crypto.randomUUID(); setShowRetry(false); });
  };
  return (
    <ContentRegion className="download-row">
      <motion.article data-testid={`download-${id}`} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-label={title}>
      <div className="download-row-inner">
        {kind !== 'batch' && (thumbnail && !thumbnailFailed ? <img className="dl-thumb" src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbnailFailed(true)} /> : <div className="dl-thumb-fallback">Thumbnail unavailable</div>)}
        <div className="dl-content">
          <div className="dl-title-row">
            <div className="dl-title-wrapper"><h3 className="dl-title" title={title}>{title}</h3><p className="dl-status">{status.replaceAll('_', ' ')}</p></div>
            <div className="dl-actions">
              <button onClick={() => setShowLog(value => !value)} className="dl-action-btn" aria-expanded={showLog} aria-controls={`log-${id}`}>Log</button>
              {!terminal && <button onClick={() => action(() => cancelDownload(id))} disabled={busy} className="dl-action-btn">{busy ? 'Cancelling…' : 'Cancel'}</button>}
              {terminal && kind !== 'batch' && <button onClick={() => setShowRetry(value => !value)} disabled={busy} aria-expanded={showRetry} className="dl-action-btn">Retry</button>}
              {terminal && kind !== 'batch' && <button onClick={() => setShowFiles(value => !value)} disabled={busy || removalBlocked} aria-expanded={showFiles} className="dl-action-btn">Manage files</button>}
              {terminal && <button onClick={() => action(() => removeDownload(id))} disabled={busy || removalBlocked} title={removalBlocked ? 'Available when the parent batch finishes' : undefined} className="dl-action-btn">Remove</button>}
            </div>
          </div>
          {error && <p role="alert" className="dl-error">{error}</p>}
          {actionError && <p role="alert" className="dl-error">{actionError}</p>}
          {showRetry && <form className="dl-retry-form" onSubmit={event => { event.preventDefault(); retry(); }}><label>Replacement source URL {download.retry_needs_url ? '(required)' : '(optional)'}<input className="input-form" type="url" aria-label="Replacement source URL" required={download.retry_needs_url} value={retryURL} onChange={event => { setRetryURL(event.target.value); retryKey.current = crypto.randomUUID(); }} placeholder={download.retry_needs_url ? 'Original signed source URL' : 'Leave blank to reuse the saved source'} /></label><button className="dl-action-btn" disabled={busy}>{busy ? 'Retrying…' : 'Start retry'}</button></form>}
          <div className="dl-progress-wrapper">
            <div className="dl-progress-bar-container" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
              <div className="dl-progress-bar-base bg-[var(--primary-green)]" style={{ width: `${percentage}%` }} />
            </div>
            <div className="dl-progress-stats">
              {batch ? <span>{batch.completed}/{batch.total} completed · {batch.admitted} queued · {batch.failed} failed · {batch.cancelled} cancelled</span> : <span>{formatBytes(downloaded_bytes)} / {formatBytes(total_bytes)} · {speed > 0 ? `${formatBytes(speed)}/s` : '—'} · ETA {formatDuration(eta)}</span>}
              <strong>{percentage}%</strong>
            </div>
          </div>
          {completed && files.length > 0 && <div className="dl-files">{files.slice(0, visibleFiles).map(file => <a className="btn btn-green-outline" key={file.index} href={resultFileURL(id, file.index)} download>{file.name} ({formatBytes(file.size)})</a>)}{files.length > visibleFiles && <button className="dl-action-btn" onClick={() => setVisibleFiles(value => value + 20)}>Show more files ({files.length - visibleFiles} remaining)</button>}</div>}
          {kind !== 'batch' && <StreamDetails download={download} />}
        </div>
      </div>
      {showLog && <div id={`log-${id}`} className="dl-log-container">{logError && <p role="alert">{logError}</p>}<pre className="dl-log-pre">{logLoading ? 'Loading log…' : logLines.length ? logLines.join('\n') : 'No log output yet.'}</pre></div>}
      {showFiles && <RetainedFiles id={id} onRefetch={onRefetch} />}
      </motion.article>
    </ContentRegion>
  );
}
