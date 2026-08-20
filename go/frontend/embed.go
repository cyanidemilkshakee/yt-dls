package frontend

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var fsRaw embed.FS

var FS, _ = fs.Sub(fsRaw, "dist")
