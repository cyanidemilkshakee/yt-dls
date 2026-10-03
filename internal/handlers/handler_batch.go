package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/validation"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
	"github.com/google/uuid"
)

type batchRequest struct {
	Entries []struct {
		URL       string `json:"url"`
		Filename  string `json:"filename"`
		Thumbnail string `json:"thumbnail"`
	} `json:"entries"`
	Options worker.DownloadOptions `json:"options"`
}

func (a *App) HandleStartBatch(w http.ResponseWriter, r *http.Request) {
	var request batchRequest
	if !decodeRequest(w, r, &request, 4<<20) {
		return
	}
	if len(request.Entries) == 0 || len(request.Entries) > 500 {
		sendError(w, 400, "Choose between 1 and 500 playlist entries per batch")
		return
	}
	if len(request.Options.PlaylistItems) > 0 || (request.Options.ConcatPlaylist != "" && request.Options.ConcatPlaylist != "never") {
		sendError(w, 400, "Use a single playlist job for concatenation; batches create separate files")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) > 128 {
		sendError(w, 400, "Idempotency key is too long")
		return
	}
	data, _ := json.Marshal(request)
	hash := sha256.Sum256(data)
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
	if a.closing || a.Store.Count()+len(request.Entries)+1 > 1000 {
		sendError(w, 429, "Too many retained or pending downloads. Remove finished records first.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	jobs := make([]worker.Job, 0, len(request.Entries))
	records := make([]*store.DownloadProgress, 0, len(request.Entries))
	checkedHosts := make(map[string]bool)
	for index, entry := range request.Entries {
		parsed, err := url.Parse(entry.URL)
		if err != nil || parsed.Host == "" {
			sendError(w, 400, fmt.Sprintf("Entry %d has an invalid URL", index+1))
			return
		}
		if !checkedHosts[parsed.Hostname()] {
			if len(checkedHosts) >= 100 {
				sendError(w, 400, "A batch may contain at most 100 different source hosts")
				return
			}
			if _, err = validation.ValidateMediaURLContext(ctx, entry.URL, a.Cfg); err != nil {
				sendError(w, 400, fmt.Sprintf("Entry %d: %s", index+1, err))
				return
			}
			checkedHosts[parsed.Hostname()] = true
		}
		opts := request.Options
		opts.URL = entry.URL
		if entry.Filename != "" {
			opts.Filename = entry.Filename
		}
		opts.Thumbnail = entry.Thumbnail
		job, dp, err := a.prepareJob(ctx, opts, true)
		if err != nil {
			sendError(w, 400, fmt.Sprintf("Entry %d: %s", index+1, err))
			return
		}
		dp.Status = "waiting_for_capacity"
		jobs = append(jobs, job)
		records = append(records, dp)
	}
	id := uuid.NewString()
	parent := store.NewDownloadProgress(id, false, false)
	parent.Kind = "batch"
	parent.Status = "queued"
	title := fmt.Sprintf("Playlist batch (%d items)", len(jobs))
	parent.Filename = &title
	parent.Batch = &store.BatchProgress{Total: len(jobs)}
	for index, job := range jobs {
		parent.Children = append(parent.Children, job.ID)
		a.Store.Set(job.ID, records[index])
	}
	a.Store.Set(id, parent)
	if key != "" {
		a.recordAdmission(key, id, hash)
	}
	a.batches.Add(1)
	go a.runBatch(parent, jobs)
	sendJSON(w, 202, map[string]string{"id": id, "message": "Playlist batch accepted; queueing continues on the server"})
}

func (a *App) runBatch(parent *store.DownloadProgress, jobs []worker.Job) {
	defer a.batches.Done()
	admissionDone := make(chan struct{})
	go func() {
		defer close(admissionDone)
		for _, job := range jobs {
			if err := a.Pool.EnqueueWait(parent.Context(), job); err != nil {
				return
			}
			if dp, ok := a.Store.Get(job.ID); ok {
				dp.Update(func(p *store.DownloadProgress) {
					if p.Status == "waiting_for_capacity" {
						p.Status = "queued"
					}
				})
			}
			parent.Update(func(p *store.DownloadProgress) { p.Batch.Admitted++ })
		}
	}()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		cancelled := parent.Context().Err() != nil
		stats := store.BatchProgress{Total: len(jobs)}
		for _, job := range jobs {
			dp, ok := a.Store.Get(job.ID)
			if !ok {
				stats.Cancelled++
				continue
			}
			if cancelled {
				cancelRecord(dp, a.Pool, job.ID)
			}
			snap := dp.Snapshot()
			switch snap.Status {
			case "completed":
				stats.Completed++
			case "failed":
				stats.Failed++
			case "cancelled":
				stats.Cancelled++
			}
		}
		finished := stats.Completed + stats.Failed + stats.Cancelled
		parent.Update(func(p *store.DownloadProgress) {
			stats.Admitted = p.Batch.Admitted
			p.Batch = &stats
			p.Progress = float64(finished) / float64(stats.Total) * 100
			if finished == stats.Total || cancelled {
				now := time.Now()
				p.CompletedAt = &now
				if cancelled {
					p.Status = "cancelled"
				} else if stats.Failed > 0 {
					p.Status = "failed"
					message := fmt.Sprintf("%d playlist items failed; retry them individually", stats.Failed)
					p.Error = &message
				} else {
					p.Status = "completed"
				}
			} else {
				p.Status = "downloading"
			}
		})
		if finished == stats.Total || cancelled {
			<-admissionDone
			return
		}
		select {
		case <-ticker.C:
		case <-parent.Context().Done():
		}
	}
}

func cancelRecord(dp *store.DownloadProgress, pool *worker.Pool, id string) {
	dp.Cancel()
	if pool != nil {
		pool.RemoveQueued(id)
	}
	dp.Update(func(p *store.DownloadProgress) {
		if store.Terminal(p.Status) {
			return
		}
		now := time.Now()
		p.Status = "cancelled"
		p.CompletedAt = &now
		p.MarkIncompleteStreams("cancelled")
		p.AddLogLocked("Download was cancelled")
	})
}

func (a *App) Close() {
	a.workMu.Lock()
	a.closing = true
	for _, snap := range a.Store.SnapshotAll() {
		if snap.Kind == "batch" && !store.Terminal(snap.Status) {
			if dp, ok := a.Store.Get(snap.DownloadID); ok {
				dp.Cancel()
			}
		}
	}
	a.workMu.Unlock()
	a.batches.Wait()
}
