const fs = require('fs');

let css = fs.readFileSync('src/features/config/ConfigSection.css', 'utf8');
css = css.replace('@apply text-sm whitespace-pre-wrap font-mono overflow-y-auto pr-2 custom-scrollbar;', '@apply text-sm whitespace-pre-wrap font-mono overflow-y-auto pr-2;');
fs.writeFileSync('src/features/config/ConfigSection.css', css);

let jsx = fs.readFileSync('src/features/config/ConfigSection.jsx', 'utf8');
jsx = jsx.replace('className="config-description-text"', 'className="config-description-text custom-scrollbar"');
fs.writeFileSync('src/features/config/ConfigSection.jsx', jsx);

console.log('fixed scrollbar');
