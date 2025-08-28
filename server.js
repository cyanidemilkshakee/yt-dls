/**
 * Enhanced YT-DL Studio Node.js Backend
 * A robust Express backend for YouTube video downloading with real-time progress tracking,
 * better error handling, and advanced features.
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} - ${level.toUpperCase()} - ${message}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: 'ytdl_backend.log' }),
        new winston.transports.Console()
    ]
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '16mb' }));

// Configuration
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Ensure download directory exists
fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {});

// Global storage for downloads and progress
const activeDownloads = new Map();
const downloadProgress = new Map();

class DownloadProgress {
    constructor(downloadId) {
        this.downloadId = downloadId;
        this.status = 'initializing';
        this.progress = 0.0;
        this.speed = 0;
        this.eta = null;
        this.downloadedBytes = 0;
        this.totalBytes = 0;
        this.filename = null;
        this.error = null;
        this.startedAt = new Date();
        this.completedAt = null;
        this.log = [];
        this.videoProgress = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
        this.audioProgress = { status: 'waiting', progress: 0, speed: 0, eta: null, downloadedBytes: 0, totalBytes: 0 };
    }

    toDict() {
        return {
            download_id: this.downloadId,
            status: this.status,
            progress: this.progress,
            speed: this.speed,
            eta: this.eta,
            downloaded_bytes: this.downloadedBytes,
            total_bytes: this.totalBytes,
            filename: this.filename,
            error: this.error,
            started_at: this.startedAt?.toISOString(),
            completed_at: this.completedAt?.toISOString(),
            video_progress: this.videoProgress,
            audio_progress: this.audioProgress
        };
    }

    addLog(message) {
        this.log.push(message);
        if (this.log.length > 500) {
            this.log.shift();
        }
    }
}

function sanitizeFilename(filename) {
    // Remove or replace invalid characters
    filename = filename.replace(/[<>:"/\\|?*]/g, '_');
    // Remove control characters
    filename = filename.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    // Limit length
    if (filename.length > 200) {
        const ext = path.extname(filename);
        const name = path.basename(filename, ext);
        filename = name.substring(0, 200 - ext.length) + ext;
    }
    return filename.trim();
}

function getVideoSummary(infoDict) {
    const title = infoDict.title || 'Unknown Title';
    const description = infoDict.description || '';
    const uploader = infoDict.uploader || 'Unknown';
    const duration = infoDict.duration;
    
    const summaryParts = [];
    
    if (uploader !== 'Unknown') {
        summaryParts.push(`Uploaded by: ${uploader}`);
    }
    
    if (duration) {
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = Math.floor(duration % 60);
        
        let durationStr;
        if (hours > 0) {
            durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        summaryParts.push(`Duration: ${durationStr}`);
    }
    
    if (description) {
        const cleanDesc = description.replace(/\s+/g, ' ').trim();
        const truncatedDesc = cleanDesc.length > 200 ? cleanDesc.substring(0, 200) + "..." : cleanDesc;
        summaryParts.push(truncatedDesc);
    }
    
    return summaryParts.length > 0 ? summaryParts.join(' | ') : "No additional information available.";
}

function progressHook(data, downloadId) {
    const progress = downloadProgress.get(downloadId);
    if (!progress) return;

    // Handle both direct hook calls and JSON-parsed data
    let d = data;
    if (typeof d === 'string') {
        try {
            d = JSON.parse(d);
        } catch {
            return;
        }
    }

    const status = d.status || 'unknown';
    const filename = d.filename || '';
    
    // Determine if this is video or audio based on filename or format info
    const isVideo = /\.(mp4|mkv|webm|avi)$/i.test(filename) && !/audio/i.test(filename);
    const isAudio = /\.(mp3|m4a|wav|aac)$/i.test(filename) || /audio/i.test(filename);
    
    if (status === 'downloading') {
        progress.status = 'downloading';
        progress.filename = filename;
        
        const totalBytes = d.total_bytes || d.total_bytes_estimate || 0;
        const downloadedBytes = d.downloaded_bytes || 0;
        
        // Update the appropriate progress tracker
        if (isVideo) {
            progress.videoProgress.status = 'downloading';
            progress.videoProgress.totalBytes = totalBytes;
            progress.videoProgress.downloadedBytes = downloadedBytes;
            progress.videoProgress.progress = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100.0) : 0;
            progress.videoProgress.speed = d.speed || 0;
            progress.videoProgress.eta = d.eta;
        } else if (isAudio) {
            progress.audioProgress.status = 'downloading';
            progress.audioProgress.totalBytes = totalBytes;
            progress.audioProgress.downloadedBytes = downloadedBytes;
            progress.audioProgress.progress = totalBytes > 0 ? Math.min((downloadedBytes / totalBytes) * 100, 100.0) : 0;
            progress.audioProgress.speed = d.speed || 0;
            progress.audioProgress.eta = d.eta;
        }
        
        // Update main progress (for backward compatibility)
        progress.totalBytes = totalBytes;
        progress.downloadedBytes = downloadedBytes;
        if (totalBytes > 0) {
            progress.progress = Math.min((downloadedBytes / totalBytes) * 100, 100.0);
        } else {
            progress.progress = 0;
        }
        progress.speed = d.speed || 0;
        progress.eta = d.eta;
        
    } else if (status === 'finished') {
        // Mark the appropriate track as completed
        if (isVideo) {
            progress.videoProgress.status = 'completed';
            progress.videoProgress.progress = 100.0;
        } else if (isAudio) {
            progress.audioProgress.status = 'completed';
            progress.audioProgress.progress = 100.0;
        }
        
        // Check if both tracks are completed or if only one track was expected
        const videoDone = progress.videoProgress.status === 'completed' || progress.videoProgress.status === 'waiting';
        const audioDone = progress.audioProgress.status === 'completed' || progress.audioProgress.status === 'waiting';
        
        if (videoDone && audioDone) {
            progress.status = 'completed';
            progress.progress = 100.0;
            progress.completedAt = new Date();
        } else {
            progress.status = 'processing';
        }
        
        progress.filename = filename;
        progress.speed = 0;
        progress.eta = null;
        
    } else if (status === 'error') {
        progress.status = 'failed';
        progress.error = String(d.error || 'Unknown error');
        if (isVideo) {
            progress.videoProgress.status = 'failed';
        } else if (isAudio) {
            progress.audioProgress.status = 'failed';
        }
    }
}

async function runYtDlpCommand(args) {
    return new Promise((resolve, reject) => {
        logger.info(`Running command: yt-dlp ${args.join(' ')}`);
        
        const process = spawn('yt-dlp', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                logger.error(`Command failed: ${stderr}`);
                reject(new Error(stderr || `Process exited with code ${code}`));
            } else {
                // Filter out empty lines and potential warnings
                const items = stdout.trim().split('\n')
                    .filter(line => line && !line.toLowerCase().startsWith('['));
                resolve({ items });
            }
        });

        process.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new Error('yt-dlp is not installed or not in PATH'));
            } else {
                reject(error);
            }
        });
    });
}

function processInfoDict(info) {
    const videoFormats = [];
    const audioFormats = [];
    const combinedFormats = [];
    const duration = info.duration;

    for (const f of info.formats || []) {
        if (f.vcodec === 'images' || 
            f.format_note === 'storyboard' || 
            ['jpg', 'jpeg', 'png', 'webp'].includes(f.ext)) {
            continue;
        }

        let filesize = f.filesize;
        let isApprox = false;

        if (!filesize && f.filesize_approx) {
            filesize = f.filesize_approx;
            isApprox = true;
        }

        // Fallback filesize estimation
        if (!filesize && typeof duration === 'number' && duration > 0) {
            const bitrate = f.vbr || f.abr || f.tbr;
            if (typeof bitrate === 'number') {
                try {
                    filesize = (bitrate * 1000 / 8) * duration;
                    isApprox = true;
                } catch {
                    filesize = null;
                }
            }
        }

        const formatInfo = {
            id: f.format_id,
            ext: f.ext,
            filesize: filesize,
            filesize_is_approx: isApprox,
            tbr: f.tbr,
            abr: f.abr,
            vbr: f.vbr,
            fps: f.fps,
            vcodec: (f.vcodec || 'N/A').split('.')[0],
            acodec: (f.acodec || 'N/A').split('.')[0],
            width: f.width,
            height: f.height,
        };

        const hasVideo = f.vcodec && f.vcodec !== 'none';
        const hasAudio = f.acodec && f.acodec !== 'none';

        if (hasVideo && hasAudio) {
            formatInfo.resolution = f.resolution || `${f.width || '?'}x${f.height || '?'}`;
            formatInfo.type = 'combined';
            combinedFormats.push(formatInfo);
        } else if (hasVideo) {
            formatInfo.resolution = f.resolution || `${f.width || '?'}x${f.height || '?'}`;
            formatInfo.type = 'video';
            videoFormats.push(formatInfo);
        } else if (hasAudio) {
            formatInfo.resolution = 'audio only';
            formatInfo.type = 'audio';
            audioFormats.push(formatInfo);
        }
    }

    const allVideoFormats = [...combinedFormats, ...videoFormats];
    allVideoFormats.sort((a, b) => {
        return (b.height || 0) - (a.height || 0) || 
               (b.vbr || 0) - (a.vbr || 0) || 
               (b.fps || 0) - (a.fps || 0);
    });
    
    audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

    const bestVideoIds = [];
    if (allVideoFormats.length > 0) {
        const bestFormat = allVideoFormats[0];
        const bestCriteria = [bestFormat.height || 0, bestFormat.vbr || 0];
        for (const f of allVideoFormats) {
            if ((f.height || 0) === bestCriteria[0] && (f.vbr || 0) === bestCriteria[1]) {
                bestVideoIds.push(f.id);
            }
        }
    }

    const bestAudioIds = [];
    if (audioFormats.length > 0) {
        const bestBitrate = audioFormats[0].abr || 0;
        for (const f of audioFormats) {
            if ((f.abr || 0) === bestBitrate) {
                bestAudioIds.push(f.id);
            }
        }
    }

    const subtitles = [];
    const subtitleLanguages = new Set();
    
    for (const [lang, subs] of Object.entries(info.subtitles || {})) {
        subtitleLanguages.add(lang);
        for (const sub of subs) {
            if (['vtt', 'srt', 'ass'].includes(sub.ext)) {
                subtitles.push({ 
                    lang, 
                    name: sub.name || lang, 
                    ext: sub.ext, 
                    auto: false 
                });
            }
        }
    }

    for (const [lang, subs] of Object.entries(info.automatic_captions || {})) {
        if (!subtitleLanguages.has(lang)) {
            for (const sub of subs) {
                if (['vtt', 'srt', 'ass'].includes(sub.ext)) {
                    subtitles.push({ 
                        lang, 
                        name: `${sub.name || lang} (auto)`, 
                        ext: sub.ext, 
                        auto: true 
                    });
                }
            }
        }
    }

    const summary = getVideoSummary(info);

    return {
        title: info.title,
        thumbnail: info.thumbnail,
        description: summary,
        duration: duration,
        uploader: info.uploader,
        upload_date: info.upload_date,
        suggested_filename: `${sanitizeFilename(info.title || 'video')}.%(ext)s`,
        video_formats: allVideoFormats,
        audio_formats: audioFormats,
        best_video_ids: bestVideoIds,
        best_audio_ids: bestAudioIds,
        subtitles: subtitles,
        subtitle_languages: Array.from(subtitleLanguages).sort(),
        has_chapters: Boolean(info.chapters),
        is_live: info.is_live || false,
    };
}

function buildYtDlpCommand(options, downloadId) {
    const command = ['yt-dlp'];

    // Progress reporting
    command.push(
        '--newline',
        '--progress-template', 
        JSON.stringify({
            "status": "%(progress.status)s",
            "downloaded_bytes": "%(progress.downloaded_bytes)d",
            "total_bytes": "%(progress.total_bytes)d",
            "speed": "%(progress.speed)d",
            "eta": "%(progress.eta)d",
            "filename": "%(info.filename)s"
        })
    );

    // Basic download options
    const formatString = options.formatCode || 'bestvideo+bestaudio/best';
    command.push('-f', formatString);

    let filenameTemplate = options.filename || '%(title)s';
    if (!filenameTemplate.includes('.%(ext)s')) {
        filenameTemplate += '.%(ext)s';
    }
    command.push('-o', filenameTemplate);

    const outputFormat = options.outputFormat;
    if (outputFormat && outputFormat !== 'default') {
        command.push('--merge-output-format', outputFormat);
    }

    if (options.overwrite) {
        command.push('--force-overwrites');
    } else if (options.overwrite === false) {
        command.push('--no-overwrites');
    }

    // Subtitle options
    if (options.enableSubtitles) {
        const subLang = options.subtitleLang;
        if (subLang && subLang !== 'none') {
            command.push('--write-subs', '--write-auto-subs');
            if (subLang !== 'all') {
                command.push('--sub-langs', subLang);
            }
        }
        
        const subFormat = options.subtitleFormat;
        if (subFormat && subFormat !== 'best') {
            command.push('--sub-format', subFormat);
        }
    }

    if (options.embedSubs) command.push('--embed-subs');
    if (options.convertSubs) command.push('--convert-subs', options.convertSubs);

    // Embedding & Metadata
    if (options.embedThumbnail) command.push('--embed-thumbnail');
    if (options.embedMetadata) command.push('--embed-metadata');
    if (options.addChapters) command.push('--add-chapters');
    if (options.embedInfoJson) command.push('--embed-info-json');
    if (options.xattrs) command.push('--xattrs');
    if (options.parseMetadata) command.push('--parse-metadata', options.parseMetadata);
    if (options.replaceInMetadata) {
        const replaceValue = options.replaceInMetadata;
        if (typeof replaceValue === 'string') {
            const parts = replaceValue.split(' ', 2);
            if (parts.length === 3) {
                command.push('--replace-in-metadata', ...parts);
            }
        }
    }

    // Post-processing options
    if (options.enablePostprocessing || options.extractAudio) {
        if (options.extractAudio) {
            command.push('-x');
            if (options.audioFormat && options.audioFormat !== 'best') {
                command.push('--audio-format', options.audioFormat);
            }
            if (options.audioQuality) {
                command.push('--audio-quality', String(options.audioQuality));
            }
        }

        if (options.remuxVideo) command.push('--remux-video', options.remuxVideo);
        if (options.recodeVideo) command.push('--recode-video', options.recodeVideo);
        if (options.convertThumb) command.push('--convert-thumbnails', options.convertThumb);
        
        if (options.postprocessorArgs) {
            command.push('--postprocessor-args', options.postprocessorArgs);
        }
            
        if (options.keepVideo) command.push('-k');
        
        if (options.postOverwrites === false) {
            command.push('--no-post-overwrites');
        } else {
            command.push('--post-overwrites');
        }
    }

    // Splicing, Correction & Playlist
    if (options.splitChapters) command.push('--split-chapters');
    if (options.forceKeyframes) command.push('--force-keyframes-at-cuts');
    if (options.concatPlaylist && options.concatPlaylist !== 'multi_video') {
        command.push('--concat-playlist', options.concatPlaylist);
    }
    if (options.fixup && options.fixup !== 'detect_or_warn') {
        command.push('--fixup', options.fixup);
    }

    // Advanced settings
    const adv = options.advancedSettings || {};
    
    // Network settings
    if (adv.proxy) command.push('--proxy', adv.proxy);
    if (adv['socket-timeout']) command.push('--socket-timeout', String(adv['socket-timeout']));
    if (adv['source-address']) command.push('--source-address', adv['source-address']);
    if (adv.impersonate) command.push('--impersonate', adv.impersonate);
    if (adv['force-ipv4']) command.push('--force-ipv4');
    if (adv['force-ipv6']) command.push('--force-ipv6');
    if (adv['enable-file-urls']) command.push('--enable-file-urls');
    if (adv['geo-verification-proxy']) command.push('--geo-verification-proxy', adv['geo-verification-proxy']);
    if (adv.xff) command.push('--xff', adv.xff);
    
    // Authentication
    if (adv.username) command.push('--username', adv.username);
    if (adv.password) command.push('--password', adv.password);
    if (adv.twofactor) command.push('--twofactor', adv.twofactor);
    if (adv.netrc) command.push('--netrc');
    if (adv['netrc-location']) command.push('--netrc-location', adv['netrc-location']);
    if (adv['netrc-cmd']) command.push('--netrc-cmd', adv['netrc-cmd']);
    if (adv['video-password']) command.push('--video-password', adv['video-password']);
    if (adv['ap-mso']) command.push('--ap-mso', adv['ap-mso']);
    if (adv['ap-username']) command.push('--ap-username', adv['ap-username']);
    if (adv['ap-password']) command.push('--ap-password', adv['ap-password']);
    if (adv['client-certificate']) command.push('--client-certificate', adv['client-certificate']);
    if (adv['client-certificate-key']) command.push('--client-certificate-key', adv['client-certificate-key']);
    if (adv['client-certificate-password']) command.push('--client-certificate-password', adv['client-certificate-password']);
    
    // SponsorBlock
    if (adv['no-sponsorblock']) {
        command.push('--no-sponsorblock');
    } else {
        if (adv['sponsorblock-mark']) command.push('--sponsorblock-mark', adv['sponsorblock-mark']);
        if (adv['sponsorblock-remove']) command.push('--sponsorblock-remove', adv['sponsorblock-remove']);
        if (adv['sponsorblock-chapter-title']) command.push('--sponsorblock-chapter-title', adv['sponsorblock-chapter-title']);
        if (adv['sponsorblock-api']) command.push('--sponsorblock-api', adv['sponsorblock-api']);
    }
    
    // Extractor settings
    if (adv['extractor-retries']) command.push('--extractor-retries', String(adv['extractor-retries']));
    if (adv['ignore-dynamic-mpd']) command.push('--ignore-dynamic-mpd');
    if (adv['hls-split-discontinuity']) command.push('--hls-split-discontinuity');
    if (adv['extractor-args']) command.push('--extractor-args', adv['extractor-args']);
    
    // FFmpeg location
    if (adv['ffmpeg-location']) {
        command.push('--ffmpeg-location', adv['ffmpeg-location']);
    }
    
    // Exec command
    if (adv.exec && !adv['no-exec']) {
        command.push('--exec', adv.exec);
    }

    // Final reliability and URL
    command.push(
        '--retries', '3', 
        '--fragment-retries', '3', 
        '--extractor-retries', '3',
        '--no-colors', 
        '--no-warnings',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    
    // Handle rate limiting for playlists
    if (options.url && options.url.toLowerCase().includes('playlist')) {
        command.push('--sleep-interval', '1');
    }
    
    command.push(options.url);
    return { command, filenameTemplate };
}

// Routes

app.get('/api/health', (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        active_downloads: activeDownloads.size
    });
});

app.get('/api/list-impersonate-targets', async (req, res) => {
    try {
        const result = await runYtDlpCommand(['--list-impersonate-targets']);
        res.json(result);
    } catch (error) {
        logger.error(`Error listing impersonate targets: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/list-ap-msos', async (req, res) => {
    try {
        const result = await runYtDlpCommand(['--ap-list-mso']);
        res.json(result);
    } catch (error) {
        logger.error(`Error listing AP MSOs: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/info', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).json({ error: "URL parameter is required" });
    }

    if (!/^https?:\/\//.test(videoUrl)) {
        return res.status(400).json({ error: "Invalid URL format. Please provide a valid HTTP/HTTPS URL" });
    }

    try {
        // Check if the URL contains a known playlist identifier
        const isPlaylistUrl = videoUrl.includes('list=') || videoUrl.includes('playlist');
        
        const opts = [
            '--quiet',
            '--no-warnings',
            '--skip-download',
            '--socket-timeout', '30',
            '--retries', '3',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '--extractor-retries', '3',
            '--fragment-retries', '3'
        ];

        if (isPlaylistUrl) {
            logger.info(`Playlist URL detected: ${videoUrl}`);
            opts.push('--flat-playlist', '--dump-json');
        } else {
            logger.info(`Single video URL detected: ${videoUrl}`);
            opts.push('--dump-json');
        }

        opts.push(videoUrl);

        const process = spawn('yt-dlp', opts, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                logger.error(`yt-dlp error for URL ${videoUrl}: ${stderr}`);
                const errorMsg = stderr.toLowerCase();
                
                if (errorMsg.includes('http error 403') || errorMsg.includes('forbidden')) {
                    return res.status(403).json({ 
                        error: "Access forbidden - This content may be geo-blocked or require authentication. Try using a VPN or different video.",
                        error_code: 'ACCESS_FORBIDDEN'
                    });
                } else if (errorMsg.includes('not available') || errorMsg.includes('private') || errorMsg.includes('deleted')) {
                    return res.status(404).json({ 
                        error: "This content is not available (private, deleted, or geo-blocked)",
                        error_code: 'CONTENT_UNAVAILABLE'
                    });
                } else if (errorMsg.includes('unsupported url')) {
                    return res.status(400).json({ 
                        error: "This URL is not supported by the downloader",
                        error_code: 'UNSUPPORTED_URL'
                    });
                } else if (errorMsg.includes('fragment') && errorMsg.includes('not found')) {
                    return res.status(503).json({ 
                        error: "YouTube is currently blocking requests. Please try again later or use a VPN.",
                        error_code: 'YOUTUBE_BLOCKED'
                    });
                } else {
                    return res.status(500).json({ 
                        error: `Could not process URL: ${stderr.split('\n')[0]}`,
                        error_code: 'PROCESSING_ERROR'
                    });
                }
            }

            try {
                const lines = stdout.trim().split('\n').filter(line => line.trim());
                if (lines.length === 0) {
                    return res.status(400).json({ error: "No information could be extracted from this URL" });
                }

                // For playlists, we might get multiple JSON objects
                if (isPlaylistUrl && lines.length > 1) {
                    const playlistEntries = [];
                    let playlistInfo = null;

                    for (const line of lines) {
                        try {
                            const info = JSON.parse(line);
                            if (info._type === 'playlist') {
                                playlistInfo = info;
                            } else {
                                // Individual video entry
                                let entryUrl = info.url;
                                if (!entryUrl && info.id) {
                                    if (info.ie_key && info.ie_key.toLowerCase().includes('youtube')) {
                                        entryUrl = `https://www.youtube.com/watch?v=${info.id}`;
                                    } else if (info.ie_key && info.ie_key.toLowerCase().includes('vimeo')) {
                                        entryUrl = `https://vimeo.com/${info.id}`;
                                    } else {
                                        entryUrl = `${videoUrl}#${info.id}`;
                                    }
                                }

                                if (entryUrl) {
                                    playlistEntries.push({
                                        id: info.id || `entry_${playlistEntries.length}`,
                                        url: entryUrl,
                                        title: info.title || 'Untitled Video',
                                        duration: info.duration,
                                        thumbnail: info.thumbnail,
                                        uploader: info.uploader,
                                        view_count: info.view_count,
                                    });
                                }
                            }
                        } catch (parseError) {
                            logger.warn(`Failed to parse line: ${line}`);
                        }
                    }

                    if (playlistEntries.length > 0) {
                        return res.json({
                            _type: 'playlist',
                            id: playlistInfo?.id || 'unknown',
                            title: playlistInfo?.title || 'Untitled Playlist',
                            uploader: playlistInfo?.uploader,
                            description: playlistInfo?.description,
                            entries: playlistEntries,
                            entry_count: playlistEntries.length,
                            original_url: videoUrl,
                        });
                    }
                }

                // Handle single video
                const info = JSON.parse(lines[0]);
                const processedInfo = processInfoDict(info);
                logger.info(`Successfully processed info for: ${processedInfo.title || 'Unknown'}`);
                res.json(processedInfo);

            } catch (parseError) {
                logger.error(`Failed to parse yt-dlp output: ${parseError.message}`);
                res.status(500).json({ error: `Failed to parse video information: ${parseError.message}` });
            }
        });

        process.on('error', (error) => {
            logger.error(`Process error: ${error.message}`);
            if (error.code === 'ENOENT') {
                res.status(500).json({ error: "yt-dlp is not installed or not in PATH" });
            } else {
                res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
            }
        });

    } catch (error) {
        logger.error(`Unexpected error for URL ${videoUrl}: ${error.message}`);
        res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
});

app.post('/api/download', async (req, res) => {
    try {
        const options = req.body;
        if (!options || !options.url) {
            return res.status(400).json({ error: "Invalid request body. URL is required." });
        }

        // Generate a unique download ID
        const downloadId = uuidv4();
        
        // Validate required options
        const url = options.url;
        if (!url || !/^https?:\/\//.test(url)) {
            return res.status(400).json({ error: "Invalid URL format" });
        }

        // Create progress tracker
        const progress = new DownloadProgress(downloadId);
        downloadProgress.set(downloadId, progress);

        // Construct the command from the received options
        const { command, filenameTemplate } = buildYtDlpCommand(options, downloadId);

        logger.info(`Starting download ${downloadId}: ${command.join(' ')}`);

        // Start the download in a separate process
        const runDownload = () => {
            try {
                progress.status = 'starting';
                
                const process = spawn(command[0], command.slice(1), {
                    cwd: DOWNLOAD_DIR,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
                
                activeDownloads.set(downloadId, {
                    process: process,
                    status: 'running',
                    command: command.join(' '),
                    url: url,
                    started_at: new Date().toISOString()
                });
                
                progress.status = 'downloading';

                // Handle stdout (progress updates)
                process.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        const cleanLine = line.trim();
                        if (!cleanLine) continue;
                        
                        progress.addLog(cleanLine);

                        // Try to parse as JSON progress update
                        try {
                            const progressData = JSON.parse(cleanLine);
                            progressHook(progressData, downloadId);
                        } catch {
                            // Regular yt-dlp output (merging, post-processing, etc.)
                            logger.debug(`yt-dlp output: ${cleanLine}`);
                            const processingKeywords = ['merger', 'extract', 'postprocessor', 'converting', 'ffmpeg'];
                            if (processingKeywords.some(keyword => cleanLine.toLowerCase().includes(keyword))) {
                                progress.status = 'processing';
                            }
                        }
                    }
                });

                // Handle stderr
                process.stderr.on('data', (data) => {
                    const errorText = data.toString();
                    progress.addLog(`ERROR: ${errorText}`);
                    logger.warn(`Download ${downloadId} stderr: ${errorText}`);
                });

                process.on('close', (code) => {
                    // Final status determination
                    if (progress.status !== 'failed' && progress.status !== 'cancelled') {
                        if (code === 0) {
                            progress.status = 'completed';
                            progress.completedAt = new Date();
                            progress.progress = 100.0;
                            progress.speed = 0;
                            progress.eta = null;
                            if (activeDownloads.has(downloadId)) {
                                const downloadInfo = activeDownloads.get(downloadId);
                                downloadInfo.status = 'completed';
                            }
                            logger.info(`Download ${downloadId} completed successfully`);
                        } else {
                            progress.status = 'failed';
                            const errorMsg = `Download failed with exit code ${code}`;
                            progress.error = errorMsg;
                            if (activeDownloads.has(downloadId)) {
                                const downloadInfo = activeDownloads.get(downloadId);
                                downloadInfo.status = 'failed';
                                downloadInfo.error = errorMsg;
                            }
                            logger.error(`Download ${downloadId} failed: ${errorMsg}`);
                        }
                    }
                });

                process.on('error', (error) => {
                    const errorMsg = `Download process error: ${error.message}`;
                    progress.status = 'failed';
                    progress.error = errorMsg;
                    if (activeDownloads.has(downloadId)) {
                        const downloadInfo = activeDownloads.get(downloadId);
                        downloadInfo.status = 'failed';
                        downloadInfo.error = errorMsg;
                    }
                    logger.error(`Exception in download ${downloadId}: ${errorMsg}`);
                });

            } catch (error) {
                const errorMsg = `Download thread error: ${error.message}`;
                progress.status = 'failed';
                progress.error = errorMsg;
                if (activeDownloads.has(downloadId)) {
                    const downloadInfo = activeDownloads.get(downloadId);
                    downloadInfo.status = 'failed';
                    downloadInfo.error = errorMsg;
                }
                logger.error(`Exception in download ${downloadId}: ${errorMsg}`);
            }
        };

        // Start download in next tick to avoid blocking
        process.nextTick(runDownload);

        res.json({
            status: "success",
            message: "Download started successfully",
            download_id: downloadId,
            command: command.join(' ')
        });

    } catch (error) {
        logger.error(`Failed to start download: ${error.message}`);
        res.status(500).json({ error: `Failed to start download: ${error.message}` });
    }
});

app.get('/api/download/:downloadId/status', (req, res) => {
    const { downloadId } = req.params;
    const progress = downloadProgress.get(downloadId);
    
    if (!progress) {
        return res.status(404).json({ error: "Download not found" });
    }
    
    res.json(progress.toDict());
});

app.post('/api/download/:downloadId/cancel', (req, res) => {
    const { downloadId } = req.params;
    
    if (!activeDownloads.has(downloadId)) {
        return res.status(404).json({ error: "Download not found" });
    }
    
    const downloadInfo = activeDownloads.get(downloadId);
    const progress = downloadProgress.get(downloadId);
    
    if (['running', 'starting', 'paused'].includes(downloadInfo.status)) {
        try {
            const process = downloadInfo.process;
            
            // Try graceful termination first
            process.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (!process.killed) {
                    process.kill('SIGKILL');
                }
            }, 5000);
            
            downloadInfo.status = 'cancelled';
            if (progress) {
                progress.status = 'cancelled';
            }
            
            logger.info(`Download ${downloadId} cancelled successfully`);
            res.json({ status: "success", message: "Download cancelled successfully" });
            
        } catch (error) {
            logger.error(`Failed to cancel download ${downloadId}: ${error.message}`);
            res.status(500).json({ error: `Failed to cancel download: ${error.message}` });
        }
    } else {
        res.status(400).json({ error: `Download is not running (status: ${downloadInfo.status})` });
    }
});

app.post('/api/download/:downloadId/pause', (req, res) => {
    const { downloadId } = req.params;
    
    if (!activeDownloads.has(downloadId)) {
        return res.status(404).json({ error: "Download not found or process not started" });
    }

    const downloadInfo = activeDownloads.get(downloadId);
    const progress = downloadProgress.get(downloadId);

    if (downloadInfo.status === 'running') {
        try {
            const process = downloadInfo.process;
            process.kill('SIGSTOP'); // Suspend the process
            downloadInfo.status = 'paused';
            if (progress) {
                progress.status = 'paused';
            }
            logger.info(`Download ${downloadId} paused successfully`);
            res.json({ status: "success", message: "Download paused" });
        } catch (error) {
            logger.error(`Failed to pause download ${downloadId}: ${error.message}`);
            res.status(500).json({ error: `Failed to pause download: ${error.message}` });
        }
    } else {
        res.status(400).json({ error: `Download is not in a pausable state (status: ${downloadInfo.status})` });
    }
});

app.post('/api/download/:downloadId/resume', (req, res) => {
    const { downloadId } = req.params;
    
    if (!activeDownloads.has(downloadId)) {
        return res.status(404).json({ error: "Download not found or process not started" });
    }

    const downloadInfo = activeDownloads.get(downloadId);
    const progress = downloadProgress.get(downloadId);

    if (downloadInfo.status === 'paused') {
        try {
            const process = downloadInfo.process;
            process.kill('SIGCONT'); // Resume the process
            downloadInfo.status = 'running';
            if (progress) {
                progress.status = 'running';
            }
            logger.info(`Download ${downloadId} resumed successfully`);
            res.json({ status: "success", message: "Download resumed" });
        } catch (error) {
            logger.error(`Failed to resume download ${downloadId}: ${error.message}`);
            res.status(500).json({ error: `Failed to resume download: ${error.message}` });
        }
    } else {
        res.status(400).json({ error: `Download is not paused (status: ${downloadInfo.status})` });
    }
});

app.get('/api/download/:downloadId/log', (req, res) => {
    const { downloadId } = req.params;
    const progress = downloadProgress.get(downloadId);
    
    if (!progress) {
        return res.status(404).json({ error: "Download not found" });
    }
    
    res.json({ log: progress.log });
});

app.get('/api/downloads', (req, res) => {
    const downloads = [];
    
    for (const [downloadId, info] of activeDownloads.entries()) {
        const progress = downloadProgress.get(downloadId);
        const downloadData = {
            download_id: downloadId,
            url: info.url,
            status: info.status,
            started_at: info.started_at,
            command: info.command,
            error: info.error
        };
        
        if (progress) {
            Object.assign(downloadData, progress.toDict());
        }
            
        downloads.push(downloadData);
    }
    
    res.json({
        downloads: downloads,
        total: downloads.length
    });
});

app.delete('/api/download/:downloadId', (req, res) => {
    const { downloadId } = req.params;
    
    if (activeDownloads.has(downloadId)) {
        const downloadInfo = activeDownloads.get(downloadId);
        // Cancel if still running
        if (downloadInfo.status === 'running') {
            try {
                downloadInfo.process.kill('SIGTERM');
            } catch (error) {
                logger.warn(`Failed to kill process for ${downloadId}: ${error.message}`);
            }
        }
        
        activeDownloads.delete(downloadId);
    }
    
    if (downloadProgress.has(downloadId)) {
        downloadProgress.delete(downloadId);
    }
    
    res.json({ status: "success", message: "Download removed" });
});

// Error handlers
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
});

app.use((error, req, res, next) => {
    logger.error(`Internal server error: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
});

// Cleanup function
function cleanupOldDownloads() {
    const currentTime = new Date();
    const toRemove = [];
    
    for (const [downloadId, info] of activeDownloads.entries()) {
        try {
            const startedAt = new Date(info.started_at);
            // Remove downloads older than 24 hours
            if ((currentTime - startedAt) > 86400000) {
                toRemove.push(downloadId);
            }
        } catch {
            // If we can't parse the date, remove it
            toRemove.push(downloadId);
        }
    }
    
    for (const downloadId of toRemove) {
        activeDownloads.delete(downloadId);
        downloadProgress.delete(downloadId);
    }
    
    if (toRemove.length > 0) {
        logger.info(`Cleaned up ${toRemove.length} old download records`);
    }
}

// Cleanup every hour
setInterval(cleanupOldDownloads, 3600000);

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received shutdown signal, cleaning up...');
    
    // Cancel all active downloads
    for (const [downloadId, info] of activeDownloads.entries()) {
        if (info.process && !info.process.killed) {
            try {
                info.process.kill('SIGTERM');
            } catch (error) {
                logger.warn(`Failed to terminate process ${downloadId}: ${error.message}`);
            }
        }
    }
    
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`YT-DL Studio Backend started on http://0.0.0.0:${PORT}`);
    logger.info(`Download directory: ${path.resolve(DOWNLOAD_DIR)}`);
});

module.exports = app;