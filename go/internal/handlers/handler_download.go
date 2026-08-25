package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/validation"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/worker"
	"github.com/google/uuid"
)

// HandleStartDownload handles POST /api/download
func (a *App) HandleStartDownload(w http.ResponseWriter, r *http.Request) {
	var req worker.DownloadOptions
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(req.URL) == "" {
		sendError(w, http.StatusBadRequest, "URL is required")
		return
	}

	// Validate the URL — checks protocol, private IPs, credentials, etc.
	validURL, err := validation.ValidateMediaURL(req.URL, a.Cfg)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.URL = validURL

	// Resolve download directory (respects ALLOW_CUSTOM_DOWNLOAD_PATH setting)
	dlDir, err := validation.ResolveDownloadDirectory(req.DownloadPath, a.Cfg)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.DownloadPath = dlDir

	// Generate a unique download ID
	downloadID := uuid.New().String()

	// Determine expected streams based on the download options
	expectedVideo, expectedAudio := worker.ExpectedStreams(req)
	dp := store.NewDownloadProgress(downloadID, expectedVideo, expectedAudio)
	dp.URL = req.URL

	// FIX: Register in the store BEFORE enqueueing.
	// The worker calls Store.Get(id) as its first action.
	// If the job is dispatched before the store entry exists, the worker silently exits.
	a.Store.Set(downloadID, dp)

	// Enqueue job. If the queue is full, remove the store entry and reject.
	job := worker.Job{
		ID:      downloadID,
		Opts:    req,
		DlDir:   dlDir,
	}
	if err := a.Pool.Enqueue(job); err != nil {
		a.Store.Delete(downloadID) // rollback
		sendError(w, http.StatusTooManyRequests, "Server is currently at maximum capacity. Please try again later.")
		return
	}

	sendJSON(w, http.StatusAccepted, map[string]string{
		"id":      downloadID,
		"message": "Download queued successfully",
	})
}

// HandleListDownloads handles GET /api/downloads
func (a *App) HandleListDownloads(w http.ResponseWriter, r *http.Request) {
	allSnaps := a.Store.SnapshotAll()
	if allSnaps == nil {
		allSnaps = []store.ProgressSnapshot{} // never send null to the frontend
	}
	sendJSON(w, http.StatusOK, map[string]any{
		"downloads": allSnaps,
	})
}

// HandleCommandPreview handles POST /api/download/command-preview
func (a *App) HandleCommandPreview(w http.ResponseWriter, r *http.Request) {
	var req worker.DownloadOptions
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	dlDir := req.DownloadPath
	if dlDir == "" {
		dlDir = a.Cfg.DownloadDir
	}
	if req.URL == "" {
		req.URL = "https://example.com/video"
	}

	res, err := worker.BuildCommand(req, dlDir, a.Cfg)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	cmdStr := worker.FormatCommand(worker.RedactCommand(res.Command))
	sendJSON(w, http.StatusOK, map[string]string{
		"command": cmdStr,
	})
}

// HandlePauseDownload handles POST /api/download/{id}/pause
func (a *App) HandlePauseDownload(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusNotImplemented, map[string]string{
		"error":      "Pause/Resume is not supported on Windows. Use cancel instead.",
		"error_code": "WINDOWS_UNSUPPORTED",
	})
}

// HandleResumeDownload handles POST /api/download/{id}/resume
func (a *App) HandleResumeDownload(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusNotImplemented, map[string]string{
		"error":      "Pause/Resume is not supported on Windows. Use cancel instead.",
		"error_code": "WINDOWS_UNSUPPORTED",
	})
}
