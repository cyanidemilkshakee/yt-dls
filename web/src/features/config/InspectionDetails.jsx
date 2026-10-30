export default function InspectionDetails({ info }) {
  const rawDate = String(info.upload_date || '');
  const date = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}` : rawDate;
  return <details className="cfg-details"><summary>Source details</summary>
    <p>{info.is_live ? 'Live stream' : 'Recorded media'}{date ? ` · Uploaded ${date}` : ''}{info.has_chapters ? ' · Chapters available' : ''}</p>
    {info.description && <p className="cfg-description">{info.description}</p>}
    {info.chapters?.length > 0 && <ol>{info.chapters.map((chapter, index) => <li key={index}>{chapter.title || `Chapter ${index + 1}`} · {Math.floor(chapter.start_time || 0)}s</li>)}</ol>}
  </details>;
}
