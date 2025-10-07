const { spawn } = require('child_process');
const os = require('os');
const logger = require('./logger');

const isWindows = os.platform() === 'win32';

function terminateProcess(processObj, timeout = 5000) {
  return new Promise((resolve) => {
    if (!processObj || processObj.killed) return resolve();

    let terminated = false;
    const cleanup = () => {
      if (!terminated) {
        terminated = true;
        resolve();
      }
    };

    processObj.on('exit', cleanup);

    if (isWindows) {
      const pid = processObj.pid;
      try {
        processObj.kill('SIGTERM');
        setTimeout(() => {
          if (!terminated && !processObj.killed) {
            spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { stdio: 'ignore' }).on('exit', cleanup);
          }
        }, timeout);
      } catch (error) {
        logger.warn(`Failed to terminate process ${pid}: ${error.message}`);
        cleanup();
      }
    } else {
      try {
        processObj.kill('SIGTERM');
        setTimeout(() => {
          if (!terminated && !processObj.killed) {
            processObj.kill('SIGKILL');
          }
        }, timeout);
      } catch (error) {
        logger.warn(`Failed to terminate process: ${error.message}`);
        cleanup();
      }
    }
  });
}

module.exports = { isWindows, terminateProcess };
