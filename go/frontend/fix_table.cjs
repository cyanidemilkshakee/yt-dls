const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');
css = css.replace('@apply table-container max-h-96', '@apply max-h-96');
fs.writeFileSync('src/index.css', css);

let jsx = fs.readFileSync('src/components/PlaylistSection.jsx', 'utf8');
jsx = jsx.replace('className="playlist-table-container"', 'className="playlist-table-container table-container"');
fs.writeFileSync('src/components/PlaylistSection.jsx', jsx);

console.log('fixed');
