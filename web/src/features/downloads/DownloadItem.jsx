import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { pauseResumeDownload, cancelDownload, removeDownload } from '../../services/api';

export default function DownloadItem({ download, onRefetch }) {
  const [showLog, setShowLog] = useState(false);

  const { id, filename, status, progress, url, error, downloaded_bytes, total_bytes, speed, eta } = download;
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isTerminal = isCompleted || status === 'failed' || status === 'cancelled';
  const isError = status === 'failed';
  const percentage = Number.isFinite(Number(progress)) ? Math.round(Number(progress)) : 0;

  const formatBytes = (value) => {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let amount = Number(value);
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  const formatSpeed = (value) => Number(value) > 0 ? `${formatBytes(value)}/s` : '—';
  const formatEta = (value) => Number(value) >= 0 ? `${Math.floor(Number(value) / 60)}:${String(Math.floor(Number(value) % 60)).padStart(2, '0')}` : '—';

  const handlePauseResume = async () => {
    await pauseResumeDownload(id, isPaused ? 'resume' : 'pause');
    onRefetch();
  };

  const handleCancel = async () => {
    await cancelDownload(id);
    onRefetch();
  };

  const handleRemove = async () => {
    await removeDownload(id);
    onRefetch();
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="dl-card card"
    >
      <div className="dl-card-inner">
        {/* We would use the actual thumbnail if available, or a fallback */}
        <div className="dl-thumb-fallback">
          Thumb
        </div>
        
        <div className="dl-content">
          <div className="dl-title-row">
            <div className="dl-title-wrapper">
              <h3 className="dl-title">{filename || url}</h3>
              <p className="dl-status status-text">{status}</p>
            </div>
            
            <div className="dl-actions download-actions-row">
              <button onClick={() => setShowLog(!showLog)} className="dl-action-btn" title="Toggle Log">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75c0-.231-.035-.454-.1-.664M6.75 7.5h1.5M6.75 12h1.5m-1.5 3h1.5M3.375 5.106c-.09.097-.159.223-.22.352a2.25 2.25 0 00-.653.882V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75c0-.231-.035-.454-.1-.664" />
                </svg>
              </button>
              
              {!isTerminal && !isError && (
                <button onClick={handlePauseResume} className="dl-action-btn" title="Pause/Resume">
                  {isPaused ? (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4l12 6-12 6V4z"/></svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z"/></svg>
                  )}
                </button>
              )}
              
              {!isTerminal && (
                <button onClick={handleCancel} className="dl-action-btn" title="Cancel">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                </button>
              )}
              
              {isTerminal && (
                <button onClick={handleRemove} className="dl-action-btn" title="Remove">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                </button>
              )}
            </div>
          </div>

          <div className="dl-progress-wrapper">
            <div className="dl-progress-bar-container">
              <div 
                className={`dl-progress-bar-base ${isError ? 'bg-red-400' : 'bg-green-400'}`} 
                style={{ width: `${percentage}%`, boxShadow: isError ? 'none' : '0 0 8px rgba(0, 255, 153, 0.6)' }}
              />
            </div>
            <div className="dl-progress-stats">
              <p className="dl-progress-mono">{formatBytes(downloaded_bytes)} / {formatBytes(total_bytes)}</p>
              <div className="dl-progress-group">
                <span>{formatSpeed(speed)}</span>
                <span>ETA: {formatEta(eta)}</span>
                <span className="font-bold">{percentage}%</span>
              </div>
            </div>
          </div>

        </div>
      </div>
      <AnimatePresence initial={false}>
        {showLog && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="dl-log-container">
              <pre className="dl-log-pre">
                {/* Normally we would map over log events */}
                {error || 'Starting download...\nDownloading...\nDone.'}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
