import { SECRET_SETTING_NAMES, unpackSettings, validateSettings } from './settings';
import { assertContract } from './contract';

const API_BASE_URL = '/api';
const SETTINGS_KEY = 'yt-dls-advanced-settings';
const SECRET_SETTINGS_KEY = 'yt-dls-session-secrets';
let infoTimeoutMs = 610_000;

function normalizeDownloadOptions(options, definition = 'DownloadOptions') {
  const normalized = { downloadMode: 'both', ...options, advancedSettings: validateSettings(options.advancedSettings || {}) };
  for (const [key, value] of Object.entries(normalized)) if (value === null) delete normalized[key];
  return assertContract(definition, normalized);
}

export async function apiRequest(path, options = {}) {
  const { timeoutMs = 30_000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions, headers: { Accept: 'application/json', ...(fetchOptions.headers || {}) }, signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : { error: (await response.text()).trim() || `HTTP ${response.status}` };
    if (!response.ok) {
      const error = new Error(payload.error || (response.status === 502 ? 'The local API server is unavailable. Start the backend and try again.' : `HTTP ${response.status}`));
      Object.assign(error, { status: response.status, code: payload.code || payload.error_code, payload });
      throw error;
    }
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (controller.signal.aborted) throw Object.assign(new Error('The backend request timed out.'), { code: 'REQUEST_TIMEOUT' });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const jsonPost = (body, options = {}) => ({ method: 'POST', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: JSON.stringify(body) });

export function fetchVideoInfo(url, advancedSettings = {}, options = {}) {
  // Extraction is expensive. A failed extraction is retried explicitly by the user.
  return apiRequest('/info', jsonPost(assertContract('InfoRequest', { url, advancedSettings: validateSettings(advancedSettings) }), { timeoutMs: infoTimeoutMs, ...options }));
}

export function startDownload(options, request = {}) {
  const { idempotencyKey = crypto.randomUUID(), ...rest } = request;
  return apiRequest('/download', jsonPost(normalizeDownloadOptions(options), { timeoutMs: 30_000, ...rest, headers: { 'Idempotency-Key': idempotencyKey } }));
}
export function startBatch(entries, options, request = {}) {
  const { idempotencyKey = crypto.randomUUID(), ...rest } = request;
  return apiRequest('/download/batch', jsonPost(assertContract('BatchRequest', { entries, options: normalizeDownloadOptions(options, 'SharedDownloadOptions') }), { timeoutMs: 45_000, ...rest, headers: { 'Idempotency-Key': idempotencyKey } }));
}
export function previewCommand(options, request = {}) { return apiRequest('/download/command-preview', jsonPost(normalizeDownloadOptions(options), { timeoutMs: 10_000, ...request })); }
export function getDownloadLog(id, request = {}) { return apiRequest(`/download/${encodeURIComponent(id)}/log`, request); }
export function cancelDownload(id) { return apiRequest(`/download/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); }
export function removeDownload(id) { return apiRequest(`/download/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function retryDownload(id, url = '', idempotencyKey = crypto.randomUUID()) {
  return apiRequest(`/download/${encodeURIComponent(id)}/retry`, jsonPost(assertContract('RetryRequest', { url, advancedSettings: await getSettings() }), { headers: { 'Idempotency-Key': idempotencyKey } }));
}
export function resultFileURL(id, index) { return `${API_BASE_URL}/download/${encodeURIComponent(id)}/file/${index}`; }
export function getRetainedFiles(id, request = {}) { return apiRequest(`/download/${encodeURIComponent(id)}/files`, request); }
export function cleanRetainedFiles(id, token, request = {}) { return apiRequest(`/download/${encodeURIComponent(id)}/files/cleanup`, jsonPost(assertContract('CleanupRequest', { token }), request)); }
export function openDownloadEvents({ onEvent, onOpen, onError }) {
  const source = new EventSource(`${API_BASE_URL}/downloads/events`);
  source.onopen = onOpen;
  source.onerror = onError;
  source.onmessage = event => {
    try { onEvent(JSON.parse(event.data)); } catch { onError(); }
  };
  return source;
}

export async function getAllDownloads(request = {}) {
  const downloads = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const data = await apiRequest(`/downloads?limit=200&offset=${offset}`, request);
    downloads.push(...(data.downloads || []));
    if (data.next_offset >= data.total || data.next_offset <= offset) break;
    offset = data.next_offset;
  }
  return { downloads };
}
export async function batchStatus(ids, request = {}) {
  const result = new Map(), unique = [...new Set(ids || [])];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const query = unique.slice(offset, offset + 50).map(encodeURIComponent).join(',');
    const page = await apiRequest(`/downloads/status/batch?ids=${query}`, request);
    for (const entry of Object.entries(page)) result.set(...entry);
  }
  return result;
}
export async function getSystemHealth(request = {}) {
  let health;
  try { health = await apiRequest('/health', { timeoutMs: 15_000, ...request }); }
  catch (error) { if (error.status === 503 && error.payload) health = error.payload; else throw error; }
  if (Number.isFinite(health.info_timeout_ms)) infoTimeoutMs = health.info_timeout_ms + 10_000;
  return health;
}

function readStorage(storage, key) {
  try { return unpackSettings(JSON.parse(storage.getItem(key) || '{}')); }
  catch { return {}; }
}
export async function getSettings() {
  const persistent = readStorage(localStorage, SETTINGS_KEY), secrets = readStorage(sessionStorage, SECRET_SETTINGS_KEY);
  let migrated = false;
  for (const name of SECRET_SETTING_NAMES) {
    if (Object.prototype.hasOwnProperty.call(persistent, name)) {
      if (!(name in secrets)) secrets[name] = persistent[name];
      delete persistent[name]; migrated = true;
    }
  }
  if (migrated) {
    // Remove old persisted credentials even if session storage is unavailable.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ schema: 1, settings: persistent }));
    sessionStorage.setItem(SECRET_SETTINGS_KEY, JSON.stringify({ schema: 1, settings: secrets }));
  }
  return validateSettings({ ...persistent, ...secrets }, { sanitize: true });
}
export async function saveSettings(settings, capabilities) {
  const validated = validateSettings(settings, { capabilities });
  const persistent = {}, secrets = {};
  for (const [name, value] of Object.entries(validated)) (SECRET_SETTING_NAMES.has(name) ? secrets : persistent)[name] = value;
  sessionStorage.setItem(SECRET_SETTINGS_KEY, JSON.stringify({ schema: 1, settings: secrets }));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ schema: 1, settings: persistent }));
}
