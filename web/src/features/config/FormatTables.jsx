import { Checkbox } from './Controls';
function VideoTags({ format }) {
  const text = `${format.id || ''} ${format.format_note || ''} ${format.format || ''}`.toLowerCase();
  const tags = [];
  if (/hdr|hdr10|rec2020|bt2020|hlg|pq|dolby.?vision|dv/i.test(text))
    tags.push(<span key="hdr" className="cfg-tag cfg-tag-accent">HDR</span>);
  if (/drc/i.test(format.id || ''))
    tags.push(<span key="drc" className="cfg-tag cfg-tag-muted">DRC</span>);
  if (/premium|high.?quality|hq/i.test(text))
    tags.push(<span key="hq" className="cfg-tag cfg-tag-accent">HQ</span>);
  const fps = Number(format.fps) || Number(text.match(/(\d+)fps/i)?.[1]);
  if (fps >= 48)
    tags.push(<span key="fps" className="cfg-tag cfg-tag-muted">{fps}fps</span>);
  return tags.length ? <>{tags}</> : null;
}

function AudioTags({ format }) {
  const text = `${format.id || ''} ${format.format_note || ''} ${format.format || ''}`.toLowerCase();
  const tags = [];
  if (/drc/i.test(format.id || ''))
    tags.push(<span key="drc" className="cfg-tag cfg-tag-muted">DRC</span>);
  if (/premium|high.?quality|hq|lossless/i.test(text))
    tags.push(<span key="hq" className="cfg-tag cfg-tag-accent">HQ</span>);
  if (/spatial|surround|5\.1|7\.1|atmos/i.test(text))
    tags.push(<span key="spatial" className="cfg-tag cfg-tag-accent">Spatial</span>);
  return tags.length ? <>{tags}</> : null;
}

export default function FormatTables({ info, downloadMode, disabled, multiVideo, setMultiVideo, selectedVideoIds, setSelectedVideoIds, multiAudio, setMultiAudio, selectedAudioIds, setSelectedAudioIds, visibleVideoFormats, initialVideoIds, initialAudioIds, handleVideoFormatClick, handleAudioFormatClick, fmtSize }) {
  const combined = !multiVideo && info.video_formats?.some(format => selectedVideoIds.has(format.id) && format.type === 'combined');
  return (
      <fieldset className="cfg-format-selection" disabled={disabled}>
        <legend className="sr-only">Source formats</legend>
        {disabled && <p className="cfg-hint">The custom format selector overrides the format choices below.</p>}
        <div className="cfg-tables-row">
          {/* Video */}
          {downloadMode !== 'audio' && <div className="cfg-table-panel">
            <div className="cfg-table-head-bar">
              <span className="cfg-table-head-title">Video Formats</span>
              <Checkbox label="Enable multiple video streams" checked={multiVideo} onChange={e => {
                const enabled = e.target.checked;
                setMultiVideo(enabled);
                setSelectedVideoIds(current => {
                  const eligible = [...current].filter(id => info.video_formats?.some(format => format.id === id && format.type === 'video'));
                  if (eligible.length > 0) return new Set(enabled ? eligible : eligible.slice(0, 1));
                  const firstVideo = info.video_formats?.find(format => format.type === 'video')?.id;
                  return new Set(firstVideo ? [firstVideo] : []);
                });
              }}>
                Multi-select
              </Checkbox>
            </div>
            <div className="cfg-table-scroll">
              <table className="cfg-table">
                <caption className="sr-only">Available video formats</caption>
                <thead>
                  <tr>
                    <th>ID</th><th>Ext / Codec</th><th>Resolution</th><th>Bitrate</th><th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleVideoFormats.length > 0 ? visibleVideoFormats.map(fmt => {
                    const isBest = initialVideoIds.has(fmt.id);
                    const isSel  = selectedVideoIds.has(fmt.id);
                    const kbps   = fmt.vbr ? `${Math.round(fmt.vbr)}k` : fmt.tbr ? `${Math.round(fmt.tbr)}k` : '—';
                    return (
                      <tr
                        key={fmt.id}
                        onClick={() => !disabled && handleVideoFormatClick(fmt.id)}
                        className={`${isBest ? 'cfg-row-best' : ''} ${isSel ? 'cfg-row-selected' : ''}`}
                      >
                        <td className="font-mono text-xs"><label className="cfg-format-choice"><input type={multiVideo ? 'checkbox' : 'radio'} name="video-format" checked={isSel} aria-label={`Select video format ${fmt.id}`} onClick={event => event.stopPropagation()} onChange={() => handleVideoFormatClick(fmt.id)} />{fmt.id}</label></td>
                        <td>{fmt.ext}<VideoTags format={fmt} /><span className="cfg-format-codec" title={fmt.vcodec}>{fmt.vcodec || '—'}</span></td>
                        <td>{fmt.resolution || (fmt.width && fmt.height ? `${fmt.width}×${fmt.height}` : fmt.height ? `${fmt.height}p` : '—')}{fmt.fps > 0 && fmt.fps < 48 && <span className="cfg-format-codec">{fmt.fps}fps</span>}</td>
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
          </div>}

          {/* Audio */}
          {downloadMode !== 'video' && !(downloadMode === 'both' && combined) && <div className="cfg-table-panel">
            <div className="cfg-table-head-bar">
              <span className="cfg-table-head-title">Audio Formats</span>
              <Checkbox label="Enable multiple audio streams" checked={multiAudio} onChange={e => {
                const enabled = e.target.checked;
                setMultiAudio(enabled);
                setSelectedAudioIds(current => new Set(enabled ? [...current] : [...current].slice(0, 1)));
              }}>
                Multi-select
              </Checkbox>
            </div>
            <div className="cfg-table-scroll">
              <table className="cfg-table">
                <caption className="sr-only">Available audio formats</caption>
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
                        onClick={() => !disabled && handleAudioFormatClick(fmt.id)}
                        className={`${isBest ? 'cfg-row-best' : ''} ${isSel ? 'cfg-row-selected' : ''}`}
                      >
                        <td className="font-mono text-xs"><label className="cfg-format-choice"><input type={multiAudio ? 'checkbox' : 'radio'} name="audio-format" checked={isSel} aria-label={`Select audio format ${fmt.id}`} onClick={event => event.stopPropagation()} onChange={() => handleAudioFormatClick(fmt.id)} />{fmt.id}</label></td>
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
          </div>}
          {downloadMode === 'both' && combined && <p className="cfg-hint">The selected video format already includes audio.</p>}
        </div>
      </fieldset>


); }
