const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const { config } = require('./config');
fs.mkdirSync(config.DOWNLOAD_DIR, { recursive: true });
fs.mkdirSync(config.LOGS_DIR, { recursive: true });

const logger = require('./utils/logger');
const { isWindows, terminateProcess } = require('./utils/platform');
const { activeDownloads, cleanupOldDownloads } = require('./services/progressTracker');
const { createRateLimit } = require('./middleware/rateLimit');
const healthRouter = require('./routes/health');
const infoRouter = require('./routes/info');
const downloadRouter = require('./routes/download');
const statusRouter = require('./routes/status');

const app = express();
app.disable('x-powered-by');

const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if ((host === 'localhost' || host === '127.0.0.1' || host === '::1') && Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)) === config.PORT) return true;
  } catch (_) {}
  return configuredOrigins.includes(origin);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});
app.use(cors({
  origin(origin, callback) {
    const allowed = isAllowedOrigin(origin);
    if (allowed) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
    error.status = 403;
    error.code = 'ORIGIN_NOT_ALLOWED';
    callback(error, false);
  },
  credentials: false,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json({ limit: '1mb', strict: true }));
app.use('/api', createRateLimit({ limit: config.REQUESTS_PER_MINUTE }));
app.use('/api/download', createRateLimit({ limit: config.DOWNLOAD_REQUESTS_PER_MINUTE, message: 'Too many download actions. Please wait before trying again.' }));
app.use(express.static(config.FRONTEND_DIR, { index: ['index.html'], etag: true, maxAge: '1h' }));

app.use('/api', healthRouter);
app.use('/api', infoRouter);
app.use('/api', downloadRouter);
app.use('/api', statusRouter);

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || (error.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) logger.error(`Request failed: ${error.message}`);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message, code: error.code || 'REQUEST_FAILED' });
});

let server = null;
let cleanupTimer = null;
let shuttingDown = false;

function openFrontend(url) {
  if (!config.AUTO_OPEN_BROWSER) return;
  let child;
  if (isWindows) child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
  else if (os.platform() === 'darwin') child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  else child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.once('error', (error) => logger.warn(`Could not open the browser automatically: ${error.message}`));
  child.unref();
}

function startServer() {
  if (server) return server;
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(config.HOST);
  if (!isLoopback && (config.ALLOW_DANGEROUS_OPTIONS || config.ALLOW_CUSTOM_DOWNLOAD_PATH || config.ALLOW_PRIVATE_URLS)) {
    throw new Error('Dangerous options, custom paths, and private URLs require a loopback HOST.');
  }
  if (!isLoopback) logger.warn(`Server is listening on ${config.HOST}. This app has no user authentication; expose it only on a trusted network.`);

  server = app.listen(config.PORT, config.HOST, () => {
    const browserHost = config.HOST === '0.0.0.0' || config.HOST === '::' ? 'localhost' : config.HOST;
    const frontendUrl = `http://${browserHost}:${config.PORT}`;
    logger.info(`YT-DL Studio started at ${frontendUrl}`);
    logger.info(`Download directory: ${config.DOWNLOAD_DIR}`);
    logger.info(`yt-dlp executable: ${config.YTDLP_PATH}`);
    setTimeout(() => openFrontend(frontendUrl), 500).unref?.();
  });
  cleanupTimer = setInterval(cleanupOldDownloads, 60 * 60 * 1000);
  cleanupTimer.unref?.();
  return server;
}

async function shutdown(signal = 'shutdown') {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}; stopping active downloads...`);
  if (cleanupTimer) clearInterval(cleanupTimer);
  await Promise.allSettled([...activeDownloads.values()].map((info) => terminateProcess(info.process)));
  await new Promise((resolve) => server ? server.close(resolve) : resolve());
  server = null;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => shutdown(signal).finally(() => process.exit(0)));
}

if (require.main === module) startServer();

module.exports = { app, startServer, shutdown, isAllowedOrigin };
