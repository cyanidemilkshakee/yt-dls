import contract from '../../../../api/contract.json';

export function createConfiguration(info) {
  const initialVideoIds = new Set(info?.best_video_ids || []);
  const audioIds = info?.best_audio_ids || [];
  const initialAudioIds = new Set(audioIds.filter(id => !/-drc\b/i.test(id)).length ? audioIds.filter(id => !/-drc\b/i.test(id)) : audioIds);
  return {
    downloadMode: 'both',
    filenameBase: info?._type === 'playlist' || info?.entries ? '%(title)s_%(id)s' : (info?.suggested_filename || info?.title || 'video').replace(/\.%\(ext\)s$/, ''),
    outputFormat: 'default',
    downloadPath: './downloads',
    activePreset: 'default',
    selectedVideoIds: new Set([...initialVideoIds].slice(0, 1)),
    selectedAudioIds: new Set([...initialAudioIds].slice(0, 1)),
    multiVideo: false,
    multiAudio: false,
    subtitleLang: 'none',
    subtitleFormat: 'best',
    subtitlesEnabled: false,
    embedSubs: false,
    extractAudio: false,
    keepVideo: false,
    overwriteFiles: false,
    postOverwriteFiles: false,
    customFormat: '',
    customSubtitleLang: '',
    concatPlaylist: 'never',
    remuxCheck: false,
    remuxFormat: '',
    recodeCheck: false,
    recodeFormat: '',
    convertSubsCheck: false,
    convertSubsFormat: 'srt',
    convertThumbCheck: false,
    convertThumbFormat: 'jpg',
    audioFormat: 'best',
    audioQuality: '',
    postprocessorArgs: '',
    embedMetadata: false,
    parseMetadata: '',
    replaceMetadata: '',
    embedThumbnail: false,
    addChapters: false,
    embedInfoJson: false,
    writeXattrs: false,
    splitChapters: false,
    forceKeyframes: false,
    fixupPolicy: 'detect_or_warn',
  };
}

export function buildOptions(info, state, advancedSettings = {}) {
  const selector = (ids, multi, fallback) => ids.size ? (multi ? [...ids].join('+') : [...ids][0]) : fallback;
  const video = selector(state.selectedVideoIds, state.multiVideo, 'bestvideo');
  const audio = selector(state.selectedAudioIds, state.multiAudio, 'bestaudio');
  const combined = info.video_formats?.some(format => state.selectedVideoIds.has(format.id) && format.type === 'combined') && !state.multiVideo;
  return {
    url: info.original_url, thumbnail: info.thumbnail || '', filename: state.filenameBase,
    downloadMode: state.downloadMode, outputFormat: state.outputFormat, downloadPath: state.downloadPath,
    formatCode: state.customFormat.trim() || (state.downloadMode === 'audio' ? `${audio}/best` : state.downloadMode === 'video' ? video : combined ? video : `${video}+${audio}/best`),
    videoMultistreams: state.multiVideo, audioMultistreams: state.multiAudio,
    enableSubtitles: state.subtitlesEnabled, subtitleLang: state.customSubtitleLang.trim() || state.subtitleLang,
    subtitleFormat: state.subtitleFormat, embedSubs: state.subtitlesEnabled && state.embedSubs,
    enablePostprocessing: state.extractAudio || state.keepVideo || state.remuxCheck || state.recodeCheck || state.convertThumbCheck || Boolean(state.postprocessorArgs.trim()),
    extractAudio: state.downloadMode === 'audio' || state.extractAudio, audioFormat: state.audioFormat, audioQuality: state.audioQuality,
    remuxVideo: state.remuxCheck ? state.remuxFormat : '', recodeVideo: state.recodeCheck ? state.recodeFormat : '',
    convertSubs: state.subtitlesEnabled && state.convertSubsCheck ? state.convertSubsFormat : '', convertThumb: state.convertThumbCheck ? state.convertThumbFormat : '',
    postprocessorArgs: state.postprocessorArgs, keepVideo: state.keepVideo, overwrite: state.overwriteFiles, postOverwrites: state.postOverwriteFiles,
    embedThumbnail: state.embedThumbnail, embedMetadata: state.embedMetadata, addChapters: state.addChapters, embedInfoJson: state.embedInfoJson,
    parseMetadata: state.parseMetadata, replaceInMetadata: state.replaceMetadata, xattrs: state.writeXattrs,
    fixup: state.fixupPolicy, splitChapters: state.splitChapters, forceKeyframes: state.forceKeyframes,
    concatPlaylist: state.concatPlaylist, advancedSettings
  };
}

function constrainConfiguration(state, info) {
  const next = { ...state };
  if (next.downloadMode === 'audio') next.extractAudio = true;
  if (next.downloadMode === 'video') next.extractAudio = false;
  if (next.downloadMode === 'both' && next.extractAudio) next.downloadMode = 'audio';
  if (next.remuxCheck && next.recodeCheck) next.remuxCheck = false;
  if (next.remuxCheck && !next.remuxFormat) next.remuxFormat = 'mp4';
  if (next.recodeCheck && !next.recodeFormat) next.recodeFormat = 'mp4';
  if (!next.splitChapters) next.forceKeyframes = false;
  if (next.subtitlesEnabled && !next.customSubtitleLang.trim() && (!next.subtitleLang.trim() || next.subtitleLang === 'none')) {
    next.subtitleLang = info?.subtitle_languages?.[0] || info?.subtitles?.[0]?.lang || 'all';
  }
  if (next.downloadMode === 'video' || next.multiVideo) {
    const eligible = [...next.selectedVideoIds].filter(id => info?.video_formats?.some(format => format.id === id && format.type === 'video'));
    if (eligible.length) next.selectedVideoIds = new Set(next.multiVideo ? eligible : eligible.slice(0, 1));
    else {
      const first = info?.video_formats?.find(format => format.type === 'video')?.id;
      next.selectedVideoIds = new Set(first ? [first] : []);
    }
  }
  return next;
}

export function configurationReducer(state, action) {
  if (action.type === 'restore') return constrainConfiguration({ ...state, ...action.value }, action.info);
  if (action.type === 'preset') {
    if (action.name === 'custom') return { ...state, activePreset: 'custom' };
    const next = { ...createConfiguration(action.info), filenameBase: state.filenameBase, downloadPath: state.downloadPath, activePreset: action.name };
    if (action.name === 'hq-mp4') next.outputFormat = 'mp4';
    if (action.name === 'mkv') next.outputFormat = 'mkv';
    if (action.name === 'mp3') { next.downloadMode = 'audio'; next.extractAudio = true; next.audioFormat = 'mp3'; next.selectedVideoIds = new Set(); }
    return constrainConfiguration(next, action.info);
  }
  if (action.key === 'savedPreset') return constrainConfiguration({ ...state, ...presetValues(action.value), activePreset: 'custom' }, action.info);
  const value = typeof action.value === 'function' ? action.value(state[action.key]) : action.value;
  const next = { ...state, [action.key]: value, activePreset: 'custom' };
  if (action.key === 'remuxCheck' && value) { next.recodeCheck = false; next.remuxFormat ||= 'mp4'; }
  if (action.key === 'recodeCheck' && value) { next.remuxCheck = false; next.recodeFormat ||= 'mp4'; }
  if (action.key === 'extractAudio' && value) next.downloadMode = 'audio';
  if (action.key === 'downloadMode') next.extractAudio = value === 'audio';
  if (action.key === 'subtitleLang') { next.customSubtitleLang = ''; next.subtitlesEnabled = value !== 'none'; }
  if (action.key === 'customSubtitleLang' && value.trim()) next.subtitlesEnabled = true;
  return constrainConfiguration(next, action.info);
}

export function presetValues(state) {
  const excluded = new Set(['filenameBase', 'downloadPath', 'activePreset', 'selectedVideoIds', 'selectedAudioIds', 'concatPlaylist', 'postprocessorArgs']);
  const validEnums = {
    downloadMode: contract.enums.downloadModes, outputFormat: ['default', ...contract.enums.mergeFormats],
    subtitleFormat: ['best', ...contract.enums.subtitleFormats], audioFormat: ['best', ...contract.enums.audioFormats],
    remuxFormat: ['', ...contract.enums.videoFormats, ...contract.enums.audioFormats], recodeFormat: ['', ...contract.enums.videoFormats],
    convertSubsFormat: contract.enums.subtitleFormats, convertThumbFormat: contract.enums.thumbFormats, fixupPolicy: contract.enums.fixupPolicies,
  };
  return Object.fromEntries(Object.entries(createConfiguration()).filter(([key, value]) => {
    const candidate = state?.[key];
    return !excluded.has(key) && typeof candidate === typeof value
      && (typeof value !== 'string' || candidate.length <= 4096 && !candidate.includes('\0'))
      && (!validEnums[key] || validEnums[key].includes(candidate));
  }).map(([key]) => [key, state[key]]));
}

export function estimateSize(info, state) {
  if (state.customFormat.trim() || info?._type === 'playlist' || info?.entries) return { videoSize: 0, audioSize: 0, totalBytes: 0, isApprox: false, incomplete: true };
  const videos = state.downloadMode === 'audio' ? [] : (info.video_formats || []).filter(format => state.selectedVideoIds.has(format.id));
  const combined = !state.multiVideo && videos.some(format => format.type === 'combined');
  const audios = state.downloadMode === 'video' || combined ? [] : (info.audio_formats || []).filter(format => state.selectedAudioIds.has(format.id));
  const selected = [...videos, ...audios];
  const size = format => Number.isFinite(Number(format.filesize)) && Number(format.filesize) > 0 ? Number(format.filesize) : 0;
  const sum = formats => formats.reduce((total, format) => total + size(format), 0);
  return { videoSize: sum(videos), audioSize: sum(audios), totalBytes: sum(selected), isApprox: selected.some(format => format.filesize_is_approx), incomplete: !selected.length || selected.some(format => !size(format)) };
}
