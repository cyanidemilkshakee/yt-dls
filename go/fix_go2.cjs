const fs = require('fs');

let mainGo = fs.readFileSync('cmd/server/main.go', 'utf8');
mainGo = mainGo.replace(/github\.com\/cyanidemilkshakee\/yt-dls\/go\/internal\/api/g, 'github.com/cyanidemilkshakee/yt-dls/go/internal/handlers');
fs.writeFileSync('cmd/server/main.go', mainGo);

console.log('fixed go 2');
