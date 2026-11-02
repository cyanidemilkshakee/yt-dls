import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute, basename } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'yt-dls-e2e-'));
const cleanup = () => {
  const path = resolve(directory), parent = resolve(tmpdir()), child = relative(parent, path);
  if (child === '' || child.startsWith('..') || isAbsolute(child) || !basename(path).startsWith('yt-dls-e2e-')) throw new Error('Refusing cleanup outside the disposable fixture directory');
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
};
const executable = name => join(directory, name + (process.platform === 'win32' ? '.exe' : ''));
for (const [name, source] of [['downloader', './test/fixtures/downloader'], ['server', './command/server']]) {
  const build = spawnSync('go', ['build', '-o', executable(name), source], { stdio: 'inherit' });
  if (build.status !== 0) { cleanup(); process.exit(build.status || 1); }
}
const server = spawn(executable('server'), [], { cwd: resolve('.'), stdio: 'inherit', env: { ...process.env,
  HOST: '127.0.0.1', PORT: '7444', FRONTEND_ORIGIN: 'http://127.0.0.1:7444',
  YTDLP_PATH: executable('downloader'), DOWNLOAD_DIR: join(directory, 'downloads'), STATE_DIR: join(directory, 'history'),
  ALLOW_PRIVATE_URLS: 'true', ALLOW_DANGEROUS_OPTIONS: 'false', ALLOW_CUSTOM_DOWNLOAD_PATH: 'false',
  MAX_CONCURRENT_DOWNLOADS: '2', MAX_DOWNLOAD_DURATION_MS: '60000', LOG_LEVEL: 'warn'
} });
let stopping = false;
const stop = () => { stopping = true; server.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
server.on('error', error => { console.error(error); cleanup(); process.exit(1); });
server.on('exit', code => { cleanup(); process.exit(stopping ? 0 : code || 0); });
