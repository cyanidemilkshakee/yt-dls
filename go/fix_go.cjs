const fs = require('fs');
const path = require('path');

function replaceInDir(dir, searchRegex, replaceStr) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath, searchRegex, replaceStr);
    } else if (fullPath.endsWith('.go')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (searchRegex.test(content)) {
        content = content.replace(searchRegex, replaceStr);
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

// 1. Rename package api to package handlers
replaceInDir('internal/handlers', /package api/g, 'package handlers');

// 2. Rename import yt-dls/internal/api to yt-dls/internal/handlers
replaceInDir('cmd/server', /"yt-dls\/internal\/api"/g, '"yt-dls/internal/handlers"');
replaceInDir('internal', /"yt-dls\/internal\/api"/g, '"yt-dls/internal/handlers"');

// also check if any router calls use api.
let mainGo = fs.readFileSync('cmd/server/main.go', 'utf8');
mainGo = mainGo.replace(/api\.SetupRoutes/g, 'handlers.SetupRoutes');
fs.writeFileSync('cmd/server/main.go', mainGo);

console.log('fixed go');
