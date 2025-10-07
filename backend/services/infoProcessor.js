const { sanitizeFilename } = require('../utils/sanitize');

function getVideoSummary(infoDict) {
  const description = infoDict.description || '';
  const uploader = infoDict.uploader || 'Unknown';
  const duration = infoDict.duration;
  const summaryParts = [];
  if (uploader !== 'Unknown') summaryParts.push(`Uploaded by: ${uploader}`);
  if (duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    const durationStr = hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    summaryParts.push(`Duration: ${durationStr}`);
  }
  if (description) {
    const cleanDesc = description.replace(/\s+/g, ' ').trim();
    const truncatedDesc = cleanDesc.length > 200 ? cleanDesc.substring(0, 200) + '...' : cleanDesc;
    summaryParts.push(truncatedDesc);
  }
  return summaryParts.length > 0 ? summaryParts.join(' | ') : 'No additional information available.';
}

function processInfoDict(info) {
  const videoFormats = [];
  const audioFormats = [];
  const combinedFormats = [];
  const duration = info.duration;

  for (const f of info.formats || []) {
    if (f.vcodec === 'images' || f.format_note === 'storyboard' || ['jpg', 'jpeg', 'png', 'webp'].includes(f.ext)) continue;

    let filesize = f.filesize;
    let isApprox = false;
    if (!filesize && f.filesize_approx) {
      filesize = f.filesize_approx; isApprox = true;
    }
    if (!filesize && typeof duration === 'number' && duration > 0) {
      const bitrate = f.vbr || f.abr || f.tbr;
      if (typeof bitrate === 'number') {
        try { filesize = (bitrate * 1000 / 8) * duration; isApprox = true; } catch { filesize = null; }
      }
    }

    const formatInfo = {
      id: f.format_id,
      ext: f.ext,
      filesize,
      filesize_is_approx: isApprox,
      tbr: f.tbr,
      abr: f.abr,
      vbr: f.vbr,
      fps: f.fps,
      vcodec: (f.vcodec || 'N/A').split('.')[0],
      acodec: (f.acodec || 'N/A').split('.')[0],
      width: f.width,
      height: f.height,
      format_note: f.format_note,
      format: f.format,
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
  allVideoFormats.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.vbr || 0) - (a.vbr || 0) || (b.fps || 0) - (a.fps || 0));
  audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

  const bestVideoIds = [];
  if (allVideoFormats.length > 0) {
    const bestFormat = allVideoFormats[0];
    const bestCriteria = [bestFormat.height || 0, bestFormat.vbr || 0];
    for (const f of allVideoFormats) if ((f.height || 0) === bestCriteria[0] && (f.vbr || 0) === bestCriteria[1]) bestVideoIds.push(f.id);
  }

  const bestAudioIds = [];
  if (audioFormats.length > 0) {
    const bestBitrate = audioFormats[0].abr || 0;
    for (const f of audioFormats) if ((f.abr || 0) === bestBitrate) bestAudioIds.push(f.id);
  }

  const subtitles = [];
  const subtitleLanguages = new Set();
  for (const [lang, subs] of Object.entries(info.subtitles || {})) {
    subtitleLanguages.add(lang);
    for (const sub of subs) if (['vtt', 'srt', 'ass'].includes(sub.ext)) subtitles.push({ lang, name: sub.name || lang, ext: sub.ext, auto: false });
  }
  for (const [lang, subs] of Object.entries(info.automatic_captions || {})) {
    if (!subtitleLanguages.has(lang)) {
      for (const sub of subs) if (['vtt', 'srt', 'ass'].includes(sub.ext)) subtitles.push({ lang, name: `${sub.name || lang} (auto)`, ext: sub.ext, auto: true });
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

module.exports = { processInfoDict };
