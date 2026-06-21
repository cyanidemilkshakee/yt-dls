const { spawn } = require('child_process');
const os = require('os');
const logger = require('./logger');

const isWindows = os.platform() === 'win32';

function waitForExit(processObj, timeout) {
  return new Promise((resolve) => {
    if (!processObj || processObj.exitCode !== null || processObj.signalCode !== null) return resolve(true);
    let done = false;
    const finish = (exited) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      processObj.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    processObj.once('exit', onExit);
    const timer = setTimeout(() => finish(false), timeout);
    timer.unref?.();
  });
}

async function terminateProcess(processObj, timeout = 5000) {
  if (!processObj || processObj.exitCode !== null || processObj.signalCode !== null) return;
  const pid = processObj.pid;
  try { processObj.kill('SIGTERM'); } catch (_) {}
  if (await waitForExit(processObj, timeout)) return;

  if (isWindows && pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', resolve);
      killer.once('close', resolve);
    });
  } else {
    try { processObj.kill('SIGKILL'); } catch (error) { logger.warn(`Failed to force-kill process ${pid || ''}: ${error.message}`); }
  }
  await waitForExit(processObj, Math.min(timeout, 2000));
}

module.exports = { isWindows, terminateProcess, waitForExit };
