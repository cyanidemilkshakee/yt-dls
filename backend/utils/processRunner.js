const { spawn } = require('child_process');

function runProcess(command, args, { timeoutMs = 10_000, maxOutputBytes = 1024 * 1024, cwd, env, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(result);
    };
    const append = (target, chunk) => {
      const next = target + chunk.toString();
      if (Buffer.byteLength(next) > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('Process output exceeded the configured limit'));
      }
      return next;
    };

    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => finish(null, { code, signal, stdout, stderr }));

    const onAbort = () => {
      child.kill('SIGKILL');
      const error = new Error('Process was aborted');
      error.code = 'PROCESS_ABORTED';
      finish(error);
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });

    timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`Process timed out after ${timeoutMs}ms`);
      error.code = 'PROCESS_TIMEOUT';
      finish(error);
    }, timeoutMs);
    timer.unref?.();
  });
}

module.exports = { runProcess };
