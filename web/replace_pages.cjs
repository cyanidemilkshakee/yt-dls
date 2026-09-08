const fs = require('fs');

const pages = [
  'src/App.jsx',
  'src/pages/Settings.jsx',
  'src/pages/About.jsx',
  'src/pages/Donate.jsx',
  'src/pages/FFmpeg.jsx'
];

const replacements = {
  'className="w-full flex flex-col items-center text-center min-h-screen"': 'className="page-container"',
  'className="flex-1 flex flex-col justify-center items-center w-full pt-10"': 'className="page-content"',
  'className="w-full max-w-4xl mx-auto flex flex-col items-center"': 'className="home-container"',
  'className="text-4xl md:text-5xl font-bold mb-4"': 'className="home-title"',
  'className="text-lg max-w-3xl mx-auto text-secondary-light dark:text-secondary-dark"': 'className="home-subtitle"',
  'className="text-lg max-w-3xl mx-auto text-[var(--text-secondary-light)] dark:text-[var(--text-secondary-dark)]"': 'className="home-subtitle"'
};

for (const p of pages) {
  if (fs.existsSync(p)) {
    let file = fs.readFileSync(p, 'utf8');
    for (const [key, value] of Object.entries(replacements)) {
      file = file.split(key).join(value);
    }
    fs.writeFileSync(p, file);
  }
}

console.log('done pages');
