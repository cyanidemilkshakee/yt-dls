const { config } = require('../config');
const { ValidationError, validateFilenameTemplate, oneOf } = require('../utils/validation');

const PROGRESS_TEMPLATE = 'download:{"status":%(progress.status)j,"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j,"eta":%(progress.eta)j,"filename":%(progress.filename,info.filepath|)j,"vcodec":%(info.vcodec)j,"acodec":%(info.acodec)j,"format_id":%(info.format_id)j}';
const MERGE_FORMATS = ['avi', 'flv', 'mkv', 'mov', 'mp4', 'webm'];
const AUDIO_FORMATS = ['aac', 'alac', 'flac', 'm4a', 'mp3', 'opus', 'vorbis', 'wav'];
const VIDEO_FORMATS = ['avi', 'flv', 'gif', 'mkv', 'mov', 'mp4', 'webm'];
const SUBTITLE_FORMATS = ['ass', 'lrc', 'srt', 'vtt'];
const CONCAT_POLICIES = ['never', 'always', 'multi_video'];

function stringOption(value, name, maxLength = 500) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) {
    throw new ValidationError(`${name} is invalid or too long.`, 'INVALID_OPTION');
  }
  return value.trim();
}

function positiveNumber(value, name, { min = 0, max = 86_400 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}.`, 'INVALID_OPTION');
  }
  return number;
}

function audioQuality(value) {
  if (value === undefined || value === null || value === '') return null;
  const quality = String(value).trim();
  if (/^(?:10|[0-9])$/.test(quality) || /^\d{2,4}(?:k|K)?$/.test(quality)) return quality;
  throw new ValidationError('Audio quality must be 0–10 or a bitrate such as 128K.', 'INVALID_OPTION');
}

function splitArguments(value, name) {
  const input = stringOption(value, name, 1000);
  if (!input) return [];
  const tokens = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return tokens.map((token) => token.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2'));
}

function validateFormatSelector(value) {
  const selector = stringOption(value || 'bestvideo+bestaudio/best', 'format selector', 300);
  if (!/^[\w+\-.,/:[\]()?<>=!*~^'" ]+$/.test(selector)) {
    throw new ValidationError('The format selector contains unsupported characters.', 'INVALID_FORMAT_SELECTOR');
  }
  return selector;
}

function dangerousOption(command, flag, value, label) {
  if (!value) return;
  if (!config.ALLOW_DANGEROUS_OPTIONS) {
    throw new ValidationError(`${label} is disabled by the server. Set ALLOW_DANGEROUS_OPTIONS=true only on a trusted local machine.`, 'DANGEROUS_OPTION_DISABLED');
  }
  command.push(flag, value === true ? undefined : value);
  if (command[command.length - 1] === undefined) command.pop();
}

function buildYtDlpCommand(options, { downloadDirectory = config.DOWNLOAD_DIR } = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ValidationError('Download options must be an object.');
  const mediaUrl = stringOption(options.url, 'media URL', 4096);
  if (!mediaUrl) throw new ValidationError('A media URL is required.', 'MISSING_URL');
  const command = [config.YTDLP_PATH, '--newline', '--progress-template', PROGRESS_TEMPLATE];

  command.push('-f', validateFormatSelector(options.formatCode));
  const filenameTemplate = validateFilenameTemplate(options.filename);
  command.push('-o', filenameTemplate, '-P', downloadDirectory);

  const outputFormat = oneOf(options.outputFormat, MERGE_FORMATS, 'merge output format');
  if (outputFormat && outputFormat !== 'default') command.push('--merge-output-format', outputFormat);
  if (options.overwrite === true) command.push('--force-overwrites');
  else command.push('--no-overwrites');

  if (options.enableSubtitles) {
    const subLang = stringOption(options.subtitleLang, 'subtitle language', 100);
    if (subLang && subLang !== 'none') {
      command.push('--write-subs', '--write-auto-subs');
      if (subLang !== 'all') command.push('--sub-langs', subLang);
      if (options.embedSubs) command.push('--embed-subs');
      const convertSubs = oneOf(options.convertSubs, SUBTITLE_FORMATS, 'subtitle conversion format');
      if (convertSubs) command.push('--convert-subs', convertSubs);
    }
    const subFormat = options.subtitleFormat === 'best' ? 'best' : oneOf(options.subtitleFormat, SUBTITLE_FORMATS, 'subtitle format');
    if (subFormat && subFormat !== 'best') command.push('--sub-format', subFormat);
  }

  if (options.embedThumbnail) command.push('--embed-thumbnail');
  if (options.embedMetadata) command.push('--embed-metadata');
  if (options.addChapters) command.push('--embed-chapters');
  if (options.embedInfoJson) command.push('--embed-info-json');
  if (options.xattrs) command.push('--xattrs');
  const parseMetadata = stringOption(options.parseMetadata, 'metadata parser', 500);
  if (parseMetadata) command.push('--parse-metadata', parseMetadata);
  const replaceMetadata = splitArguments(options.replaceInMetadata, 'metadata replacement');
  if (replaceMetadata.length) {
    if (replaceMetadata.length !== 3) throw new ValidationError('Replace-in-metadata requires: FIELDS REGEX REPLACE.', 'INVALID_OPTION');
    command.push('--replace-in-metadata', ...replaceMetadata);
  }

  if (options.enablePostprocessing || options.extractAudio) {
    if (options.extractAudio) {
      command.push('--extract-audio');
      const audioFormat = options.audioFormat === 'best' ? 'best' : oneOf(options.audioFormat, AUDIO_FORMATS, 'audio format');
      if (audioFormat && audioFormat !== 'best') command.push('--audio-format', audioFormat);
      const quality = audioQuality(options.audioQuality);
      if (quality !== null) command.push('--audio-quality', String(quality));
    }
    const remux = oneOf(options.remuxVideo, [...VIDEO_FORMATS, ...AUDIO_FORMATS], 'remux format');
    if (remux) command.push('--remux-video', remux);
    const recode = oneOf(options.recodeVideo, VIDEO_FORMATS, 'recode format');
    if (recode) command.push('--recode-video', recode);
    const thumbnail = oneOf(options.convertThumb, ['jpg', 'png', 'webp'], 'thumbnail format');
    if (thumbnail) command.push('--convert-thumbnails', thumbnail);
    const postprocessorArgs = stringOption(options.postprocessorArgs, 'postprocessor arguments', 1000);
    dangerousOption(command, '--postprocessor-args', postprocessorArgs, 'Raw postprocessor arguments');
    if (options.keepVideo) command.push('--keep-video');
    command.push(options.postOverwrites === false ? '--no-post-overwrites' : '--post-overwrites');
  }

  if (options.splitChapters) command.push('--split-chapters');
  if (options.forceKeyframes) command.push('--force-keyframes-at-cuts');
  const concat = oneOf(options.concatPlaylist, CONCAT_POLICIES, 'playlist concatenation policy');
  if (concat && concat !== 'multi_video') command.push('--concat-playlist', concat);
  const fixup = oneOf(options.fixup, ['never', 'warn', 'detect_or_warn', 'force'], 'fixup policy');
  if (fixup && fixup !== 'detect_or_warn') command.push('--fixup', fixup);

  const adv = options.advancedSettings && typeof options.advancedSettings === 'object' ? options.advancedSettings : {};
  const proxy = stringOption(adv.proxy, 'proxy', 500);
  if (proxy) command.push('--proxy', proxy);
  const socketTimeout = positiveNumber(adv['socket-timeout'], 'socket timeout', { min: 1, max: 3600 });
  if (socketTimeout !== null) command.push('--socket-timeout', String(socketTimeout));
  const sourceAddress = stringOption(adv['source-address'], 'source address', 100);
  if (sourceAddress) command.push('--source-address', sourceAddress);
  const geoProxy = stringOption(adv['geo-verification-proxy'], 'geo verification proxy', 500);
  if (geoProxy) command.push('--geo-verification-proxy', geoProxy);
  const xff = stringOption(adv.xff, 'X-Forwarded-For policy', 100);
  if (xff) command.push('--xff', xff);
  const impersonate = stringOption(adv.impersonate, 'impersonation target', 100);
  if (impersonate) command.push('--impersonate', impersonate);
  if (adv['force-ipv4'] && adv['force-ipv6']) throw new ValidationError('IPv4 and IPv6 cannot both be forced.', 'CONFLICTING_OPTIONS');
  if (adv['force-ipv4']) command.push('--force-ipv4');
  if (adv['force-ipv6']) command.push('--force-ipv6');
  dangerousOption(command, '--enable-file-urls', adv['enable-file-urls'], 'Local file URLs');

  for (const [key, flag] of [['username', '--username'], ['password', '--password'], ['twofactor', '--twofactor'], ['video-password', '--video-password'], ['ap-mso', '--ap-mso'], ['ap-username', '--ap-username'], ['ap-password', '--ap-password']]) {
    const value = stringOption(adv[key], key, 1000);
    if (value) command.push(flag, value);
  }
  dangerousOption(command, '--netrc', adv.netrc, 'Reading .netrc credentials');
  const netrcLocation = stringOption(adv['netrc-location'], 'netrc location', 500);
  dangerousOption(command, '--netrc-location', netrcLocation, 'Custom .netrc files');
  dangerousOption(command, '--netrc-cmd', stringOption(adv['netrc-cmd'], 'netrc command', 1000), 'netrc commands');
  dangerousOption(command, '--client-certificate', stringOption(adv['client-certificate'], 'client certificate', 500), 'Client certificate files');
  dangerousOption(command, '--client-certificate-key', stringOption(adv['client-certificate-key'], 'client certificate key', 500), 'Client certificate key files');
  const certificatePassword = stringOption(adv['client-certificate-password'], 'client certificate password', 1000);
  if (certificatePassword) command.push('--client-certificate-password', certificatePassword);

  const extractorRetries = positiveNumber(adv['extractor-retries'], 'extractor retries', { min: 0, max: 100 });
  command.push('--extractor-retries', String(extractorRetries ?? 3));
  if (adv['ignore-dynamic-mpd']) command.push('--ignore-dynamic-mpd');
  if (adv['hls-split-discontinuity']) command.push('--hls-split-discontinuity');
  const extractorArgs = stringOption(adv['extractor-args'], 'extractor arguments', 1000);
  if (extractorArgs) command.push('--extractor-args', extractorArgs);
  const ffmpegLocation = stringOption(adv['ffmpeg-location'], 'FFmpeg location', 500);
  dangerousOption(command, '--ffmpeg-location', ffmpegLocation, 'Custom FFmpeg executables');
  dangerousOption(command, '--exec', !adv['no-exec'] && stringOption(adv.exec, 'execute command', 2000), 'Post-download commands');

  command.push('--retries', '3', '--fragment-retries', '3', '--retry-sleep', 'http:exp=1:20', '--no-colors', '--no-warnings');
  command.push(mediaUrl);
  return { command, filenameTemplate, downloadDirectory };
}

const SECRET_FLAGS = new Set(['--password', '--twofactor', '--video-password', '--ap-password', '--client-certificate-password']);
function redactCommand(command) {
  return command.map((arg, index) => SECRET_FLAGS.has(command[index - 1]) ? '[REDACTED]' : arg);
}

function formatCommand(command) {
  return command.map((argument) => {
    const value = String(argument);
    if (/^[A-Za-z0-9_./:\\%()+,=@-]+$/.test(value)) return value;
    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
  }).join(' ');
}

module.exports = { buildYtDlpCommand, redactCommand, formatCommand, PROGRESS_TEMPLATE };
