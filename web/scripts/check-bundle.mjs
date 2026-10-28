import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const directory = resolve(import.meta.dirname, '../dist/assets');
const limits = { javascript: 160 * 1024, stylesheet: 25 * 1024, chunk: 125 * 1024, background: 250 * 1024 };
let javascript = 0, stylesheet = 0, largest = 0, background = 0;
for (const name of readdirSync(directory)) {
  if (!/\.(?:js|css)$/.test(name)) continue;
  const size = gzipSync(readFileSync(resolve(directory, name))).length;
  if (name.endsWith('.js')) {
    if (name.startsWith('BackgroundCanvas-')) background = Math.max(background, size);
    else { javascript += size; largest = Math.max(largest, size); }
  }
  else stylesheet += size;
}
if (javascript > limits.javascript || stylesheet > limits.stylesheet || largest > limits.chunk || background > limits.background) {
  throw new Error(`Bundle budget exceeded: application JS ${javascript}/${limits.javascript}, CSS ${stylesheet}/${limits.stylesheet}, largest application chunk ${largest}/${limits.chunk}, lazy background ${background}/${limits.background} gzip bytes`);
}
console.log(`Bundle budget passed: application JS ${(javascript / 1024).toFixed(1)} KiB, CSS ${(stylesheet / 1024).toFixed(1)} KiB, largest application chunk ${(largest / 1024).toFixed(1)} KiB, lazy background ${(background / 1024).toFixed(1)} KiB gzip`);
