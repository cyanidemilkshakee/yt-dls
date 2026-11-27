import { useState, useEffect } from 'react';
import ContentRegion from '../components/ContentRegion';
import { getSettings, saveSettings, getSystemHealth } from '../services/api';

import { DEFAULT_SETTINGS, settingBlockedReason, validateSettings } from '../services/settings';

const DEFAULT_CAPABILITIES = { dangerous_options: false, network_guard: true };

export default function Settings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [reduceEffects, setReduceEffects] = useState(() => {
    try {
      const stored = localStorage.getItem('yt-dls-low-perf-mode');
      return stored === null ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : stored === 'true';
    } catch {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([getSettings(), getSystemHealth({ signal: controller.signal })]).then(([settingsResult, healthResult]) => {
      if (controller.signal.aborted) return;
      const errors = [];
      let activeCapabilities;
      if (healthResult.status === 'fulfilled' && healthResult.value?.capabilities) {
        activeCapabilities = healthResult.value.capabilities;
        setCapabilities(activeCapabilities);
        setPolicyLoaded(true);
      } else {
        setCapabilities(DEFAULT_CAPABILITIES);
        errors.push('Could not load server policy; restricted options remain disabled.');
      }

      if (settingsResult.status === 'fulfilled') {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...validateSettings(settingsResult.value, { sanitize: true, capabilities: activeCapabilities })
        });
        setSettingsLoaded(true);
      } else {
        errors.unshift(`Could not load saved settings: ${settingsResult.reason?.message || settingsResult.reason}`);
      }
      setSaveStatus(errors.join(' '));
    }).finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'force-ipv4' && checked ? { 'force-ipv6': false } : {}),
      ...(name === 'force-ipv6' && checked ? { 'force-ipv4': false } : {})
    }));
  };

  const handleReduceEffectsChange = (e) => {
    const enabled = e.target.checked;
    setReduceEffects(enabled);
    try { localStorage.setItem('yt-dls-low-perf-mode', String(enabled)); } catch {}
    window.dispatchEvent(new CustomEvent('yt-dls-performance-change', { detail: enabled }));
  };

  const handleSave = async () => {
    if (isLoading || isSaving || !settingsLoaded) return;
    setIsSaving(true);
    setSaveStatus('');
    try {
      await saveSettings(settings, policyLoaded ? capabilities : undefined);
      setSaveStatus('Settings saved successfully.');
    } catch (err) {
      setSaveStatus(`Failed to save settings: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-page max-w-6xl mx-auto">
      <h1 className="settings-page-title text-3xl font-bold mb-6">Preferences</h1>
      <p className="mb-8 text-secondary-light dark:text-secondary-dark">
        Configure advanced yt-dlp options, then select Save All Settings. Passwords and proxy URLs are kept in this browser session.
      </p>

      <p className="preferences-policy-note text-sm">Options unavailable under the current server policy are disabled.</p>

      <section className="preferences-section" aria-labelledby="general-preferences-title">
        <h2 id="general-preferences-title" className="preferences-section-title">General</h2>
        <ContentRegion className="preferences-group">
          <div className="preference-row">
            <div className="preference-copy">
              <span className="font-medium">Reduce motion</span>
              <p className="setting-description">Reduce interface motion. Device reduced-motion preferences are also respected.</p>
            </div>
            <label className="preference-switch" aria-label="Reduce motion">
              <input type="checkbox" checked={reduceEffects} onChange={handleReduceEffectsChange} />
              <span aria-hidden="true" />
            </label>
          </div>
        </ContentRegion>
      </section>


      <form id="settings-form" aria-busy={isLoading} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <fieldset disabled={isLoading || isSaving || !settingsLoaded} className="preferences-form-sections">
        <section className="preferences-section">
          <h2 className="preferences-section-title">Network Options</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="proxy" className="font-medium">Proxy URL</label>
                <input type="text" id="proxy" name="proxy" disabled={Boolean(settingBlockedReason('proxy', capabilities))} title={settingBlockedReason('proxy', capabilities)} className="input-form mt-1" placeholder="socks5://user:pass@127.0.0.1:1080" value={settings.proxy} onChange={handleChange} />
                <p className="setting-description">Use the specified HTTP/HTTPS/SOCKS proxy.</p>
                <p className="setting-description setting-description-wide">Custom proxies are disabled while the outbound network guard is active. They require <code>ALLOW_PRIVATE_URLS=true</code> on a trusted local machine.</p>
              </div>
              <div className="setting-item">
                <label htmlFor="socket-timeout" className="font-medium">Socket Timeout</label>
                <input type="number" id="socket-timeout" name="socket-timeout" min={1} max={3600} step={1} className="input-form mt-1" placeholder="30" value={settings['socket-timeout']} onChange={handleChange} />
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
                  <input id="impersonate" name="impersonate" list="impersonation-profiles" className="input-form mt-1 flex-grow" value={settings.impersonate} onChange={handleChange} placeholder="None, chrome, firefox, chrome-110…" />
                  <datalist id="impersonation-profiles"><option value="chrome" /><option value="firefox" /><option value="safari" /><option value="edge" /></datalist>
                </div>
                <p className="setting-description">Client to impersonate for requests (e.g., chrome-110).</p>
              </div>
              <div className="setting-item col-span-1 md:col-span-2">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="force-ipv4" className="checkbox-style" checked={settings['force-ipv4']} onChange={handleChange} /> Force IPv4</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="force-ipv6" className="checkbox-style" checked={settings['force-ipv6']} onChange={handleChange} /> Force IPv6</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="enable-file-urls" disabled={Boolean(settingBlockedReason('enable-file-urls', capabilities))} title={settingBlockedReason('enable-file-urls', capabilities)} className="checkbox-style" checked={settings['enable-file-urls']} onChange={handleChange} /> Allow extractor file access</label>
                </div>
              </div>
            </div>
          </ContentRegion>
        </section>

        <section className="preferences-section">
          <h2 className="preferences-section-title">Geo-restriction</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="geo-verification-proxy" className="font-medium">Geo-Verification Proxy</label>
                <input type="text" id="geo-verification-proxy" name="geo-verification-proxy" disabled={Boolean(settingBlockedReason('geo-verification-proxy', capabilities))} title={settingBlockedReason('geo-verification-proxy', capabilities)} className="input-form mt-1" placeholder="Proxy URL" value={settings['geo-verification-proxy']} onChange={handleChange} />
                <p className="setting-description">Proxy to verify IP for geo-restricted sites.</p>
              </div>
              <div className="setting-item">
                <label htmlFor="xff" className="font-medium">X-Forwarded-For</label>
                <input type="text" id="xff" name="xff" className="input-form mt-1" placeholder="e.g., US or 1.2.3.0/24" value={settings.xff} onChange={handleChange} />
                <p className="setting-description">Fake X-Forwarded-For header value.</p>
              </div>
            </div>
          </ContentRegion>
        </section>

        <section className="preferences-section">
          <h2 className="preferences-section-title">Authentication</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="username" className="font-medium">Username</label>
                <input type="text" id="username" name="username" className="input-form mt-1" value={settings.username} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="password" className="font-medium">Password</label>
                <input type="password" id="password" name="password" className="input-form mt-1" value={settings.password} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="twofactor" className="font-medium">Two-Factor Code</label>
                <input type="text" id="twofactor" name="twofactor" className="input-form mt-1" value={settings.twofactor} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="video-password" className="font-medium">Video Password</label>
                <input type="password" id="video-password" name="video-password" className="input-form mt-1" value={settings['video-password']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="netrc-location" className="font-medium">.netrc Location</label>
                <input type="text" id="netrc-location" name="netrc-location" disabled={Boolean(settingBlockedReason('netrc-location', capabilities))} title={settingBlockedReason('netrc-location', capabilities)} className="input-form mt-1" placeholder="~/.netrc" value={settings['netrc-location']} onChange={handleChange} />
                <label className="flex items-center gap-2 mt-2 cursor-pointer"><input type="checkbox" name="netrc" disabled={Boolean(settingBlockedReason('netrc', capabilities))} title={settingBlockedReason('netrc', capabilities)} className="checkbox-style" checked={settings.netrc} onChange={handleChange} /> Use .netrc</label>
              </div>
              <div className="setting-item">
                <label htmlFor="netrc-cmd" className="font-medium">.netrc Command</label>
                <input type="text" id="netrc-cmd" name="netrc-cmd" disabled={Boolean(settingBlockedReason('netrc-cmd', capabilities))} title={settingBlockedReason('netrc-cmd', capabilities)} className="input-form mt-1" value={settings['netrc-cmd']} onChange={handleChange} />
                <p className="setting-description">Command to get credentials.</p>
              </div>
              <div className="setting-item">
                <label htmlFor="ap-mso" className="font-medium">Adobe Pass MSO</label>
                <input type="text" id="ap-mso" name="ap-mso" className="input-form mt-1" placeholder="Provider identifier" value={settings['ap-mso']} onChange={handleChange} />
                <p className="setting-description">Service provider identifier required by the extractor.</p>
              </div>
              <div className="setting-item">
                <label htmlFor="ap-username" className="font-medium">AP Username</label>
                <input type="text" id="ap-username" name="ap-username" className="input-form mt-1" value={settings['ap-username']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="ap-password" className="font-medium">AP Password</label>
                <input type="password" id="ap-password" name="ap-password" className="input-form mt-1" value={settings['ap-password']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="client-certificate" className="font-medium">Client Certificate (.pem)</label>
                <input type="text" id="client-certificate" name="client-certificate" disabled={Boolean(settingBlockedReason('client-certificate', capabilities))} title={settingBlockedReason('client-certificate', capabilities)} className="input-form mt-1" placeholder="/path/to/cert.pem" value={settings['client-certificate']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="client-certificate-key" className="font-medium">Client Certificate Key</label>
                <input type="text" id="client-certificate-key" name="client-certificate-key" disabled={Boolean(settingBlockedReason('client-certificate-key', capabilities))} title={settingBlockedReason('client-certificate-key', capabilities)} className="input-form mt-1" placeholder="/path/to/key.pem" value={settings['client-certificate-key']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="client-certificate-password" className="font-medium">Client Certificate Password</label>
                <input type="password" id="client-certificate-password" name="client-certificate-password" className="input-form mt-1" value={settings['client-certificate-password']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="cookies" className="font-medium">Cookies File (Netscape format)</label>
                <input type="text" id="cookies" name="cookies" disabled={Boolean(settingBlockedReason('cookies', capabilities))} title={settingBlockedReason('cookies', capabilities)} className="input-form mt-1" placeholder="/path/to/cookies.txt" value={settings['cookies']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="cookies-from-browser" className="font-medium">Cookies from Browser</label>
                <input type="text" id="cookies-from-browser" name="cookies-from-browser" disabled={Boolean(settingBlockedReason('cookies-from-browser', capabilities))} title={settingBlockedReason('cookies-from-browser', capabilities)} className="input-form mt-1" placeholder="chrome, firefox, brave, etc." value={settings['cookies-from-browser']} onChange={handleChange} />
              </div>
            </div>
          </ContentRegion>
        </section>

        <section className="preferences-section">
          <h2 className="preferences-section-title">File &amp; Execution</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="ffmpeg-location" className="font-medium">FFmpeg Location</label>
                <input type="text" id="ffmpeg-location" name="ffmpeg-location" disabled={Boolean(settingBlockedReason('ffmpeg-location', capabilities))} title={settingBlockedReason('ffmpeg-location', capabilities)} className="input-form mt-1" placeholder="/usr/bin/ffmpeg" value={settings['ffmpeg-location']} onChange={handleChange} />
                <p className="setting-description">Path to the ffmpeg binary or its containing directory.</p>
              </div>
              <div className="setting-item col-span-full">
                <label htmlFor="exec" className="font-medium">Execute Command</label>
                <input type="text" id="exec" name="exec" disabled={Boolean(settingBlockedReason('exec', capabilities))} title={settingBlockedReason('exec', capabilities)} className="input-form mt-1" placeholder="after_move:mv %(filepath)q /videos/" value={settings.exec} onChange={handleChange} />
                <p className="setting-description">Execute a command after a download stage.</p>
              </div>
              <div className="setting-item">
                <label className="flex items-center gap-2 cursor-pointer pt-6"><input type="checkbox" name="no-exec" className="checkbox-style" checked={settings['no-exec']} onChange={handleChange} /> Disable --exec</label>
              </div>
              <div className="setting-item col-span-full">
                <label htmlFor="download-archive" className="font-medium">Download Archive File</label>
                <input type="text" id="download-archive" name="download-archive" disabled={Boolean(settingBlockedReason('download-archive', capabilities))} title={settingBlockedReason('download-archive', capabilities)} className="input-form mt-1" placeholder="/path/to/archive.txt" value={settings['download-archive']} onChange={handleChange} />
                <p className="setting-description">File to record downloaded videos so they are skipped in future runs.</p>
              </div>
            </div>
          </ContentRegion>
        </section>

        <section className="preferences-section">
          <h2 className="preferences-section-title">SponsorBlock Options</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="sponsorblock-mark" className="font-medium">Mark Categories</label>
                <input type="text" id="sponsorblock-mark" name="sponsorblock-mark" className="input-form mt-1" placeholder="all,-preview" value={settings['sponsorblock-mark']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="sponsorblock-remove" className="font-medium">Remove Categories</label>
                <input type="text" id="sponsorblock-remove" name="sponsorblock-remove" className="input-form mt-1" placeholder="sponsor,selfpromo" value={settings['sponsorblock-remove']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="sponsorblock-chapter-title" className="font-medium">Chapter Title Template</label>
                <input type="text" id="sponsorblock-chapter-title" name="sponsorblock-chapter-title" className="input-form mt-1" placeholder="[SponsorBlock]: %(category_names)l" value={settings['sponsorblock-chapter-title']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="sponsorblock-api" className="font-medium">SponsorBlock API URL</label>
                <input type="text" id="sponsorblock-api" name="sponsorblock-api" className="input-form mt-1" placeholder="https://sponsor.ajay.app" value={settings['sponsorblock-api']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label className="flex items-center gap-2 cursor-pointer pt-6"><input type="checkbox" name="no-sponsorblock" className="checkbox-style" checked={settings['no-sponsorblock']} onChange={handleChange} /> Disable SponsorBlock</label>
              </div>
            </div>
          </ContentRegion>
        </section>

        <section className="preferences-section">
          <h2 className="preferences-section-title">Extractor Options</h2>
          <ContentRegion className="preferences-group">
                    <div className="preferences-fields">
              <div className="setting-item">
                <label htmlFor="extractor-retries" className="font-medium">Extractor Retries</label>
                <input type="number" id="extractor-retries" name="extractor-retries" min={0} max={100} step={1} className="input-form mt-1" placeholder="3" value={settings['extractor-retries']} onChange={handleChange} />
              </div>
              <div className="setting-item">
                <label htmlFor="extractor-args" className="font-medium">Extractor Arguments</label>
                <input type="text" id="extractor-args" name="extractor-args" className="input-form mt-1" placeholder="youtube:player_client=android" value={settings['extractor-args']} onChange={handleChange} />
              </div>
              <div className="setting-item col-span-1 md:col-span-2">
                <div className="flex items-center space-x-8">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="ignore-dynamic-mpd" className="checkbox-style" checked={settings['ignore-dynamic-mpd']} onChange={handleChange} /> Ignore Dynamic DASH</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="hls-split-discontinuity" className="checkbox-style" checked={settings['hls-split-discontinuity']} onChange={handleChange} /> Split HLS at Discontinuity</label>
                </div>
              </div>
            </div>
          </ContentRegion>
        </section>

        <div className="flex justify-end pt-4">
          <button type="submit" disabled={isSaving} className="btn btn-primary px-8 py-3 text-base disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save All Settings'}
          </button>
        </div>
        <p aria-live="polite" role={saveStatus.startsWith('Failed') || saveStatus.startsWith('Could not') ? 'alert' : 'status'} className="text-sm text-secondary-light dark:text-secondary-dark">{isLoading ? 'Loading settings…' : saveStatus}</p>
        </fieldset>
      </form>
    </div>
  );
}
