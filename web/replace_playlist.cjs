const fs = require('fs');
let file = fs.readFileSync('src/components/PlaylistSection.jsx', 'utf8');

const replacements = {
  'className="my-12 w-[80%] max-w-5xl card p-6 text-left mx-auto"': 'className="playlist-container"',
  'className="flex justify-between items-center mb-4 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-4"': 'className="playlist-header"',
  'className="text-2xl font-bold"': 'className="playlist-title"',
  'className="text-sm text-secondary-light dark:text-secondary-dark"': 'className="playlist-subtitle"',
  'className="flex justify-between items-center mb-4"': 'className="playlist-controls"',
  'className="flex items-center space-x-2"': 'className="playlist-controls-group"',
  'className="table-container max-h-96 border border-[var(--border-light)] dark:border-[var(--border-dark)] rounded-lg overflow-hidden overflow-y-auto"': 'className="playlist-table-container"',
  'className="bg-gray-100 dark:bg-black/20 sticky top-0 z-10"': 'className="playlist-table-header"',
  'className="p-3 w-12 text-center"': 'className="playlist-th-center"',
  'className="p-3 text-left"': 'className="playlist-th-left"',
  'className="p-3 text-right"': 'className="playlist-th-right"',
  'className="divide-y divide-[var(--border-light)] dark:divide-[var(--border-dark)]"': 'className="playlist-tbody"',
  'className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"': 'className="playlist-tr"',
  'className="p-3 text-center"': 'className="playlist-td-center"',
  'className="p-3 text-right font-mono"': 'className="playlist-td-right"',
  'className="p-3"': 'className="playlist-td"',
  'className="flex items-center space-x-3"': 'className="playlist-item-content"',
  'className="w-16 h-9 object-cover rounded border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800"': 'className="playlist-item-img"',
  'className="flex-1 min-w-0"': 'className="playlist-item-details"',
  'className="font-medium text-sm line-clamp-2 mb-1"': 'className="playlist-item-title"',
  'className="text-xs text-gray-500 dark:text-gray-400"': 'className="playlist-item-id"'
};

for (const [key, value] of Object.entries(replacements)) {
  file = file.split(key).join(value);
}

fs.writeFileSync('src/components/PlaylistSection.jsx', file);
console.log('done playlist');
