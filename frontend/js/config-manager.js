import { state, SETTINGS_KEY } from './config.js';
import { 
    showNotification, 
    addCinematicEnter, 
    addCinematicExit,
    getValue,
    getChecked,
    setChecked,
    setValue,
    setupCheckboxToggle,
    addEventListenerSafe
} from './ui-utils.js';

// Config section DOM elements
let configSection, configContentLoading, configContentLoaded;
let configCloseBtn, configCancelBtn, configConfirmBtn;
let configTitle, configSummary, configFilenameBase, configThumbnail;
let videoFormatsTableBody, audioFormatsTableBody, subtitlesTableBody;
let videoFormatsSection, audioFormatsSection;
let downloadModeGroup, finalCommandTextarea;
let subtitlesToggle, subtitlesOptions;
let postprocessingToggle, postprocessingOptions;
let metadataToggle, metadataOptions;
let presetsGroup, allConfigInputs;

// Initialize config manager
export function initConfigManager() {
    initConfigElements();
    setupConfigEventListeners();
    setupPresets();
    setupDownloadModes();
    setupToggleOptions();
}

// Initialize DOM elements
function initConfigElements() {
    configSection = document.getElementById('config-section');
    
    // Initialize config template first if needed
    const configTemplate = document.getElementById('config-section-template');
    if (configSection && configTemplate && configSection.innerHTML.trim() === '') {
        configSection.innerHTML = configTemplate.innerHTML;
    }
    
    // Now initialize all the DOM elements
    configContentLoading = document.getElementById('config-content-loading');
    configContentLoaded = document.getElementById('config-content-loaded');
    configCloseBtn = document.getElementById('config-close-btn');
    configCancelBtn = document.getElementById('config-cancel-btn');
    configConfirmBtn = document.getElementById('config-confirm-download-btn');
    configTitle = document.getElementById('config-title');
    configSummary = document.getElementById('config-summary');
    configFilenameBase = document.getElementById('config-filename-base');
    configThumbnail = document.getElementById('config-thumbnail');
    videoFormatsTableBody = document.getElementById('video-formats-table-body');
    audioFormatsTableBody = document.getElementById('audio-formats-table-body');
    subtitlesTableBody = document.getElementById('subtitles-table-body');
    videoFormatsSection = document.getElementById('video-formats-section');
    audioFormatsSection = document.getElementById('audio-formats-section');
    downloadModeGroup = document.getElementById('download-mode-group');
    finalCommandTextarea = document.getElementById('final-command');
    subtitlesToggle = document.getElementById('enable-subtitles');
    subtitlesOptions = document.getElementById('subtitles-options');
    postprocessingToggle = document.getElementById('enable-postprocessing');
    postprocessingOptions = document.getElementById('postprocessing-options');
    metadataToggle = document.getElementById('enable-metadata');
    metadataOptions = document.getElementById('metadata-options');
    presetsGroup = document.getElementById('presets-group');
    allConfigInputs = configSection?.querySelectorAll('input, select, button') || [];
    
    // Initialize file size display elements
    window.totalFileSizeElement = document.getElementById('total-file-size');
    window.fileSizeBreakdownElement = document.getElementById('file-size-breakdown');
}

// Setup event listeners
function setupConfigEventListeners() {
    if (configCloseBtn) {
        addEventListenerSafe(configCloseBtn, 'click', hideConfigSection);
    }
    if (configCancelBtn) {
        addEventListenerSafe(configCancelBtn, 'click', hideConfigSection);
    }
    if (configConfirmBtn) {
        addEventListenerSafe(configConfirmBtn, 'click', () => {
            // This will be handled by the main app
            const event = new CustomEvent('configConfirm', {
                detail: buildDownloadOptions()
            });
            document.dispatchEvent(event);
            hideConfigSection();
        });
    }

    // Format selection event listeners
    if (videoFormatsTableBody) {
        addEventListenerSafe(videoFormatsTableBody, 'click', handleFormatSelection);
    }
    if (audioFormatsTableBody) {
        addEventListenerSafe(audioFormatsTableBody, 'click', handleFormatSelection);
    }

    // Command textarea two-way binding
    if (finalCommandTextarea) {
        addEventListenerSafe(finalCommandTextarea, 'input', parseCommandAndUpdateUI);
    }

    // Setup input change listeners for custom preset activation
    allConfigInputs.forEach(input => {
        const isPresetButton = input.classList.contains('preset-btn');
        const isDownloadModeButton = input.closest('#download-mode-group');
        if (!isPresetButton && !isDownloadModeButton) {
            addEventListenerSafe(input, 'change', () => {
                setActivePreset('custom');
                generateCommand();
                // Update file size for multi-stream checkboxes
                if (input.id === 'config-video-multistreams' || input.id === 'config-audio-multistreams') {
                    updateTotalFileSize();
                }
            });
            addEventListenerSafe(input, 'input', () => {
                setActivePreset('custom');
                generateCommand();
            });
        }
    });
}

// Setup toggle options
function setupToggleOptions() {
    if (subtitlesToggle && subtitlesOptions) {
        addEventListenerSafe(subtitlesToggle, 'change', () => {
            subtitlesOptions.classList.toggle('hidden', !subtitlesToggle.checked);
            generateCommand();
        });
    }

    if (postprocessingToggle && postprocessingOptions) {
        addEventListenerSafe(postprocessingToggle, 'change', () => {
            postprocessingOptions.classList.toggle('hidden', !postprocessingToggle.checked);
            generateCommand();
        });
    }

    if (metadataToggle && metadataOptions) {
        addEventListenerSafe(metadataToggle, 'change', () => {
            metadataOptions.classList.toggle('hidden', !metadataToggle.checked);
            generateCommand();
        });
    }

    // Setup specific checkbox toggles
    setupCheckboxToggle('pp-remux-check', 'pp-remux-format', generateCommand);
    setupCheckboxToggle('pp-recode-check', 'pp-recode-format', generateCommand);
    setupCheckboxToggle('pp-convert-subs-check', 'pp-convert-subs-format', generateCommand);
    setupCheckboxToggle('pp-convert-thumb-check', 'pp-convert-thumb-format', generateCommand);

    // Keep video checkbox special handling
    const keepVideoCheck = document.getElementById('pp-keep-video');
    const overwriteCheck = document.getElementById('pp-overwrite');
    if (keepVideoCheck && overwriteCheck) {
        addEventListenerSafe(keepVideoCheck, 'change', () => {
            if (keepVideoCheck.checked) {
                overwriteCheck.checked = true;
                overwriteCheck.disabled = true;
            } else {
                overwriteCheck.disabled = false;
            }
            generateCommand();
        });
    }

    // Extract audio options toggle
    const extractAudioCheck = document.getElementById('pp-extract-audio');
    const extractAudioOptions = document.getElementById('extract-audio-options');
    if (extractAudioCheck && extractAudioOptions) {
        addEventListenerSafe(extractAudioCheck, 'change', () => {
            extractAudioOptions.classList.toggle('hidden', !extractAudioCheck.checked);
            if (extractAudioCheck.checked && postprocessingToggle) {
                postprocessingToggle.checked = true;
                postprocessingOptions.classList.remove('hidden');
            }
            generateCommand();
        });
    }
}

// Setup presets
function setupPresets() {
    if (!presetsGroup) return;

    addEventListenerSafe(presetsGroup, 'click', (e) => {
        if (e.target.classList.contains('preset-btn')) {
            const preset = e.target.dataset.preset;
            setActivePreset(preset);
            if (preset !== 'custom') {
                applyPreset(preset);
            }
        }
    });
}

// Setup download modes
function setupDownloadModes() {
    if (!downloadModeGroup) return;

    addEventListenerSafe(downloadModeGroup, 'click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const mode = e.target.dataset.mode;
        state.currentDownloadMode = mode;
        
        if (mode === 'audio') {
            state.selectedVideoIds.clear();
            document.querySelectorAll('#video-formats-table-body tr').forEach(row => row.classList.remove('selected'));
            const videoMultistreams = document.getElementById('config-video-multistreams');
            if (videoMultistreams) videoMultistreams.checked = false;
        } else if (mode === 'video') {
            state.selectedAudioIds.clear();
            document.querySelectorAll('#audio-formats-table-body tr').forEach(row => row.classList.remove('selected'));
            const audioMultistreams = document.getElementById('config-audio-multistreams');
            if (audioMultistreams) audioMultistreams.checked = false;
        }

        updateDownloadModeUI();
        setActivePreset('custom');
        generateCommand();
        updateTotalFileSize(); // Update file size display
    });
}

// Show config section
export function showConfigSection() {
    if (!configSection) return;
    
    configSection.classList.remove('hidden');
    addCinematicEnter(configSection);
    configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    if (configContentLoading) {
        configContentLoading.style.display = 'block';
        configContentLoading.innerHTML = `
            <div role="status" class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--primary-green)] border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p class="mt-2 text-[var(--text-secondary-light)] dark:text-[var(--text-secondary-dark)]">Fetching video information...</p>`;
    }
    if (configContentLoaded) {
        configContentLoaded.style.display = 'none';
    }
}

// Hide config section
export function hideConfigSection() {
    if (!configSection) return;

    addCinematicExit(configSection, () => {
        if (state.currentPlaylistInfo) {
            state.selectedPlaylistVideoUrls.clear();
            state.currentPlaylistInfo = null;
            // Notify playlist manager to hide playlist view
            const event = new CustomEvent('hidePlaylistView');
            document.dispatchEvent(event);
        }
    });
}

// Populate config view with video info
export function populateConfigView(videoInfo, isBatch = false) {
    state.currentVideoInfo = videoInfo;
    state.selectedVideoIds.clear();
    state.selectedAudioIds.clear();

    if (isBatch) {
        configTitle.textContent = `Batch Config: ${state.selectedPlaylistVideoUrls.size} Videos`;
        configSummary.textContent = `Applying settings to all selected videos from "${state.currentPlaylistInfo.title}". Format details below are from the first selected video.`;
        configFilenameBase.value = (state.currentPlaylistInfo.title || 'playlist').replace(/[\\/:*?"<>|]/g, '_') + '/%(playlist_index)s - %(title)s';

        const firstVideoDetails = state.currentPlaylistInfo.entries.find(v => state.selectedPlaylistVideoUrls.has(v.url));
        configThumbnail.src = firstVideoDetails?.thumbnail || 'https://placehold.co/256x144/1a1a1a/e5e5e5?text=Batch+Config';
    } else {
        configTitle.textContent = videoInfo.title || 'Unknown Title';
        configSummary.textContent = videoInfo.description || 'No description available.';
        configFilenameBase.value = (videoInfo.suggested_filename || `${(videoInfo.title || 'video')}`).replace(/\.%\(ext\)s$/, '');
        configThumbnail.src = videoInfo.thumbnail || 'https://placehold.co/256x144/1a1a1a/e5e5e5?text=No+Thumbnail';
    }

    populateFormatTables(videoInfo);
    populateSubtitlesTable(videoInfo);

    if (configContentLoading) configContentLoading.style.display = 'none';
    if (configContentLoaded) configContentLoaded.style.display = 'block';
    
    setActivePreset('default');
    applyPreset('default');
    updateTotalFileSize(); // Initial file size calculation
    showNotification('Configuration ready!', 'success');
}

// Populate format tables
function populateFormatTables(videoInfo) {
    if (videoFormatsTableBody) videoFormatsTableBody.innerHTML = '';
    if (audioFormatsTableBody) audioFormatsTableBody.innerHTML = '';

    const bestVideoIds = videoInfo.best_video_ids || [];
    let bestAudioIds = videoInfo.best_audio_ids || [];
    
    // Prefer non-DRC id among best audios
    if (bestAudioIds.length > 1) {
        const nonDrc = bestAudioIds.filter(id => !/-drc\b/i.test(id));
        if (nonDrc.length > 0) bestAudioIds = nonDrc;
    }

    // Populate Video Formats Table
    if (videoInfo.video_formats && videoInfo.video_formats.length > 0) {
        const firstBestVideoCodec = videoInfo.video_formats.find(f => bestVideoIds.includes(f.id))?.vcodec;
        videoInfo.video_formats.forEach(format => {
            const row = createFormatRow(format, 'video', bestVideoIds, firstBestVideoCodec);
            videoFormatsTableBody.appendChild(row);
        });
    } else {
        videoFormatsTableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">No video formats available.</td></tr>';
    }

    // Populate Audio Formats Table
    if (videoInfo.audio_formats && videoInfo.audio_formats.length > 0) {
        const firstBestAudioCodec = videoInfo.audio_formats.find(f => bestAudioIds.includes(f.id))?.acodec;
        videoInfo.audio_formats.forEach(format => {
            const row = createFormatRow(format, 'audio', bestAudioIds, firstBestAudioCodec);
            audioFormatsTableBody.appendChild(row);
        });
    } else {
        audioFormatsTableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">No audio-only formats available.</td></tr>';
    }
}

// Create format table row
function createFormatRow(format, type, bestIds, firstBestCodec) {
    const isBest = bestIds.includes(format.id);
    const row = document.createElement('tr');
    row.className = 'format-table-row cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors';
    if (isBest) row.classList.add('best-row');
    row.dataset.id = format.id;
    row.dataset.type = type;
    
    const bitrate = type === 'video' 
        ? (format.vbr ? `${Math.round(format.vbr)} kbps` : (format.tbr ? `${Math.round(format.tbr)} kbps` : 'N/A'))
        : (format.abr ? `${Math.round(format.abr)} kbps` : 'N/A');
    
    const codec = type === 'video' ? format.vcodec : format.acodec;
    const codecClass = (isBest && codec !== firstBestCodec) ? 'diff-codec' : '';
    const fileSizeStr = `${format.filesize_is_approx ? '~' : ''}${formatFileSize(format.filesize)}`;

    // Generate quality tags
    const tags = generateQualityTags(format, type);
    const tagsHtml = tags.length > 0 ? `<div class="flex flex-wrap gap-1 mt-1">${tags.join('')}</div>` : '';

    if (type === 'video') {
        row.innerHTML = `
            <td class="p-2 font-mono text-xs">${format.id}</td>
            <td class="p-2">${format.ext}</td>
            <td class="p-2">
                ${format.resolution || 'N/A'}
                ${tagsHtml}
            </td>
            <td class="p-2">${bitrate}</td>
            <td class="p-2">${fileSizeStr}</td>
            <td class="p-2 truncate ${codecClass}" title="${codec}">${codec}</td>
        `;
    } else {
        row.innerHTML = `
            <td class="p-2 font-mono text-xs">${format.id}</td>
            <td class="p-2">
                ${format.ext}
                ${tagsHtml}
            </td>
            <td class="p-2">${bitrate}</td>
            <td class="p-2">${fileSizeStr}</td>
            <td class="p-2 truncate ${codecClass}" title="${codec}">${codec}</td>
        `;
    }

    return row;
}

// Generate quality tags for formats
function generateQualityTags(format, type) {
    const tags = [];
    const formatId = format.id || '';
    const formatNote = format.format_note || '';
    const formatName = format.format || '';
    const combinedText = `${formatId} ${formatNote} ${formatName}`.toLowerCase();
    
    if (type === 'video') {
        // HDR detection
        if (/hdr|hdr10|rec2020|bt2020|hlg|pq|dolby.?vision|dv/i.test(combinedText)) {
            tags.push('<span class="px-1 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">HDR</span>');
        }
        
        // Frame rate indicators
        if (/60fps|50fps|48fps/i.test(combinedText)) {
            const match = combinedText.match(/(\d+)fps/i);
            if (match) {
                tags.push(`<span class="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">${match[1]}fps</span>`);
            }
        }
    } else {
        // Spatial audio indicators
        if (/spatial|surround|5\.1|7\.1|atmos|360/i.test(combinedText)) {
            tags.push('<span class="px-1 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">Spatial</span>');
        }
        
        // Sample rate indicators
        if (/48khz|96khz|192khz|44khz/i.test(combinedText)) {
            const match = combinedText.match(/(\d+)khz/i);
            if (match) {
                tags.push(`<span class="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">${match[1]}kHz</span>`);
            }
        }
    }
    
    // DRC detection
    if (/drc/i.test(formatId)) {
        tags.push('<span class="px-1 py-0.5 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded">DRC</span>');
    }
    
    // High quality indicators
    if (/premium|high.?quality|hq|lossless/i.test(combinedText)) {
        tags.push('<span class="px-1 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">HQ</span>');
    }
    
    return tags;
}

// Populate subtitles table
function populateSubtitlesTable(videoInfo) {
    if (!subtitlesTableBody) return;

    const subtitleLangSelect = document.getElementById('config-subtitle-lang');
    if (subtitleLangSelect) {
        subtitleLangSelect.innerHTML = '<option value="none">No Subtitles</option><option value="all">All Languages</option>';
        if (videoInfo.subtitle_languages && videoInfo.subtitle_languages.length > 0) {
            videoInfo.subtitle_languages.forEach(lang => {
                subtitleLangSelect.add(new Option(lang, lang));
            });
        }
    }

    if (videoInfo.subtitles && videoInfo.subtitles.length > 0) {
        subtitlesTableBody.innerHTML = '';
        videoInfo.subtitles.forEach(subtitle => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-2">${subtitle.lang}</td>
                <td class="p-2">${subtitle.name}</td>
                <td class="p-2">${subtitle.auto ? 'Yes' : 'No'}</td>
            `;
            subtitlesTableBody.appendChild(row);
        });
    } else {
        subtitlesTableBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">No subtitles available.</td></tr>';
    }
}

// Handle format selection
function handleFormatSelection(e) {
    const row = e.target.closest('tr.format-table-row');
    if (!row || !row.dataset.id) return;

    const id = row.dataset.id;
    const type = row.dataset.type;
    const targetSet = type === 'video' ? state.selectedVideoIds : state.selectedAudioIds;
    const multiSelect = document.getElementById(`config-${type}-multistreams`).checked;
    const tableBody = type === 'video' ? videoFormatsTableBody : audioFormatsTableBody;

    if (!multiSelect) {
        targetSet.clear();
        tableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
    }

    if (targetSet.has(id)) {
        targetSet.delete(id);
        row.classList.remove('selected');
    } else {
        targetSet.add(id);
        row.classList.add('selected');
    }
    
    setActivePreset('custom');
    generateCommand();
    updateTotalFileSize(); // Update file size display
}

// Set active preset
function setActivePreset(presetName) {
    if (!presetsGroup) return;

    presetsGroup.querySelectorAll('button').forEach(btn => {
        btn.classList.remove('active', 'bg-white', 'dark:bg-gray-700', 'text-black', 'dark:text-white');
        btn.classList.add('text-gray-600', 'dark:text-gray-400');
    });
    
    const activeBtn = presetsGroup.querySelector(`[data-preset="${presetName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        activeBtn.classList.add('bg-white', 'dark:bg-gray-700', 'text-black', 'dark:text-white');
    }
}

// Apply preset
function applyPreset(presetName) {
    state.selectedVideoIds.clear();
    state.selectedAudioIds.clear();
    document.querySelectorAll('.format-table-row').forEach(row => row.classList.remove('selected'));
    
    const videoMultistreams = document.getElementById('config-video-multistreams');
    const audioMultistreams = document.getElementById('config-audio-multistreams');
    if (videoMultistreams) videoMultistreams.checked = false;
    if (audioMultistreams) audioMultistreams.checked = false;
    
    const extractAudio = document.getElementById('pp-extract-audio');
    if (extractAudio) extractAudio.checked = false;
    
    const selectBestFormats = () => {
        if (!state.currentVideoInfo) return;

        const bestVideoIds = state.currentVideoInfo.best_video_ids || [];
        const bestAudioIds = state.currentVideoInfo.best_audio_ids || [];
        
        bestVideoIds.forEach(id => state.selectedVideoIds.add(id));
        bestAudioIds.forEach(id => state.selectedAudioIds.add(id));

        document.querySelectorAll('#video-formats-table-body tr, #audio-formats-table-body tr').forEach(row => {
            if (state.selectedVideoIds.has(row.dataset.id) || state.selectedAudioIds.has(row.dataset.id)) {
                row.classList.add('selected');
            }
        });
    };

    switch(presetName) {
        case 'default':
            state.currentDownloadMode = 'both';
            setValue('config-output-format', 'default');
            selectBestFormats();
            break;
        case 'hq-mp4':
            state.currentDownloadMode = 'both';
            setValue('config-output-format', 'mp4');
            selectBestFormats();
            break;
        case 'mp3':
            state.currentDownloadMode = 'audio';
            if (extractAudio) extractAudio.checked = true;
            const bestAudioIds = state.currentVideoInfo?.best_audio_ids || [];
            bestAudioIds.forEach(id => state.selectedAudioIds.add(id));
            document.querySelectorAll('#audio-formats-table-body tr').forEach(row => {
                if(state.selectedAudioIds.has(row.dataset.id)) row.classList.add('selected');
            });
            break;
        case 'mkv':
            state.currentDownloadMode = 'both';
            setValue('config-output-format', 'mkv');
            selectBestFormats();
            break;
    }
    
    setTimeout(() => {
        const firstSelectedVideo = document.querySelector('#video-formats-table-body tr.selected');
        if (firstSelectedVideo) {
            firstSelectedVideo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const firstSelectedAudio = document.querySelector('#audio-formats-table-body tr.selected');
        if (firstSelectedAudio) {
            firstSelectedAudio.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);

    updateDownloadModeUI();
    generateCommand();
    updateTotalFileSize(); // Update file size display
}

// Update download mode UI
function updateDownloadModeUI() {
    if (!downloadModeGroup) return;

    downloadModeGroup.querySelectorAll('button').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-gray-700', 'text-black', 'dark:text-white');
        btn.classList.add('text-gray-600', 'dark:text-gray-400');
    });
    
    const activeBtn = downloadModeGroup.querySelector(`[data-mode="${state.currentDownloadMode}"]`);
    if (activeBtn) {
        activeBtn.classList.add('bg-white', 'dark:bg-gray-700', 'text-black', 'dark:text-white');
        activeBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
    }
    
    if (state.currentDownloadMode === 'audio') {
        videoFormatsSection?.classList.add('disabled-section');
        audioFormatsSection?.classList.remove('disabled-section');
    } else if (state.currentDownloadMode === 'video') {
        videoFormatsSection?.classList.remove('disabled-section');
        audioFormatsSection?.classList.add('disabled-section');
    } else {
        videoFormatsSection?.classList.remove('disabled-section');
        audioFormatsSection?.classList.remove('disabled-section');
    }
}

// Generate yt-dlp command
export function generateCommand() {
    if (!finalCommandTextarea) return;

    let command = 'yt-dlp';

    // Format Selection
    let formatString = '';
    if (state.currentDownloadMode === 'both') {
        const video = state.selectedVideoIds.size > 0 ? [...state.selectedVideoIds].join(',') : 'bestvideo';
        const audio = state.selectedAudioIds.size > 0 ? [...state.selectedAudioIds].join(',') : 'bestaudio';
        formatString = `${video}+${audio}/best`;
    } else if (state.currentDownloadMode === 'video') {
        formatString = state.selectedVideoIds.size > 0 ? [...state.selectedVideoIds].join(',') : 'bestvideo';
    } else if (state.currentDownloadMode === 'audio') {
        formatString = state.selectedAudioIds.size > 0 ? [...state.selectedAudioIds].join(',') : 'bestaudio';
    }
    command += ` -f "${formatString}"`;

    // Output and Container
    const outputFormat = getValue('config-output-format');
    if (outputFormat && outputFormat !== 'default') {
        command += ` --merge-output-format ${outputFormat}`;
    }
    const finalFilename = `${getValue('config-filename-base') || '%(title)s'}.%(ext)s`;
    command += ` -o "${finalFilename}"`;
    const dlPath = getValue('config-download-path');
    if (dlPath) {
        command += ` -P "${dlPath}"`;
    }

    // Add other options (subtitles, post-processing, etc.)
    command = addSubtitleOptions(command);
    command = addPostProcessingOptions(command);
    command = addMetadataOptions(command);
    command = addAdditionalOptions(command);

    // Final URL
    command += ` "${state.currentUrl}"`;
    finalCommandTextarea.value = command;
}

// Add subtitle options to command
function addSubtitleOptions(command) {
    if (getChecked('enable-subtitles')) {
        const subLang = getValue('config-subtitle-lang');
        if (subLang !== 'none') {
            command += ' --write-subs --write-auto-subs';
            if (subLang !== 'all') command += ` --sub-langs ${subLang}`;
            
            const subFormat = getValue('config-subtitle-format');
            if (subFormat !== 'best') command += ` --sub-format ${subFormat}`;
        }
    }
    if (getChecked('pp-embed-subs')) command += ' --embed-subs';
    if (getChecked('pp-convert-subs-check') && getValue('pp-convert-subs-format')) {
        command += ` --convert-subs ${getValue('pp-convert-subs-format')}`;
    }
    return command;
}

// Add post-processing options to command
function addPostProcessingOptions(command) {
    if (getChecked('enable-postprocessing')) {
        if (getChecked('pp-extract-audio')) {
            command += ' -x';
            const audioFormat = getValue('pp-audio-format');
            if (audioFormat && audioFormat !== 'best') {
                command += ` --audio-format ${audioFormat}`;
            }
            const audioQuality = getValue('pp-audio-quality');
            if (audioQuality) {
                command += ` --audio-quality ${audioQuality}`;
            }
        }

        if (getChecked('pp-keep-video')) command += ' -k';
        if (!getChecked('pp-overwrite')) command += ' --no-post-overwrites';

        const remuxFormat = getValue('pp-remux-format');
        if (getChecked('pp-remux-check') && remuxFormat) {
            command += ` --remux-video "${remuxFormat}"`;
        }

        const recodeFormat = getValue('pp-recode-format');
        if (getChecked('pp-recode-check') && recodeFormat) {
            command += ` --recode-video "${recodeFormat}"`;
        }
        
        const convertThumbFormat = getValue('pp-convert-thumb-format');
        if (getChecked('pp-convert-thumb-check') && convertThumbFormat) {
             command += ` --convert-thumbnails ${convertThumbFormat}`;
        }

        const ppa = getValue('pp-args');
        if (ppa) {
            command += ` --ppa "${ppa}"`;
        }
    }
    return command;
}

// Add metadata options to command
function addMetadataOptions(command) {
    if (getChecked('pp-embed-thumbnail')) command += ' --embed-thumbnail';
    if ((metadataToggle && metadataToggle.checked) && getChecked('pp-embed-metadata')) command += ' --embed-metadata';
    if (getChecked('pp-add-chapters')) command += ' --add-chapters';
    if (getChecked('pp-embed-info-json')) command += ' --embed-info-json';
    if (getChecked('pp-xattrs')) command += ' --xattrs';
    
    if (metadataToggle && metadataToggle.checked) {
        const parseMeta = getValue('pp-parse-metadata');
        if (parseMeta) command += ` --parse-metadata "${parseMeta}"`;
        const replaceMeta = getValue('pp-replace-metadata');
        if (replaceMeta) command += ` --replace-in-metadata "${replaceMeta}"`;
    }
    return command;
}

// Add additional options to command
function addAdditionalOptions(command) {
    if (getChecked('pp-split-chapters')) command += ' --split-chapters';
    if (getChecked('pp-force-keyframes')) command += ' --force-keyframes-at-cuts';
    
    const fixupPolicy = getValue('pp-fixup');
    if (fixupPolicy && fixupPolicy !== 'detect_or_warn') {
        command += ` --fixup ${fixupPolicy}`;
    }

    const concatPolicy = getValue('pp-concat-playlist');
    if (concatPolicy && concatPolicy !== 'multi_video') {
         command += ` --concat-playlist ${concatPolicy}`;
    }
    return command;
}

// Parse command and update UI (two-way binding)
function parseCommandAndUpdateUI() {
    if (!finalCommandTextarea) return;
    
    const command = finalCommandTextarea.value;
    if (!command) return;

    // Simplified parser for two-way binding
    const filenameMatch = command.match(/-o "([^"]+)"/);
    if (filenameMatch && filenameMatch[1]) {
        const fullFilename = filenameMatch[1];
        if (configFilenameBase.value !== fullFilename) {
            configFilenameBase.value = fullFilename;
        }
    }

    const formatMatch = command.match(/-f "([^"]+)"/);
    if (formatMatch && formatMatch[1]) {
        const formatString = formatMatch[1];
        const parts = formatString.split('+');
        const videoIds = new Set(parts[0].split(','));
        const audioIds = parts.length > 1 ? new Set(parts[1].split(',')) : new Set();

        state.selectedVideoIds = videoIds;
        state.selectedAudioIds = audioIds;
        
        document.querySelectorAll('#video-formats-table-body tr').forEach(row => {
            row.classList.toggle('selected', state.selectedVideoIds.has(row.dataset.id));
        });
        document.querySelectorAll('#audio-formats-table-body tr').forEach(row => {
            row.classList.toggle('selected', state.selectedAudioIds.has(row.dataset.id));
        });
    }

    // Update checkboxes based on command
    setChecked('pp-embed-thumbnail', /--embed-thumbnail/.test(command));
    setChecked('pp-embed-metadata', /--embed-metadata/.test(command));
    setChecked('pp-add-chapters', /--add-chapters/.test(command));
    setChecked('pp-extract-audio', /-x/.test(command) || /--extract-audio/.test(command));

    const mergeMatch = command.match(/--merge-output-format (\w+)/);
    if (mergeMatch && mergeMatch[1]) {
        setValue('config-output-format', mergeMatch[1]);
    }
}

// Build download options object
export function buildDownloadOptions() {
    const advancedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');

    let formatCode = 'bestvideo+bestaudio/best';
    if (state.currentDownloadMode === 'both') {
        const video = state.selectedVideoIds.size > 0 ? [...state.selectedVideoIds].join('+') : 'bestvideo';
        const audio = state.selectedAudioIds.size > 0 ? [...state.selectedAudioIds].join('+') : 'bestaudio';
        formatCode = `${video}+${audio}/best`;
    } else if (state.currentDownloadMode === 'video') {
        formatCode = state.selectedVideoIds.size > 0 ? [...state.selectedVideoIds].join('+') : 'bestvideo';
    } else if (state.currentDownloadMode === 'audio') {
        formatCode = state.selectedAudioIds.size > 0 ? [...state.selectedAudioIds].join('+') : 'bestaudio';
    }

    return {
        url: state.currentUrl,
        formatCode: formatCode,
        filename: getValue('config-filename-base'),
        outputFormat: getValue('config-output-format'),
        downloadPath: getValue('config-download-path'),
        
        // Subtitles
        enableSubtitles: getChecked('enable-subtitles'),
        subtitleLang: getValue('config-subtitle-lang'),
        subtitleFormat: getValue('config-subtitle-format'),
        embedSubs: getChecked('pp-embed-subs'),

        // Post-processing
        enablePostprocessing: getChecked('enable-postprocessing'),
        extractAudio: getChecked('pp-extract-audio'),
        audioFormat: getValue('pp-audio-format'),
        audioQuality: getValue('pp-audio-quality'),
        remuxVideo: getChecked('pp-remux-check') ? getValue('pp-remux-format') : null,
        recodeVideo: getChecked('pp-recode-check') ? getValue('pp-recode-format') : null,
        convertSubs: getChecked('pp-convert-subs-check') ? getValue('pp-convert-subs-format') : null,
        convertThumb: getChecked('pp-convert-thumb-check') ? getValue('pp-convert-thumb-format') : null,
        postprocessorArgs: getValue('pp-args'),
        keepVideo: getChecked('pp-keep-video'),
        postOverwrites: getChecked('pp-overwrite'),

        // Embedding
        embedThumbnail: getChecked('pp-embed-thumbnail'),
        embedMetadata: getChecked('pp-embed-metadata'),
        addChapters: getChecked('pp-add-chapters'),
        embedInfoJson: getChecked('pp-embed-info-json'),
        
        // Metadata & Correction
        parseMetadata: (metadataToggle && metadataToggle.checked) ? getValue('pp-parse-metadata') : null,
        replaceInMetadata: (metadataToggle && metadataToggle.checked) ? getValue('pp-replace-metadata') : null,
        xattrs: getChecked('pp-xattrs'),
        fixup: getValue('pp-fixup'),

        // Cutting & Splicing
        splitChapters: getChecked('pp-split-chapters'),
        forceKeyframes: getChecked('pp-force-keyframes'),
        concatPlaylist: getValue('pp-concat-playlist'),
        
        overwrite: getChecked('pp-overwrite'),

        // Advanced Settings from settings page
        advancedSettings: advancedSettings
    };
}

// Calculate and update total file size display
function updateTotalFileSize() {
    if (!window.totalFileSizeElement || !window.fileSizeBreakdownElement || !state.currentVideoInfo) {
        return;
    }

    let totalVideoSize = 0;
    let totalAudioSize = 0;
    let videoSizeCount = 0;
    let audioSizeCount = 0;

    // Calculate video sizes
    if (state.currentDownloadMode === 'both' || state.currentDownloadMode === 'video') {
        state.selectedVideoIds.forEach(id => {
            const format = state.currentVideoInfo.video_formats?.find(f => f.id === id);
            if (format && format.filesize && typeof format.filesize === 'number') {
                totalVideoSize += format.filesize;
                videoSizeCount++;
            }
        });
    }

    // Calculate audio sizes
    if (state.currentDownloadMode === 'both' || state.currentDownloadMode === 'audio') {
        state.selectedAudioIds.forEach(id => {
            const format = state.currentVideoInfo.audio_formats?.find(f => f.id === id);
            if (format && format.filesize && typeof format.filesize === 'number') {
                totalAudioSize += format.filesize;
                audioSizeCount++;
            }
        });
    }

    const totalSize = totalVideoSize + totalAudioSize;
    const hasValidSizes = videoSizeCount > 0 || audioSizeCount > 0;

    // Update the display
    if (hasValidSizes && totalSize > 0) {
        window.totalFileSizeElement.textContent = formatFileSize(totalSize);
        window.totalFileSizeElement.classList.remove('text-gray-500');
        window.totalFileSizeElement.classList.add('text-green-600', 'dark:text-green-400');
        
        const videoSizeStr = totalVideoSize > 0 ? formatFileSize(totalVideoSize) : '--';
        const audioSizeStr = totalAudioSize > 0 ? formatFileSize(totalAudioSize) : '--';
        window.fileSizeBreakdownElement.textContent = `Video: ${videoSizeStr} | Audio: ${audioSizeStr}`;
    } else {
        // No valid sizes available
        const selectedVideoCount = state.selectedVideoIds.size;
        const selectedAudioCount = state.selectedAudioIds.size;
        
        if (selectedVideoCount === 0 && selectedAudioCount === 0) {
            window.totalFileSizeElement.textContent = 'No formats selected';
        } else {
            window.totalFileSizeElement.textContent = 'Size unknown';
        }
        
        window.totalFileSizeElement.classList.remove('text-green-600', 'dark:text-green-400');
        window.totalFileSizeElement.classList.add('text-gray-500');
        
        const videoText = selectedVideoCount > 0 ? `${selectedVideoCount} video${selectedVideoCount > 1 ? 's' : ''}` : '--';
        const audioText = selectedAudioCount > 0 ? `${selectedAudioCount} audio${selectedAudioCount > 1 ? 's' : ''}` : '--';
        window.fileSizeBreakdownElement.textContent = `Video: ${videoText} | Audio: ${audioText}`;
    }

    // Handle multi-stream indication
    if ((state.selectedVideoIds.size > 1) || (state.selectedAudioIds.size > 1)) {
        const multiIndicator = ' (multi-stream)';
        if (!window.totalFileSizeElement.textContent.includes(multiIndicator)) {
            window.totalFileSizeElement.textContent += multiIndicator;
        }
    }
}

// Utility function for file size formatting (fallback)
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i < 2 ? 0 : 2)} ${sizes[i]}`;
}
