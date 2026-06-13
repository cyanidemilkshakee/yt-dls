const { sanitizeFilename } = require('../utils/sanitize');

function buildYtDlpCommand(options) {
  const command = ['yt-dlp'];

  command.push(
    '--newline',
    '--progress-template',
    '{"status":"%(progress.status)s","downloaded_bytes":"%(progress.downloaded_bytes)s","total_bytes":"%(progress.total_bytes)s","total_bytes_estimate":"%(progress.total_bytes_estimate)s","speed":"%(progress.speed)s","eta":"%(progress.eta)s","filename":"%(info.filepath,progress.filename|)s"}'
  );

  const formatString = options.formatCode || 'bestvideo+bestaudio/best';
  command.push('-f', formatString);

  let filenameTemplate = options.filename || '%(title)s';
  if (!filenameTemplate.includes('.%(ext)s')) filenameTemplate += '.%(ext)s';
  command.push('-o', filenameTemplate);

  // Output path: allow per-request download directory
  if (options.downloadPath && typeof options.downloadPath === 'string') {
    const dlPath = options.downloadPath.trim();
    if (dlPath) {
      command.push('-P', dlPath);
    }
  }

  const outputFormat = options.outputFormat;
  if (outputFormat && outputFormat !== 'default') command.push('--merge-output-format', outputFormat);

  if (options.overwrite) command.push('--force-overwrites');
  else if (options.overwrite === false) command.push('--no-overwrites');

  if (options.enableSubtitles) {
    const subLang = options.subtitleLang;
    if (subLang && subLang !== 'none') {
      command.push('--write-subs', '--write-auto-subs');
      if (subLang !== 'all') command.push('--sub-langs', subLang);
      // embedSubs and convertSubs only make sense when subs are being written
      if (options.embedSubs) command.push('--embed-subs');
      if (options.convertSubs) command.push('--convert-subs', options.convertSubs);
    }
    const subFormat = options.subtitleFormat;
    if (subFormat && subFormat !== 'best') command.push('--sub-format', subFormat);
  }
  if (options.embedThumbnail) command.push('--embed-thumbnail');
  if (options.embedMetadata) command.push('--embed-metadata');
  if (options.addChapters) command.push('--add-chapters');
  if (options.embedInfoJson) command.push('--embed-info-json');
  if (options.xattrs) command.push('--xattrs');
  if (options.parseMetadata) command.push('--parse-metadata', options.parseMetadata);

  if (options.enablePostprocessing || options.extractAudio) {
    if (options.extractAudio) {
      command.push('-x');
      if (options.audioFormat && options.audioFormat !== 'best') command.push('--audio-format', options.audioFormat);
      if (options.audioQuality) command.push('--audio-quality', String(options.audioQuality));
    }
    if (options.remuxVideo) command.push('--remux-video', options.remuxVideo);
    if (options.recodeVideo) command.push('--recode-video', options.recodeVideo);
    if (options.convertThumb) command.push('--convert-thumbnails', options.convertThumb);
    if (options.postprocessorArgs) command.push('--postprocessor-args', options.postprocessorArgs);
    if (options.keepVideo) command.push('-k');
    if (options.postOverwrites === false) command.push('--no-post-overwrites');
    else command.push('--post-overwrites');
  }

  if (options.splitChapters) command.push('--split-chapters');
  if (options.forceKeyframes) command.push('--force-keyframes-at-cuts');
  if (options.concatPlaylist && options.concatPlaylist !== 'multi_video') command.push('--concat-playlist', options.concatPlaylist);
  if (options.fixup && options.fixup !== 'detect_or_warn') command.push('--fixup', options.fixup);

  const adv = options.advancedSettings || {};
  if (adv.proxy) command.push('--proxy', adv.proxy);
  if (adv['socket-timeout']) command.push('--socket-timeout', String(adv['socket-timeout']));
  if (adv['source-address']) command.push('--source-address', adv['source-address']);
  if (adv.impersonate) command.push('--impersonate', adv.impersonate);
  if (adv['force-ipv4']) command.push('--force-ipv4');
  if (adv['force-ipv6']) command.push('--force-ipv6');
  if (adv['enable-file-urls']) command.push('--enable-file-urls');
  if (adv['geo-verification-proxy']) command.push('--geo-verification-proxy', adv['geo-verification-proxy']);
  if (adv.xff) command.push('--xff', adv.xff);

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

  if (adv['extractor-retries']) command.push('--extractor-retries', String(adv['extractor-retries']));
  if (adv['ignore-dynamic-mpd']) command.push('--ignore-dynamic-mpd');
  if (adv['hls-split-discontinuity']) command.push('--hls-split-discontinuity');
  if (adv['extractor-args']) command.push('--extractor-args', adv['extractor-args']);
  if (adv['ffmpeg-location']) command.push('--ffmpeg-location', adv['ffmpeg-location']);
  if (adv.exec && !adv['no-exec']) command.push('--exec', adv.exec);

  command.push(
    '--retries', '3',
    '--fragment-retries', '3',
    '--no-colors',
    '--no-warnings',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );

  // If user didn't set extractor-retries in advancedSettings, apply default
  if (!adv['extractor-retries']) command.push('--extractor-retries', '3');

  if (options.url && options.url.toLowerCase().includes('playlist')) command.push('--sleep-interval', '1');
  command.push(options.url);

  return { command, filenameTemplate };
}

module.exports = { buildYtDlpCommand };
