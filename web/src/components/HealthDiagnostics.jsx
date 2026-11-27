import { useEffect, useRef, useState } from 'react';
import ContentRegion from './ContentRegion';
import { getSystemHealth } from '../services/api';

function toolState(value, issue = '') {
  if (value === true) return { kind: 'available', label: 'Available' };
  if (value === false && /probe failed|timed out/i.test(issue)) return { kind: 'unavailable', label: 'Check failed' };
  if (value === false) return { kind: 'missing', label: 'Missing' };
  return { kind: 'unverified', label: 'Not checked' };
}

function DiagnosticRow({ label, state, value, actionLinks = [] }) {
  return <div className={`diagnostic-row diagnostic-row-${state.kind}`} role="listitem">
    <div className="diagnostic-row-body">
      <div className="diagnostic-row-heading">
        <strong>{label}</strong>
        <span className={`diagnostic-badge diagnostic-badge-${state.kind}`}>{state.label}</span>
      </div>
      {value && <p className="diagnostic-value">{value}</p>}
      {actionLinks.length > 0 && <div className="diagnostic-links">
        {actionLinks.map(({ href, label }) => <a className="diagnostic-action" key={href} href={href} target="_blank" rel="noreferrer">{label}</a>)}
      </div>}
    </div>
  </div>;
}

function CapabilityList({ capabilities }) {
  return <ul className="diagnostic-capability-list">
    {Object.entries(capabilities || {}).map(([name, enabled]) => <li key={name}>
      <span>{name.replaceAll('_', ' ')}</span>
      <span className={`diagnostic-badge diagnostic-badge-${enabled ? 'available' : 'disabled'}`}>{enabled ? 'Enabled' : 'Disabled'}</span>
    </li>)}
  </ul>;
}

export default function HealthDiagnostics() {
  const [health, setHealth] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const controller = useRef(null);
  const load = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try { const data = await getSystemHealth({ signal: request.signal }); if (!request.signal.aborted) setHealth(data); }
    catch (err) { if (!request.signal.aborted) setError(err.message || 'The server did not return diagnostic results.'); }
    finally { if (!request.signal.aborted) setLoading(false); }
  };
  useEffect(() => { load(); return () => controller.current?.abort(); }, []);

  const issues = health?.issues || [];
  const ytdlpIssue = issues.find(issue => /yt-dlp/i.test(issue)) || '';
  const mediaIssue = issues.find(issue => /ffmpeg|ffprobe/i.test(issue)) || '';
  const runtimeIssue = issues.find(issue => /javascript runtime/i.test(issue)) || '';
  const ytdlpState = toolState(health?.ytdlp_available, ytdlpIssue);
  const ffmpegState = toolState(health?.ffmpeg_available, mediaIssue);
  const ffprobeState = toolState(health?.ffprobe_available, mediaIssue);
  const runtimeState = toolState(health?.js_runtime_available, runtimeIssue);
  const ejsState = toolState(health?.ejs_available);
  const directoryState = health?.download_directory_writable
    ? { kind: 'available', label: 'Writable' }
    : { kind: 'unavailable', label: health?.download_directory_writable === false ? 'Unavailable' : 'Not checked' };
  return <ContentRegion className="diagnostics" aria-label="System diagnostics" aria-busy={loading}>
    {error && <div className="diagnostics-error" role="alert">
      <strong>Diagnostics unavailable</strong>
      <p>Check that the local server is running, then reopen System Health. {error}</p>
    </div>}
    {loading && !health && <p className="diagnostics-loading" role="status">Checking installed tools…</p>}
    {health && <>
      {issues.length > 0 && <section className="diagnostics-disclosure" aria-label="Server notes">
        <ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
      </section>}
      <section className="diagnostics-section" aria-label="Diagnostic results">
        <div className="diagnostics-list" role="list">
          <DiagnosticRow label="yt-dlp" state={ytdlpState}
            value={ytdlpState.kind === 'available' ? health.ytdlp_version || 'Version not reported' : ''}
            actionLinks={ytdlpState.kind === 'missing' ? [{ href: 'https://github.com/yt-dlp/yt-dlp/wiki/Installation', label: 'Official yt-dlp installation guide' }] : []} />
          <DiagnosticRow label="FFmpeg" state={ffmpegState}
            value={ffmpegState.kind === 'available' ? health.ffmpeg_version || 'Version not reported' : ''}
            actionLinks={ffmpegState.kind !== 'available' ? [{ href: 'https://www.ffmpeg.org/download.html', label: 'Official FFmpeg download options' }] : []} />
          <DiagnosticRow label="ffprobe" state={ffprobeState}
            value={ffprobeState.kind === 'available' ? health.ffprobe_version || 'Version not reported' : ''}
            actionLinks={ffprobeState.kind !== 'available' ? [{ href: 'https://www.ffmpeg.org/download.html', label: 'FFmpeg downloads include ffprobe' }] : []} />
          <DiagnosticRow label="JavaScript runtime" state={runtimeState}
            value={runtimeState.kind === 'available' ? `${health.js_runtime || 'Runtime'}${health.js_runtime_version ? ` · ${health.js_runtime_version}` : ''}` : ''}
            actionLinks={runtimeState.kind !== 'available' ? [
              { href: 'https://nodejs.org/en/download/', label: 'Official Node.js downloads' },
              { href: 'https://docs.deno.com/runtime/getting_started/installation/', label: 'Official Deno installation guide' },
            ] : []} />
          <DiagnosticRow label="EJS challenge solver" state={ejsState}
            value={ejsState.kind === 'available' ? health.ejs_version || 'Installed' : ejsState.kind === 'unverified' ? 'Not separately checked for this yt-dlp installation' : ''}
            actionLinks={ejsState.kind === 'missing' ? [{ href: 'https://github.com/yt-dlp/yt-dlp/wiki/EJS', label: 'Official EJS setup guide' }] : []} />
          <DiagnosticRow label="Download directory" state={directoryState} />
        </div>
      </section>
      <section className="diagnostics-disclosure diagnostics-capabilities" aria-label="Server capabilities">
        <p>Disabled features may be unavailable by design or restricted by server policy.</p>
        <CapabilityList capabilities={health.capabilities} />
      </section>
    </>}
  </ContentRegion>;
}
