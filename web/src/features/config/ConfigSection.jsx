import './ConfigSection.css';
import contract from '../../../../api/contract.json';
import FormatTables from './FormatTables';
import OptionsSections from './OptionsSections';
import SavedPresets from './SavedPresets';
import InspectionDetails from './InspectionDetails';
import BatchOptions from './BatchOptions';
import { useEffect, useRef, useState } from 'react';
import { startDownload, startBatch, previewCommand, getSettings, getSystemHealth } from '../../services/api';

import { useConfiguration } from './useConfiguration';
import { estimateSize, buildOptions } from './model';

export default function ConfigSection({ info, onClose, onDownloadStarted, batchEntries, initialPreset = 'default', initialConfiguration, initialEntryNames }) {
  const isBatch = Boolean(batchEntries);
  const [entryNames, setEntryNames] = useState(initialEntryNames || {});
  const dialogRef = useRef(null);
  const closeHandlerRef = useRef(onClose);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const previewController = useRef(null);
  const submissionController = useRef(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; previewController.current?.abort(); submissionController.current?.abort(); };
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [actionError, setActionError] = useState('');
  const [capabilities, setCapabilities] = useState(null);
  const admissionKey = useRef(crypto.randomUUID());
  useEffect(() => { const controller = new AbortController(); getSystemHealth({ signal: controller.signal }).then(health => setCapabilities(health.capabilities)).catch(() => {}); return () => controller.abort(); }, []);
  const { configuration, setField, applyPreset: resetPreset, downloadMode, setDownloadMode, filenameBase, setFilenameBase, outputFormat, setOutputFormat, downloadPath, setDownloadPath, activePreset, selectedVideoIds, setSelectedVideoIds, selectedAudioIds, setSelectedAudioIds, multiVideo, setMultiVideo, multiAudio, setMultiAudio } = useConfiguration(info, initialPreset, initialConfiguration);
  const [commandDraft, setCommandDraft] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const closeDialog = () => {
    previewController.current?.abort();
    submissionController.current?.abort();
    onClose?.({ configuration, entryNames });
  };
  useEffect(() => { closeHandlerRef.current = closeDialog; });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const inertSiblings = [];
    let current = dialog;
    while (current?.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          inertSiblings.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      current = current.parentElement;
      if (current === document.body) break;
    }
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog?.querySelectorAll(focusableSelector) || [])
      .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    const initialFocus = requestAnimationFrame(() => (dialog?.querySelector('[aria-label="Close"]') || dialog)?.focus());

    const handleDialogKeys = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandlerRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      document.removeEventListener('keydown', handleDialogKeys);
      cancelAnimationFrame(initialFocus);
      inertSiblings.forEach(([element, wasInert]) => { element.inert = wasInert; });
      requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
        else (document.getElementById('url-input') || document.querySelector('[data-playlist-submit]'))?.focus();
      });
    };
  }, []);

  // Accordion visibility is presentation state. Download behavior is derived
  // from the actual option values so collapsing a section cannot discard a
  // user's selections.
  useEffect(() => { admissionKey.current = crypto.randomUUID(); previewController.current?.abort(); setPreviewLoading(false); setCommandDraft(null); }, [configuration, entryNames]);


  if (!info) return null;
	const initialVideoIds = new Set(info.best_video_ids || []);
	const initialAudioIds = new Set(info.best_audio_ids || []);

  const visibleVideoFormats = (info.video_formats || []).filter(format =>
    (downloadMode !== 'video' && !multiVideo) || format.type === 'video'
  );
  const videoOnlyUnavailable = !isBatch && !configuration.customFormat.trim() && downloadMode === 'video' && !info.video_formats?.some(format => format.type === 'video');

  /* ── format click ─────────────────────────────────────────────────────── */
  const handleVideoFormatClick = (id) => {
    const selectedFormat = info.video_formats?.find(format => format.id === id);
    if (downloadMode === 'video' && selectedFormat?.type === 'combined') return;
    if (multiVideo && selectedFormat?.type === 'combined') return;
    if (multiVideo) {
      const s = new Set(selectedVideoIds);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      setSelectedVideoIds(s);
    } else setSelectedVideoIds(new Set([id]));
  };
  const handleAudioFormatClick = (id) => {
    if (multiAudio) {
      const s = new Set(selectedAudioIds);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      setSelectedAudioIds(s);
    } else setSelectedAudioIds(new Set([id]));
  };

  /* ── helpers ──────────────────────────────────────────────────────────── */
  const fmtSize = (bytes) => {
    if (!Number.isFinite(Number(bytes)) || bytes <= 0) return 'N/A';
    const i = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
  };
  const fmtDuration = (secs) => {
    if (!secs) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                 : `${m}:${String(s).padStart(2,'0')}`;
  };

  /* ── preset ───────────────────────────────────────────────────────────── */
  const applyPreset = name => { resetPreset(name); setCommandDraft(null); };
  const { totalBytes, videoSize, audioSize, isApprox, incomplete } = estimateSize(info, configuration);

  /* ── download request / server-generated preview ─────────────────────── */
  const buildDownloadOptions = async () => {
    const options = buildOptions(info, configuration, await getSettings());
    if (isBatch && configuration.concatPlaylist !== 'never') {
      if (configuration.concatPlaylist === 'always' && batchEntries.length < 2) throw new Error('Choose at least two playlist items to concatenate.');
      if (!batchEntries.every(entry => Number.isInteger(entry.playlist_index) && entry.playlist_index > 0)) throw new Error('This source does not provide playlist indexes. Download separate files instead.');
      if (new Set(batchEntries.map(entry => entry.playlist_index)).size !== batchEntries.length) throw new Error('Selected items have duplicate playlist indexes. Download separate files instead.');
      options.playlistItems = batchEntries.map(entry => entry.playlist_index).sort((a, b) => a - b);
    } else if (isBatch) {
      options.url = batchEntries[0].url;
      options.filename = entryNames[0] || filenameBase;
    }
    return options;
  };

  const handlePreview = async () => {
    if (videoOnlyUnavailable) {
      setActionError('This source has no separate video-only format. Choose Video + Audio.');
      return;
    }
    previewController.current?.abort();
    const controller = new AbortController(); previewController.current = controller;
    setPreviewLoading(true); setActionError('');
    try {
      const options = await buildDownloadOptions();
      if (controller.signal.aborted) return;
      const result = await previewCommand(options, { signal: controller.signal });
      if (mountedRef.current && !controller.signal.aborted) setCommandDraft(result.command || '');
    } catch (err) {
      if (mountedRef.current && !controller.signal.aborted) setActionError('Could not build command preview: ' + (err.message || err));
    } finally {
      if (mountedRef.current && previewController.current === controller) setPreviewLoading(false);
    }
  };

  /* ── download ─────────────────────────────────────────────────────────── */
  const handleDownload = async () => {
    if (submittingRef.current) return;
    if (videoOnlyUnavailable) {
      setActionError('This source has no separate video-only format. Choose Video + Audio.');
      return;
    }
    submittingRef.current = true;
    const controller = new AbortController(); submissionController.current = controller;
    const idempotencyKey = admissionKey.current;
    setIsSubmitting(true); setActionError('');
    try {
      const options = await buildDownloadOptions();
      if (controller.signal.aborted) return;
      if (isBatch && configuration.concatPlaylist === 'never') {
        await startBatch(batchEntries.map((entry, index) => ({ url: entry.url, thumbnail: entry.thumbnail || '', filename: entryNames[index] || filenameBase })), options, { idempotencyKey, signal: controller.signal });
      } else await startDownload(options, { idempotencyKey, signal: controller.signal });
      if (mountedRef.current && !controller.signal.aborted) onDownloadStarted?.();
    } catch (err) {
      if (mountedRef.current && !controller.signal.aborted) setActionError('Failed to start download: ' + (err.message || err));
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  /* ── select helpers ───────────────────────────────────────────────────── */
  const PRESETS = [
    { id: 'default', label: 'Default' },
    { id: 'hq-mp4',  label: 'Best MP4' },
    { id: 'mkv',     label: 'Best MKV' },
    { id: 'mp3',     label: 'Audio (MP3)' },
    { id: 'custom',  label: 'Custom' },
  ];
  const MODES = [
    { id: 'both',  label: 'Video + Audio' },
    { id: 'video', label: 'Video Only' },
    { id: 'audio', label: 'Audio Only' },
  ];
  const handleModeChange = (mode) => {
    setDownloadMode(mode);
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <section id="config-section" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="config-dialog-title" tabIndex={-1} className="cfg-shell card">

      {/* ── Header ── */}
      <div className="cfg-header">
        <span id="config-dialog-title" className="cfg-header-title">{isBatch ? `Configure ${batchEntries.length} playlist items` : 'Download Configuration'}</span>
        <button type="button" className="cfg-close-btn" onClick={closeDialog} aria-label="Close">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      <div className="cfg-body">

        {/* ── 1. Meta row ── */}
        <div className="cfg-meta-row">
          {info.thumbnail && !thumbnailFailed ? <img
            id="config-thumbnail"
            src={info.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setThumbnailFailed(true)}
            className="cfg-thumb"
          /> : <div className="cfg-thumb grid place-items-center text-xs text-white">Thumbnail unavailable</div>}
          <div className="cfg-meta-info">
            <p className="cfg-video-title">{info.title}</p>
            <div className="cfg-meta-chips">
              {info.uploader && (
                <span className="cfg-chip">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  {info.uploader}
                </span>
              )}
              {info.duration && (
                <span className="cfg-chip">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/>
                  </svg>
                  {fmtDuration(info.duration)}
                </span>
              )}
              {info.view_count > 0 && (
                <span className="cfg-chip">
                  {Number(info.view_count).toLocaleString()} views
                </span>
              )}
              {info.ext && <span className="cfg-chip">{info.ext.toUpperCase()}</span>}
            </div>

            {/* filename / container / path */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div>
                <p className="cfg-field-label">Filename</p>
                <input
                  type="text"
                  className="cfg-input"
                  aria-label="Filename" value={filenameBase}
                  onChange={e => setFilenameBase(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <p className="cfg-field-label">Container</p>
                  <select
                    className="cfg-input"
                    aria-label="Container" value={outputFormat}
                    onChange={e => setOutputFormat(e.target.value)}
                    style={{ padding: '0.5rem 0.7rem' }}
                  >
                    <option value="default">Default</option>
                    {contract.enums.mergeFormats.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
                  </select>
                  {outputFormat !== 'default' && <p className="cfg-hint">Remuxing keeps the selected codecs and may fail if this container cannot hold them. Recoding takes longer; MKV supports more codecs.</p>}
                </div>
                <div>
                  <p className="cfg-field-label">Download Path</p>
                  <input
                    type="text"
                    className="cfg-input"
                    disabled={capabilities?.custom_download_path === false} aria-label="Download path" value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="./downloads"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <InspectionDetails info={info} />
        <SavedPresets configuration={configuration} onApply={preset => setField('savedPreset', preset)} />
        <label className="cfg-field-label">Custom format selector
          <input className="cfg-input" aria-label="Custom format selector" value={configuration.customFormat} onChange={event => setField('customFormat', event.target.value)} placeholder="Automatic, or bestvideo[height<=1080]+bestaudio/best" />
        </label>
        {isBatch && <BatchOptions entries={batchEntries} configuration={configuration} setField={setField} entryNames={entryNames} setEntryNames={setEntryNames} />}
        {/* ── 2. Controls: Presets + Mode ── */}
        <div className="cfg-controls-row">
          <div>
            <p className="cfg-control-label">Preset</p>
            <div className="seg-group">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`seg-btn ${activePreset === p.id ? 'seg-active-green' : ''}`}
                  aria-pressed={activePreset === p.id}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="cfg-control-label">Download Mode</p>
            <div className="seg-group-fill">
              {MODES.map(m => (
                <button
                  key={m.id}
                  className={`seg-btn ${downloadMode === m.id ? 'seg-active' : ''}`}
                  aria-pressed={downloadMode === m.id}
                  onClick={() => handleModeChange(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!isBatch && <FormatTables disabled={Boolean(configuration.customFormat.trim())} {...{info, downloadMode, multiVideo, setMultiVideo, selectedVideoIds, setSelectedVideoIds, multiAudio, setMultiAudio, selectedAudioIds, setSelectedAudioIds, visibleVideoFormats, initialVideoIds, initialAudioIds, handleVideoFormatClick, handleAudioFormatClick, fmtSize}} />}
        {videoOnlyUnavailable && <p role="status" className="cfg-hint">This source has no separate video-only format. Choose Video + Audio or enter a custom format selector.</p>}
        {/* ── 4. Size indicator ── */}
        <div className="cfg-size-bar">
          <div>
            <p className="cfg-size-label">Estimated Download Size</p>
            {!isBatch && !configuration.customFormat.trim() && <p className="cfg-size-breakdown">
              Video: {videoSize ? fmtSize(videoSize) : '—'} &nbsp;·&nbsp; Audio: {audioSize ? fmtSize(audioSize) : '—'}
            </p>}
            {(isBatch || configuration.customFormat.trim()) && <p className="cfg-size-breakdown">The extractor selects formats when the job runs.</p>}
          </div>
          <p className="cfg-size-value">
            {totalBytes > 0 ? `${isApprox ? '~' : ''}${fmtSize(totalBytes)}${incomplete ? ' + unknown' : ''}` : 'Unknown'}
          </p>
        </div>

        <OptionsSections info={info} configuration={configuration} setField={setField} capabilities={capabilities} initialPostOpen={initialPreset === 'mp3'} />
        {/* ── Command preview ── */}
        <div>
          <div className="cfg-command-heading">
            <p className="cfg-field-label">Latest Server-validated Command Preview</p>
            {commandDraft !== null && (
              <button type="button" className="cfg-command-reset" onClick={() => setCommandDraft(null)}>Clear preview</button>
            )}
          </div>
          <textarea
            className="cfg-command-box"
            value={commandDraft ?? ''}
            placeholder="Refresh the preview to see the command built from these options."
            readOnly
            aria-label="Generated command"
          />
          <p className="text-xs text-secondary-light dark:text-secondary-dark mt-1">
            {isBatch && configuration.concatPlaylist === 'never' ? 'Preview shows the first item; all items use these shared options. ' : ''}This display contains redacted credentials. Each job gets its own directory; the generated job ID replaces &lt;job-id&gt;.
          </p>
          <button type="button" className="cfg-command-reset" onClick={handlePreview} disabled={previewLoading || videoOnlyUnavailable}>
            {previewLoading ? 'Building preview…' : 'Refresh command preview'}
          </button>
        </div>

      </div>{/* /cfg-body */}

      {/* ── Footer ── */}
      <div className="cfg-footer">
        {actionError && <p role="alert">{actionError}</p>}
        <button type="button" className="cfg-btn-cancel" onClick={closeDialog}>Cancel</button>
        <button type="button" className="cfg-btn-download" onClick={handleDownload} disabled={videoOnlyUnavailable || isSubmitting}>
          {isSubmitting ? 'Starting…' : isBatch ? configuration.concatPlaylist === 'never' ? 'Start batch' : 'Concatenate selected items' : 'Download'}
        </button>
      </div>

    </section>
  );
}
