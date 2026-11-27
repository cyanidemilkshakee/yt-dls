import contract from '../../../../api/contract.json';
export const isTerminal = status => contract.enums.terminalStatuses.includes(status);

export function mergeDownloads(previous, snapshots, replace = false) {
  const old = new Map(previous.map(item => [item.id, item]));
  const merged = replace ? new Map() : new Map(old);
  for (const snapshot of snapshots) {
    if (!snapshot) continue;
    const id = snapshot.download_id || snapshot.id;
    if (!id) continue;
    const existing = old.get(id);
    // Snapshots are complete records. Omitted optional fields must clear old
    // values (for example result files after an explicit cleanup).
    merged.set(id, existing && (existing.version || 0) > (snapshot.version || 0) ? existing : { ...snapshot, id });
  }
  return [...merged.values()].sort((a, b) => (Date.parse(b.queued_at || b.started_at) || 0) - (Date.parse(a.queued_at || a.started_at) || 0) || a.id.localeCompare(b.id));
}
export function formatBytes(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '—';
  const unit = Math.min(4, Math.floor(Math.log(Number(value)) / Math.log(1024)));
  return `${(Number(value) / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
}
export function formatDuration(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return '—';
  const seconds = Math.floor(Number(value)), h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
