package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/process"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

// Worker executes a single yt-dlp download job and updates the ProgressStore.
type Worker struct {
	ID    string
	Opts  DownloadOptions
	DlDir string // resolved download directory
	Cfg   *config.Config
	Store *store.ProgressStore
	Built BuildResult
}

func NewWorker(id string, opts DownloadOptions, dlDir string, cfg *config.Config, st *store.ProgressStore) *Worker {
	return &Worker{
		ID:    id,
		Opts:  opts,
		DlDir: dlDir,
		Cfg:   cfg,
		Store: st,
	}
}

// Run executes the download job. It blocks until the download finishes or ctx is cancelled.
func (w *Worker) Run(ctx context.Context) {
	dp, ok := w.Store.Get(w.ID)
	if !ok {
		return // Should not happen if correctly pre-registered
	}
	dp.FilesMu.RLock()
	defer dp.FilesMu.RUnlock()
	if dp.Context().Err() != nil {
		w.failCancelled(dp)
		return
	}
	if err := os.MkdirAll(w.DlDir, 0o755); err != nil {
		w.fail(dp, fmt.Sprintf("Failed to prepare download directory: %v", err))
		return
	}
	if directory, err := filepath.EvalSymlinks(w.DlDir); err == nil {
		w.DlDir = directory
		dp.Update(func(p *store.DownloadProgress) { p.OutputDirectory = directory })
	}

	dp.Update(func(p *store.DownloadProgress) {
		if !store.Terminal(p.Status) {
			p.Status = "starting"
			now := time.Now()
			p.StartedAt = &now
		}
	})

	res := w.Built
	var err error
	if len(res.Command) == 0 {
		res, err = BuildCommand(w.Opts, w.DlDir, w.Cfg)
	}
	if err != nil {
		w.fail(dp, fmt.Sprintf("Failed to build command: %v", err))
		return
	}

	// The process must stop when either the pool shuts down or the user cancels
	// this download. Use the pool context as the parent and bridge the per-job
	// cancellation into it.
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(w.Cfg.MaxDownloadDurationMs)*time.Millisecond)
	stopDownloadCancel := context.AfterFunc(dp.Context(), cancel)
	defer cancel()
	defer stopDownloadCancel()

	// Stream both output channels through the shared process runner. It owns the
	// complete yt-dlp process tree (including ffmpeg children on Windows),
	// applies the configured cancellation, and prevents inherited proxy
	// variables from bypassing the application's network policy.
	stdoutLines := &process.Lines{
		Cancel: cancel,
		Handle: func(line string) { w.processLine(dp, line, false) },
	}
	stderrLines := &process.Lines{
		Cancel: cancel,
		Handle: func(line string) { w.processLine(dp, line, true) },
	}

	dp.Update(func(p *store.DownloadProgress) {
		if !store.Terminal(p.Status) {
			p.Status = "preparing"
		}
	})
	err = process.Run(timeoutCtx, res.Command, res.DownloadDirectory, stdoutLines, stderrLines)
	stdoutLines.Flush()
	stderrLines.Flush()
	if err == nil && timeoutCtx.Err() == nil && dp.Context().Err() == nil {
		w.collectResults(dp)
	}

	now := time.Now()
	dp.Update(func(p *store.DownloadProgress) {
		if p.CompletedAt == nil {
			p.CompletedAt = &now
		}
		p.Speed = 0
		p.ETA = nil

		switch {
		case p.Status == "failed" || p.Status == "cancelled":
			// The first terminal transition stays authoritative while the
			// subprocess finishes unwinding after cancellation or an error.
			p.MarkIncompleteStreams(p.Status)

		case timeoutCtx.Err() == context.DeadlineExceeded:
			p.Status = "failed"
			errStr := "Download timeout — process terminated"
			p.Error = &errStr
			p.AddLogLocked(errStr)
			p.MarkIncompleteStreams("failed")

		case ctx.Err() != nil || dp.Context().Err() != nil:
			// The pool context is cancelled during shutdown; the per-download
			// context is cancelled by the user's Cancel action.
			if p.Status != "cancelled" {
				p.Status = "cancelled"
				p.AddLogLocked("Download was cancelled")
			}
			p.MarkIncompleteStreams("cancelled")

		case err != nil:
			p.Status = "failed"
			errStr := fmt.Sprintf("Process exited with error: %v", err)
			p.Error = &errStr
			p.AddLogLocked(errStr)
			p.MarkIncompleteStreams("failed")

		default:
			// Clean exit — success
			p.Status = "completed"
			p.Progress = 100
			p.AddLogLocked("Download completed successfully")
			if p.VideoProgress.Expected {
				p.VideoProgress.Status = "completed"
				p.VideoProgress.Progress = 100
				p.VideoProgress.Speed = 0
				p.VideoProgress.ETA = nil
				if p.VideoProgress.TotalBytes > 0 {
					p.VideoProgress.DownloadedBytes = p.VideoProgress.TotalBytes
				} else if p.VideoProgress.DownloadedBytes > 0 {
					p.VideoProgress.TotalBytes = p.VideoProgress.DownloadedBytes
				}
			}
			if p.AudioProgress.Expected {
				p.AudioProgress.Status = "completed"
				p.AudioProgress.Progress = 100
				p.AudioProgress.Speed = 0
				p.AudioProgress.ETA = nil
				if p.AudioProgress.TotalBytes > 0 {
					p.AudioProgress.DownloadedBytes = p.AudioProgress.TotalBytes
				} else if p.AudioProgress.DownloadedBytes > 0 {
					p.AudioProgress.TotalBytes = p.AudioProgress.DownloadedBytes
				}
			}
			p.RecalculateAggregate()
			p.Progress = 100
		}
	})
}

func (w *Worker) collectResults(dp *store.DownloadProgress) {
	var paths []string
	truncated := false
	_ = filepath.WalkDir(w.DlDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		switch strings.ToLower(filepath.Ext(path)) {
		case ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv", ".gif", ".m4v", ".ts", ".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".alac", ".srt", ".vtt", ".ass", ".lrc", ".jpg", ".jpeg", ".png", ".webp", ".json", ".description":
			if len(paths) < 5000 {
				paths = append(paths, path)
			} else {
				truncated = true
			}
		}
		return nil
	})
	sort.Strings(paths)
	dp.Update(func(p *store.DownloadProgress) {
		p.Paths = paths
		p.Files = nil
		for i, path := range paths {
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				p.Files = append(p.Files, store.ResultFile{Index: i, Name: filepath.Base(path), Size: info.Size()})
			}
		}
		if len(paths) == 1 {
			p.Filename = &paths[0]
		}
		if truncated {
			p.AddLogLocked("Result links are limited to 5000 files per job; additional files remain in the job directory")
		}
	})
}

// processLine handles one complete line from either yt-dlp output stream.
func (w *Worker) processLine(dp *store.DownloadProgress, line string, isStderr bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return
	}
	if strings.HasPrefix(line, finalPathPrefix) {
		var finalPath string
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, finalPathPrefix)), &finalPath); err == nil && finalPath != "" {
			dp.Update(func(p *store.DownloadProgress) { p.Filename = &finalPath })
		}
		return
	}

	// Attempt to extract JSON progress from this line.
	if start := strings.Index(line, "{"); start != -1 {
		if end := strings.LastIndex(line, "}"); end > start {
			jsonSlice := line[start : end+1]
			if strings.Contains(jsonSlice, `"status"`) && HandleProgress(dp, []byte(jsonSlice)) {
				return // structured progress is surfaced in the progress fields
			}
		}
	}

	if isStderr {
		// yt-dlp writes both recoverable diagnostics and terminal errors to
		// stderr. Keep the text for the user, but let process exit determine
		// whether the job has actually failed.
		dp.AddLog("STDERR: " + line)
	} else {
		dp.AddLog(line)
	}
}

// fail marks the download as failed with a given error message.
func (w *Worker) fail(dp *store.DownloadProgress, errMsg string) {
	now := time.Now()
	dp.Update(func(p *store.DownloadProgress) {
		if store.Terminal(p.Status) {
			return
		}
		p.Status = "failed"
		errCopy := errMsg // avoid closure-capture of errMsg arg by reference
		p.Error = &errCopy
		p.AddLogLocked(errMsg)
		p.CompletedAt = &now
		p.MarkIncompleteStreams("failed")
	})
}

func (w *Worker) failCancelled(dp *store.DownloadProgress) {
	now := time.Now()
	dp.Update(func(p *store.DownloadProgress) {
		if p.Status == "completed" || p.Status == "failed" || p.Status == "cancelled" {
			return
		}
		p.Status = "cancelled"
		p.CompletedAt = &now
		p.AddLogLocked("Download was cancelled")
		p.MarkIncompleteStreams("cancelled")
	})
}
