import './PlaylistSection.css';
import { useState } from 'react';

export default function PlaylistSection({ info, onClose, onConfigureSelected }) {
  const [selectedIds, setSelectedIds] = useState(new Set(info?.entries?.map(e => e.id) || []));

  if (!info || !info.entries) return null;

  const handleSelectAll = () => {
    setSelectedIds(new Set(info.entries.map(e => e.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleSelection = (id) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const allSelected = selectedIds.size === info.entries.length;

  const handleConfigure = () => {
    const selectedEntries = info.entries.filter(e => selectedIds.has(e.id));
    onConfigureSelected(selectedEntries);
  };

  return (
    <section id="playlist-section" className="playlist-container card">
      <div className="playlist-header">
        <div>
          <h2 className="playlist-title">{info.title}</h2>
          <p className="playlist-subtitle">{info.entries.length} videos</p>
        </div>
        <button onClick={onClose} className="btn hover:bg-black/10 dark:hover:bg-white/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
      </div>

      <div className="playlist-controls">
        <div className="playlist-controls-group">
          <button onClick={handleSelectAll} className="btn text-sm py-1 px-3">Select All</button>
          <button onClick={handleDeselectAll} className="btn text-sm py-1 px-3">Deselect All</button>
        </div>
        <p className="text-sm font-semibold">{selectedIds.size} video(s) selected</p>
      </div>

      <div className="playlist-table-container table-container">
        <table className="w-full text-sm">
          <thead className="playlist-table-header">
            <tr>
              <th className="playlist-th-center">
                <input 
                  type="checkbox" 
                  className="checkbox-style" 
                  checked={allSelected} 
                  onChange={allSelected ? handleDeselectAll : handleSelectAll} 
                />
              </th>
              <th className="playlist-th-left">Title</th>
              <th className="playlist-th-right">Duration</th>
            </tr>
          </thead>
          <tbody className="playlist-tbody">
            {info.entries.map(entry => (
              <tr 
                key={entry.id} 
                className="playlist-tr"
                onClick={() => toggleSelection(entry.id)}
              >
                <td className="playlist-td-center" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    className="checkbox-style" 
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelection(entry.id)}
                  />
                </td>
                <td className="playlist-td">
                  <div className="playlist-item-content">
                    <img 
                      className="playlist-item-img" 
                      src={entry.thumbnail || ''} 
                      alt="Thumbnail" 
                      loading="lazy" 
                    />
                    <div className="playlist-item-details">
                      <div className="playlist-item-title">{entry.title}</div>
                      <div className="playlist-item-id">ID: {entry.id}</div>
                    </div>
                  </div>
                </td>
                <td className="playlist-td-right">
                  {Math.floor(entry.duration / 60)}:{(entry.duration % 60).toString().padStart(2, '0')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-6">
        <button 
          onClick={handleConfigure}
          disabled={selectedIds.size === 0} 
          className="btn btn-primary px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Configure & Download Selected
        </button>
      </div>
    </section>
  );
}
