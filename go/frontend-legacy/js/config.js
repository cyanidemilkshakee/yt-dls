// Configuration constants and global settings
const runtimeLocation = globalThis.location;
export const API_BASE_URL = runtimeLocation && runtimeLocation.protocol !== 'file:'
    ? `${runtimeLocation.origin}/api`
    : 'http://localhost:7391/api';

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
    sseConnection: null,
    lowPerformanceMode: localStorage.getItem('yt-dls-low-perf-mode') === 'true',
};

// Settings storage key
export const SETTINGS_KEY = 'yt-dls-advanced-settings';
export const SECRET_SETTINGS_KEY = 'yt-dls-session-secrets';
export const SECRET_SETTING_NAMES = new Set([
    'password', 'twofactor', 'video-password', 'ap-password',
    'client-certificate-password'
]);

function readJsonStorage(storage, key) {
    try { return JSON.parse(storage.getItem(key) || '{}'); }
    catch (error) {
        console.warn(`Ignoring invalid saved settings for ${key}:`, error);
        storage.removeItem(key);
        return {};
    }
}

export function getAdvancedSettings() {
    return {
        ...readJsonStorage(localStorage, SETTINGS_KEY),
        ...readJsonStorage(sessionStorage, SECRET_SETTINGS_KEY)
    };
}

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
