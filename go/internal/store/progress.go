package store

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/bus"
)

type StreamProgress struct {
	Expected        bool    `json:"expected"`
	Combined        bool    `json:"combined"`
	Status          string  `json:"status"`
	Progress        float64 `json:"progress"`
	Speed           float64 `json:"speed"`
	ETA             *int64  `json:"eta"`
	DownloadedBytes int64   `json:"downloadedBytes"` // matches frontend
	TotalBytes      int64   `json:"totalBytes"`      // matches frontend
}

// ProgressSnapshot is a thread-safe snapshot of the current progress state,
// suitable for JSON serialization and sending to SSE clients.
type ProgressSnapshot struct {
	DownloadID      string         `json:"download_id"`
	URL             string         `json:"url,omitempty"`
	Status          string         `json:"status"`
	Progress        float64        `json:"progress"`
	Speed           float64        `json:"speed"`
	ETA             *int64         `json:"eta"`
	DownloadedBytes int64          `json:"downloaded_bytes"`
	TotalBytes      int64          `json:"total_bytes"`
	Filename        *string        `json:"filename"`
	Error           *string        `json:"error"`
	StartedAt       *time.Time     `json:"started_at,omitempty"`
	CompletedAt     *time.Time     `json:"completed_at,omitempty"`
	VideoProgress   StreamProgress `json:"video_progress"`
	AudioProgress   StreamProgress `json:"audio_progress"`
}

// noCopy is a zero-size sentinel that prevents DownloadProgress from being
// accidentally copied (go vet -copylocks will flag any copy of noCopy).
type noCopy struct{}

func (*noCopy) Lock()   {}
func (*noCopy) Unlock() {}

// DownloadProgress represents the mutable state of a download.
type DownloadProgress struct {
	_noCopy noCopy // go vet guard against value-copy
	mu      sync.RWMutex

	DownloadID      string
	URL             string
	Status          string
	Progress        float64
	Speed           float64
	ETA             *int64
	DownloadedBytes int64
	TotalBytes      int64
	Filename        *string
	Error           *string
	StartedAt       *time.Time
	CompletedAt     *time.Time
	VideoProgress   StreamProgress
	AudioProgress   StreamProgress

	Log []string

	// OnUpdate is called after every Update with a snapshot of the new state.
	OnUpdate func(snap ProgressSnapshot)

	ctx    context.Context
	cancel context.CancelFunc
}

// NewDownloadProgress initializes a new DownloadProgress.
func NewDownloadProgress(downloadID string, expectedVideo, expectedAudio bool) *DownloadProgress {
	now := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	dp := &DownloadProgress{
		DownloadID: downloadID,
		Status:     "initializing",
		StartedAt:  &now,
		Log:        make([]string, 0, 200),
		ctx:        ctx,
		cancel:     cancel,
	}

	dp.VideoProgress.Expected = expectedVideo
	if expectedVideo {
		dp.VideoProgress.Status = "waiting"
	} else {
		dp.VideoProgress.Status = "not_requested"
	}

	dp.AudioProgress.Expected = expectedAudio
	if expectedAudio {
		dp.AudioProgress.Status = "waiting"
	} else {
		dp.AudioProgress.Status = "not_requested"
	}

	return dp
}

// Context returns the cancellation context for this download.
func (dp *DownloadProgress) Context() context.Context {
	return dp.ctx
}

// Cancel aborts the download context.
func (dp *DownloadProgress) Cancel() {
	dp.cancel()
}

// AddLogLocked appends a log line WITHOUT acquiring the lock.
// It MUST only be called when the caller already holds dp.mu (i.e. inside an Update callback).
func (dp *DownloadProgress) AddLogLocked(msg string) {
	dp.Log = append(dp.Log, msg)
	if len(dp.Log) > 200 {
		copy(dp.Log, dp.Log[1:])
		dp.Log = dp.Log[:200]
	}
}

// AddLog safely appends a log line (acquires the write-lock).
// Do NOT call this from inside an Update callback — use AddLogLocked instead.
func (dp *DownloadProgress) AddLog(msg string) {
	dp.mu.Lock()
	dp.AddLogLocked(msg)
	dp.mu.Unlock()
}

// GetLogs returns a copy of the current logs.
func (dp *DownloadProgress) GetLogs() []string {
	dp.mu.RLock()
	defer dp.mu.RUnlock()

	out := make([]string, len(dp.Log))
	copy(out, dp.Log)
	return out
}

func clamp(v float64) float64 {
	if math.IsNaN(v) {
		return 0
	}
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// Snapshot returns a point-in-time copy of the progress data.
func (dp *DownloadProgress) Snapshot() ProgressSnapshot {
	dp.mu.RLock()
	defer dp.mu.RUnlock()
	return dp.snapshotLocked()
}

// snapshotLocked creates a snapshot while the lock is already held.
func (dp *DownloadProgress) snapshotLocked() ProgressSnapshot {
	snap := ProgressSnapshot{
		DownloadID:      dp.DownloadID,
		URL:             dp.URL,
		Status:          dp.Status,
		Progress:        clamp(dp.Progress),
		Speed:           dp.Speed,
		ETA:             dp.ETA,
		DownloadedBytes: dp.DownloadedBytes,
		TotalBytes:      dp.TotalBytes,
		Filename:        dp.Filename,
		Error:           dp.Error,
		StartedAt:       dp.StartedAt,
		CompletedAt:     dp.CompletedAt,
		VideoProgress:   dp.VideoProgress,
		AudioProgress:   dp.AudioProgress,
	}

	snap.VideoProgress.Progress = clamp(snap.VideoProgress.Progress)
	snap.AudioProgress.Progress = clamp(snap.AudioProgress.Progress)

	return snap
}

// Update mutates the progress based on a callback. The callback runs while
// the write-lock is held, so it MUST use AddLogLocked (not AddLog) for logging.
func (dp *DownloadProgress) Update(fn func(dp *DownloadProgress)) {
	dp.mu.Lock()
	fn(dp)
	snap := dp.snapshotLocked()
	dp.mu.Unlock()

	if dp.OnUpdate != nil {
		dp.OnUpdate(snap)
	}
}

// RecalculateAggregate recalculates top-level progress from streams.
// Must be called inside an Update block.
func (dp *DownloadProgress) RecalculateAggregate() {
	var streams []*StreamProgress
	if dp.VideoProgress.Expected {
		streams = append(streams, &dp.VideoProgress)
	}
	if dp.AudioProgress.Expected {
		streams = append(streams, &dp.AudioProgress)
	}

	if len(streams) == 0 {
		return
	}

	allCombined := true
	for _, s := range streams {
		if !s.Combined {
			allCombined = false
			break
		}
	}

	if len(streams) > 1 && allCombined {
		streams = streams[:1] // Just use the first one if they are combined
	}

	allTotalsKnown := true
	var totalBytes int64
	var downloadedBytes int64
	var progressSum float64

	for _, s := range streams {
		if s.TotalBytes <= 0 {
			allTotalsKnown = false
		}
		totalBytes += s.TotalBytes
		downloadedBytes += s.DownloadedBytes
		progressSum += s.Progress
	}

	dp.TotalBytes = totalBytes
	dp.DownloadedBytes = downloadedBytes

	if allTotalsKnown && totalBytes > 0 {
		dp.Progress = math.Min(100, (float64(downloadedBytes)/float64(totalBytes))*100)
	} else {
		dp.Progress = progressSum / float64(len(streams))
	}
}

// MarkIncompleteStreams sets the status of expected but non-completed streams.
// Must be called inside an Update block.
func (dp *DownloadProgress) MarkIncompleteStreams(status string) {
	if dp.VideoProgress.Expected && dp.VideoProgress.Status != "completed" {
		dp.VideoProgress.Status = status
		dp.VideoProgress.Speed = 0
		dp.VideoProgress.ETA = nil
	}
	if dp.AudioProgress.Expected && dp.AudioProgress.Status != "completed" {
		dp.AudioProgress.Status = status
		dp.AudioProgress.Speed = 0
		dp.AudioProgress.ETA = nil
	}
}

// ProgressStore manages all active and recently completed downloads.
type ProgressStore struct {
	data     sync.Map // map[string]*DownloadProgress
	eventBus *bus.Bus
}

func NewProgressStore(eventBus *bus.Bus) *ProgressStore {
	return &ProgressStore{
		eventBus: eventBus,
	}
}

func (s *ProgressStore) Set(id string, dp *DownloadProgress) {
	if s.eventBus != nil {
		dp.OnUpdate = func(snap ProgressSnapshot) {
			s.eventBus.Publish(bus.Event{
				Type:       bus.EventProgress,
				DownloadID: id,
				Data:       snap,
			})
		}
	}
	s.data.Store(id, dp)
}

func (s *ProgressStore) Get(id string) (*DownloadProgress, bool) {
	v, ok := s.data.Load(id)
	if !ok {
		return nil, false
	}
	return v.(*DownloadProgress), true
}

func (s *ProgressStore) Delete(id string) {
	s.data.Delete(id)
}

// CleanupOldDownloads removes terminal downloads older than maxAge.
func (s *ProgressStore) CleanupOldDownloads(maxAge time.Duration) int {
	now := time.Now()
	removed := 0

	s.data.Range(func(key, value interface{}) bool {
		id := key.(string)
		dp := value.(*DownloadProgress)

		snap := dp.Snapshot()
		if snap.Status == "completed" || snap.Status == "failed" || snap.Status == "cancelled" {
			refTime := snap.StartedAt
			if snap.CompletedAt != nil {
				refTime = snap.CompletedAt
			}
			
			if refTime != nil && now.Sub(*refTime) > maxAge {
				s.data.Delete(id)
				removed++
			}
		}
		return true
	})

	return removed
}

// SnapshotAll returns snapshots of all downloads in the store.
func (s *ProgressStore) SnapshotAll() []ProgressSnapshot {
	var out []ProgressSnapshot
	s.data.Range(func(key, value interface{}) bool {
		dp := value.(*DownloadProgress)
		out = append(out, dp.Snapshot())
		return true
	})
	return out
}
