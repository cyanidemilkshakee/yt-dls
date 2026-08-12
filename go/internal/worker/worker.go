package worker

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
)

var criticalErrors = []*regexp.Regexp{
	regexp.MustCompile(`(?i)video unavailable`),
	regexp.MustCompile(`(?i)video has been removed`),
	regexp.MustCompile(`(?i)this video is private`),
	regexp.MustCompile(`(?i)unsupported url`),
	regexp.MustCompile(`(?i)no video formats found`),
	regexp.MustCompile(`(?i)unable to download`),
	regexp.MustCompile(`(?i)http error`),
	regexp.MustCompile(`(?i)network is unreachable`),
	regexp.MustCompile(`(?i)connection timed out`),
	regexp.MustCompile(`(?i)403 forbidden`),
	regexp.MustCompile(`(?i)404 not found`),
	regexp.MustCompile(`(?i)500 internal server error`),
	regexp.MustCompile(`(?i)access denied`),
	regexp.MustCompile(`(?i)permission denied`),
	regexp.MustCompile(`(?i)disk full`),
	regexp.MustCompile(`(?i)no space left`),
}

// Worker executes a single yt-dlp download job and updates the ProgressStore.
type Worker struct {
	ID    string
	Opts  DownloadOptions
	DlDir string // resolved download directory
	Cfg   *config.Config
	Store *store.ProgressStore
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

	dp.Update(func(p *store.DownloadProgress) { p.Status = "starting" })

	res, err := BuildCommand(w.Opts, w.DlDir, w.Cfg)
	if err != nil {
		w.fail(dp, fmt.Sprintf("Failed to build command: %v", err))
		return
	}

	timeoutCtx, cancel := context.WithTimeout(dp.Context(), time.Duration(w.Cfg.MaxDownloadDurationMs)*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(timeoutCtx, res.Command[0], res.Command[1:]...)
	cmd.Dir = res.DownloadDirectory
	setSysProcAttr(cmd) // platform-specific: hide console window on Windows

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		w.fail(dp, fmt.Sprintf("Failed to create stdout pipe: %v", err))
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		w.fail(dp, fmt.Sprintf("Failed to create stderr pipe: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		w.fail(dp, fmt.Sprintf("Failed to start yt-dlp process: %v", err))
		return
	}

	dp.Update(func(p *store.DownloadProgress) { p.Status = "downloading" })

	// Wait for both stream readers to finish before calling cmd.Wait().
	// This is required by os/exec docs: reads must complete before Wait.
	var readerWg sync.WaitGroup
	readerWg.Add(2)
	go func() { defer readerWg.Done(); w.processOutput(dp, stdout, false) }()
	go func() { defer readerWg.Done(); w.processOutput(dp, stderr, true) }()
	readerWg.Wait()

	err = cmd.Wait()

	now := time.Now()
	dp.Update(func(p *store.DownloadProgress) {
		p.CompletedAt = &now
		p.Speed = 0
		p.ETA = nil

		switch {
		case timeoutCtx.Err() == context.DeadlineExceeded:
			p.Status = "failed"
			errStr := "Download timeout — process terminated"
			p.Error = &errStr
			p.AddLogLocked(errStr)
			p.MarkIncompleteStreams("failed")

		case dp.Context().Err() != nil:
			// Parent context cancelled — either graceful shutdown or user cancel
			p.Status = "cancelled"
			p.AddLogLocked("Download was cancelled")
			p.MarkIncompleteStreams("cancelled")

		case p.Status == "failed":
			// Already marked failed by a critical stderr line — enrich completedAt only
			// (error message was already set)
			if p.CompletedAt == nil {
				p.CompletedAt = &now
			}
			p.MarkIncompleteStreams("failed")

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
				}
			}
			if p.AudioProgress.Expected {
				p.AudioProgress.Status = "completed"
				p.AudioProgress.Progress = 100
				p.AudioProgress.Speed = 0
				p.AudioProgress.ETA = nil
				if p.AudioProgress.TotalBytes > 0 {
					p.AudioProgress.DownloadedBytes = p.AudioProgress.TotalBytes
				}
			}
		}
	})
}

// processOutput reads lines from pipe, attempts JSON progress parsing,
// detects critical errors on stderr, and logs everything else.
func (w *Worker) processOutput(dp *store.DownloadProgress, pipe io.Reader, isStderr bool) {
	scanner := bufio.NewScanner(pipe)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024) // allow up to 1 MB per line (yt-dlp JSON can be large)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Attempt to extract JSON progress from this line
		if start := strings.Index(line, "{"); start != -1 {
			if end := strings.LastIndex(line, "}"); end > start {
				jsonSlice := line[start : end+1]
				if strings.Contains(jsonSlice, `"status"`) {
					HandleProgress(dp, []byte(jsonSlice))
					if !isStderr {
						continue // stdout JSON consumed — don't double-log
					}
				}
			}
		}

		if isStderr {
			// FIX: copy the line value before the closure to avoid
			// capturing the loop variable by reference.
			lineCopy := line
			for _, re := range criticalErrors {
				if re.MatchString(lineCopy) {
					dp.Update(func(p *store.DownloadProgress) {
						p.Status = "failed"
						p.Error = &lineCopy // safe: lineCopy is captured, not re-used
						p.Speed = 0
						p.ETA = nil
					})
					break
				}
			}
			dp.AddLog("STDERR: " + line)
		} else {
			dp.AddLog(line)
		}
	}
}

// fail marks the download as failed with a given error message.
func (w *Worker) fail(dp *store.DownloadProgress, errMsg string) {
	now := time.Now()
	dp.Update(func(p *store.DownloadProgress) {
		p.Status = "failed"
		errCopy := errMsg // avoid closure-capture of errMsg arg by reference
		p.Error = &errCopy
		p.AddLogLocked(errMsg)
		p.CompletedAt = &now
		p.MarkIncompleteStreams("failed")
	})
}
