// Main application module that coordinates all other modules
import { state } from './config.js';
import { fetchPlatformInfo, fetchVideoInfo, startDownload } from './api.js';
import { initBackground } from './background.js';
import { initUIControls } from './ui-controls.js';
import { initDownloadManager, addDownload, cleanup } from './download-manager.js';
import { 
    initConfigManager, 
    showConfigSection, 
    hideConfigSection,
    populateConfigView,
    buildDownloadOptions
} from './config-manager.js';
import { 
    initPlaylistManager, 
    showPlaylistViewUnderInput,
    hidePlaylistView,
    getSelectedPlaylistUrls
} from './playlist-manager.js';
import { initSettingsManager } from './settings-manager.js';
import { 
    showNotification, 
    handleNetworkError,
    addEventListenerSafe
} from './ui-utils.js';

// Main application class
class YTDLStudioApp {
    constructor() {
        this.initialized = false;
    }

    // Initialize the application
    async init() {
        if (this.initialized) {
            console.warn('App already initialized');
            return;
        }

        console.log('Initializing YT-DL Studio...');

        try {
            // Initialize all modules
            await this.initializeModules();
            
            // Setup main application event listeners
            this.setupMainEventListeners();
            
            // Setup cleanup on page unload
            this.setupCleanup();
            
            this.initialized = true;
            console.log('YT-DL Studio initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            showNotification('Failed to initialize application', 'error');
        }
    }

    // Initialize all modules
    async initializeModules() {
        // Initialize 3D background
        initBackground();
        
        // Initialize UI controls (theme, sidebar)
        initUIControls();
        
        // Initialize download manager
        initDownloadManager();
        
        // Initialize config manager
        initConfigManager();
        
        // Initialize playlist manager
        initPlaylistManager();
        
        // Initialize settings manager (only if on settings page)
        initSettingsManager();
        
        // Fetch platform info
        await fetchPlatformInfo();
        
        console.log('All modules initialized');
    }

    // Setup main application event listeners
    setupMainEventListeners() {
        this.setupVideoFetching();
        this.setupKeyboardShortcuts();
        this.setupCustomEvents();
        this.setupDonationScrolling();
        this.setupImageErrorHandling();
    }

    // Setup video fetching functionality
    setupVideoFetching() {
        const urlInput = document.getElementById('url-input');
        const fetchBtn = document.getElementById('fetch-info-btn');

        if (urlInput && fetchBtn) {
            addEventListenerSafe(urlInput, 'keypress', (e) => {
                if (e.key === 'Enter') {
                    this.triggerMetadataFetch();
                }
            });

            addEventListenerSafe(fetchBtn, 'click', () => {
                this.triggerMetadataFetch();
            });
        }
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape key to close config
            if (e.key === 'Escape') {
                const configSection = document.getElementById('config-section');
                if (configSection && !configSection.classList.contains('hidden')) {
                    hideConfigSection();
                }
            }
            
            // Ctrl/Cmd + Enter to confirm download
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const configSection = document.getElementById('config-section');
                if (configSection && !configSection.classList.contains('hidden')) {
                    e.preventDefault();
                    const confirmBtn = document.getElementById('config-confirm-download-btn');
                    if (confirmBtn) confirmBtn.click();
                }
            }
        });
    }

    // Setup custom events
    setupCustomEvents() {
        // Listen for config confirmation
        document.addEventListener('configConfirm', async (e) => {
            const options = e.detail;
            await this.startRealDownload(options);
        });

        // Listen for playlist configuration request
        document.addEventListener('playlistConfigure', async (e) => {
            const { firstUrl } = e.detail;
            await this.handlePlaylistConfigure(firstUrl);
        });
    }

    // Setup donation grid scrolling
    setupDonationScrolling() {
        const donationGrid = document.getElementById('donationGrid');
        const scrollLeftBtn = document.getElementById('scrollLeftBtn');
        const scrollRightBtn = document.getElementById('scrollRightBtn');

        if (donationGrid && scrollLeftBtn && scrollRightBtn) {
            const scrollAmount = 300;

            addEventListenerSafe(scrollLeftBtn, 'click', () => {
                donationGrid.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            });

            addEventListenerSafe(scrollRightBtn, 'click', () => {
                donationGrid.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            });
        }
    }

    // Setup image error handling
    setupImageErrorHandling() {
        document.addEventListener('error', (e) => {
            if (e.target.tagName === 'IMG') {
                const htmlEl = document.documentElement;
                const theme = htmlEl.classList.contains('dark') ? 'dark' : 'light';
                const bgColor = theme === 'dark' ? '1a1a1a' : 'ffffff';
                const textColor = theme === 'dark' ? 'e5e5e5' : '1a1a1a';
                e.target.src = `https://placehold.co/128x72/${bgColor}/${textColor}?text=No+Image`;
            }
        }, true);
    }

    // Setup cleanup on page unload
    setupCleanup() {
        window.addEventListener('beforeunload', () => {
            cleanup();
        });
    }

    // Trigger metadata fetch for URL
    async triggerMetadataFetch() {
        const urlInput = document.getElementById('url-input');
        if (!urlInput) return;

        if (urlInput.value.trim() === '') {
            urlInput.focus();
            urlInput.classList.add('ring-2', 'ring-red-500');
            setTimeout(() => urlInput.classList.remove('ring-2', 'ring-red-500'), 2000);
            return;
        }

        state.currentUrl = urlInput.value.trim();
        showConfigSection();

        try {
            const info = await this.fetchVideoInfoWithErrorHandling(state.currentUrl);

            if (info._type === 'playlist') {
                state.currentPlaylistInfo = info;
                hideConfigSection();
                setTimeout(() => {
                    showPlaylistViewUnderInput(info);
                }, 600);
            } else {
                state.currentVideoInfo = info;
                populateConfigView(info, false);
            }
        } catch (error) {
            const configContentLoading = document.getElementById('config-content-loading');
            if (configContentLoading) {
                configContentLoading.innerHTML = `
                    <div class="text-center text-red-500 p-4">
                        <p class="font-semibold">Error Fetching Information</p>
                        <p class="text-sm mt-1">${error.message}</p>
                        <button class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onclick="document.dispatchEvent(new Event('hideConfig'))">Close</button>
                    </div>`;
            }
        }

        urlInput.value = '';
    }

    // Fetch video info with error handling
    async fetchVideoInfoWithErrorHandling(url) {
        try {
            return await fetchVideoInfo(url);
        } catch (error) {
            throw new Error(handleNetworkError(error));
        }
    }

    // Handle playlist configuration
    async handlePlaylistConfigure(firstUrl) {
        hidePlaylistView();
        showConfigSection();
        
        const configContentLoading = document.getElementById('config-content-loading');
        if (configContentLoading) {
            configContentLoading.innerHTML = `
                <div role="status" class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--primary-green)] border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
                <p class="mt-2 text-[var(--text-secondary-light)] dark:text-[var(--text-secondary-dark)]">Fetching details for batch config...</p>`;
        }

        try {
            const videoInfo = await fetchVideoInfo(firstUrl);
            populateConfigView(videoInfo, true);
        } catch (error) {
            if (configContentLoading) {
                configContentLoading.innerHTML = `
                    <div class="text-center text-red-500 p-4">
                        <p class="font-semibold">Error fetching video details</p>
                        <p class="text-sm mt-1">${handleNetworkError(error)}</p>
                        <button class="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" onclick="document.dispatchEvent(new Event('hideConfig'))">Close</button>
                    </div>`;
            }
        }
    }

    // Start real download
    async startRealDownload(options) {
        try {
            const isBatch = state.selectedPlaylistVideoUrls.size > 0 && state.currentPlaylistInfo !== null;
            const urlsToDownload = isBatch ? getSelectedPlaylistUrls() : [state.currentUrl];

            showNotification(`Starting download for ${urlsToDownload.length} item(s)...`, 'info');

            for (const url of urlsToDownload) {
                const downloadOptions = { ...options, url };

                let title, thumbnail;
                if (isBatch) {
                    const videoEntry = state.currentPlaylistInfo.entries.find(v => v.url === url);
                    title = videoEntry?.title || 'Playlist Video';
                    thumbnail = videoEntry?.thumbnail || (state.currentVideoInfo?.thumbnail || '');
                } else {
                    title = state.currentVideoInfo?.title || 'Video Download';
                    thumbnail = state.currentVideoInfo?.thumbnail || '';
                }

                const response = await startDownload(downloadOptions);
                addDownload({
                    title: title,
                    thumbnail: thumbnail,
                    downloadId: response.download_id
                });
            }

            // Show downloads section
            const downloadsSection = document.getElementById('downloads-section');
            const clearCompletedBtn = document.getElementById('clear-completed-btn');
            
            if (downloadsSection) {
                downloadsSection.classList.remove('hidden');
                downloadsSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            if (clearCompletedBtn) {
                clearCompletedBtn.classList.remove('hidden');
            }

            // Clear batch selection if applicable
            if (isBatch) {
                state.selectedPlaylistVideoUrls.clear();
                state.currentPlaylistInfo = null;
            }

        } catch (error) {
            showNotification(`Failed to start download: ${handleNetworkError(error)}`, 'error');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new YTDLStudioApp();
    await app.init();
});

// Export for potential external use
export default YTDLStudioApp;
