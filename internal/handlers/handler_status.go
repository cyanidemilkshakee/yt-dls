package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/go-chi/chi/v5"
)

// HandleGetDownloadStatus handles GET /api/download/{id}/status
func (a *App) HandleGetDownloadStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		sendError(w, http.StatusBadRequest, "Download ID is required")
		return
	}

	dp, ok := a.Store.Get(id)
	if !ok {
		sendError(w, http.StatusNotFound, "Download not found")
		return
	}

	snap := dp.Snapshot()
	sendJSON(w, http.StatusOK, snap)
}

// HandleBatchStatus handles GET /api/downloads/status/batch?ids=...
func (a *App) HandleBatchStatus(w http.ResponseWriter, r *http.Request) {
	idsParam := r.URL.Query().Get("ids")
	idList := strings.Split(idsParam, ",")

	const maxBatchIDs = 50
	if len(idList) > maxBatchIDs {
		sendError(w, http.StatusBadRequest, fmt.Sprintf("Too many IDs — maximum is %d", maxBatchIDs))
		return
	}

	result := make(map[string]any)
	for _, id := range idList {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}

		dp, ok := a.Store.Get(id)
		if ok {
			result[id] = dp.Snapshot()
		} else {
			result[id] = nil
		}
	}

	sendJSON(w, http.StatusOK, result)
}

// HandleGetLog handles GET /api/download/{id}/log
func (a *App) HandleGetLog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		sendError(w, http.StatusBadRequest, "Download ID is required")
		return
	}

	dp, ok := a.Store.Get(id)
	if !ok {
		sendError(w, http.StatusNotFound, "Download not found")
		return
	}

	sendJSON(w, http.StatusOK, map[string]any{
		"log": dp.GetLogs(),
	})
}

// HandleCancelDownload handles POST /api/download/{id}/cancel
func (a *App) HandleCancelDownload(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		sendError(w, http.StatusBadRequest, "Download ID is required")
		return
	}

	dp, ok := a.Store.Get(id)
	if !ok {
		sendError(w, http.StatusNotFound, "Download not found")
		return
	}

	// Tell the progress tracker to cancel.
	// The Worker is listening to dp.Context().Done() via command Context.
	dp.Cancel()
	if a.Pool != nil {
		a.Pool.RemoveQueued(id)
	}
	dp.Update(func(p *store.DownloadProgress) {
		if p.Status == "completed" || p.Status == "failed" || p.Status == "cancelled" {
			return
		}
		p.Status = "cancelled"
		now := time.Now()
		p.CompletedAt = &now
		p.AddLogLocked("Download was cancelled")
		p.MarkIncompleteStreams("cancelled")
	})

	sendJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Download cancelled successfully",
	})
}

// HandleDeleteDownload handles DELETE /api/download/{id}
func (a *App) HandleDeleteDownload(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		sendError(w, http.StatusBadRequest, "Download ID is required")
		return
	}

	dp, ok := a.Store.Get(id)
	if !ok {
		// FIX: return 404 instead of silently returning 200 for unknown IDs.
		sendError(w, http.StatusNotFound, "Download not found")
		return
	}

	if !store.Terminal(dp.Snapshot().Status) {
		sendError(w, http.StatusConflict, "Cancel or finish the job before removing its history")
		return
	}
	if a.Store.ActiveBatchContains(id) {
		sendError(w, http.StatusConflict, "This item belongs to an active batch. Finish or cancel the batch before removing its history.")
		return
	}
	// Remove the history record; result files remain on disk.
	if !dp.FilesMu.TryLock() {
		sendError(w, 409, "Wait for the worker and file transfers to finish before removing history")
		return
	}
	defer dp.FilesMu.Unlock()
	dp.Cancel()
	if a.Pool != nil {
		a.Pool.RemoveQueued(id)
	}
	a.Store.Delete(id)

	sendJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Download removed",
	})
}
