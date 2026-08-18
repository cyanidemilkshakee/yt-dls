const fs = require('fs');
let file = fs.readFileSync('src/components/ConfigSection.jsx', 'utf8');

const replacements = {
  'className="my-12 w-[95%] max-w-[1400px] card mx-auto"': 'className="config-main-container"',
  'className="flex-shrink-0 flex justify-between items-center p-4 border-b border-[var(--border-light)] dark:border-[var(--border-dark)]"': 'className="config-header"',
  'className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10"': 'className="config-close-btn"',
  'className="flex-grow p-6 text-left space-y-8"': 'className="config-body"',
  'className="flex flex-col md:flex-row gap-6"': 'className="config-layout"',
  'className="w-full md:w-[500px] flex-shrink-0 self-start aspect-video rounded-lg shadow-md overflow-hidden bg-black/10 dark:bg-white/5"': 'className="config-thumbnail-wrapper"',
  'className="w-full h-full object-cover"': 'className="config-thumbnail-img"',
  'className="flex-grow min-w-[250px]"': 'className="config-details"',
  'className="text-2xl font-bold mb-2"': 'className="config-title"',
  'className="mb-4"': 'className="config-description-container"',
  'className="font-semibold text-sm mb-1 block"': 'className="config-label block"',
  'className="font-semibold text-sm mb-1"': 'className="config-label"',
  'className="text-sm text-[var(--text-secondary-light)] dark:text-[var(--text-secondary-dark)] max-h-24 overflow-y-auto pr-2"': 'className="config-description-text"',
  'className="space-y-6"': 'className="config-form-container"',
  'className="input-form w-full p-2 rounded bg-gray-200 dark:bg-black/20 border border-[var(--border-light)] dark:border-[var(--border-dark)]"': 'className="input-form config-input"',
  'className="grid grid-cols-1 md:grid-cols-2 gap-4"': 'className="form-grid-2"',
  'className="flex flex-wrap gap-2"': 'className="presets-container"',
  'className="flex items-center space-x-2 rounded-lg p-1 bg-gray-200 dark:bg-black/20 w-fit"': 'className="mode-toggle-group"',
  'className="grid grid-cols-1 lg:grid-cols-2 gap-6"': 'className="form-grid-lg-2"',
  'className="flex justify-between items-center mb-2"': 'className="section-header"',
  'className="flex items-center space-x-2 cursor-pointer"': 'className="checkbox-label"',
  'className="h-5 w-5 text-[var(--primary-green)] bg-transparent border-2 dark:border-gray-600 border-gray-300 rounded focus:ring-0 focus:ring-offset-0"': 'className="checkbox-input"',
  'className="text-sm"': 'className="checkbox-text"',
  // Presets
  'className={`preset-btn px-4 py-1.5 text-sm rounded-md transition-colors ${': 'className={`preset-btn-base ${',
  "'bg-[var(--primary-green)] text-black font-semibold'": "'preset-btn-active'",
  "'bg-gray-200 dark:bg-black/20 hover:bg-gray-300 dark:hover:bg-black/40 text-gray-600 dark:text-gray-400'": "'preset-btn-inactive'",
  // Modes
  "className={`btn px-4 py-1.5 text-sm rounded-md ${downloadMode==='both' ? 'bg-[var(--primary-green)] text-black' : ''}`}": "className={`mode-btn-base ${downloadMode==='both' ? 'mode-btn-active' : ''}`}",
  "className={`btn px-4 py-1.5 text-sm rounded-md ${downloadMode==='video' ? 'bg-[var(--primary-green)] text-black' : ''}`}": "className={`mode-btn-base ${downloadMode==='video' ? 'mode-btn-active' : ''}`}",
  "className={`btn px-4 py-1.5 text-sm rounded-md ${downloadMode==='audio' ? 'bg-[var(--primary-green)] text-black' : ''}`}": "className={`mode-btn-base ${downloadMode==='audio' ? 'mode-btn-active' : ''}`}"
};

for (const [key, value] of Object.entries(replacements)) {
  file = file.split(key).join(value);
}

fs.writeFileSync('src/components/ConfigSection.jsx', file);
console.log('done');
