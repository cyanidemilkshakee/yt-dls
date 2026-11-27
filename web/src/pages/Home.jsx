import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import { fetchVideoInfo, getSettings } from '../services/api';
import HealthDiagnostics from '../components/HealthDiagnostics';
import ConfigSection from '../features/config/ConfigSection';
import PlaylistSection from '../features/playlist/PlaylistSection';
import DownloadsSection from '../features/downloads/DownloadsSection';
import HomeArtwork from './HomeArtwork';

export default function Home() {
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [view, setView] = useState('input');
  const [error, setError] = useState('');
  const [showHealth, setShowHealth] = useState(false);
  const [batchConfiguration, setBatchConfiguration] = useState(null);
  const [batchDraft, setBatchDraft] = useState(null);
  const [playlistSelection, setPlaylistSelection] = useState(null);
  const [playlistPreset, setPlaylistPreset] = useState('default');
  const fetchingInfoRef = useRef(false);
  const infoController = useRef(null);
  const focusSearch = useRef(false);
  useEffect(() => () => infoController.current?.abort(), []);

  const backToSearch = () => { focusSearch.current = true; setView('input'); };
  const entryKey = entry => `${entry.playlist_index ?? videoInfo?.entries?.indexOf(entry)}:${entry.url}`;
  const configureBatch = (entries, preset) => {
    const entryNames = Object.fromEntries(entries.map((entry, index) => [index, batchDraft?.names?.[entryKey(entry)] || '']));
    setBatchConfiguration({ entries, preset, configuration: batchDraft?.configuration, entryNames });
    setView('config');
  };
  const closeConfiguration = draft => {
    if (batchConfiguration) {
      const names = Object.fromEntries(batchConfiguration.entries.map((entry, index) => [entryKey(entry), draft.entryNames[index] || '']));
      setBatchDraft({ configuration: draft.configuration, names });
      setView('playlist');
    } else backToSearch();
  };

  const handleFetchInfo = async () => {
    if (!url.trim() || fetchingInfoRef.current) return;
    fetchingInfoRef.current = true;
    setIsFetching(true);
    setError('');
    const controller = new AbortController();
    infoController.current = controller;
    try {
      const advancedSettings = await getSettings();
      if (controller.signal.aborted) return;
      const info = await fetchVideoInfo(url.trim(), advancedSettings, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setVideoInfo(info);
      setBatchConfiguration(null);
      setBatchDraft(null);
      setPlaylistSelection(null);
      setPlaylistPreset('default');
      setView(info._type === 'playlist' || info.entries ? 'playlist' : 'config');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Failed to fetch video information');
    } finally {
      fetchingInfoRef.current = false;
      setIsFetching(false);
    }
  };

  return <div className="page-container">{view === 'input' && <HomeArtwork />}<div className="page-content"><AnimatePresence mode="wait">
    {view === 'input' && <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }} className="home-container">
      <section id="description-section" className="home-description-section">
        <h1 className="home-title">YT-DL Studio</h1>
        <p className="home-subtitle">YT-DL Studio uses yt-dlp to inspect and download audio and video from supported sites. This studio provides a modern interface to inspect media, select formats, and manage downloads.</p>
      </section>
      {isFetching && <button className="btn mb-4" onClick={() => infoController.current?.abort()}>Cancel inspection</button>}
      <section id="input-section" className="home-input-section relative">
        <label htmlFor="url-input" className="sr-only">Video or playlist URL</label>
        <motion.input layoutId="url-input" id="url-input" type="url" placeholder="Enter Video or Playlist URL and press Enter"
          ref={element => { if (element && focusSearch.current) { element.focus(); focusSearch.current = false; } }}
          className="input-base w-full p-4 rounded-lg bg-[var(--input-bg-light)] dark:bg-[var(--input-bg-dark)] border border-[var(--border-light)] dark:border-[var(--border-dark)] outline-none focus:ring-2 focus:ring-[var(--primary-green)]"
          value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') handleFetchInfo(); }} disabled={isFetching}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'fetch-error' : undefined} />
        <button id="fetch-info-btn" aria-label="Fetch video info" onClick={handleFetchInfo} disabled={isFetching || !url.trim()}
          className="btn btn-primary absolute top-1/2 right-3 -translate-y-1/2 p-2.5 disabled:opacity-50">
          {isFetching ? <span role="status" aria-label="Inspecting source" className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-[var(--primary-green)] border-r-transparent" />
            : <FiArrowRight aria-hidden="true" className="h-6 w-6" />}
        </button>
      </section>
      {error && <p id="fetch-error" role="alert" className="mb-4 text-[var(--primary-green)]">{error}</p>}
      <div className="home-actions-container">
        <button onClick={() => setView('downloads')} className="btn btn-green-outline px-6 py-2">Download Queue</button>
        <button className="btn btn-system-health" onClick={() => setShowHealth(value => !value)} aria-expanded={showHealth} aria-controls={showHealth ? 'health-diagnostics' : undefined}>System Health</button>
      </div>
      {showHealth && <div id="health-diagnostics"><HealthDiagnostics /></div>}
    </motion.div>}

    {view === 'config' && <motion.div key="config" initial={{ opacity: 0, backdropFilter: 'blur(0px)' }} animate={{ opacity: 1, backdropFilter: 'blur(4px)' }} exit={{ opacity: 0, backdropFilter: 'blur(0px)' }} className="fixed inset-0 z-60 flex items-start justify-center" style={{ background: 'rgba(0,0,0,0.72)', padding: '2.5rem 1rem' }}>
      <motion.div initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="config-modal">
        <ConfigSection info={videoInfo} batchEntries={batchConfiguration?.entries} initialPreset={batchConfiguration?.preset || 'default'} initialConfiguration={batchConfiguration?.configuration} initialEntryNames={batchConfiguration?.entryNames} onClose={closeConfiguration} onDownloadStarted={() => setView('downloads')} />
      </motion.div>
    </motion.div>}

    {view === 'playlist' && <motion.div key="playlist" className="w-full min-w-0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <PlaylistSection info={videoInfo} initialSelected={playlistSelection} initialPreset={playlistPreset}
        onSelectionChange={selection => setPlaylistSelection([...selection])}
        onPresetChange={preset => { setPlaylistPreset(preset); setBatchDraft(value => value ? { ...value, configuration: null } : null); }}
        onClose={backToSearch} error={error} onConfigureSelected={configureBatch} />
    </motion.div>}

    {view === 'downloads' && <motion.div key="downloads" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="w-full">
      <div className="flex justify-start mb-4 max-w-6xl mx-auto"><button onClick={backToSearch} className="btn hover:bg-black/10 dark:hover:bg-white/5 px-4 py-2">&larr; Back to Search</button></div>
      <DownloadsSection />
    </motion.div>}
  </AnimatePresence></div></div>;
}
