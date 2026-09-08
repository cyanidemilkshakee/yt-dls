const fs = require('fs');

let config = fs.readFileSync('src/features/config/ConfigSection.jsx', 'utf8');
config = config.replace(/from '\.\.\//g, "from '../../");
config = "import './ConfigSection.css';\n" + config;
fs.writeFileSync('src/features/config/ConfigSection.jsx', config);

let playlist = fs.readFileSync('src/features/playlist/PlaylistSection.jsx', 'utf8');
playlist = playlist.replace(/from '\.\.\//g, "from '../../");
playlist = "import './PlaylistSection.css';\n" + playlist;
fs.writeFileSync('src/features/playlist/PlaylistSection.jsx', playlist);

let downloads = fs.readFileSync('src/features/downloads/DownloadsSection.jsx', 'utf8');
downloads = downloads.replace(/from '\.\.\//g, "from '../../");
downloads = downloads.replace(/from '\.\/DownloadItem'/g, "from './DownloadItem'"); // same dir
downloads = "import './Downloads.css';\n" + downloads;
fs.writeFileSync('src/features/downloads/DownloadsSection.jsx', downloads);

let downloadItem = fs.readFileSync('src/features/downloads/DownloadItem.jsx', 'utf8');
downloadItem = downloadItem.replace(/from '\.\.\//g, "from '../../");
fs.writeFileSync('src/features/downloads/DownloadItem.jsx', downloadItem);

let useDownloads = fs.readFileSync('src/features/downloads/useDownloads.js', 'utf8');
useDownloads = useDownloads.replace(/from '\.\.\//g, "from '../../");
fs.writeFileSync('src/features/downloads/useDownloads.js', useDownloads);

console.log('fixed imports in features');
