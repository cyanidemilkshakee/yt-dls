const fs = require('fs');
let file1 = fs.readFileSync('src/components/DownloadsSection.jsx', 'utf8');

const replacements1 = {
  'className="w-2/3 mx-auto mt-12"': 'className="downloads-container"',
  'className="flex justify-between items-center mb-4"': 'className="downloads-header"',
  'className="text-2xl font-bold"': 'className="downloads-title"',
  'className="px-4 py-2 text-sm rounded-full bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-500/40 transition-colors hidden"': 'className="btn-clear-completed"',
  'className="space-y-4"': 'className="downloads-list"'
};

for (const [key, value] of Object.entries(replacements1)) {
  file1 = file1.split(key).join(value);
}
fs.writeFileSync('src/components/DownloadsSection.jsx', file1);

let file2 = fs.readFileSync('src/components/DownloadItem.jsx', 'utf8');
const replacements2 = {
  'className="card p-4 flex flex-col items-center space-x-4 transition-all duration-500"': 'className="dl-card"',
  'className="flex items-start w-full"': 'className="dl-card-inner"',
  'className="w-48 h-27 bg-gray-700 rounded-md flex-shrink-0 flex items-center justify-center text-xs text-white"': 'className="dl-thumb-fallback"',
  'className="flex-grow overflow-hidden ml-6 text-left"': 'className="dl-content"',
  'className="flex items-center justify-between mb-2"': 'className="dl-title-row"',
  'className="flex-grow"': 'className="dl-title-wrapper"',
  'className="font-semibold leading-tight truncate"': 'className="dl-title"',
  'className="status-text text-sm text-gray-400 truncate mt-0.5"': 'className="dl-status"',
  'className="download-actions-row flex items-center rounded-full border border-[var(--border-light)] dark:border-[var(--border-dark)] bg-transparent px-3 py-1.5 shrink-0 space-x-2"': 'className="dl-actions"',
  'className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full"': 'className="dl-action-btn"',
  'className="mt-4 w-full"': 'className="dl-progress-wrapper"',
  'className="relative w-full bg-gray-700 rounded-full h-3"': 'className="dl-progress-bar-container"',
  'className={`h-3 rounded-full transition-all duration-300 ${isError ? \'bg-red-400\' : \'bg-green-400\'}`}': 'className={`dl-progress-bar-base ${isError ? \'bg-red-400\' : \'bg-green-400\'}`}',
  'className="flex items-center justify-between text-xs text-gray-400 mt-1.5"': 'className="dl-progress-stats"',
  'className="font-mono"': 'className="dl-progress-mono"',
  'className="flex items-center space-x-3 font-mono"': 'className="dl-progress-group"',
  'className="log-container w-full bg-black/50 dark:bg-black/80 p-2 rounded-md mt-4 max-h-48 overflow-y-auto"': 'className="dl-log-container"',
  'className="log-content text-xs font-mono text-left whitespace-pre-wrap"': 'className="dl-log-content"'
};

for (const [key, value] of Object.entries(replacements2)) {
  file2 = file2.split(key).join(value);
}
fs.writeFileSync('src/components/DownloadItem.jsx', file2);

console.log('done downloads');
