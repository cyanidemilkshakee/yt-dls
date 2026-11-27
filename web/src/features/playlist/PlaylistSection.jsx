import './PlaylistSection.css';
import ContentRegion from '../../components/ContentRegion';
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../downloads/model';

const batchLimit = 500;
function Thumbnail({ url }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img className="playlist-item-img" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="playlist-item-img grid place-items-center text-xs">No thumbnail</span>;
}

export default function PlaylistSection({ info, onClose, onConfigureSelected, onSelectionChange = () => {}, onPresetChange = () => {}, queueing = false, queueProgress = '', error = '', initialSelected, initialPreset = 'default' }) {
  const entries = info?.entries || [];
  const [selected, setSelected] = useState(() => new Set((initialSelected || entries.slice(0, batchLimit).map((_, index) => index)).filter(index => Number.isInteger(index) && index >= 0 && index < entries.length).slice(0, batchLimit)));
  const [page, setPage] = useState(0);
  const [preset, setPreset] = useState(initialPreset);
  const submitRef = useRef(null);
  const selectAllRef = useRef(null);
  const pages = Math.max(1, Math.ceil(entries.length / 100));
  const firstBatchIndexes = entries.slice(0, batchLimit).map((_, index) => index);
  const firstBatchSelected = firstBatchIndexes.length > 0 && firstBatchIndexes.every(index => selected.has(index));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !firstBatchSelected; }, [selected, firstBatchSelected]);
  useEffect(() => { const frame = requestAnimationFrame(() => submitRef.current?.focus()); return () => cancelAnimationFrame(frame); }, []);

  const updateSelected = value => {
    const next = typeof value === 'function' ? value(selected) : value;
    onSelectionChange(next);
    setSelected(next);
  };
  const toggle = index => updateSelected(previous => {
    const next = new Set(previous);
    if (next.has(index)) next.delete(index);
    else if (next.size < batchLimit) next.add(index);
    return next;
  });

  return <ContentRegion id="playlist-section" className="playlist-container" aria-label="Playlist selection">
    <div className="playlist-header"><div><h2 className="playlist-title">{info?.title || 'Playlist'}</h2><p>{entries.length} items · {selected.size} selected{info?.uploader ? ` · ${info.uploader}` : ''}</p></div><button onClick={onClose} disabled={queueing} className="btn">Back</button></div>
    <div className="playlist-controls">
      <div className="playlist-controls-group"><button disabled={queueing || !entries.length} onClick={() => updateSelected(new Set(firstBatchIndexes))} className="btn">{entries.length > batchLimit ? 'Select first 500' : 'Select all'}</button><button disabled={queueing} onClick={() => updateSelected(new Set())} className="btn">Deselect all</button></div>
      <label>Download preset <select value={preset} onChange={event => { setPreset(event.target.value); onPresetChange(event.target.value); }} disabled={queueing} className="input-form"><option value="default">Best available</option><option value="hq-mp4">Best MP4</option><option value="mkv">Best MKV</option><option value="mp3">Audio MP3</option></select></label>
    </div>
    <p className="text-sm mb-3">Choose up to 500 items per batch. Configure shared output options and filenames before starting. Queueing continues on the server; cancel the batch from Downloads.</p>
    {selected.size === batchLimit && entries.length > batchLimit && <p role="status" className="text-sm mb-3">The batch limit is 500. Deselect an item to choose another.</p>}
    <div className="playlist-table-container table-container" role="region" aria-label="Playlist items, scroll to see all columns" tabIndex={0}><table className="w-full text-sm"><caption className="sr-only">Available playlist items</caption><thead className="playlist-table-header"><tr><th><input ref={selectAllRef} type="checkbox" aria-label={entries.length > batchLimit ? 'Select first 500 playlist items' : 'Select all playlist items'} checked={firstBatchSelected} disabled={queueing || !entries.length} onChange={() => updateSelected(firstBatchSelected ? new Set() : new Set(firstBatchIndexes))} /></th><th className="playlist-th-left">Title</th><th className="playlist-th-right">Duration</th></tr></thead>
      <tbody>{entries.slice(page * 100, (page + 1) * 100).map((entry, localIndex) => {
        const index = page * 100 + localIndex;
        return <tr className="playlist-tr" key={`${index}:${entry.id}`} onClick={() => !queueing && toggle(index)}><td className="playlist-td-center" onClick={event => event.stopPropagation()}><input type="checkbox" className="checkbox-style" aria-label={`Select item ${index + 1}: ${entry.title || entry.id || 'Untitled'}`} checked={selected.has(index)} disabled={queueing || !selected.has(index) && selected.size === batchLimit} onChange={() => toggle(index)} /></td><td className="playlist-td"><div className="playlist-item-content"><Thumbnail url={entry.thumbnail} /><div className="playlist-item-details"><div className="playlist-item-title">{entry.title || 'Untitled'}</div><div className="playlist-item-id">Item {index + 1} · {entry.id}{entry.uploader ? ` · ${entry.uploader}` : ''}{entry.view_count > 0 ? ` · ${Number(entry.view_count).toLocaleString()} views` : ''}</div></div></div></td><td className="playlist-td-right">{formatDuration(entry.duration)}</td></tr>;
      })}</tbody></table></div>
    <div className="flex flex-wrap justify-between gap-3 mt-6"><div className="flex items-center gap-3"><button className="btn" disabled={queueing || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn" disabled={queueing || page + 1 >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div><button ref={submitRef} data-playlist-submit onClick={() => onConfigureSelected(entries.filter((_, index) => selected.has(index)), preset)} disabled={!selected.size || queueing} className="btn btn-primary">{queueing ? queueProgress || 'Submitting batch…' : `Download ${selected.size} selected`}</button></div>
    {error && <p role="alert" className="mt-4">{error}</p>}
  </ContentRegion>;
}
