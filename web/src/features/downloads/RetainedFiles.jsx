import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanRetainedFiles, getRetainedFiles } from '../../services/api';
import { formatBytes } from './model';

export default function RetainedFiles({ id, onRefetch }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false);
  const controller = useRef(null), running = useRef(false);
  const load = useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setConfirmed(false);
    try { const files = await getRetainedFiles(id, { signal: request.signal }); if (!request.signal.aborted) { setPreview(files); setError(''); } }
    catch (err) { if (!request.signal.aborted) { setError(err.message); setPreview(null); } }
    finally { if (!request.signal.aborted) setBusy(false); }
  }, [id]);
  useEffect(() => { load(); return () => controller.current?.abort(); }, [load]);
  const clean = async () => {
    if (running.current || !confirmed || !preview?.token) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    running.current = true; setBusy(true);
    try {
      await cleanRetainedFiles(id, preview.token, { signal: request.signal });
      if (request.signal.aborted) return;
      await onRefetch();
      if (!request.signal.aborted) await load();
    }
    catch (err) { if (!request.signal.aborted) { setError(err.message); setConfirmed(false); } }
    finally { running.current = false; if (!request.signal.aborted) setBusy(false); }
  };
  return <section className="dl-details" aria-label="Retained job files">
    <div className="dl-files-heading"><strong>Retained job files</strong><button className="dl-action-btn" disabled={busy} onClick={load}>Refresh file preview</button></div>
    {busy && <p role="status">Checking files…</p>}{error && <p role="alert">{error}</p>}
    {preview && <><p>{preview.files.length} files · {formatBytes(preview.total_bytes)}. Includes outputs, sidecars, and partial files in this job’s directory.</p><ul className="dl-retained-list">{preview.files.map(file => <li key={file.name}>{file.name} · {formatBytes(file.size)}</li>)}</ul>
      {preview.files.length > 0 && <><label className="dl-clean-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Delete these files permanently</label><button className="dl-action-btn" disabled={!confirmed || busy} onClick={clean}>Delete previewed files</button></>}
    </>}
  </section>;
}
