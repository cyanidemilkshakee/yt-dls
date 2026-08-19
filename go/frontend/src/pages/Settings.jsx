import { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../services/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    proxy: '',
    'socket-timeout': '',
    'source-address': '',
    impersonate: '',
    'force-ipv4': false,
    'force-ipv6': false,
    'enable-file-urls': false,
    'geo-verification-proxy': '',
    xff: '',
    username: '',
    password: '',
    twofactor: '',
    'video-password': '',
    'netrc-location': '',
    netrc: false,
    'netrc-cmd': '',
    'ap-mso': '',
    'ap-username': '',
    'ap-password': '',
    'client-certificate': '',
    'client-certificate-key': '',
    'client-certificate-password': '',
    'ffmpeg-location': '',
    exec: '',
    'no-exec': false,
    'sponsorblock-mark': '',
    'sponsorblock-remove': '',
    'sponsorblock-chapter-title': '',
    'sponsorblock-api': '',
    'no-sponsorblock': false,
    'extractor-retries': '',
    'extractor-args': '',
    'ignore-dynamic-mpd': false,
    'hls-split-discontinuity': false,
  });

  useEffect(() => {
    getSettings().then(data => {
      if (data) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    }).catch(err => console.error("Failed to load settings", err));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = () => {
    saveSettings(settings)
      .then(() => alert("Settings saved successfully!"))
      .catch(err => alert("Failed to save settings: " + err));
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Advanced Settings</h1>
      <p className="mb-8 text-secondary-light dark:text-secondary-dark">
        Configure advanced yt-dlp options. These settings will be applied to all downloads. Settings are saved automatically.
      </p>

      <form id="settings-form" className="space-y-10" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">Network Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="proxy" className="font-medium">Proxy URL</label>
              <input type="text" id="proxy" name="proxy" className="input-form mt-1" placeholder="socks5://user:pass@127.0.0.1:1080" value={settings.proxy} onChange={handleChange} />
              <p className="setting-description">Use the specified HTTP/HTTPS/SOCKS proxy.</p>
            </div>
            <div className="setting-item">
              <label htmlFor="socket-timeout" className="font-medium">Socket Timeout</label>
              <input type="number" id="socket-timeout" name="socket-timeout" className="input-form mt-1" placeholder="30" value={settings['socket-timeout']} onChange={handleChange} />
              <p className="setting-description">Time to wait before giving up, in seconds.</p>
            </div>
            <div className="setting-item">
              <label htmlFor="source-address" className="font-medium">Source Address</label>
              <input type="text" id="source-address" name="source-address" className="input-form mt-1" placeholder="e.g., 192.168.1.10" value={settings['source-address']} onChange={handleChange} />
              <p className="setting-description">Client-side IP address to bind to.</p>
            </div>
            <div className="setting-item">
              <label htmlFor="impersonate" className="font-medium">Impersonate Client</label>
              <div className="flex gap-2">
                <select id="impersonate" name="impersonate" className="input-form mt-1 flex-grow" value={settings.impersonate} onChange={handleChange}>
                  <option value="">None</option>
                  <option value="chrome">Chrome</option>
                  <option value="firefox">Firefox</option>
                </select>
                <button type="button" className="btn btn-primary p-2.5 mt-1" title="Load Targets">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5V4M4 15h5v5H4M14 4h5v5h-5M14 15h5v5h-5M" /></svg>
                </button>
              </div>
              <p className="setting-description">Client to impersonate for requests (e.g., chrome-110).</p>
            </div>
            <div className="setting-item col-span-1 md:col-span-2">
              <div className="flex items-center space-x-8">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="force-ipv4" className="checkbox-style" checked={settings['force-ipv4']} onChange={handleChange} /> Force IPv4</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="force-ipv6" className="checkbox-style" checked={settings['force-ipv6']} onChange={handleChange} /> Force IPv6</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="enable-file-urls" className="checkbox-style" checked={settings['enable-file-urls']} onChange={handleChange} /> Enable file:// URLs</label>
              </div>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">Geo-restriction</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="geo-verification-proxy" className="font-medium">Geo-Verification Proxy</label>
              <input type="text" name="geo-verification-proxy" className="input-form mt-1" placeholder="Proxy URL" value={settings['geo-verification-proxy']} onChange={handleChange} />
              <p className="setting-description">Proxy to verify IP for geo-restricted sites.</p>
            </div>
            <div className="setting-item">
              <label htmlFor="xff" className="font-medium">X-Forwarded-For</label>
              <input type="text" name="xff" className="input-form mt-1" placeholder="e.g., US or 1.2.3.0/24" value={settings.xff} onChange={handleChange} />
              <p className="setting-description">Fake X-Forwarded-For header value.</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">Authentication</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="username" className="font-medium">Username</label>
              <input type="text" name="username" className="input-form mt-1" value={settings.username} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="password" className="font-medium">Password</label>
              <input type="password" name="password" className="input-form mt-1" value={settings.password} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="twofactor" className="font-medium">Two-Factor Code</label>
              <input type="text" name="twofactor" className="input-form mt-1" value={settings.twofactor} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="video-password" className="font-medium">Video Password</label>
              <input type="password" name="video-password" className="input-form mt-1" value={settings['video-password']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="netrc-location" className="font-medium">.netrc Location</label>
              <input type="text" name="netrc-location" className="input-form mt-1" placeholder="~/.netrc" value={settings['netrc-location']} onChange={handleChange} />
              <label className="flex items-center gap-2 mt-2 cursor-pointer"><input type="checkbox" name="netrc" className="checkbox-style" checked={settings.netrc} onChange={handleChange} /> Use .netrc</label>
            </div>
            <div className="setting-item">
              <label htmlFor="netrc-cmd" className="font-medium">.netrc Command</label>
              <input type="text" name="netrc-cmd" className="input-form mt-1" value={settings['netrc-cmd']} onChange={handleChange} />
              <p className="setting-description">Command to get credentials.</p>
            </div>
            <div className="setting-item">
              <label htmlFor="ap-mso" className="font-medium">Adobe Pass MSO</label>
              <div className="flex gap-2">
                <select name="ap-mso" className="input-form mt-1 flex-grow" value={settings['ap-mso']} onChange={handleChange}>
                  <option value="">None</option>
                </select>
              </div>
            </div>
            <div className="setting-item">
              <label htmlFor="ap-username" className="font-medium">AP Username</label>
              <input type="text" name="ap-username" className="input-form mt-1" value={settings['ap-username']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="ap-password" className="font-medium">AP Password</label>
              <input type="password" name="ap-password" className="input-form mt-1" value={settings['ap-password']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="client-certificate" className="font-medium">Client Certificate (.pem)</label>
              <input type="text" name="client-certificate" className="input-form mt-1" placeholder="/path/to/cert.pem" value={settings['client-certificate']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="client-certificate-key" className="font-medium">Client Certificate Key</label>
              <input type="text" name="client-certificate-key" className="input-form mt-1" placeholder="/path/to/key.pem" value={settings['client-certificate-key']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="client-certificate-password" className="font-medium">Client Certificate Password</label>
              <input type="password" name="client-certificate-password" className="input-form mt-1" value={settings['client-certificate-password']} onChange={handleChange} />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">File &amp; Execution</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="ffmpeg-location" className="font-medium">FFmpeg Location</label>
              <input type="text" name="ffmpeg-location" className="input-form mt-1" placeholder="/usr/bin/ffmpeg" value={settings['ffmpeg-location']} onChange={handleChange} />
              <p className="setting-description">Path to the ffmpeg binary or its containing directory.</p>
            </div>
            <div className="setting-item col-span-full">
              <label htmlFor="exec" className="font-medium">Execute Command</label>
              <input type="text" name="exec" className="input-form mt-1" placeholder="after_move:mv %(filepath)q /videos/" value={settings.exec} onChange={handleChange} />
              <p className="setting-description">Execute a command after a download stage.</p>
            </div>
            <div className="setting-item">
              <label className="flex items-center gap-2 cursor-pointer pt-6"><input type="checkbox" name="no-exec" className="checkbox-style" checked={settings['no-exec']} onChange={handleChange} /> Disable --exec</label>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">SponsorBlock Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="sponsorblock-mark" className="font-medium">Mark Categories</label>
              <input type="text" name="sponsorblock-mark" className="input-form mt-1" placeholder="all,-preview" value={settings['sponsorblock-mark']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="sponsorblock-remove" className="font-medium">Remove Categories</label>
              <input type="text" name="sponsorblock-remove" className="input-form mt-1" placeholder="sponsor,selfpromo" value={settings['sponsorblock-remove']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="sponsorblock-chapter-title" className="font-medium">Chapter Title Template</label>
              <input type="text" name="sponsorblock-chapter-title" className="input-form mt-1" placeholder="[SponsorBlock]: %(category_names)l" value={settings['sponsorblock-chapter-title']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="sponsorblock-api" className="font-medium">SponsorBlock API URL</label>
              <input type="text" name="sponsorblock-api" className="input-form mt-1" placeholder="https://sponsor.ajay.app" value={settings['sponsorblock-api']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label className="flex items-center gap-2 cursor-pointer pt-6"><input type="checkbox" name="no-sponsorblock" className="checkbox-style" checked={settings['no-sponsorblock']} onChange={handleChange} /> Disable SponsorBlock</label>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-semibold mb-6 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-3">Extractor Options</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="setting-item">
              <label htmlFor="extractor-retries" className="font-medium">Extractor Retries</label>
              <input type="text" name="extractor-retries" className="input-form mt-1" placeholder="3 or infinite" value={settings['extractor-retries']} onChange={handleChange} />
            </div>
            <div className="setting-item">
              <label htmlFor="extractor-args" className="font-medium">Extractor Arguments</label>
              <input type="text" name="extractor-args" className="input-form mt-1" placeholder="youtube:player_client=android" value={settings['extractor-args']} onChange={handleChange} />
            </div>
            <div className="setting-item col-span-1 md:col-span-2">
              <div className="flex items-center space-x-8">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="ignore-dynamic-mpd" className="checkbox-style" checked={settings['ignore-dynamic-mpd']} onChange={handleChange} /> Ignore Dynamic DASH</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="hls-split-discontinuity" className="checkbox-style" checked={settings['hls-split-discontinuity']} onChange={handleChange} /> Split HLS at Discontinuity</label>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button type="submit" className="btn btn-primary px-8 py-3 text-base">Save All Settings</button>
        </div>
      </form>
    </div>
  );
}
