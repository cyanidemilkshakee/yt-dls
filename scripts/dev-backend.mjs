#!/usr/bin/env node
// Starts the Go backend server from the project root (where go.mod lives).
// Works on Windows PowerShell, cmd.exe, and Unix shells alike.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// go.mod is now at the project root, one level up from scripts/
const projectRoot = join(__dirname, '..');

const env = {
  ...process.env,
  FRONTEND_ORIGIN: 'http://localhost:5173',
};

const isWindows = process.platform === 'win32';
const result = spawnSync(
  isWindows ? 'go.exe' : 'go',
  ['run', './cmd/server'],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  }
);

process.exit(result.status ?? 0);
