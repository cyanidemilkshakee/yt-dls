export default function About() {
  return (
    <div className="w-[60%] mx-auto space-y-12">
      <section className="card p-8">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <svg className="h-12 w-12 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-4">About YT-DL Studio</h2>
            <p className="text-lg text-secondary-light dark:text-secondary-dark mb-4">
              YT-DL Studio was created to provide a powerful, yet simple and safe, interface for the incredible `yt-dlp` command-line tool. Our goal is to protect people from the ads, trackers, and malware often pushed by alternative downloaders. We believe that the best software is safe, open, and accessible to everyone.
            </p>
            <p className="text-lg text-secondary-light dark:text-secondary-dark mb-6">
              This tool helps creators, educators, and archivists save content from across the web. No ads, no trackers, no nonsense. Just a convenient web app that works wherever you need it.
            </p>
            <a href="#" className="btn btn-primary px-6 py-3">View Source on GitHub</a>
          </div>
        </div>
      </section>

      <section className="card p-8">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <svg className="h-12 w-12 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286zm0 13.036h.008v.008h-.008v-.008z" /></svg>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-4">Privacy Policy</h2>
            <div className="prose dark:prose-invert max-w-none text-secondary-light dark:text-secondary-dark space-y-4">
              <p>Our privacy policy is simple: <strong>we don’t collect or store anything about you</strong>. What you do with this tool is solely your business, not ours or anyone else’s. These terms are applicable only when using an official instance of YT-DL Studio. If you are using a self-hosted instance, you must contact the instance host for their policy.</p>
              <h4 className="text-xl font-semibold !mt-6 !mb-2 text-text-light dark:text-text-dark">Zero-Log Policy</h4>
              <p>The backend server, which processes download requests, has a strict zero-log policy. It does not store or track anything about individual users, the URLs they submit, or the content they download. All operations are handled in-memory and are stateless. Once a download is complete or fails, all associated information is purged.</p>
              <h4 className="text-xl font-semibold !mt-6 !mb-2 text-text-light dark:text-text-dark">Data Processing</h4>
              <p>When you request a download, the URL is passed to the server-side `yt-dlp` instance. The server fetches the metadata and the media content on your behalf. This media is never written to the server's disk permanently; it is streamed to a temporary file in a designated download directory and is accessible only for the duration of the download process. The management of these files is handled by the application logic, and they are intended for immediate retrieval by the user.</p>
              <h4 className="text-xl font-semibold !mt-6 !mb-2 text-text-light dark:text-text-dark">Analytics</h4>
              <p>We use a self-hosted, privacy-focused analytics tool (Plausible) to get an approximate number of active users. No identifiable information about you or your requests is ever stored. All data is anonymized and aggregated. Plausible doesn’t use cookies and is fully compliant with GDPR, CCPA, and PECR. This helps us understand usage patterns to improve the service without compromising your privacy.</p>
              <h4 className="text-xl font-semibold !mt-6 !mb-2 text-text-light dark:text-text-dark">Third-Party Services</h4>
              <p>This service may use Cloudflare for DDoS &amp; abuse protection. This is required to provide the best experience for everyone. Cloudflare is a privacy-conscious provider and is fully compliant with GDPR. Learn more about Cloudflare’s dedication to privacy on their official website.</p>
            </div>
          </div>
        </div>
      </section>
      
      <section className="card p-8">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <svg className="h-12 w-12 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-4">Terms of Service</h2>
            <div className="prose dark:prose-invert max-w-none text-secondary-light dark:text-secondary-dark space-y-4">
              <p>You, the end user, are solely responsible for what you do with this tool, including how you use and distribute the resulting content. Please be mindful when using the content of others and always credit original creators.</p>
              <p>Ensure that your use of this service does not violate any local or international laws, terms of service for the source website, or copyright licenses. Fair use and proper attribution benefit everyone. When used for educational purposes, always cite your sources.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-8">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <svg className="h-12 w-12 text-[var(--primary-green)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-4">A Heartfelt Thank You</h2>
            <p className="text-lg text-secondary-light dark:text-secondary-dark mb-4">
              YT-DL Studio would not exist without the monumental effort of the `yt-dlp` team and its contributors. This application is fundamentally a user interface built on top of their incredible, versatile, and tirelessly maintained open-source project.
            </p>
            <p className="text-lg text-secondary-light dark:text-secondary-dark">
              We extend our deepest gratitude to them for their dedication to creating a tool that empowers users and champions a free, open internet. Their work is the engine that powers this entire studio.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
