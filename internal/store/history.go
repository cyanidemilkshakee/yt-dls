package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/privacy"
)

type ResultFile struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	Size  int64  `json:"size"`
}
type BatchProgress struct {
	Total     int `json:"total"`
	Admitted  int `json:"admitted"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
	Cancelled int `json:"cancelled"`
}
type historyRecord struct {
	Snapshot        ProgressSnapshot `json:"snapshot"`
	Options         json.RawMessage  `json:"options,omitempty"`
	OutputDirectory string           `json:"output_directory,omitempty"`
	Paths           []string         `json:"paths,omitempty"`
	Logs            []string         `json:"logs,omitempty"`
}
type historyFile struct {
	Schema  int             `json:"schema"`
	Records []historyRecord `json:"records"`
}

func Terminal(status string) bool {
	return status == "completed" || status == "failed" || status == "cancelled"
}

// NewPersistentStore restores bounded, secret-free history. An interrupted
// process is never silently re-launched; the user can explicitly retry it.
func NewPersistentStore(eventBus *bus.Bus, path string) (*ProgressStore, error) {
	s := NewProgressStore(eventBus)
	s.path = path
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	file, err := os.Open(path)
	if err == nil {
		defer file.Close()
		var saved historyFile
		decoder := json.NewDecoder(io.LimitReader(file, 64<<20))
		if err = decoder.Decode(&saved); err != nil {
			return nil, fmt.Errorf("read history %s: %w", path, err)
		}
		if saved.Schema != 1 || len(saved.Records) > 1000 {
			return nil, fmt.Errorf("unsupported or oversized history: %s", path)
		}
		for _, record := range saved.Records {
			snap := record.Snapshot
			dp := NewDownloadProgress(snap.DownloadID, snap.VideoProgress.Expected, snap.AudioProgress.Expected)
			dp.Version = snap.Version
			dp.URL = snap.URL
			dp.Thumbnail = snap.Thumbnail
			dp.Status = snap.Status
			dp.Progress = snap.Progress
			dp.DownloadedBytes = snap.DownloadedBytes
			dp.TotalBytes = snap.TotalBytes
			dp.Filename = snap.Filename
			dp.Error = snap.Error
			dp.StartedAt = snap.StartedAt
			dp.QueuedAt = snap.QueuedAt
			dp.CompletedAt = snap.CompletedAt
			dp.VideoProgress = snap.VideoProgress
			dp.AudioProgress = snap.AudioProgress
			dp.Streams = snap.Streams
			dp.Kind = snap.Kind
			dp.Children = snap.Children
			dp.Batch = snap.Batch
			dp.Files = snap.Files
			dp.Paths = record.Paths
			dp.OutputDirectory = record.OutputDirectory
			dp.RetryOptions = record.Options
			dp.RetryNeedsURL = snap.RetryNeedsURL
			for _, line := range record.Logs {
				dp.AddLogLocked(line)
			}
			if !Terminal(dp.Status) {
				now := time.Now()
				message := "Server restarted while this job was active. Retry to start a new isolated job."
				dp.Status = "failed"
				dp.Error = &message
				dp.CompletedAt = &now
				dp.MarkIncompleteStreams("failed")
				dp.Version++
			}
			s.Set(dp.DownloadID, dp)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	s.dirty = make(chan struct{}, 1)
	s.stop = make(chan struct{})
	s.done = make(chan struct{})
	go s.persistLoop()
	s.changed()
	return s, nil
}

func (s *ProgressStore) changed() {
	if s.dirty != nil {
		select {
		case s.dirty <- struct{}{}:
		default:
		}
	}
}

func (s *ProgressStore) persistLoop() {
	defer close(s.done)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	dirty := false
	for {
		select {
		case <-s.dirty:
			dirty = true
		case <-ticker.C:
			if dirty {
				s.recordError(s.Flush())
				dirty = false
			}
		case <-s.stop:
			s.recordError(s.Flush())
			return
		}
	}
}

func (s *ProgressStore) recordError(err error) { s.errMu.Lock(); s.persistErr = err; s.errMu.Unlock() }
func (s *ProgressStore) PersistenceError() error {
	s.errMu.RLock()
	defer s.errMu.RUnlock()
	return s.persistErr
}

// Flush uses an atomic replacement so a crash leaves either complete version.
func (s *ProgressStore) Flush() error {
	if s.path == "" {
		return nil
	}
	s.TrimHistory(200)
	saved := historyFile{Schema: 1, Records: make([]historyRecord, 0)}
	s.mu.RLock()
	for _, dp := range s.data {
		dp.mu.RLock()
		snap := dp.snapshotLocked()
		snap.URL = privacy.URL(snap.URL)
		snap.Thumbnail = privacy.URL(snap.Thumbnail)
		logs := append([]string(nil), dp.Log...)
		// Logs are useful during execution; only the last 16 lines survive a restart.
		if len(logs) > 16 {
			logs = logs[len(logs)-16:]
		}
		saved.Records = append(saved.Records, historyRecord{Snapshot: snap, Options: append(json.RawMessage(nil), dp.RetryOptions...), OutputDirectory: dp.OutputDirectory, Paths: append([]string(nil), dp.Paths...), Logs: logs})
		dp.mu.RUnlock()
	}
	s.mu.RUnlock()
	bytes, err := json.Marshal(saved)
	if err != nil {
		return err
	}
	if len(bytes) > 64<<20 {
		return fmt.Errorf("history exceeded 64 MiB budget")
	}
	temp, err := os.CreateTemp(filepath.Dir(s.path), ".history-*")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err = temp.Chmod(0600); err == nil {
		_, err = temp.Write(bytes)
	}
	if err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, s.path)
}

func (s *ProgressStore) TrimHistory(limit int) {
	snapshots := s.SnapshotAll()
	protected := make(map[string]bool)
	for _, snap := range snapshots {
		if snap.Kind == "batch" && !Terminal(snap.Status) {
			for _, id := range snap.Children {
				protected[id] = true
			}
		}
	}
	terminal := 0
	for _, snap := range snapshots {
		if Terminal(snap.Status) && !protected[snap.DownloadID] {
			terminal++
			if terminal > limit {
				s.Delete(snap.DownloadID)
			}
		}
	}
}

func (s *ProgressStore) ActiveBatchContains(id string) bool {
	for _, snap := range s.SnapshotAll() {
		if snap.Kind == "batch" && !Terminal(snap.Status) {
			for _, child := range snap.Children {
				if child == id {
					return true
				}
			}
		}
	}
	return false
}
func (s *ProgressStore) Count() int { s.mu.RLock(); defer s.mu.RUnlock(); return len(s.data) }
func (dp *DownloadProgress) RetryData() (json.RawMessage, bool) {
	dp.mu.RLock()
	defer dp.mu.RUnlock()
	return append(json.RawMessage(nil), dp.RetryOptions...), dp.RetryNeedsURL
}
func (dp *DownloadProgress) File(index int) (string, string, bool) {
	dp.mu.RLock()
	defer dp.mu.RUnlock()
	if index < 0 || index >= len(dp.Paths) || dp.Paths[index] == "" {
		return "", "", false
	}
	return dp.Paths[index], dp.OutputDirectory, true
}

// Close is called once, after workers have stopped, to flush final statuses.
func (s *ProgressStore) Close() error {
	if s.stop != nil {
		close(s.stop)
		<-s.done
	}
	return s.PersistenceError()
}
