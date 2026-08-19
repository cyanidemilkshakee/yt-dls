import { state } from './config.js';
import { 
    showNotification, 
    formatDuration,
    scrollIntoView,
    addEventListenerSafe
} from './ui-utils.js';

// Playlist management functionality
let playlistSection, mainInterfaceSections;

// Initialize playlist manager
export function initPlaylistManager() {
    initPlaylistElements();
    setupPlaylistEventListeners();
    
    // Listen for custom events
    document.addEventListener('hidePlaylistView', hidePlaylistView);
}

// Initialize DOM elements
function initPlaylistElements() {
    playlistSection = document.getElementById('playlist-section');
    mainInterfaceSections = [
        document.getElementById('description-section'), 
        document.getElementById('input-section'), 
        document.getElementById('show-downloads-btn')
    ];
}

// Setup event listeners for playlist functionality
function setupPlaylistEventListeners() {
    const playlistItemsBody = document.getElementById('playlist-items-body');
    const playlistBackBtn = document.getElementById('playlist-back-btn');
    const playlistSelectAllBtn = document.getElementById('playlist-select-all-btn');
    const playlistDeselectAllBtn = document.getElementById('playlist-deselect-all-btn');
    const playlistHeaderCheckbox = document.getElementById('playlist-header-checkbox');
    const playlistConfigureBtn = document.getElementById('playlist-configure-btn');

    if (playlistItemsBody) {
        addEventListenerSafe(playlistItemsBody, 'click', (e) => {
            const row = e.target.closest('.playlist-item-row');
            if (!row || !row.dataset.url) return;

            const checkbox = row.querySelector('.playlist-item-checkbox');
            if (!checkbox) return;
            
            if (e.target.tagName !== 'INPUT') {
                checkbox.checked = !checkbox.checked;
            }

            togglePlaylistItem(row, checkbox);
        });
    }

    if (playlistBackBtn) {
        addEventListenerSafe(playlistBackBtn, 'click', () => {
            hidePlaylistView();
            state.currentPlaylistInfo = null;
            state.selectedPlaylistVideoUrls.clear();
        });
    }

    if (playlistSelectAllBtn) {
        addEventListenerSafe(playlistSelectAllBtn, 'click', () => {
            playlistItemsBody?.querySelectorAll('.playlist-item-row').forEach(row => {
                const checkbox = row.querySelector('.playlist-item-checkbox');
                if (checkbox && row.dataset.url) {
                    checkbox.checked = true;
                    state.selectedPlaylistVideoUrls.add(row.dataset.url);
                    row.classList.add('selected');
                }
            });
            updatePlaylistSelectionCount();
        });
    }

    if (playlistDeselectAllBtn) {
        addEventListenerSafe(playlistDeselectAllBtn, 'click', () => {
            playlistItemsBody?.querySelectorAll('.playlist-item-row').forEach(row => {
                const checkbox = row.querySelector('.playlist-item-checkbox');
                if (checkbox) {
                    checkbox.checked = false;
                    row.classList.remove('selected');
                }
            });
            state.selectedPlaylistVideoUrls.clear();
            updatePlaylistSelectionCount();
        });
    }

    if (playlistHeaderCheckbox) {
        addEventListenerSafe(playlistHeaderCheckbox, 'change', (e) => {
            if (e.target.checked) {
                playlistSelectAllBtn?.click();
            } else {
                playlistDeselectAllBtn?.click();
            }
        });
    }

    if (playlistConfigureBtn) {
        addEventListenerSafe(playlistConfigureBtn, 'click', async () => {
            if (state.selectedPlaylistVideoUrls.size === 0) return;

            const firstUrl = state.selectedPlaylistVideoUrls.values().next().value;

            // Notify app to handle configuration
            const event = new CustomEvent('playlistConfigure', {
                detail: { firstUrl }
            });
            document.dispatchEvent(event);
        });
    }
}

// Toggle playlist item selection
function togglePlaylistItem(row, checkbox) {
    const url = row.dataset.url;
    if (checkbox.checked) {
        state.selectedPlaylistVideoUrls.add(url);
        row.classList.add('selected');
    } else {
        state.selectedPlaylistVideoUrls.delete(url);
        row.classList.remove('selected');
    }
    updatePlaylistSelectionCount();
}

// Update playlist selection count display
function updatePlaylistSelectionCount() {
    const count = state.selectedPlaylistVideoUrls.size;
    const countElement = document.getElementById('playlist-selection-count');
    const headerCheckbox = document.getElementById('playlist-header-checkbox');
    const configureBtn = document.getElementById('playlist-configure-btn');

    if (countElement) {
        countElement.textContent = `${count} video(s) selected`;
    }

    if (headerCheckbox && state.currentPlaylistInfo) {
        headerCheckbox.checked = count > 0 && count === state.currentPlaylistInfo.entries.length;
    }

    if (configureBtn) {
        configureBtn.disabled = count === 0;
    }
}

// Show playlist view (full screen)
export function showPlaylistView(playlistInfo) {
    if (!playlistSection || !mainInterfaceSections) return;

    mainInterfaceSections.forEach(el => {
        if (el) el.style.display = 'none';
    });
    
    playlistSection.classList.remove('hidden');
    scrollIntoView(playlistSection);

    populatePlaylistView(playlistInfo);
    showNotification(`Loaded playlist with ${playlistInfo.entries.length} videos`, 'success');
}

// Show playlist view under input (embedded)
export function showPlaylistViewUnderInput(playlistInfo) {
    if (!playlistSection) return;

    // Keep main interface visible but show playlist under input
    playlistSection.classList.remove('hidden');
    playlistSection.classList.add('playlist-under-input');
    
    // Add smooth transition with cinematic effect
    playlistSection.style.transform = 'translateY(-20px) scale(0.95)';
    playlistSection.style.opacity = '0';
    
    setTimeout(() => {
        playlistSection.style.transform = 'translateY(0) scale(1)';
        playlistSection.style.opacity = '1';
    }, 50);

    populatePlaylistView(playlistInfo);
    showNotification(`Loaded playlist with ${playlistInfo.entries.length} videos`, 'success');
}

// Hide playlist view
export function hidePlaylistView() {
    if (!playlistSection || !mainInterfaceSections) return;

    playlistSection.style.transform = 'translateY(-20px) scale(0.95)';
    playlistSection.style.opacity = '0';
    
    setTimeout(() => {
        playlistSection.classList.add('hidden');
        playlistSection.classList.remove('playlist-under-input');
        playlistSection.style.transform = '';
        playlistSection.style.opacity = '';
        
        mainInterfaceSections.forEach(el => {
            if (el) {
                el.style.display = el.id === 'show-downloads-btn' ? 'inline-flex' : 'block';
            }
        });
        
        const descSection = document.querySelector('#description-section');
        const inputSection = document.querySelector('#input-section');
        if (descSection) descSection.style.display = 'block';
        if (inputSection) inputSection.style.display = 'block';
    }, 300);
}

// Populate playlist view with data
function populatePlaylistView(playlistInfo) {
    state.currentPlaylistInfo = playlistInfo;
    
    const titleElement = document.getElementById('playlist-title');
    const countElement = document.getElementById('playlist-video-count');
    const itemsBody = document.getElementById('playlist-items-body');
    const itemTemplate = document.getElementById('playlist-item-template');

    if (titleElement) {
        titleElement.textContent = playlistInfo.title || 'Untitled Playlist';
    }
    if (countElement) {
        countElement.textContent = `${playlistInfo.entries.length} videos`;
    }

    if (itemsBody && itemTemplate) {
        itemsBody.innerHTML = '';
        state.selectedPlaylistVideoUrls.clear();

        playlistInfo.entries.forEach((video, index) => {
            const itemClone = itemTemplate.content.cloneNode(true);
            const row = itemClone.querySelector('.playlist-item-row');
            
            row.id = `playlist-item-${video.id}`;
            row.dataset.url = video.url;
            
            const thumbnail = row.querySelector('.playlist-item-thumbnail');
            if (video.thumbnail) {
                thumbnail.src = video.thumbnail;
                thumbnail.alt = `Thumbnail for ${video.title}`;
            } else {
                thumbnail.src = 'https://placehold.co/120x68/1a1a1a/e5e5e5?text=No+Image';
                thumbnail.alt = 'No thumbnail available';
            }
            
            thumbnail.addEventListener('error', (e) => {
                e.target.src = 'https://placehold.co/120x68/1a1a1a/e5e5e5?text=No+Image';
            });
            
            row.querySelector('.playlist-item-title').textContent = video.title || 'Untitled Video';
            row.querySelector('.playlist-item-id').textContent = `ID: ${video.id}`;
            row.querySelector('.playlist-item-duration').textContent = formatDuration(video.duration);
            
            itemsBody.appendChild(itemClone);
        });
    }

    updatePlaylistSelectionCount();
}

// Get selected playlist URLs
export function getSelectedPlaylistUrls() {
    return Array.from(state.selectedPlaylistVideoUrls);
}

// Clear playlist selection
export function clearPlaylistSelection() {
    state.selectedPlaylistVideoUrls.clear();
    state.currentPlaylistInfo = null;
}

// Check if playlist is currently shown
export function isPlaylistVisible() {
    return playlistSection && !playlistSection.classList.contains('hidden');
}
