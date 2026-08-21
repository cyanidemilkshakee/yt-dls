import './ConfigSection.css';
import { useState } from 'react';
import { startDownload } from '../../services/api';

/* ── tiny helpers ─────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <label className="tog-label">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="tog-track"><span className="tog-thumb" /></span>
    </label>
  );
}

function Checkbox({ checked, onChange, disabled, children }) {
  return (
    <label className="cb-label">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="cb-box" />
      <span className="cb-text">{children}</span>
    </label>
  );
}

function Accordion({ title, open, onToggle, children }) {
  return (
    <div className="cfg-accordion">
      <button className="cfg-accordion-trigger" onClick={onToggle}>
        <span>{title}</span>
        <svg className={`cfg-accordion-chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="cfg-accordion-body">{children}</div>}
    </div>
  );
}

/* ── format tags ──────────────────────────────────────────────────────────── */
function VideoTags({ format }) {
  const text = `${format.id || ''} ${format.format_note || ''} ${format.format || ''}`.toLowerCase();
  const tags = [];
  if (/hdr|hdr10|rec2020|bt2020|hlg|pq|dolby.?vision|dv/i.test(text))
    tags.push(<span key="hdr" className="cfg-tag" style={{ background: '#7c3aed22', color: '#a78bfa' }}>HDR</span>);
  if (/drc/i.test(format.id || ''))
    tags.push(<span key="drc" className="cfg-tag" style={{ background: '#92400e22', color: '#fbbf24' }}>DRC</span>);
  if (/premium|high.?quality|hq/i.test(text))
    tags.push(<span key="hq" className="cfg-tag" style={{ background: '#05966922', color: '#34d399' }}>HQ</span>);
  const fpsMatch = text.match(/(\d+)fps/i);
  if (fpsMatch && parseInt(fpsMatch[1]) >= 48)
    tags.push(<span key="fps" className="cfg-tag" style={{ background: '#1d4ed822', color: '#60a5fa' }}>{fpsMatch[1]}fps</span>);
  return tags.length ? <>{tags}</> : null;
}

function AudioTags({ format }) {
  const text = `${format.id || ''} ${format.format_note || ''} ${format.format || ''}`.toLowerCase();
  const tags = [];
  if (/drc/i.test(format.id || ''))
    tags.push(<span key="drc" className="cfg-tag" style={{ background: '#92400e22', color: '#fbbf24' }}>DRC</span>);
  if (/premium|high.?quality|hq|lossless/i.test(text))
    tags.push(<span key="hq" className="cfg-tag" style={{ background: '#05966922', color: '#34d399' }}>HQ</span>);
  if (/spatial|surround|5\.1|7\.1|atmos/i.test(text))
    tags.push(<span key="spatial" className="cfg-tag" style={{ background: '#7c3aed22', color: '#a78bfa' }}>Spatial</span>);
  return tags.length ? <>{tags}</> : null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
export default function ConfigSection({ info, onClose, onDownloadStarted }) {
  const initialVideoIds = new Set(info?.best_video_ids || []);
  let initialAudioIdsArr = info?.best_audio_ids || [];
  if (initialAudioIdsArr.length > 1) {
    const nonDrc = initialAudioIdsArr.filter(id => !/-drc\b/i.test(id));
    if (nonDrc.length > 0) initialAudioIdsArr = nonDrc;
  }
  const initialAudioIds = new Set(initialAudioIdsArr);

  const [downloadMode, setDownloadMode]       = useState('both');
  const [filenameBase, setFilenameBase]       = useState((info?.suggested_filename || info?.title || 'video').replace(/\.%\(ext\)s$/, ''));
  const [outputFormat, setOutputFormat]       = useState('default');
  const [downloadPath, setDownloadPath]       = useState('./downloads');
  const [activePreset, setActivePreset]       = useState('default');

  const [selectedVideoIds, setSelectedVideoIds] = useState(initialVideoIds);
  const [selectedAudioIds, setSelectedAudioIds] = useState(initialAudioIds);
  const [multiVideo, setMultiVideo]           = useState(false);
  const [multiAudio, setMultiAudio]           = useState(false);

  // Accordion state
  const [openSubs,  setOpenSubs]  = useState(false);
  const [openPost,  setOpenPost]  = useState(false);
  const [openMeta,  setOpenMeta]  = useState(false);
  const [openExtra, setOpenExtra] = useState(false);

  // Subtitles
  const [subtitleLang,   setSubtitleLang]   = useState('none');
  const [subtitleFormat, setSubtitleFormat] = useState('best');
  const [embedSubs,      setEmbedSubs]      = useState(false);

  // Post-processing
  const [extractAudio,      setExtractAudio]      = useState(false);
  const [keepVideo,         setKeepVideo]         = useState(false);
  const [overwriteFiles,    setOverwriteFiles]    = useState(false);
  const [remuxCheck,        setRemuxCheck]        = useState(false);
  const [remuxFormat,       setRemuxFormat]       = useState('');
  const [recodeCheck,       setRecodeCheck]       = useState(false);
  const [recodeFormat,      setRecodeFormat]      = useState('');
  const [convertSubsCheck,  setConvertSubsCheck]  = useState(false);
  const [convertSubsFormat, setConvertSubsFormat] = useState('srt');
  const [convertThumbCheck, setConvertThumbCheck] = useState(false);
  const [convertThumbFormat,setConvertThumbFormat]= useState('jpg');
  const [audioFormat,       setAudioFormat]       = useState('best');
  const [audioQuality,      setAudioQuality]      = useState('');
  const [postprocessorArgs, setPostprocessorArgs] = useState('');

  // Metadata
  const [embedMetadata,  setEmbedMetadata]  = useState(false);
  const [parseMetadata,  setParseMetadata]  = useState('');
  const [replaceMetadata,setReplaceMetadata]= useState('');

  // Additional
  const [embedThumbnail, setEmbedThumbnail] = useState(false);
  const [addChapters,    setAddChapters]    = useState(false);
  const [embedInfoJson,  setEmbedInfoJson]  = useState(false);
  const [writeXattrs,    setWriteXattrs]    = useState(false);
  const [splitChapters,  setSplitChapters]  = useState(false);
  const [forceKeyframes, setForceKeyframes] = useState(false);
  const [concatPlaylist, setConcatPlaylist] = useState('multi_video');
  const [fixupPolicy,    setFixupPolicy]    = useState('detect_or_warn');

  if (!info) return null;

  /* ── format click ─────────────────────────────────────────────────────── */
  const handleVideoFormatClick = (id) => {
    if (multiVideo) {
      const s = new Set(selectedVideoIds);
      s.has(id) ? s.delete(id) : s.add(id);
      setSelectedVideoIds(s);
    } else setSelectedVideoIds(new Set([id]));
  };
  const handleAudioFormatClick = (id) => {
    if (multiAudio) {
      const s = new Set(selectedAudioIds);
      s.has(id) ? s.delete(id) : s.add(id);
      setSelectedAudioIds(s);
    } else setSelectedAudioIds(new Set([id]));
  };

  /* ── helpers ──────────────────────────────────────────────────────────── */
  const fmtSize = (bytes) => {
    if (!bytes) return 'N/A';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
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
  const applyPreset = (name) => {
    setActivePreset(name);
    setSelectedVideoIds(new Set());
    setSelectedAudioIds(new Set());
    setMultiVideo(false); setMultiAudio(false); setExtractAudio(false);
    const bestV = () => setSelectedVideoIds(new Set(info?.best_video_ids || []));
    const bestA = () => setSelectedAudioIds(new Set(info?.best_audio_ids || []));
    if (name === 'default') { setDownloadMode('both'); setOutputFormat('default'); bestV(); bestA(); }
    if (name === 'hq-mp4')  { setDownloadMode('both'); setOutputFormat('mp4');     bestV(); bestA(); }
    if (name === 'mkv')     { setDownloadMode('both'); setOutputFormat('mkv');     bestV(); bestA(); }
    if (name === 'mp3')     {
      setDownloadMode('audio'); setOpenPost(true); setExtractAudio(true);
      setAudioFormat('mp3'); setSelectedAudioIds(new Set(info?.best_audio_ids || []));
    }
  };

  /* ── size ─────────────────────────────────────────────────────────────── */
  let totalBytes = 0, videoSize = null, audioSize = null, isApprox = false;
  if (downloadMode !== 'audio') {
    const vf = info.video_formats?.find(f => selectedVideoIds.has(f.id));
    if (vf?.filesize) { totalBytes += vf.filesize; videoSize = vf.filesize; if (vf.filesize_is_approx) isApprox = true; }
  }
  if (downloadMode !== 'video') {
    const af = info.audio_formats?.find(f => selectedAudioIds.has(f.id));
    if (af?.filesize) { totalBytes += af.filesize; audioSize = af.filesize; if (af.filesize_is_approx) isApprox = true; }
  }

  /* ── command ──────────────────────────────────────────────────────────── */
  const generateCommand = () => {
    let cmd = 'yt-dlp';
    const vid = [...selectedVideoIds].join(',') || 'bestvideo';
    const aud = [...selectedAudioIds].join(',') || 'bestaudio';
    const fmt = downloadMode === 'both' ? `${vid}+${aud}/best`
              : downloadMode === 'video' ? vid : aud;
    cmd += ` -f "${fmt}"`;
    if (outputFormat && outputFormat !== 'default') cmd += ` --merge-output-format ${outputFormat}`;
    cmd += ` -o "${filenameBase || '%(title)s'}.%(ext)s"`;
    if (downloadPath) cmd += ` -P "${downloadPath}"`;
    if (openSubs && subtitleLang !== 'none') {
      cmd += ' --write-subs --write-auto-subs';
      if (subtitleLang !== 'all') cmd += ` --sub-langs ${subtitleLang}`;
      if (subtitleFormat !== 'best') cmd += ` --sub-format ${subtitleFormat}`;
    }
    if (embedSubs) cmd += ' --embed-subs';
    if (embedThumbnail) cmd += ' --embed-thumbnail';
    if (openMeta && embedMetadata) cmd += ' --embed-metadata';
    if (addChapters) cmd += ' --add-chapters';
    if (embedInfoJson) cmd += ' --embed-info-json';
    if (writeXattrs) cmd += ' --xattrs';
    if (openPost && extractAudio) {
      cmd += ' -x';
      if (audioFormat && audioFormat !== 'best') cmd += ` --audio-format ${audioFormat}`;
      if (audioQuality) cmd += ` --audio-quality ${audioQuality}`;
    }
    if (openPost && keepVideo) cmd += ' -k';
    if (openPost && !overwriteFiles) cmd += ' --no-post-overwrites';
    if (openPost && remuxCheck && remuxFormat) cmd += ` --remux-video "${remuxFormat}"`;
    if (openPost && recodeCheck && recodeFormat) cmd += ` --recode-video "${recodeFormat}"`;
    if (convertSubsCheck && convertSubsFormat) cmd += ` --convert-subs ${convertSubsFormat}`;
    if (convertThumbCheck && convertThumbFormat) cmd += ` --convert-thumbnails ${convertThumbFormat}`;
    if (openPost && postprocessorArgs) cmd += ` --ppa "${postprocessorArgs}"`;
    if (openMeta && parseMetadata) cmd += ` --parse-metadata "${parseMetadata}"`;
    if (openMeta && replaceMetadata) cmd += ` --replace-in-metadata "${replaceMetadata}"`;
    if (splitChapters) cmd += ' --split-chapters';
    if (forceKeyframes) cmd += ' --force-keyframes-at-cuts';
    if (fixupPolicy && fixupPolicy !== 'detect_or_warn') cmd += ` --fixup ${fixupPolicy}`;
    if (concatPlaylist && concatPlaylist !== 'multi_video') cmd += ` --concat-playlist ${concatPlaylist}`;
    cmd += ` "${info.original_url}"`;
    return cmd;
  };

  /* ── download ─────────────────────────────────────────────────────────── */
  const handleDownload = async () => {
    try {
      const vid = [...selectedVideoIds].join('+') || 'bestvideo';
      const aud = [...selectedAudioIds].join('+') || 'bestaudio';
      await startDownload({
        url: info.original_url,
        formatCode: downloadMode === 'both' ? `${vid}+${aud}/best`
                  : downloadMode === 'video' ? vid : aud,
        filename: filenameBase, outputFormat, downloadPath,
        enableSubtitles: openSubs, subtitleLang, subtitleFormat, embedSubs,
        enablePostprocessing: openPost, extractAudio, audioFormat, audioQuality,
        remuxVideo: remuxCheck ? remuxFormat : null,
        recodeVideo: recodeCheck ? recodeFormat : null,
        convertSubs: convertSubsCheck ? convertSubsFormat : null,
        convertThumb: convertThumbCheck ? convertThumbFormat : null,
        postprocessorArgs, keepVideo, postOverwrites: overwriteFiles,
        embedThumbnail, embedMetadata, addChapters, embedInfoJson,
        parseMetadata: openMeta ? parseMetadata : null,
        replaceInMetadata: openMeta ? replaceMetadata : null,
        xattrs: writeXattrs, fixup: fixupPolicy, splitChapters, forceKeyframes, concatPlaylist,
      });
      onDownloadStarted?.();
      onClose?.();
    } catch (err) {
      console.error('Download failed to start:', err);
      alert('Failed to start download: ' + (err.message || err));
    }
  };

  /* ── select helpers ───────────────────────────────────────────────────── */
  const Select = ({ value, onChange, disabled, children, className = '' }) => (
    <select
      value={value} onChange={onChange} disabled={disabled}
      className={`cfg-inline-select ${className}`}
      style={{ background: 'var(--input-bg-light)', color: 'var(--text-light)' }}
    >
      {children}
    </select>
  );

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

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <section id="config-section" className="cfg-shell card">

      {/* ── Header ── */}
      <div className="cfg-header">
        <span className="cfg-header-title">Download Configuration</span>
        <button className="cfg-close-btn" onClick={onClose} aria-label="Close">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      <div className="cfg-body">

        {/* ── 1. Meta row ── */}
        <div className="cfg-meta-row">
          <img
            id="config-thumbnail"
            src={info.thumbnail}
            alt="Thumbnail"
            className="cfg-thumb"
          />
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
                  value={filenameBase}
                  onChange={e => setFilenameBase(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <p className="cfg-field-label">Container</p>
                  <select
                    className="cfg-input"
                    value={outputFormat}
                    onChange={e => setOutputFormat(e.target.value)}
                    style={{ padding: '0.5rem 0.7rem' }}
                  >
                    <option value="default">Default</option>
                    <option value="mp4">MP4</option>
                    <option value="mkv">MKV</option>
                    <option value="webm">WebM</option>
                  </select>
                </div>
                <div>
                  <p className="cfg-field-label">Download Path</p>
                  <input
                    type="text"
                    className="cfg-input"
                    value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="./downloads"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Controls: Presets + Mode ── */}
        <div className="cfg-controls-row">
          <div>
            <p className="cfg-control-label">Preset</p>
            <div className="seg-group">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`seg-btn ${activePreset === p.id ? 'seg-active-green' : ''}`}
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
                  onClick={() => setDownloadMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 3. Format tables ── */}
        <div className="cfg-tables-row">
          {/* Video */}
          <div className="cfg-table-panel">
            <div className="cfg-table-head-bar">
              <span className="cfg-table-head-title">Video Formats</span>
              <Checkbox checked={multiVideo} onChange={e => setMultiVideo(e.target.checked)}>
                Multi-select
              </Checkbox>
            </div>
            <div className="cfg-table-scroll">
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Ext</th><th>Res</th><th>Bitrate</th><th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {info.video_formats?.length > 0 ? info.video_formats.map(fmt => {
                    const isBest = initialVideoIds.has(fmt.id);
                    const isSel  = selectedVideoIds.has(fmt.id);
                    const kbps   = fmt.vbr ? `${Math.round(fmt.vbr)}k` : fmt.tbr ? `${Math.round(fmt.tbr)}k` : '—';
                    return (
                      <tr
                        key={fmt.id}
                        onClick={() => handleVideoFormatClick(fmt.id)}
                        className={`${isBest ? 'cfg-row-best' : ''} ${isSel ? 'cfg-row-selected' : ''}`}
                      >
                        <td className="font-mono text-xs">{fmt.id}</td>
                        <td>{fmt.ext}<VideoTags format={fmt} /></td>
                        <td>{fmt.resolution || '—'}</td>
                        <td>{kbps}</td>
                        <td>{fmt.filesize_is_approx ? '~' : ''}{fmtSize(fmt.filesize)}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary-light)' }}>No video formats</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audio */}
          <div className="cfg-table-panel">
            <div className="cfg-table-head-bar">
              <span className="cfg-table-head-title">Audio Formats</span>
              <Checkbox checked={multiAudio} onChange={e => setMultiAudio(e.target.checked)}>
                Multi-select
              </Checkbox>
            </div>
            <div className="cfg-table-scroll">
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Ext</th><th>Bitrate</th><th>Size</th><th>Codec</th>
                  </tr>
                </thead>
                <tbody>
                  {info.audio_formats?.length > 0 ? info.audio_formats.map(fmt => {
                    const isBest = initialAudioIds.has(fmt.id);
                    const isSel  = selectedAudioIds.has(fmt.id);
                    const kbps   = fmt.abr ? `${Math.round(fmt.abr)}k` : '—';
                    return (
                      <tr
                        key={fmt.id}
                        onClick={() => handleAudioFormatClick(fmt.id)}
                        className={`${isBest ? 'cfg-row-best' : ''} ${isSel ? 'cfg-row-selected' : ''}`}
                      >
                        <td className="font-mono text-xs">{fmt.id}</td>
                        <td>{fmt.ext}<AudioTags format={fmt} /></td>
                        <td>{kbps}</td>
                        <td>{fmt.filesize_is_approx ? '~' : ''}{fmtSize(fmt.filesize)}</td>
                        <td className="font-mono text-xs truncate" style={{ maxWidth: '7rem' }} title={fmt.acodec}>{fmt.acodec || '—'}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary-light)' }}>No audio formats</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── 4. Size indicator ── */}
        <div className="cfg-size-bar">
          <div>
            <p className="cfg-size-label">Estimated Download Size</p>
            <p className="cfg-size-breakdown">
              Video: {videoSize ? fmtSize(videoSize) : '—'} &nbsp;·&nbsp; Audio: {audioSize ? fmtSize(audioSize) : '—'}
            </p>
          </div>
          <p className="cfg-size-value">
            {totalBytes > 0 ? `${isApprox ? '~' : ''}${fmtSize(totalBytes)}` : '—'}
          </p>
        </div>

        {/* ── 5. Accordions ── */}

        {/* Subtitles */}
        <Accordion title="Subtitles" open={openSubs} onToggle={() => setOpenSubs(o => !o)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <p className="cfg-field-label">Language</p>
              <Select value={subtitleLang} onChange={e => setSubtitleLang(e.target.value)}>
                <option value="none">No Subtitles</option>
                <option value="all">All Languages</option>
                {info.subtitle_languages?.map(l => <option key={l} value={l}>{l}</option>)}
              </Select>
            </div>
            <div>
              <p className="cfg-field-label">Format</p>
              <Select value={subtitleFormat} onChange={e => setSubtitleFormat(e.target.value)}>
                <option value="best">Best</option>
                <option value="srt">SRT</option>
                <option value="vtt">VTT</option>
                <option value="ass">ASS</option>
              </Select>
            </div>
          </div>
          <Checkbox checked={embedSubs} onChange={e => setEmbedSubs(e.target.checked)}>Embed subtitles into file</Checkbox>
          {info.subtitles?.length > 0 && (
            <div className="cfg-table-panel">
              <div className="cfg-table-scroll" style={{ maxHeight: '140px' }}>
                <table className="cfg-table">
                  <thead><tr><th>Lang</th><th>Name</th><th>Auto</th></tr></thead>
                  <tbody>
                    {info.subtitles.map((s, i) => (
                      <tr key={i}><td>{s.lang}</td><td>{s.name}</td><td>{s.auto ? 'Yes' : 'No'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Accordion>

        {/* Post-processing */}
        <Accordion title="Post-processing" open={openPost} onToggle={() => setOpenPost(o => !o)}>
          <div className="cfg-opt-grid">
            <Checkbox checked={extractAudio}   onChange={e => setExtractAudio(e.target.checked)}>Extract Audio</Checkbox>
            <Checkbox checked={keepVideo}       onChange={e => setKeepVideo(e.target.checked)}>Keep Video</Checkbox>
            <Checkbox checked={overwriteFiles}  onChange={e => setOverwriteFiles(e.target.checked)} disabled={keepVideo}>Overwrite Files</Checkbox>
          </div>

          {extractAudio && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border-light)' }}>
              <div>
                <p className="cfg-field-label">Audio Format</p>
                <Select value={audioFormat} onChange={e => setAudioFormat(e.target.value)}>
                  <option value="best">Best</option>
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="flac">FLAC</option>
                  <option value="wav">WAV</option>
                  <option value="opus">Opus</option>
                </Select>
              </div>
              <div>
                <p className="cfg-field-label">Quality</p>
                <Select value={audioQuality} onChange={e => setAudioQuality(e.target.value)}>
                  <option value="">Default (VBR 5)</option>
                  <option value="0">0 — Best</option>
                  <option value="5">5 — Standard</option>
                  <option value="9">9 — Smallest</option>
                  <option value="320K">320K CBR</option>
                  <option value="256K">256K CBR</option>
                  <option value="192K">192K CBR</option>
                </Select>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {[
              { label: 'Remux to', check: remuxCheck, setCheck: setRemuxCheck, val: remuxFormat, setVal: setRemuxFormat, opts: ['mp4','mkv','webm'] },
              { label: 'Recode to', check: recodeCheck, setCheck: setRecodeCheck, val: recodeFormat, setVal: setRecodeFormat, opts: ['mp4','mkv','webm'] },
              { label: 'Convert Subs', check: convertSubsCheck, setCheck: setConvertSubsCheck, val: convertSubsFormat, setVal: setConvertSubsFormat, opts: ['srt','vtt','ass'] },
              { label: 'Convert Thumb', check: convertThumbCheck, setCheck: setConvertThumbCheck, val: convertThumbFormat, setVal: setConvertThumbFormat, opts: ['jpg','png','webp'] },
            ].map(({ label, check, setCheck, val, setVal, opts }) => (
              <div key={label} className="cfg-inline-row">
                <label className="cb-label" style={{ flexShrink: 0 }}>
                  <input type="checkbox" checked={check} onChange={e => setCheck(e.target.checked)} />
                  <span className="cb-box" />
                </label>
                <span className="cfg-inline-label">{label}</span>
                <Select value={val} onChange={e => setVal(e.target.value)} disabled={!check}>
                  {!val && <option value="">Select…</option>}
                  {opts.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                </Select>
              </div>
            ))}
          </div>

          <div>
            <p className="cfg-field-label">Post-processor Args (--ppa)</p>
            <input
              type="text"
              className="cfg-input"
              value={postprocessorArgs}
              onChange={e => setPostprocessorArgs(e.target.value)}
              placeholder="ffmpeg:-vcodec libx264"
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>
        </Accordion>

        {/* Metadata */}
        <Accordion title="Metadata" open={openMeta} onToggle={() => setOpenMeta(o => !o)}>
          <Checkbox checked={embedMetadata} onChange={e => setEmbedMetadata(e.target.checked)}>Embed metadata</Checkbox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <p className="cfg-field-label">Parse Metadata</p>
              <input type="text" className="cfg-input" value={parseMetadata} onChange={e => setParseMetadata(e.target.value)} placeholder="%(artist)s:%(title)s" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <div>
              <p className="cfg-field-label">Replace in Metadata</p>
              <input type="text" className="cfg-input" value={replaceMetadata} onChange={e => setReplaceMetadata(e.target.value)} placeholder="title /[.!?]/_" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
          </div>
        </Accordion>

        {/* Additional */}
        <Accordion title="Additional Options" open={openExtra} onToggle={() => setOpenExtra(o => !o)}>
          <div className="cfg-opt-grid">
            <Checkbox checked={embedThumbnail} onChange={e => setEmbedThumbnail(e.target.checked)}>Embed Thumbnail</Checkbox>
            <Checkbox checked={addChapters}    onChange={e => setAddChapters(e.target.checked)}>Add Chapters</Checkbox>
            <Checkbox checked={embedInfoJson}  onChange={e => setEmbedInfoJson(e.target.checked)}>Embed info.json</Checkbox>
            <Checkbox checked={writeXattrs}    onChange={e => setWriteXattrs(e.target.checked)}>Write xattrs</Checkbox>
            <Checkbox checked={splitChapters}  onChange={e => setSplitChapters(e.target.checked)}>Split Chapters</Checkbox>
            <Checkbox checked={forceKeyframes} onChange={e => setForceKeyframes(e.target.checked)}>Force Keyframes at Cuts</Checkbox>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <p className="cfg-field-label">Fixup Policy</p>
              <Select value={fixupPolicy} onChange={e => setFixupPolicy(e.target.value)}>
                <option value="detect_or_warn">Detect or Warn</option>
                <option value="never">Never</option>
                <option value="warn">Warn</option>
                <option value="ignore">Ignore</option>
              </Select>
            </div>
            <div>
              <p className="cfg-field-label">Concat Playlist</p>
              <Select value={concatPlaylist} onChange={e => setConcatPlaylist(e.target.value)}>
                <option value="multi_video">Multi Video</option>
                <option value="never">Never</option>
                <option value="always">Always</option>
              </Select>
            </div>
          </div>
        </Accordion>

        {/* ── Command preview ── */}
        <div>
          <p className="cfg-field-label" style={{ marginBottom: '0.4rem' }}>Generated Command</p>
          <textarea className="cfg-command-box" readOnly value={generateCommand()} />
        </div>

      </div>{/* /cfg-body */}

      {/* ── Footer ── */}
      <div className="cfg-footer">
        <button className="cfg-btn-cancel" onClick={onClose}>Cancel</button>
        <button className="cfg-btn-download" onClick={handleDownload}>
          Download
        </button>
      </div>

    </section>
  );
}
