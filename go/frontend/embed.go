package frontend

import "embed"

//go:embed *.html *.css *.js js
var FS embed.FS
