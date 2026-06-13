import { API_BASE_URL, updatePlatformInfo } from './config.js';

// Fetch platform info on load
export async function fetchPlatformInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            const health = await response.json();
            const platformInfo = {
                platform: health.platform || 'unknown',
                supports_pause_resume: health.supports_pause_resume !== false
            };
            updatePlatformInfo(platformInfo);
            return platformInfo;
        }
    } catch (error) {
        console.warn('Failed to fetch platform info:', error);
    }
    return null;
}

// Fetch video information with retry logic
export async function fetchVideoInfo(url, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(`${API_BASE_URL}/info?url=${encodeURIComponent(url)}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.error || `HTTP ${response.status}`);
                error.status = response.status;
                error.code = errorData.error_code;
                throw error;
            }
            
            const data = await response.json();
            if (data.error) {
                const error = new Error(data.error);
                error.code = data.error_code;
                throw error;
            }
            
            return data;
            
        } catch (error) {
            console.warn(`Attempt ${attempt}/${retries} failed:`, error);
            
            if (error.status === 404 || error.status === 403 || error.code === 'UNSUPPORTED_URL') {
                throw error;
            }
            
            if (attempt === retries) {
                throw error;
            }
            
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Start download
export async function startDownload(options) {
    try {
        const response = await fetch(`${API_BASE_URL}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Error starting download:', error);
        throw error;
    }
}

// Update download status
export async function updateDownloadStatus(downloadId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${downloadId}/status`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Download ${downloadId} not found`);
                return null;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error updating status for ${downloadId}:`, error);
        throw error;
    }
}

// Get download log
export async function getDownloadLog(downloadId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${downloadId}/log`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`Error getting log for ${downloadId}:`, error);
        throw error;
    }
}

// Cancel download
export async function cancelDownload(downloadId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${downloadId}/cancel`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        return true;
    } catch (error) {
        console.error('Cancel request failed:', error);
        throw error;
    }
}

// Remove download
export async function removeDownload(downloadId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${downloadId}`, { 
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        return response.ok;
    } catch (error) {
        console.warn('Remove request failed:', error);
        return false;
    }
}

// Pause/Resume download
export async function pauseResumeDownload(downloadId, action) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${downloadId}/${action}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to ${action}`);
        }
        
        return true;
    } catch (error) {
        console.error(`${action} request failed:`, error);
        throw error;
    }
}

// Get all downloads
export async function getAllDownloads() {
    try {
        const response = await fetch(`${API_BASE_URL}/downloads`);
        if (!response.ok) throw new Error("Could not connect to backend.");
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch downloads:", error);
        throw error;
    }
}

/**
 * Batch status — fetch progress for multiple download IDs in a single request.
 * Returns a Map<downloadId, data|null>.
 * @param {string[]} ids
 * @returns {Promise<Map<string, object|null>>}
 */
export async function batchStatus(ids) {
    if (!ids || ids.length === 0) return new Map();
    try {
        const query    = ids.map(encodeURIComponent).join(',');
        const response = await fetch(`${API_BASE_URL}/downloads/status/batch?ids=${query}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const obj = await response.json();
        // Convert plain object → Map for convenient iteration
        return new Map(Object.entries(obj));
    } catch (error) {
        console.error('Batch status request failed:', error);
        throw error;
    }
}

// Health check
export async function getSystemHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Health check failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Health check failed:', error);
        throw error;
    }
}

// Get impersonate targets
export async function getImpersonateTargets() {
    try {
        const response = await fetch(`${API_BASE_URL}/list-impersonate-targets`);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Error fetching impersonate targets:', error);
        throw error;
    }
}

// Get AP MSOs
export async function getApMsos() {
    try {
        const response = await fetch(`${API_BASE_URL}/list-ap-msos`);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Error fetching AP MSOs:', error);
        throw error;
    }
}
