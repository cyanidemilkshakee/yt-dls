import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { run } from './commands.mjs';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
if (!existsSync(python)) {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  const launcher = candidates.find(name => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
  if (!launcher) throw new Error('Install Python 3.10 or newer, then retry.');
  run(launcher, ['-m', 'venv', '.venv']);
}
run(resolve(python), ['-m', 'pip', 'install', '-r', 'requirements-runtime.txt']);
run(resolve(python), ['-c', "import yt_dlp, yt_dlp_ejs; print('Project downloader and EJS solver are ready')"]);
