import './Downloads.css';
import { useDownloads } from './useDownloads';
import DownloadItem from './DownloadItem';
import { motion, AnimatePresence } from 'framer-motion';

export default function DownloadsSection() {
  const { downloads, refetch } = useDownloads();

  const handleClearCompleted = async () => {
    // For now, this requires hooking into API's removeDownload function
    refetch();
  };

  if (downloads.length === 0) return null;

  return (
    <section id="downloads-section" className="downloads-container">
      <div id="downloads-header" className="downloads-header">
        <h2 className="downloads-title">Downloads</h2>
        <button 
          id="clear-completed-btn" 
          onClick={handleClearCompleted}
          className="btn-clear-completed"
        >
          Clear Completed
        </button>
      </div>
      <motion.div layout id="downloads-container" className="downloads-list">
        <AnimatePresence mode="popLayout">
          {downloads.map(dl => (
            <DownloadItem key={dl.id} download={dl} onRefetch={refetch} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
