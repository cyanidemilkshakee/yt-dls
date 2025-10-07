// Configuration constants and global settings
export const API_BASE_URL = 'http://localhost:5000/api';

// Platform capabilities
export let platformInfo = {
    platform: 'unknown',
    supports_pause_resume: true
};

// Application state
export const state = {
    currentUrl: '',
    currentVideoInfo: null,
    currentPlaylistInfo: null,
    selectedVideoIds: new Set(),
    selectedAudioIds: new Set(),
    selectedPlaylistVideoUrls: new Set(),
    currentDownloadMode: 'both',
    downloadIdCounter: 0,
    activeDownloadPolling: new Map(),
    sseConnection: null
};

// Settings storage key
export const SETTINGS_KEY = 'yt-dls-advanced-settings';

// Download options defaults
export const DEFAULT_DOWNLOAD_OPTIONS = {
    outputFormat: 'default',
    filename: null,
    downloadPath: './downloads',
    enableSubtitles: false,
    subtitleLang: 'none',
    subtitleFormat: 'best',
    embedSubs: false,
    enablePostprocessing: false,
    extractAudio: false,
    audioFormat: 'best',
    audioQuality: null,
    embedThumbnail: false,
    embedMetadata: false,
    addChapters: false,
    overwrite: false
};

// Update platform info
export function updatePlatformInfo(info) {
    Object.assign(platformInfo, info);
}

// Reset application state
export function resetState() {
    state.currentUrl = '';
    state.currentVideoInfo = null;
    state.currentPlaylistInfo = null;
    state.selectedVideoIds.clear();
    state.selectedAudioIds.clear();
    state.selectedPlaylistVideoUrls.clear();
    state.currentDownloadMode = 'both';
}
