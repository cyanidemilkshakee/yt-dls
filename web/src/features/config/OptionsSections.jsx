import { useState } from 'react';
import { Accordion, Checkbox, Select } from './Controls';
import contract from '../../../../api/contract.json';

const options = values => values.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>);
export default function OptionsSections({ info, configuration: c, setField: set, capabilities, initialPostOpen }) {
  const [open, setOpen] = useState({ post: initialPostOpen });
  const section = (key, title, children) => <Accordion title={title} open={Boolean(open[key])} onToggle={() => setOpen(value => ({ ...value, [key]: !value[key] }))}>{children}</Accordion>;
  const check = (key, label, disabled = false) => <Checkbox checked={c[key]} disabled={disabled} onChange={event => set(key, event.target.checked)}>{label}</Checkbox>;
  const field = (key, label, placeholder = '', disabled = false) => <label className="cfg-field-label">{label}<input className="cfg-input" aria-label={label} value={c[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} disabled={disabled} /></label>;
  const languages = [...new Set([...(info.subtitle_languages || []), ...(info.subtitles || []).map(subtitle => subtitle.lang)])].filter(Boolean).sort();
  return <>
    {section('subs', 'Subtitles', <>
      <div className="cfg-subtitle-grid"><label className="cfg-field-label">Language<Select label="Subtitle language" value={c.customSubtitleLang.trim() ? 'custom' : c.subtitleLang} onChange={event => set('subtitleLang', event.target.value)}><option value="none">No Subtitles</option><option value="all">All Languages</option>{c.customSubtitleLang.trim() && <option value="custom" disabled>Custom patterns</option>}{[...new Set([...languages, ...(c.subtitleLang !== 'none' && c.subtitleLang !== 'all' ? [c.subtitleLang] : [])])].filter(value => value !== 'none' && value !== 'all').map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
        <label className="cfg-field-label">Format<Select label="Subtitle format" value={c.subtitleFormat} onChange={event => set('subtitleFormat', event.target.value)}>{options(['best', ...contract.enums.subtitleFormats])}</Select></label></div>
      {field('customSubtitleLang', 'Custom subtitle languages', 'en.*,ja,-live_chat')}
      <p className="cfg-hint">Use comma-separated languages or patterns. Availability is checked by the extractor for each item.</p>
      {check('subtitlesEnabled', 'Download subtitles')}{check('embedSubs', 'Embed subtitles into file', !c.subtitlesEnabled)}
      {info.subtitles?.length > 0 && <div className="cfg-table-panel"><div className="cfg-table-scroll"><table className="cfg-table"><thead><tr><th>Language</th><th>Name</th><th>Automatic</th></tr></thead><tbody>{info.subtitles.map((subtitle, index) => <tr key={index}><td>{subtitle.lang}</td><td>{subtitle.name}</td><td>{subtitle.auto ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></div>}
    </>)}
    {section('post', 'Post-processing', <>
      <div className="cfg-opt-grid">{check('extractAudio', 'Extract Audio', c.downloadMode !== 'both')}{check('keepVideo', 'Keep Video')}{check('overwriteFiles', 'Overwrite Files')}{check('postOverwriteFiles', 'Overwrite postprocessed files')}</div>
      {c.extractAudio && <div className="cfg-subtitle-grid"><label className="cfg-field-label">Audio Format<Select label="Audio format" value={c.audioFormat} onChange={event => set('audioFormat', event.target.value)}>{options(['best', ...contract.enums.audioFormats])}</Select></label>
        {field('audioQuality', 'Audio quality', '0–10 or bitrate, e.g. 192K')}</div>}
      <p className="cfg-hint">FFmpeg is required for merging and conversion. Quality 0 is best; 10 is smallest. Lossless formats ignore lossy quality settings.</p>
      <div className="cfg-subtitle-grid">{[
        ['remuxCheck', 'remuxFormat', 'Remux to', [...new Set([...contract.enums.videoFormats, ...contract.enums.audioFormats])]],
        ['recodeCheck', 'recodeFormat', 'Recode to', contract.enums.videoFormats],
        ['convertSubsCheck', 'convertSubsFormat', 'Convert Subs', contract.enums.subtitleFormats],
        ['convertThumbCheck', 'convertThumbFormat', 'Convert Thumb', contract.enums.thumbFormats]
      ].map(([enabled, key, label, values]) => {
        const unavailable = enabled === 'convertSubsCheck' && !c.subtitlesEnabled;
        return <div key={key} className="cfg-inline-row">{check(enabled, label, unavailable)}<Select label={`${label} format`} disabled={!c[enabled] || unavailable} value={c[key] || values[0]} onChange={event => set(key, event.target.value)}>{options(values)}</Select></div>;
      })}</div>
      {!c.subtitlesEnabled && <p className="cfg-hint">Enable subtitles to convert or embed them.</p>}
      {field('postprocessorArgs', 'Postprocessor arguments', 'ffmpeg:-vcodec libx264', !capabilities?.dangerous_options)}
    </>)}
    {section('metadata', 'Metadata', <>
      {check('embedMetadata', 'Embed metadata')}
      <div className="cfg-subtitle-grid">{field('parseMetadata', 'Parse metadata', '%(artist)s:%(title)s')}{field('replaceMetadata', 'Replace metadata', 'title /[.!?]/_')}</div>
    </>)}
    {section('extra', 'Additional Options', <>
      <div className="cfg-opt-grid">{check('embedThumbnail', 'Embed Thumbnail')}{check('addChapters', 'Add Chapters')}{check('embedInfoJson', 'Embed info.json')}{check('writeXattrs', 'Write xattrs')}{check('splitChapters', 'Split Chapters')}{check('forceKeyframes', 'Force Keyframes at Cuts', !c.splitChapters)}</div>
      <label className="cfg-field-label">Fixup Policy<Select label="Fixup policy" value={c.fixupPolicy} onChange={event => set('fixupPolicy', event.target.value)}>{contract.enums.fixupPolicies.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select></label>
    </>)}
  </>;
}
