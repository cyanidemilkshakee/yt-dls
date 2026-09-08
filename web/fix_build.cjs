const fs = require('fs');

// Fix the useDownloads import
let dlSection = fs.readFileSync('src/features/downloads/DownloadsSection.jsx', 'utf8');
dlSection = dlSection.replace(/from '\.\.\/\.\.\/hooks\/useDownloads'/g, "from './useDownloads'");
fs.writeFileSync('src/features/downloads/DownloadsSection.jsx', dlSection);

// Add @reference to all CSS files
const cssFiles = [
  'src/features/config/ConfigSection.css',
  'src/features/downloads/Downloads.css',
  'src/features/playlist/PlaylistSection.css'
];

for (const file of cssFiles) {
  let content = fs.readFileSync(file, 'utf8');
  content = `@reference "../../index.css";\n\n` + content;
  fs.writeFileSync(file, content);
}

// Add @layer components to the CSS files as well? No, they don't strictly need it if they are imported into index.css or injected.
// Actually, wait, if they are imported into index.css, they don't need @reference if they are imported AFTER the theme, but here they are imported from JS components directly. 
// When importing CSS directly in JS, Vite processes them independently. So they DO need @reference and they probably should be wrapped in @layer components if we want them in that layer. Let's just add @layer components too for good measure.
for (const file of cssFiles) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/@reference "\.\.\/\.\.\/index\.css";\n\n/, ''); // remove what we just added
  content = `@reference "../../index.css";\n\n@layer components {\n` + content.split('\n').map(l => '  ' + l).join('\n') + `\n}\n`;
  fs.writeFileSync(file, content);
}

console.log('fixed build');
