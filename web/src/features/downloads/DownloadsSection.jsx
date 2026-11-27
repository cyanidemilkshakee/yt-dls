import './Downloads.css';
import ContentRegion from '../../components/ContentRegion';
import { useState } from 'react';
import { useDownloads } from './useDownloads';
import DownloadItem from './DownloadItem';
import { motion, AnimatePresence } from 'framer-motion';
import { removeDownload } from '../../services/api';
import { isTerminal } from './model';

export default function DownloadsSection() {
  const { downloads, refetch, error, loading, connection } = useDownloads();
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const protectedChildren = new Set(downloads.filter(download => download.kind === 'batch' && !isTerminal(download.status)).flatMap(download => download.children || []));
  const clearableIds = downloads.filter(download => download.status === 'completed' && !protectedChildren.has(download.id)).map(download => download.id);

  const handleClearCompleted = async () => {
    if (clearing) return;
    const completedIds = clearableIds;
    if (completedIds.length === 0) return;
    setClearing(true);
    setClearError('');
    try {
      const results = await Promise.allSettled(completedIds.map(removeDownload));
      if (results.some(result => result.status === 'rejected')) {
        setClearError('Some completed records could not be cleared. Please retry.');
      }
    } finally {
      await refetch();
      setClearing(false);
    }
  };

  return (
    <section id="downloads-section" className="downloads-container">
      <div id="downloads-header" className="downloads-header">
        <h2 className="downloads-title">Downloads</h2>
        <button
          id="clear-completed-btn"
          onClick={handleClearCompleted}
          disabled={clearing || clearableIds.length === 0}
          aria-label="Clear completed downloads"
          className="btn-clear-completed"
        >
          {clearing ? 'Clearing…' : 'Clear Completed'}
        </button>
      </div>
      {error && <p role="alert">{error} <button className="btn" onClick={refetch}>Refresh</button></p>}
      {clearError && <p role="alert">{clearError}</p>}
      {loading && <p role="status">Loading downloads…</p>}
      {!loading && <p className="text-sm mb-3">{connection === 'live' ? 'Live progress connected' : 'Updating with polling; live progress reconnects automatically'}. Removing history keeps files; use Manage files to clean them first.</p>}
      {!loading && downloads.length === 0 && <ContentRegion className="downloads-empty" role="status">Your download queue is empty. Inspect a video or playlist to get started.</ContentRegion>}
      <motion.div layout id="downloads-container" className="downloads-list">
        <AnimatePresence mode="popLayout">
          {downloads.map(dl => (
            <DownloadItem key={dl.id} download={dl} onRefetch={refetch} removalBlocked={protectedChildren.has(dl.id)} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
