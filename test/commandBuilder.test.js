const test = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../backend/config');
const { buildYtDlpCommand, redactCommand, formatCommand } = require('../backend/services/commandBuilder');
const { ValidationError, isPrivateIp, validateFilenameTemplate } = require('../backend/utils/validation');

test('builds a current yt-dlp command with a machine-readable progress template', () => {
  const { command } = buildYtDlpCommand({
    url: 'https://www.youtube.com/watch?v=test',
    filename: '%(title)s',
    formatCode: 'bestvideo+bestaudio/best',
    enableSubtitles: true,
    subtitleLang: 'en',
    embedSubs: true,
    outputFormat: 'mp4',
  });
  assert.equal(command[0], config.YTDLP_PATH);
  assert.ok(command.includes('--progress-template'));
  assert.match(command[command.indexOf('--progress-template') + 1], /"vcodec"/);
  assert.match(command[command.indexOf('--progress-template') + 1], /"acodec"/);
  assert.ok(command.includes('--merge-output-format'));
  assert.ok(command.includes('--write-auto-subs'));
  assert.ok(command.includes('--embed-subs'));
  assert.equal(command.at(-1), 'https://www.youtube.com/watch?v=test');
});

test('rejects filename traversal and path separators', () => {
  assert.throws(() => validateFilenameTemplate('../escape'), ValidationError);
  assert.throws(() => validateFilenameTemplate('folder/file'), ValidationError);
  assert.equal(validateFilenameTemplate('%(title)s'), '%(title)s.%(ext)s');
});

test('blocks shell execution and local file access by default', () => {
  assert.throws(() => buildYtDlpCommand({
    url: 'https://example.com/video',
    advancedSettings: { exec: 'after_move:whoami' },
  }), /disabled by the server/);
  assert.throws(() => buildYtDlpCommand({
    url: 'https://example.com/video',
    advancedSettings: { 'enable-file-urls': true },
  }), /disabled by the server/);
});

test('redacts credentials in command previews and logs', () => {
  const command = ['yt-dlp', '--username', 'alice', '--password', 'secret', 'https://example.com'];
  const safe = redactCommand(command);
  assert.equal(safe[4], '[REDACTED]');
  assert.doesNotMatch(formatCommand(safe), /secret/);
});

test('recognizes common private and loopback addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.1.1', '::1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
});
