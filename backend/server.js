/**
 * YT-DL Studio Backend (modular)
 * Express app bootstrapping: middleware, static, routers, lifecycle.
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const logger = require('./utils/logger');
const { isWindows, terminateProcess } = require('./utils/platform');
const { activeDownloads, cleanupOldDownloads } = require('./services/progressTracker');

// Routers
const healthRouter = require('./routes/health');
const infoRouter = require('./routes/info');
const downloadRouter = require('./routes/download');
const statusRouter = require('./routes/status');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedOrigins = process.env.FRONTEND_ORIGIN ?
            process.env.FRONTEND_ORIGIN.split(',') :
            ['http://localhost:3000', 'http://127.0.0.1:3000', `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('file://')) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true
}));
app.use(express.json({ limit: '16mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend'), { index: ['index.html'] }));

// Ensure downloads directory exists at startup
const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads');
fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch(() => {});

// Ensure logs directory exists for rotating logs
const LOGS_DIR = path.join(__dirname, '..', 'logs');
fs.mkdir(LOGS_DIR, { recursive: true }).catch(() => {});

// Mount routers under /api
app.use('/api', healthRouter);
app.use('/api', infoRouter);
app.use('/api', downloadRouter);
app.use('/api', statusRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
    logger.error(`Internal server error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// Periodic cleanup
setInterval(cleanupOldDownloads, 3600000); // hourly

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received shutdown signal, cleaning up...');
    const terminationPromises = [];
    for (const [, info] of activeDownloads.entries()) {
        if (info.process && !info.process.killed) {
            terminationPromises.push(terminateProcess(info.process));
        }
    }
    await Promise.allSettled(terminationPromises);
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`YT-DL Studio Backend started on http://0.0.0.0:${PORT}`);
    logger.info(`Download directory: ${path.resolve(DOWNLOAD_DIR)}`);
    logger.info(`Platform: ${os.platform()} (Windows features ${isWindows ? 'enabled' : 'disabled'})`);

    const frontendUrl = `http://localhost:${PORT}`;
    logger.info(`Frontend available at: ${frontendUrl}`);

    setTimeout(() => {
        try {
            if (isWindows) {
                spawn('cmd', ['/c', 'start', frontendUrl], { detached: true, stdio: 'ignore' });
            } else if (os.platform() === 'darwin') {
                spawn('open', [frontendUrl], { detached: true, stdio: 'ignore' });
            } else {
                spawn('xdg-open', [frontendUrl], { detached: true, stdio: 'ignore' });
            }
            logger.info(`Opened frontend in default browser: ${frontendUrl}`);
        } catch (error) {
            logger.warn(`Failed to automatically open browser: ${error.message}`);
            logger.info(`Please manually open your browser and navigate to: ${frontendUrl}`);
        }
    }, 1500);
});

module.exports = app;