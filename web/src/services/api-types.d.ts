// Generated from api/contract.json by npm run api:generate. Do not edit.
export interface DownloadOptions {
  "url": string;
  "thumbnail"?: string;
  "formatCode"?: string;
  "videoMultistreams"?: boolean;
  "audioMultistreams"?: boolean;
  "filename"?: string;
  "outputFormat"?: "" | "default" | "avi" | "flv" | "mkv" | "mov" | "mp4" | "webm";
  "overwrite"?: boolean;
  "downloadMode": "default" | "" | "both" | "video" | "audio";
  "downloadPath"?: string;
  "enableSubtitles"?: boolean;
  "subtitleLang"?: string;
  "embedSubs"?: boolean;
  "convertSubs"?: "default" | "" | "ass" | "lrc" | "srt" | "vtt";
  "subtitleFormat"?: "default" | "" | "best" | "ass" | "lrc" | "srt" | "vtt";
  "embedThumbnail"?: boolean;
  "embedMetadata"?: boolean;
  "addChapters"?: boolean;
  "embedInfoJson"?: boolean;
  "xattrs"?: boolean;
  "parseMetadata"?: string;
  "replaceInMetadata"?: string;
  "enablePostprocessing"?: boolean;
  "extractAudio"?: boolean;
  "audioFormat"?: "default" | "" | "best" | "aac" | "alac" | "flac" | "m4a" | "mp3" | "opus" | "vorbis" | "wav";
  "audioQuality"?: string;
  "remuxVideo"?: "default" | "" | "aac" | "alac" | "flac" | "m4a" | "mp3" | "opus" | "vorbis" | "wav" | "avi" | "flv" | "gif" | "mkv" | "mov" | "mp4" | "webm";
  "recodeVideo"?: "default" | "" | "avi" | "flv" | "gif" | "mkv" | "mov" | "mp4" | "webm";
  "convertThumb"?: "default" | "" | "jpg" | "png" | "webp";
  "postprocessorArgs"?: string;
  "keepVideo"?: boolean;
  "postOverwrites"?: boolean | null;
  "splitChapters"?: boolean;
  "forceKeyframes"?: boolean;
  "concatPlaylist"?: "default" | "" | "never" | "always" | "multi_video";
  "playlistItems"?: Array<number>;
  "fixup"?: "default" | "" | "never" | "warn" | "detect_or_warn" | "force";
  "advancedSettings"?: AdvancedSettings;
}

export interface AdvancedSettings {
  "proxy"?: string;
  "socket-timeout"?: number | null;
  "source-address"?: string;
  "geo-verification-proxy"?: string;
  "xff"?: string;
  "impersonate"?: string;
  "force-ipv4"?: boolean;
  "force-ipv6"?: boolean;
  "enable-file-urls"?: boolean;
  "username"?: string;
  "password"?: string;
  "twofactor"?: string;
  "video-password"?: string;
  "ap-mso"?: string;
  "ap-username"?: string;
  "ap-password"?: string;
  "netrc"?: boolean;
  "netrc-location"?: string;
  "netrc-cmd"?: string;
  "client-certificate"?: string;
  "client-certificate-key"?: string;
  "client-certificate-password"?: string;
  "cookies"?: string;
  "cookies-from-browser"?: string;
  "extractor-retries"?: number | null;
  "ignore-dynamic-mpd"?: boolean;
  "hls-split-discontinuity"?: boolean;
  "extractor-args"?: string;
  "ffmpeg-location"?: string;
  "exec"?: string;
  "no-exec"?: boolean;
  "sponsorblock-mark"?: string;
  "sponsorblock-remove"?: string;
  "sponsorblock-chapter-title"?: string;
  "sponsorblock-api"?: string;
  "no-sponsorblock"?: boolean;
  "download-archive"?: string;
}

export interface ProgressSnapshot {
  "version": number;
  "queued_at"?: string | null;
  "streams"?: Record<string, StreamProgress>;
  "files"?: Array<ResultFile>;
  "kind"?: string;
  "children"?: Array<string>;
  "batch"?: BatchProgress;
  "retry_needs_url"?: boolean;
  "download_id": string;
  "url"?: string;
  "thumbnail"?: string;
  "status": "initializing" | "waiting_for_capacity" | "queued" | "starting" | "preparing" | "downloading" | "processing" | "completed" | "failed" | "cancelled";
  "progress": number;
  "speed"?: number;
  "eta"?: number | null;
  "downloaded_bytes"?: number;
  "total_bytes"?: number;
  "filename"?: string | null;
  "error"?: string | null;
  "started_at"?: string | null;
  "completed_at"?: string | null;
  "video_progress": StreamProgress;
  "audio_progress": StreamProgress;
}

export interface StreamProgress {
  "id"?: string;
  "kind"?: string;
  "expected"?: boolean;
  "combined"?: boolean;
  "status"?: string;
  "progress"?: number;
  "speed"?: number;
  "eta"?: number | null;
  "downloadedBytes"?: number;
  "totalBytes"?: number;
}

export interface ResultFile {
  "index"?: number;
  "name"?: string;
  "size"?: number;
}

export interface BatchProgress {
  "total"?: number;
  "admitted"?: number;
  "completed"?: number;
  "failed"?: number;
  "cancelled"?: number;
}

export interface Capabilities {
  "cancel"?: boolean;
  "batch"?: boolean;
  "retry"?: boolean;
  "result_files"?: boolean;
  "pause_resume"?: boolean;
  "network_guard"?: boolean;
  "custom_download_path"?: boolean;
  "dangerous_options"?: boolean;
  "events"?: boolean;
  "playlist_concat"?: boolean;
  "file_cleanup"?: boolean;
}

export interface Health {
  "app_version": string;
  "commit": string;
  "build_time": string;
  "status": string;
  "platform": string;
  "ytdlp_version": string;
  "ejs_status": string;
  "ejs_version": string;
  "ffmpeg_version": string;
  "ffprobe_version": string;
  "js_runtime": string;
  "js_runtime_version": string;
  "ytdlp_available": boolean;
  "ffmpeg_available": boolean;
  "ffprobe_available": boolean;
  "js_runtime_available": boolean;
  "download_directory_exists": boolean;
  "download_directory_writable": boolean;
  "supports_pause_resume": boolean;
  "ejs_available": boolean | null;
  "max_concurrent_downloads": number;
  "info_timeout_ms": number;
  "issues": Array<string>;
  "capabilities": Capabilities;
}

export interface Format {
  "id"?: string | null;
  "ext"?: string | null;
  "format"?: string | null;
  "format_note"?: string | null;
  "resolution"?: string | null;
  "type"?: string | null;
  "vcodec"?: string | null;
  "acodec"?: string | null;
  "filesize"?: number | null;
  "tbr"?: number | null;
  "abr"?: number | null;
  "vbr"?: number | null;
  "fps"?: number | null;
  "width"?: number | null;
  "height"?: number | null;
  "filesize_is_approx"?: boolean;
}

export interface Subtitle {
  "lang"?: string;
  "ext"?: string;
  "name"?: string;
  "auto"?: boolean;
}

export interface Chapter {
  "title"?: string;
  "start_time"?: number | null;
  "end_time"?: number | null;
}

export interface VideoInfo {
  "id": string | null;
  "original_url": string | null;
  "title": string | null;
  "thumbnail"?: string | null;
  "description"?: string | null;
  "ext"?: string | null;
  "uploader"?: string | null;
  "upload_date"?: string | null;
  "suggested_filename"?: string | null;
  "duration"?: number | null;
  "view_count"?: number | null;
  "video_formats": Array<Format> | null;
  "audio_formats": Array<Format> | null;
  "subtitles"?: Array<Subtitle> | null;
  "chapters"?: Array<Chapter> | null;
  "best_video_ids"?: Array<string> | null;
  "best_audio_ids"?: Array<string> | null;
  "subtitle_languages"?: Array<string> | null;
  "has_chapters": boolean;
  "is_live": boolean;
}

export interface PlaylistEntry {
  "id": string | null;
  "url": string | null;
  "title": string | null;
  "thumbnail"?: string | null;
  "uploader"?: string | null;
  "duration"?: number | null;
  "view_count"?: number | null;
  "playlist_index": number;
}

export interface PlaylistInfo {
  "_type": "playlist";
  "id": string | null;
  "title": string | null;
  "uploader"?: string | null;
  "description"?: string | null;
  "original_url": string | null;
  "entry_count": number;
  "entries": Array<PlaylistEntry>;
}

export interface InfoRequest {
  "url": string;
  "advancedSettings"?: AdvancedSettings;
}

export interface RetryRequest {
  "url"?: string;
  "advancedSettings"?: AdvancedSettings;
}

export interface BatchEntry {
  "url": string;
  "filename"?: string;
  "thumbnail"?: string;
}

export interface BatchRequest {
  "entries": Array<BatchEntry>;
  "options": SharedDownloadOptions;
}

export interface CommandPreview {
  "command": string;
  "shell": string;
  "argv": Array<string>;
}

export interface Admission {
  "id": string;
  "message"?: string;
}

export interface History {
  "downloads": Array<ProgressSnapshot>;
  "total": number;
  "next_offset": number;
}

export interface Log {
  "log": Array<string>;
}

export interface RetainedFile {
  "name": string;
  "size": number;
  "modified": number;
}

export interface RetainedPreview {
  "files": Array<RetainedFile>;
  "total_bytes": number;
  "token": string;
}

export interface CleanupRequest {
  "token": string;
}

export interface CleanupResult {
  "removed": number;
  "bytes_freed": number;
}

export interface Error {
  "error": string;
  "code"?: string;
  "error_code"?: string;
}

export type StatusMap = Record<string, ProgressSnapshot | null>;

export type EventStream = { "type": "progress"; "downloadId": string; "data": ProgressSnapshot } | { "type": "snapshot"; "downloads": Array<ProgressSnapshot> } | { "type": "resync" };

export type BinaryFile = string;

export interface Success {
  "status": string;
  "message"?: string;
}

export interface SharedDownloadOptions {
  "url"?: string;
  "thumbnail"?: string;
  "formatCode"?: string;
  "videoMultistreams"?: boolean;
  "audioMultistreams"?: boolean;
  "filename"?: string;
  "outputFormat"?: "" | "default" | "avi" | "flv" | "mkv" | "mov" | "mp4" | "webm";
  "overwrite"?: boolean;
  "downloadMode"?: "default" | "" | "both" | "video" | "audio";
  "downloadPath"?: string;
  "enableSubtitles"?: boolean;
  "subtitleLang"?: string;
  "embedSubs"?: boolean;
  "convertSubs"?: "default" | "" | "ass" | "lrc" | "srt" | "vtt";
  "subtitleFormat"?: "default" | "" | "best" | "ass" | "lrc" | "srt" | "vtt";
  "embedThumbnail"?: boolean;
  "embedMetadata"?: boolean;
  "addChapters"?: boolean;
  "embedInfoJson"?: boolean;
  "xattrs"?: boolean;
  "parseMetadata"?: string;
  "replaceInMetadata"?: string;
  "enablePostprocessing"?: boolean;
  "extractAudio"?: boolean;
  "audioFormat"?: "default" | "" | "best" | "aac" | "alac" | "flac" | "m4a" | "mp3" | "opus" | "vorbis" | "wav";
  "audioQuality"?: string;
  "remuxVideo"?: "default" | "" | "aac" | "alac" | "flac" | "m4a" | "mp3" | "opus" | "vorbis" | "wav" | "avi" | "flv" | "gif" | "mkv" | "mov" | "mp4" | "webm";
  "recodeVideo"?: "default" | "" | "avi" | "flv" | "gif" | "mkv" | "mov" | "mp4" | "webm";
  "convertThumb"?: "default" | "" | "jpg" | "png" | "webp";
  "postprocessorArgs"?: string;
  "keepVideo"?: boolean;
  "postOverwrites"?: boolean | null;
  "splitChapters"?: boolean;
  "forceKeyframes"?: boolean;
  "concatPlaylist"?: "default" | "" | "never" | "always" | "multi_video";
  "playlistItems"?: Array<number>;
  "fixup"?: "default" | "" | "never" | "warn" | "detect_or_warn" | "force";
  "advancedSettings"?: AdvancedSettings;
}
