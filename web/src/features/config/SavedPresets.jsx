import { useState } from 'react';
import { presetValues } from './model';

const key = 'yt-dls-output-presets';
function readPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(saved)) return [];
    const unique = new Map();
    for (const value of saved) {
      if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || !value.configuration || typeof value.configuration !== 'object' || Array.isArray(value.configuration)) continue;
      unique.set(value.name.trim(), { name: value.name.trim(), configuration: presetValues(value.configuration) });
      if (unique.size === 20) break;
    }
    return [...unique.values()];
  } catch { return []; }
}
export default function SavedPresets({ configuration, onApply }) {
  const [presets, setPresets] = useState(readPresets);
  const [name, setName] = useState(''), [selected, setSelected] = useState(''), [error, setError] = useState('');
  const save = values => { try { localStorage.setItem(key, JSON.stringify(values)); setPresets(values); setError(''); return true; } catch { setError('Could not save presets in this browser.'); return false; } };
  return <details className="cfg-details"><summary>Saved output presets</summary><p className="cfg-hint">Presets store output preferences in this browser. Filenames, source-specific format IDs, paths, raw postprocessor arguments, and credentials are excluded.</p>
    <div className="cfg-preset-row"><label className="cfg-field-label">Preset name<input className="cfg-input" aria-label="Preset name" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button className="btn" disabled={!name.trim() || presets.length >= 20 && !presets.some(p => p.name === name.trim())} onClick={() => { const value = name.trim(); if (save([...presets.filter(p => p.name !== value), { name: value, configuration: presetValues(configuration) }])) setSelected(value); }}>Save preset</button></div>
    <div className="cfg-preset-row"><label className="cfg-field-label">Saved preset<select className="cfg-input" aria-label="Saved preset" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose…</option>{presets.map(preset => <option key={preset.name} value={preset.name}>{preset.name}</option>)}</select></label><button className="btn" disabled={!selected} onClick={() => { const preset = presets.find(p => p.name === selected); if (preset) onApply(presetValues(preset.configuration)); }}>Apply saved preset</button><button className="btn" disabled={!selected} onClick={() => { if (save(presets.filter(p => p.name !== selected))) setSelected(''); }}>Delete preset</button></div>
    {error && <p role="alert">{error}</p>}
  </details>;
}
