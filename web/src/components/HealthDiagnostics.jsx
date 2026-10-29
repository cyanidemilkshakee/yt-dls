import { useEffect, useRef, useState } from 'react';
import { getSystemHealth } from '../services/api';

export default function HealthDiagnostics() {
  const [health, setHealth] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const controller = useRef(null);
  const load = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try { const data = await getSystemHealth({ signal: request.signal }); if (!request.signal.aborted) setHealth(data); }
    catch (err) { if (!request.signal.aborted) setError(err.message); }
    finally { if (!request.signal.aborted) setLoading(false); }
  };
  useEffect(() => { load(); return () => controller.current?.abort(); }, []);
  const readiness = value => value === null || value === undefined ? 'Unverified' : value ? 'Available' : 'Missing';
  return <section className="card diagnostics" aria-label="System diagnostics">
    <div className="diagnostics-heading"><h2>System diagnostics</h2><button className="btn" disabled={loading} onClick={load}>{loading ? 'Checking…' : 'Refresh diagnostics'}</button></div>
    {error && <p role="alert">{error}</p>}
    {health && <>
      <p role="status">{health.status === 'ok' ? 'Ready' : 'Some capabilities need attention'} · Version {health.app_version} · {health.platform}</p>
      <dl className="diagnostics-grid">{[
        ['Build', `${health.commit} · ${health.build_time}`],
        ['yt-dlp', `${readiness(health.ytdlp_available)} · ${health.ytdlp_version || 'Version unknown'}`],
        ['FFmpeg', `${readiness(health.ffmpeg_available)} · ${health.ffmpeg_version || 'Version unknown'}`],
        ['ffprobe', `${readiness(health.ffprobe_available)} · ${health.ffprobe_version || 'Version unknown'}`],
        ['JavaScript runtime', `${health.js_runtime} · ${readiness(health.js_runtime_available)} · ${health.js_runtime_version || ''}`],
        ['EJS challenge solver', `${readiness(health.ejs_available)} · ${health.ejs_version || health.ejs_status || ''}`],
        ['Download directory', health.download_directory_writable ? 'Writable' : 'Unavailable'],
        ['Concurrency', `${health.max_concurrent_downloads} downloads`],
        ['Inspection timeout', `${Math.round(health.info_timeout_ms / 1000)} seconds`]
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {health.issues?.length > 0 && <ul>{health.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <details><summary>Server capabilities</summary><dl className="diagnostics-grid">{Object.entries(health.capabilities || {}).map(([name, enabled]) => <div key={name}><dt>{name.replaceAll('_', ' ')}</dt><dd>{enabled ? 'Enabled' : 'Disabled'}</dd></div>)}</dl></details>
    </>}
  </section>;
}
