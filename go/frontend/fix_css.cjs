const fs = require('fs');

// Fix index.css
let css = fs.readFileSync('src/index.css', 'utf8');
css = css.replace('@apply my-12 w-[95%] max-w-[1400px] mx-auto card;', '@apply my-12 w-[95%] max-w-[1400px] mx-auto;');
css = css.replace('@apply my-12 w-[80%] max-w-5xl card p-6 text-left mx-auto;', '@apply my-12 w-[80%] max-w-5xl p-6 text-left mx-auto;');
css = css.replace('@apply card p-4 flex flex-col items-center space-x-4 transition-all duration-500;', '@apply p-4 flex flex-col items-center space-x-4 transition-all duration-500;');
css = css.replace('@apply status-text text-sm text-gray-400 truncate mt-0.5;', '@apply text-sm text-gray-400 truncate mt-0.5;');
css = css.replace('@apply download-actions-row flex items-center', '@apply flex items-center');
css = css.replace('@apply log-container w-full', '@apply w-full');
css = css.replace('@apply log-content text-xs', '@apply text-xs');
fs.writeFileSync('src/index.css', css);

// Fix JSX files
let config = fs.readFileSync('src/components/ConfigSection.jsx', 'utf8');
config = config.replace('className="config-main-container"', 'className="config-main-container card"');
fs.writeFileSync('src/components/ConfigSection.jsx', config);

let playlist = fs.readFileSync('src/components/PlaylistSection.jsx', 'utf8');
playlist = playlist.replace('className="playlist-container"', 'className="playlist-container card"');
fs.writeFileSync('src/components/PlaylistSection.jsx', playlist);

let dl = fs.readFileSync('src/components/DownloadItem.jsx', 'utf8');
dl = dl.replace('className="dl-card"', 'className="dl-card card"');
dl = dl.replace('className="dl-status"', 'className="dl-status status-text"');
dl = dl.replace('className="dl-actions"', 'className="dl-actions download-actions-row"');
dl = dl.replace('className="dl-log-container"', 'className="dl-log-container log-container"');
dl = dl.replace('className="dl-log-content"', 'className="dl-log-content log-content"');
fs.writeFileSync('src/components/DownloadItem.jsx', dl);

console.log('done fixing css and jsx');
