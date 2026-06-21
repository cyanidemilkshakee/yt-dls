import { API_BASE_URL, updatePlatformInfo } from './config.js';

async function apiRequest(path, options = {}) {
    const { timeoutMs = 30_000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...fetchOptions,
            headers: { Accept: 'application/json', ...(fetchOptions.headers || {}) },
            signal: controller.signal
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : { error: (await response.text()).trim() || `HTTP ${response.status}` };
        if (!response.ok) {
            const error = new Error(payload.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.code = payload.code || payload.error_code;
            error.payload = payload;
            throw error;
        }
        return payload;
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('The backend request timed out.');
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchPlatformInfo() {
    try {
        const health = await getSystemHealth();
        const platform = {
            platform: health.platform || 'unknown',
            supports_pause_resume: health.supports_pause_resume !== false,
            capabilities: health.capabilities || {},
            max_concurrent_downloads: health.max_concurrent_downloads || null
        };
        updatePlatformInfo(platform);
        return platform;
    } catch (error) {
        console.warn('Failed to fetch platform info:', error);
        if (error.payload) {
            updatePlatformInfo(error.payload);
            return error.payload;
        }
        return null;
    }
}

export async function fetchVideoInfo(url, retries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await apiRequest(`/info?url=${encodeURIComponent(url)}`, { timeoutMs: 130_000 });
        } catch (error) {
            lastError = error;
            const retryable = !error.status || error.status === 429 || error.status >= 500;
            if (!retryable || attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, Math.min(750 * 2 ** (attempt - 1), 5000)));
        }
    }
    throw lastError;
}

export function startDownload(options) {
    return apiRequest('/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
        timeoutMs: 15_000
    });
}

export function previewCommand(options) {
    return apiRequest('/command-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
        timeoutMs: 10_000
    });
}

export async function updateDownloadStatus(downloadId) {
    try { return await apiRequest(`/download/${encodeURIComponent(downloadId)}/status`); }
    catch (error) { if (error.status === 404) return null; throw error; }
}

export function getDownloadLog(downloadId) {
    return apiRequest(`/download/${encodeURIComponent(downloadId)}/log`);
}

export function cancelDownload(downloadId) {
    return apiRequest(`/download/${encodeURIComponent(downloadId)}/cancel`, { method: 'POST' });
}

export async function removeDownload(downloadId) {
    try {
        await apiRequest(`/download/${encodeURIComponent(downloadId)}`, { method: 'DELETE' });
        return true;
    } catch (error) {
        console.warn('Remove request failed:', error);
        return false;
    }
}

export function pauseResumeDownload(downloadId, action) {
    if (!['pause', 'resume'].includes(action)) return Promise.reject(new Error('Invalid download action'));
    return apiRequest(`/download/${encodeURIComponent(downloadId)}/${action}`, { method: 'POST' });
}

export function getAllDownloads() {
    return apiRequest('/downloads');
}

export async function batchStatus(ids) {
    if (!ids?.length) return new Map();
    const uniqueIds = [...new Set(ids)].slice(0, 100);
    const query = uniqueIds.map(encodeURIComponent).join(',');
    const result = await apiRequest(`/downloads/status/batch?ids=${query}`);
    return new Map(Object.entries(result));
}

export async function getSystemHealth() {
    try { return await apiRequest('/health', { timeoutMs: 15_000 }); }
    catch (error) {
        // A degraded health response deliberately uses 503 but still contains
        // useful diagnostics for the existing system-health dialog.
        if (error.status === 503 && error.payload) return error.payload;
        throw error;
    }
}

export function getImpersonateTargets() {
    return apiRequest('/list-impersonate-targets', { timeoutMs: 15_000 });
}

export function getApMsos() {
    return apiRequest('/list-ap-msos', { timeoutMs: 15_000 });
}
