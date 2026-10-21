import { spawnSync } from 'node:child_process';
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? result.signal ?? 'unknown status'}`);
}
export function npm(args) {
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args]);
  else if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'npm', ...args]);
  else run('npm', args);
}
