import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { run, npm } from './commands.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const all = process.argv.slice(2).includes('--all');
if (process.argv.slice(2).some(argument => argument !== '--all')) throw new Error('Only --all is supported');
npm(['run', 'build', '--prefix', 'web']);
mkdirSync('dist', { recursive: true });
const version = JSON.parse(readFileSync('package.json', 'utf8').replace(/^\uFEFF/, '')).version;
const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
const gitStatus = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
const commit = git.status === 0 ? `${git.stdout.trim()}${gitStatus.status === 0 && gitStatus.stdout.trim() ? '-dirty' : ''}` : 'unknown';
const buildTime = new Date().toISOString();
const nativeOS = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const nativeArch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!nativeOS || !nativeArch) throw new Error('Unsupported build platform');
const targets = all ? [['windows', 'amd64'], ['linux', 'amd64'], ['linux', 'arm64'], ['darwin', 'amd64'], ['darwin', 'arm64']] : [[nativeOS, nativeArch]];
for (const [os, arch] of targets) {
  const name = all ? `yt-dls-${os}-${arch}${os === 'windows' ? '.exe' : ''}` : `yt-dls${os === 'windows' ? '.exe' : ''}`;
  const path = `dist/${name}`;
  const ldflags = `-s -w -X github.com/cyanidemilkshakee/yt-dls/internal/version.Version=${version} -X github.com/cyanidemilkshakee/yt-dls/internal/version.Commit=${commit} -X github.com/cyanidemilkshakee/yt-dls/internal/version.BuildTime=${buildTime}`;
  run('go', ['build', '-trimpath', '-ldflags', ldflags, '-o', path, './command/server'], { env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: '0' } });
}
const checksums = readdirSync('dist').filter(name => /^yt-dls(?:-(?:windows|linux|darwin)-(?:amd64|arm64))?(?:\.exe)?$/.test(name)).sort().map(name => `${createHash('sha256').update(readFileSync(`dist/${name}`)).digest('hex')}  ${name}`);
writeFileSync('dist/SHA256SUMS', `${checksums.join('\n')}\n`);
writeFileSync('dist/build.json', JSON.stringify({ version, commit, buildTime, targets }, null, 2));
console.log(`Built ${targets.length} target(s) in ${root}/dist`);
