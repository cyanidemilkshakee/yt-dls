const fs = require('fs');

let mainGo = fs.readFileSync('cmd/server/main.go', 'utf8');
mainGo = mainGo.replace(/&api\.App/g, '&handlers.App');
fs.writeFileSync('cmd/server/main.go', mainGo);

console.log('fixed main.go app pointer');
