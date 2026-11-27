import { formatBytes, formatDuration } from './model';

export default function StreamDetails({ download }) {
  const streams = Object.values(download.streams || {});
  const items = streams.length ? streams : [download.video_progress && { ...download.video_progress, id: 'video', kind: 'video' }, download.audio_progress && { ...download.audio_progress, id: 'audio', kind: 'audio' }].filter(Boolean);
  return <details className="dl-details"><summary>Stream details</summary>
    {items.length === 0 ? <p>Stream information will appear when extraction starts.</p> : <div className="dl-streams">{items.map((stream, index) => <div key={stream.id || index} className="dl-stream"><strong>{stream.kind || 'Media'}{stream.combined ? ' + audio' : ''} · {stream.id || index + 1}</strong><p>{stream.status.replaceAll('_', ' ')} · {Math.round(stream.progress || 0)}%</p><p>{formatBytes(stream.downloadedBytes)} / {formatBytes(stream.totalBytes)} · {stream.speed > 0 ? `${formatBytes(stream.speed)}/s` : '—'} · ETA {formatDuration(stream.eta)}</p></div>)}</div>}
  </details>;
}
