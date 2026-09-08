#!/usr/bin/env node
/**
 * kill-port.mjs
 * Kills any process listening on a given TCP port (Windows + Unix).
 * Usage: node scripts/kill-port.mjs 7391
 */
import { execSync } from 'child_process';

const port = process.argv[2];
if (!port) {
  console.error('Usage: node scripts/kill-port.mjs <port>');
  process.exit(1);
}

try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = [...new Set(
      out.trim().split('\n')
        .filter(l => l.includes('LISTENING'))
        .map(l => l.trim().split(/\s+/).pop())
        .filter(Boolean)
    )];
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Killed PID ${pid} (was on port ${port})`);
      } catch {}
    }
  } else {
    execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: 'ignore' });
    console.log(`Killed processes on port ${port}`);
  }
} catch {
  // Port was not in use — that's fine
}
