import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchVideoInfo } from '../services/api';
import ConfigSection from '../features/config/ConfigSection';
import PlaylistSection from '../features/playlist/PlaylistSection';
import DownloadsSection from '../features/downloads/DownloadsSection';

export default function Home() {
  const [url, setUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [view, setView] = useState('input'); // input, config, playlist, downloads
  const [error, setError] = useState('');

  const handleFetchInfo = async () => {
    if (!url.trim()) return;
    setIsFetching(true);
    setError('');
    
    try {
      const info = await fetchVideoInfo(url);
      setVideoInfo(info);
      if (info._type === 'playlist' || info.entries) {
        setView('playlist');
      } else {
        setView('config');
      }
    } catch (err) {
      console.error('Failed to fetch info:', err);
      setError(err.message || 'Failed to fetch video information');
    } finally {
      setIsFetching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFetchInfo();
    }
  };

  return (
    <div className="page-container">
      <div className="page-content">
        <AnimatePresence mode="wait">
        
          {view === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
              className="home-container"
            >
              <section id="description-section" className="home-description-section">
                <h1 className="home-title">YT-DL Studio</h1>
                <p className="home-subtitle">
                  YT-DLS leverages the power of yt-dlp, a feature-rich command-line audio/video downloader with support for thousands of sites. 
                  This studio provides a sleek, modern interface to select formats, manage downloads, and get AI-powered insights with ease.
                </p>
              </section>

              <section id="input-section" className="home-input-section relative">
                <motion.input 
                  layoutId="url-input"
                  id="url-input" 
                  type="text" 
                  placeholder="Enter Video or Playlist URL and press Enter" 
                  className="input-base w-full p-4 rounded-lg bg-white/50 dark:bg-black/50 border border-[var(--border-light)] dark:border-[var(--border-dark)] outline-none focus:ring-2 focus:ring-[var(--primary-green)]" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isFetching}
                />
                <button 
                  id="fetch-info-btn" 
                  aria-label="Fetch video info" 
                  onClick={handleFetchInfo}
                  disabled={isFetching}
                  className="btn btn-primary absolute top-1/2 right-3 -translate-y-1/2 p-2.5 disabled:opacity-50"
                >
                  {isFetching ? (
                    <div role="status" className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-black border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </section>
              
              {error && <p className="text-red-500 mb-4">{error}</p>}

              <div className="home-actions-container">
                <button onClick={() => setView('downloads')} className="btn btn-green-outline px-6 py-2">
                  Download Queue
                </button>
                <button className="btn btn-system-health" title="Run system health check">
                  🔧 System Health
                </button>
              </div>
            </motion.div>
          )}

          {view === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              className="fixed inset-0 z-40 flex items-start justify-center"
              style={{ background: 'rgba(0,0,0,0.55)', padding: '2.5rem 1rem' }}
            >
              <motion.div 
                initial={{ y: 50, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 50, scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                style={{ width: '100%', maxWidth: '860px' }}
              >
                <ConfigSection
                  info={videoInfo}
                  onClose={() => setView('input')}
                  onDownloadStarted={() => {
                    import('canvas-confetti').then((confetti) => {
                      confetti.default({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#00ff99', '#0099ff', '#ffffff']
                      });
                    });
                    setView('downloads');
                  }}
                />
              </motion.div>
            </motion.div>
          )}

          {view === 'playlist' && (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <PlaylistSection 
                info={videoInfo}
                onClose={() => setView('input')}
                onConfigureSelected={(selected) => {
                  import('canvas-confetti').then((confetti) => {
                    confetti.default({
                      particleCount: 200,
                      spread: 90,
                      origin: { y: 0.6 }
                    });
                  });
                  alert(`Selected ${selected.length} items to download`);
                  setView('downloads');
                }}
              />
            </motion.div>
          )}

          {view === 'downloads' && (
            <motion.div 
              key="downloads"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full"
            >
              <div className="flex justify-start mb-4 px-8 w-2/3 mx-auto">
                <button onClick={() => setView('input')} className="btn hover:bg-black/10 dark:hover:bg-white/10 px-4 py-2">
                  &larr; Back to Search
                </button>
              </div>
              <DownloadsSection />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
