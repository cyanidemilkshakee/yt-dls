const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');

// remove everything between /* ConfigSection.jsx Semantics */ and /* Home.jsx Semantics */
css = css.replace(/\/\* ConfigSection\.jsx Semantics \*\/[\s\S]*?\/\* Home\.jsx Semantics \*\//, '/* Home.jsx Semantics */');

// remove everything between /* PlaylistSection.jsx Semantics */ and /* Downloads Semantics */
css = css.replace(/\/\* PlaylistSection\.jsx Semantics \*\/[\s\S]*?\/\* Downloads Semantics \*\//, '/* Downloads Semantics */');

// remove everything from /* Downloads Semantics */ to the end of @layer components block
css = css.replace(/\/\* Downloads Semantics \*\/[\s\S]*?}\n\n:root {/, '}\n\n:root {');

fs.writeFileSync('src/index.css', css);
console.log('cleaned css');
