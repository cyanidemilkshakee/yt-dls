package handlers

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/validation"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
	"github.com/google/uuid"
)

// HandleStartDownload handles POST /api/download
func (a *App) HandleStartDownload(w http.ResponseWriter, r *http.Request) {
	var req worker.DownloadOptions
	if !decodeRequest(w, r, &req, 1<<20) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) > 128 {
		sendError(w, 400, "Idempotency key is too long")
		return
	}
	encoded, _ := json.Marshal(req)
	hash := sha256.Sum256(encoded)
	a.workMu.Lock()
	defer a.workMu.Unlock()
	if key != "" {
		if existing, ok := a.admissions[key]; ok {
			if existing.Hash != hash {
				sendError(w, 409, "Idempotency key was already used for different options")
				return
			}
			if _, ok := a.Store.Get(existing.ID); ok {
				sendJSON(w, 202, map[string]string{"id": existing.ID})
				return
			}
		}
	}
	if a.closing || a.Store.Count() >= 1000 {
		sendError(w, 429, "Download history is at capacity. Remove finished records or wait for cleanup.")
		return
	}
	job, dp, err := a.prepareJob(r.Context(), req, false)
	if err != nil {
		sendError(w, 400, err.Error())
		return
	}
	a.Store.Set(job.ID, dp)
	if err = a.Pool.Enqueue(job); err != nil {
		a.Store.Delete(job.ID)
		sendError(w, 429, "The queue is full. Try again after a job finishes.")
		return
	}
	if key != "" {
		a.recordAdmission(key, job.ID, hash)
	}
	sendJSON(w, 202, map[string]string{"id": job.ID, "message": "Download queued successfully"})
}

// Call with workMu held. Keep keys for retained jobs rather than clearing all
// keys when old, deleted history has filled the admission cache.
func (a *App) recordAdmission(key, id string, hash [32]byte) {
	if a.admissions == nil {
		a.admissions = make(map[string]admission)
	}
	if len(a.admissions) >= 1000 {
		for existingKey, record := range a.admissions {
			if _, exists := a.Store.Get(record.ID); !exists {
				delete(a.admissions, existingKey)
			}
		}
	}
	a.admissions[key] = admission{ID: id, Hash: hash}
}

func decodeRequest(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	outer := json.NewDecoder(r.Body)
	var raw json.RawMessage
	if err := outer.Decode(&raw); err != nil {
		sendError(w, 400, "Invalid JSON payload: "+err.Error())
		return false
	}
	if !bytes.HasPrefix(bytes.TrimSpace(raw), []byte("{")) {
		sendError(w, 400, "Expected a JSON object")
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		sendError(w, 400, "Invalid JSON payload: "+err.Error())
		return false
	}
	if err := outer.Decode(new(any)); err != io.EOF {
		sendError(w, 400, "Expected one JSON object")
		return false
	}
	return true
}

func (a *App) prepareJob(ctx context.Context, req worker.DownloadOptions, publicHostChecked bool) (worker.Job, *store.DownloadProgress, error) {
	if strings.TrimSpace(req.Filename) == "" {
		req.Filename = "%(title)s_%(id)s"
	}
	root, err := validation.ResolveDownloadDirectory(req.DownloadPath, a.Cfg)
	if err != nil {
		return worker.Job{}, nil, err
	}
	id := uuid.NewString()
	directory := filepath.Join(root, id)
	// Full option validation is completed before DNS work and before admission.
	if req.DownloadMode == "audio" {
		req.ExtractAudio = true
	}
	built, err := worker.BuildCommand(req, directory, a.Cfg)
	if err != nil {
		return worker.Job{}, nil, err
	}
	validationCfg := a.Cfg
	if publicHostChecked {
		copy := *a.Cfg
		copy.AllowPrivateURLs = true
		validationCfg = &copy
	}
	validationCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req.URL, err = validation.ValidateMediaURLContext(validationCtx, req.URL, validationCfg)
	if err != nil {
		return worker.Job{}, nil, err
	}
	// Rebuild with the canonical URL; the worker reuses this exact argv.
	built, err = worker.BuildCommand(req, directory, a.Cfg)
	if err != nil {
		return worker.Job{}, nil, err
	}
	video, audio := worker.ExpectedStreams(req)
	dp := store.NewDownloadProgress(id, video, audio)
	dp.Status = "queued"
	dp.URL = req.URL
	dp.Thumbnail = req.Thumbnail
	dp.OutputDirectory = directory
	dp.Secrets = worker.Secrets(req)
	dp.RetryOptions, dp.RetryNeedsURL = worker.RetryOptions(req)
	return worker.Job{ID: id, Opts: req, DlDir: directory, Built: built}, dp, nil
}

// HandleListDownloads handles GET /api/downloads
func (a *App) HandleListDownloads(w http.ResponseWriter, r *http.Request) {
	allSnaps := a.Store.SnapshotAll()
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if offset < 0 {
		offset = 0
	}
	if limit < 1 || limit > 200 {
		limit = 200
	}
	total := len(allSnaps)
	if offset > total {
		offset = total
	}
	end := min(offset+limit, total)
	allSnaps = allSnaps[offset:end]
	if allSnaps == nil {
		allSnaps = []store.ProgressSnapshot{} // never send null to the frontend
	}
	sendJSON(w, http.StatusOK, map[string]any{
		"downloads": allSnaps,
		"total":     total, "next_offset": end,
	})
}

// HandleCommandPreview handles POST /api/download/command-preview
func (a *App) HandleCommandPreview(w http.ResponseWriter, r *http.Request) {
	// FIX: cap request body to 1 MB.
	var req worker.DownloadOptions
	if !decodeRequest(w, r, &req, 1<<20) {
		return
	}
	if strings.TrimSpace(req.Filename) == "" {
		req.Filename = "%(title)s_%(id)s"
	}

	// FIX: validate URL even for previews — without this, any URL (including
	// SSRF targets) could be embedded in the built command.
	if strings.TrimSpace(req.URL) != "" {
		validationCtx, cancelValidation := context.WithTimeout(r.Context(), 5*time.Second)
		validURL, err := validation.ValidateMediaURLContext(validationCtx, req.URL, a.Cfg)
		cancelValidation()
		if err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		req.URL = validURL
	} else {
		req.URL = "https://example.com/video"
	}

	dlDir, err := validation.ResolveDownloadDirectory(req.DownloadPath, a.Cfg)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.DownloadPath = dlDir

	res, err := worker.BuildCommand(req, filepath.Join(dlDir, "<job-id>"), a.Cfg)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	cmdStr := worker.FormatCommand(worker.RedactCommand(res.Command))
	sendJSON(w, http.StatusOK, map[string]any{
		"command": cmdStr, "argv": worker.RedactCommand(res.Command), "shell": "Display only; <job-id> is generated at admission",
	})
}
