const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Node 22 can load .env files without another runtime dependency. Missing files
// are intentionally ignored so environment-only deployments keep working.
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(ROOT_DIR, '.env')); } catch (_) {}
}

function numberEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

const configuredDownloadDir = process.env.DOWNLOAD_DIR || path.join(ROOT_DIR, 'downloads');

const config = Object.freeze({
  ROOT_DIR,
  FRONTEND_DIR: path.join(ROOT_DIR, 'frontend'),
  DOWNLOAD_DIR: path.resolve(ROOT_DIR, configuredDownloadDir),
  LOGS_DIR: path.resolve(ROOT_DIR, process.env.LOG_DIR || 'logs'),
  YTDLP_PATH: process.env.YTDLP_PATH || 'yt-dlp',
  PORT: numberEnv('PORT', 7391, { min: 1, max: 65535 }),
  HOST: process.env.HOST || '127.0.0.1',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  AUTO_OPEN_BROWSER: booleanEnv('AUTO_OPEN_BROWSER', true),
  ALLOW_CUSTOM_DOWNLOAD_PATH: booleanEnv('ALLOW_CUSTOM_DOWNLOAD_PATH', false),
  ALLOW_DANGEROUS_OPTIONS: booleanEnv('ALLOW_DANGEROUS_OPTIONS', false),
  ALLOW_PRIVATE_URLS: booleanEnv('ALLOW_PRIVATE_URLS', false),
  MAX_CONCURRENT_DOWNLOADS: numberEnv('MAX_CONCURRENT_DOWNLOADS', 3, { min: 1, max: 32 }),
  MAX_DOWNLOAD_DURATION_MS: numberEnv('MAX_DOWNLOAD_DURATION_MS', 30 * 60 * 1000, { min: 10_000 }),
  YTDLP_CHECK_TIMEOUT_MS: numberEnv('YTDLP_CHECK_TIMEOUT_MS', 15_000, { min: 1000 }),
  INFO_TIMEOUT_MS: numberEnv('INFO_TIMEOUT_MS', 120_000, { min: 5000 }),
  INFO_MAX_OUTPUT_BYTES: numberEnv('INFO_MAX_OUTPUT_BYTES', 16 * 1024 * 1024, { min: 1024 * 1024 }),
  REQUESTS_PER_MINUTE: numberEnv('REQUESTS_PER_MINUTE', 180, { min: 10 }),
  DOWNLOAD_REQUESTS_PER_MINUTE: numberEnv('DOWNLOAD_REQUESTS_PER_MINUTE', 20, { min: 1 }),
});

module.exports = { config, numberEnv, booleanEnv };
