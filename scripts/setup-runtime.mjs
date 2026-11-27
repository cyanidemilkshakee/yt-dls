import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { run } from './commands.mjs';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3', 'python'];
const supportsRuntime = name => spawnSync(name, ['-c', 'import sys; raise SystemExit(sys.version_info < (3, 10))'], { stdio: 'ignore' }).status === 0;
if (!existsSync(python)) {
  const launcher = candidates.find(supportsRuntime);
  if (!launcher) throw new Error('Install Python 3.10 or newer, then retry.');
  run(launcher, ['-m', 'venv', '.venv']);
}
const version = spawnSync(resolve(python), ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], { encoding: 'utf8' });
if (version.status !== 0) throw new Error('Could not identify the Python version in .venv.');
const [major, minor] = version.stdout.trim().split('.').map(Number);
if (major < 3 || (major === 3 && minor < 10)) {
  throw new Error(`The existing .venv uses Python ${major}.${minor}. Remove .venv, install Python 3.10 or newer, then retry.`);
}
run(resolve(python), ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(resolve(python), ['-m', 'pip', 'install', '-r', 'requirements-runtime.txt']);
run(resolve(python), ['-c', "import yt_dlp, yt_dlp_ejs; print('Project downloader and EJS solver are ready')"]);
