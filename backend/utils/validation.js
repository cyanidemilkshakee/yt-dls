const dns = require('dns').promises;
const net = require('net');
const path = require('path');
const { config } = require('../config');

class ValidationError extends Error {
  constructor(message, code = 'INVALID_OPTIONS') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 400;
  }
}

function isPrivateIp(address) {
  if (!address) return true;
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIp(mapped[1]);
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

async function validateMediaUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new ValidationError('A media URL is required.', 'MISSING_URL');
  let parsed;
  try { parsed = new URL(rawUrl.trim()); } catch (_) { throw new ValidationError('The media URL is malformed.', 'MALFORMED_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new ValidationError('Only HTTP and HTTPS URLs are supported.', 'UNSUPPORTED_PROTOCOL');
  if (parsed.username || parsed.password) throw new ValidationError('Credentials must not be embedded in the URL.', 'URL_CREDENTIALS_NOT_ALLOWED');
  if (config.ALLOW_PRIVATE_URLS) return parsed.toString();

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new ValidationError('Private and loopback URLs are disabled.', 'PRIVATE_URL_NOT_ALLOWED');
  try {
    const records = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(({ address }) => isPrivateIp(address))) {
      throw new ValidationError('Private, reserved, and loopback network addresses are disabled.', 'PRIVATE_URL_NOT_ALLOWED');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`Could not resolve the media host: ${error.message}`, 'HOST_RESOLUTION_FAILED');
  }
  return parsed.toString();
}

function resolveDownloadDirectory(requestedPath) {
  if (!requestedPath || /^\.?[\\/]?downloads[\\/]?$/i.test(String(requestedPath).trim())) return config.DOWNLOAD_DIR;
  if (!config.ALLOW_CUSTOM_DOWNLOAD_PATH) {
    throw new ValidationError('Custom download paths are disabled by the server.', 'CUSTOM_PATH_DISABLED');
  }
  return path.resolve(config.ROOT_DIR, String(requestedPath).trim());
}

function validateFilenameTemplate(value) {
  const template = String(value || '%(title)s').trim();
  if (!template || template.length > 200) throw new ValidationError('Filename templates must contain 1–200 characters.', 'INVALID_FILENAME');
  if (template.includes('\0') || /[\\/]/.test(template) || template === '..' || template.startsWith('..')) {
    throw new ValidationError('Filename templates cannot contain paths or traversal segments.', 'INVALID_FILENAME');
  }
  return template.endsWith('.%(ext)s') ? template : `${template}.%(ext)s`;
}

function oneOf(value, allowed, name) {
  if (!value || value === 'default') return value;
  if (!allowed.includes(value)) throw new ValidationError(`Unsupported ${name}: ${value}`, 'UNSUPPORTED_OPTION');
  return value;
}

module.exports = { ValidationError, isPrivateIp, validateMediaUrl, resolveDownloadDirectory, validateFilenameTemplate, oneOf };
