import { SiGithub } from 'react-icons/si';
import './About.css';

const workflow = [
  {
    title: 'Inspect a source',
    description: 'Paste a video or playlist URL to view its details and available formats before downloading.',
  },
  {
    title: 'Configure the download',
    description: 'Choose quality, output options, and saved presets. Select individual entries when working with playlists.',
  },
  {
    title: 'Follow and manage jobs',
    description: 'Track progress in the queue, review completed files, retry failed jobs, and manage downloaded media.',
  },
];

export default function About() {
  return <div className="about-page">
    <header className="about-hero">
      <div className="about-hero-copy">
        <h1 className="about-title">About YT-DL Studio</h1>
        <p className="about-lede">A local workspace for yt-dlp. Inspect videos and playlists, choose how to download them, and manage your jobs in one place. The app runs on your computer and opens in your browser.</p>
      </div>
      <a
        className="about-source-link"
        href="https://github.com/cyanidemilkshakee/yt-dls"
        target="_blank"
        rel="noreferrer"
        aria-label="YT-DL Studio on GitHub"
        title="View source on GitHub"
      >
        <SiGithub aria-hidden="true" />
      </a>
    </header>

    <div className="about-layout">
      <nav className="about-toc" aria-label="About page sections">
        <a href="#the-app">The app</a>
        <a href="#download-workflow">Download workflow</a>
        <a href="#setup-health">Setup and system health</a>
        <a href="#privacy">Privacy and local data</a>
        <a href="#responsible-use">Responsible use</a>
      </nav>

      <main className="about-main">
        <section className="about-section" id="the-app" aria-labelledby="the-app-title">
          <header className="about-section-header">
            <h2 id="the-app-title">A clear place to manage downloads</h2>
            <p>YT-DL Studio brings the most useful parts of a media download workflow into a straightforward interface.</p>
          </header>
          <p className="about-body-copy">Use the home page to inspect a source and prepare a download. The queue keeps active and completed jobs together, while settings let you tune yt-dlp for your needs. System Health reports which local tools are available when you need to troubleshoot.</p>
        </section>

        <section className="about-section" id="download-workflow" aria-labelledby="download-workflow-title">
          <header className="about-section-header">
            <h2 id="download-workflow-title">Download workflow</h2>
            <p>Move from a link to a finished file without losing track of the job.</p>
          </header>
          <div className="about-feature-list">
            {workflow.map((item) => <article className="about-feature" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>)}
          </div>
        </section>

        <section className="about-section" id="setup-health" aria-labelledby="setup-health-title">
          <header className="about-section-header">
            <h2 id="setup-health-title">Setup and system health</h2>
            <p>Install the app and its media tools, then use System Health to check readiness.</p>
          </header>
          <div className="about-setup-content">
            <p>From the project folder, run <code>npm run setup</code> to install app dependencies and <code>npm run setup:runtime</code> to install the project-managed yt-dlp runtime. Start the app with <code>npm run dev</code>.</p>
            <p>FFmpeg and ffprobe need to be installed separately and available on PATH. On macOS, use <code>brew install ffmpeg</code>. If you already have yt-dlp, set <code>YTDLP_PATH</code> to its executable.</p>
            <p>Open <strong>System Health</strong> on the home page and select <strong>Refresh</strong> after installing tools. It shows detected versions, readiness, and next steps; when yt-dlp is missing, it provides the official installation link.</p>
          </div>
        </section>

        <section className="about-section" id="privacy" aria-labelledby="privacy-title">
          <header className="about-section-header">
            <h2 id="privacy-title">Privacy and local data</h2>
            <p>The app runs locally and does not include analytics, advertising, remote fonts, or tracking scripts.</p>
          </header>
          <div className="about-privacy-list">
            <article>
              <h3>Media and history</h3>
              <p>Downloaded media stays on your computer. Removing a history record does not delete its files; use Manage files to review and remove retained downloads.</p>
            </article>
            <article>
              <h3>Credentials and preferences</h3>
              <p>Passwords and proxy credentials are kept in browser session storage and active process memory. Other settings and appearance preferences use browser local storage.</p>
            </article>
            <article>
              <h3>Network requests</h3>
              <p>Metadata, thumbnails, and downloads connect to the media services you choose. Optional SponsorBlock settings contact that service.</p>
            </article>
          </div>
        </section>

        <footer className="about-footer" id="responsible-use">
          <h2>Use content you have permission to download</h2>
          <p>Follow the source site’s terms and applicable copyright rules. YT-DL Studio is built around open source tools including yt-dlp, FFmpeg, Go, and React.</p>
        </footer>
      </main>
    </div>
  </div>;
}
