package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
	"github.com/go-chi/chi/v5"
)

func (a *App) HandleResultFile(w http.ResponseWriter, r *http.Request) {
	dp, ok := a.Store.Get(chi.URLParam(r, "id"))
	if !ok {
		sendError(w, 404, "Download not found")
		return
	}
	dp.FilesMu.RLock()
	defer dp.FilesMu.RUnlock()
	if dp.Snapshot().Status != "completed" {
		sendError(w, 409, "Files are available after successful completion")
		return
	}
	index, err := strconv.Atoi(chi.URLParam(r, "index"))
	if err != nil {
		sendError(w, 400, "Invalid file index")
		return
	}
	path, root, ok := dp.File(index)
	if !ok {
		sendError(w, 404, "Result file not found")
		return
	}
	// Pin the owned directory before opening relative paths. os.Root prevents
	// a concurrent symlink replacement from redirecting a file response outside it.
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		sendError(w, 404, "Result directory no longer exists")
		return
	}
	if resolvedRoot != filepath.Clean(root) {
		sendError(w, 403, "Result directory contains a symbolic link")
		return
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		sendError(w, 403, "Result file is outside its job directory")
		return
	}
	parent, err := os.OpenRoot(filepath.Dir(root))
	if err != nil {
		sendError(w, 404, "Result directory is unavailable")
		return
	}
	defer parent.Close()
	directory, err := parent.Lstat(filepath.Base(root))
	if err != nil || !directory.IsDir() || directory.Mode()&os.ModeSymlink != 0 {
		sendError(w, 403, "Result directory is not an owned directory")
		return
	}
	scope, err := parent.OpenRoot(filepath.Base(root))
	if err != nil {
		sendError(w, 403, "Result directory is outside its parent")
		return
	}
	defer scope.Close()
	openedDirectory, err := scope.Stat(".")
	if err != nil || !os.SameFile(directory, openedDirectory) {
		sendError(w, 409, "Result directory changed while opening it")
		return
	}
	entry, err := scope.Lstat(rel)
	if err != nil || !entry.Mode().IsRegular() {
		sendError(w, 404, "Result is not a regular file")
		return
	}
	file, err := scope.Open(rel)
	if err != nil {
		sendError(w, 404, "Result file is unavailable")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || !os.SameFile(entry, info) {
		sendError(w, 404, "Result is not a regular file")
		return
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": info.Name()}))
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (a *App) HandleRetryDownload(w http.ResponseWriter, r *http.Request) {
	dp, ok := a.Store.Get(chi.URLParam(r, "id"))
	if !ok {
		sendError(w, 404, "Download not found")
		return
	}
	if !store.Terminal(dp.Snapshot().Status) {
		sendError(w, 409, "Cancel or finish this job before retrying")
		return
	}
	var request struct {
		URL              string                  `json:"url"`
		AdvancedSettings worker.AdvancedSettings `json:"advancedSettings"`
	}
	if !decodeRequest(w, r, &request, 1<<20) {
		return
	}
	saved, needsURL := dp.RetryData()
	var options worker.DownloadOptions
	if len(saved) == 0 || json.Unmarshal(saved, &options) != nil {
		sendError(w, 409, "This record has no retry configuration. Inspect its source again.")
		return
	}
	if needsURL && strings.TrimSpace(request.URL) == "" {
		sendError(w, 400, "Supply the original source URL; signed parameters are not saved to disk")
		return
	}
	if request.URL != "" {
		options.URL = request.URL
	}
	options.AdvancedSettings = request.AdvancedSettings
	// Reuse admission validation and idempotency, without bypassing boundaries.
	data, _ := json.Marshal(options)
	r.Body = io.NopCloser(bytes.NewReader(data))
	a.HandleStartDownload(w, r)
}
