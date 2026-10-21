import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { run, npm } from './commands.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.FRONTEND_ORIGIN = [...new Set([...(process.env.FRONTEND_ORIGIN || '').split(',').filter(Boolean), 'http://localhost:5173', 'http://127.0.0.1:5173'])].join(',');
const port = Number(process.env.PORT || 7391);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const probe = createServer();
await new Promise((ok, fail) => { probe.once('error', () => fail(new Error(`Port ${port} is occupied. Stop its owner or set PORT to another value.`))); probe.listen(port, '127.0.0.1', () => probe.close(ok)); });
if (!existsSync('web/dist/index.html')) npm(['run', 'build:frontend']);
const binary = resolve(root, '.cache', process.platform === 'win32' ? 'dev-server.exe' : 'dev-server');
mkdirSync(resolve(root, '.cache'), { recursive: true });
run('go', ['build', '-o', binary, './command/server']);
// Preserve explicit origins. Vite normally proxies to the API on the same origin.
const child = spawn(binary, [], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
