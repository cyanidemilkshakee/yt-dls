package store

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/privacy"
)

type StreamProgress struct {
	ID              string  `json:"id,omitempty"`
	Kind            string  `json:"kind,omitempty"`
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
	Version         uint64                    `json:"version"`
	QueuedAt        *time.Time                `json:"queued_at,omitempty"`
	Streams         map[string]StreamProgress `json:"streams,omitempty"`
	Files           []ResultFile              `json:"files,omitempty"`
	Kind            string                    `json:"kind,omitempty"`
	Children        []string                  `json:"children,omitempty"`
	Batch           *BatchProgress            `json:"batch,omitempty"`
	RetryNeedsURL   bool                      `json:"retry_needs_url,omitempty"`
	DownloadID      string                    `json:"download_id"`
	URL             string                    `json:"url,omitempty"`
	Thumbnail       string                    `json:"thumbnail,omitempty"`
	Status          string                    `json:"status"`
	Progress        float64                   `json:"progress"`
	Speed           float64                   `json:"speed"`
	ETA             *int64                    `json:"eta"`
	DownloadedBytes int64                     `json:"downloaded_bytes"`
	TotalBytes      int64                     `json:"total_bytes"`
	Filename        *string                   `json:"filename"`
	Error           *string                   `json:"error"`
	StartedAt       *time.Time                `json:"started_at,omitempty"`
	CompletedAt     *time.Time                `json:"completed_at,omitempty"`
	VideoProgress   StreamProgress            `json:"video_progress"`
	AudioProgress   StreamProgress            `json:"audio_progress"`
}

// noCopy is a zero-size sentinel that prevents DownloadProgress from being
// accidentally copied (go vet -copylocks will flag any copy of noCopy).
type noCopy struct{}

func (*noCopy) Lock()   {}
func (*noCopy) Unlock() {}

// DownloadProgress represents the mutable state of a download.
type DownloadProgress struct {
	// FilesMu excludes cleanup/history removal while a worker or file response owns this directory.
	FilesMu         sync.RWMutex
	_noCopy         noCopy // go vet guard against value-copy
	mu              sync.RWMutex
	notifyMu        sync.Mutex
	Version         uint64
	QueuedAt        *time.Time
	Streams         map[string]StreamProgress
	Files           []ResultFile
	Paths           []string
	OutputDirectory string
	RetryOptions    json.RawMessage
	RetryNeedsURL   bool
	Kind            string
	Children        []string
	Batch           *BatchProgress
	Secrets         []string

	DownloadID      string
	URL             string
	Thumbnail       string
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
		QueuedAt:   &now,
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

const maxLogLines = 200
const maxLogBytes = 64 << 10

// AddLogLocked appends a log line WITHOUT acquiring the lock.
// It MUST only be called when the caller already holds dp.mu (i.e. inside an Update callback).
// FIX: previous implementation used copy+truncate which left a duplicate of the
// last entry. Now we drop the oldest line first, then append.
func (dp *DownloadProgress) AddLogLocked(msg string) {
	msg = privacy.Text(msg, dp.Secrets...)
	if len(msg) > 4096 {
		msg = strings.ToValidUTF8(msg[:4096], "") + "… [truncated]"
	}
	dp.Log = append(dp.Log, msg)
	bytes := 0
	for _, line := range dp.Log {
		bytes += len(line)
	}
	for len(dp.Log) > maxLogLines || bytes > maxLogBytes {
		bytes -= len(dp.Log[0])
		dp.Log[0] = ""
		dp.Log = dp.Log[1:]
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
		Version: dp.Version, QueuedAt: dp.QueuedAt, Kind: dp.Kind, RetryNeedsURL: dp.RetryNeedsURL,
		Files: append([]ResultFile(nil), dp.Files...), Children: append([]string(nil), dp.Children...),
		DownloadID:      dp.DownloadID,
		URL:             dp.URL,
		Thumbnail:       dp.Thumbnail,
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
	if dp.Batch != nil {
		batch := *dp.Batch
		snap.Batch = &batch
	}
	if len(dp.Streams) > 0 {
		snap.Streams = make(map[string]StreamProgress, len(dp.Streams))
		for id, s := range dp.Streams {
			snap.Streams[id] = s
		}
	}

	snap.VideoProgress.Progress = clamp(snap.VideoProgress.Progress)
	snap.AudioProgress.Progress = clamp(snap.AudioProgress.Progress)

	return snap
}

// Update mutates the progress based on a callback. The callback runs while
// the write-lock is held, so it MUST use AddLogLocked (not AddLog) for logging.
func (dp *DownloadProgress) Update(fn func(dp *DownloadProgress)) {
	// Serialize mutation and notification together so subscribers never receive
	// an older snapshot after a newer snapshot of the same job.
	dp.notifyMu.Lock()
	defer dp.notifyMu.Unlock()
	dp.mu.Lock()
	fn(dp)
	if dp.Error != nil {
		value := privacy.Text(*dp.Error, dp.Secrets...)
		dp.Error = &value
	}
	dp.Version++
	snap := dp.snapshotLocked()
	dp.mu.Unlock()

	if dp.OnUpdate != nil {
		dp.OnUpdate(snap)
	}
}

// RecalculateAggregate recalculates top-level progress from streams.
// Must be called inside an Update block.
func (dp *DownloadProgress) RecalculateAggregate() {
	if len(dp.Streams) > 0 {
		var total, downloaded int64
		var progress float64
		allKnown, video, audio := true, false, false
		for _, stream := range dp.Streams {
			total += stream.TotalBytes
			downloaded += stream.DownloadedBytes
			progress += stream.Progress
			if stream.TotalBytes <= 0 {
				allKnown = false
			}
			if stream.Kind == "video" || stream.Kind == "combined" {
				video = true
			}
			if stream.Kind == "audio" || stream.Kind == "combined" {
				audio = true
			}
		}
		dp.TotalBytes, dp.DownloadedBytes = total, downloaded
		count := len(dp.Streams)
		if dp.VideoProgress.Expected && !video {
			count++
			allKnown = false
		}
		if dp.AudioProgress.Expected && !audio {
			count++
			allKnown = false
		}
		if allKnown && total > 0 {
			dp.Progress = clamp(float64(downloaded) / float64(total) * 100)
		} else {
			dp.Progress = clamp(progress / float64(count))
		}
		return
	}
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
	for id, stream := range dp.Streams {
		if stream.Status != "completed" {
			stream.Status = status
			stream.Speed = 0
			stream.ETA = nil
			dp.Streams[id] = stream
		}
	}
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
//
// Uses a RWMutex-protected plain map instead of sync.Map.  Active downloads
// fire progress updates every few hundred milliseconds (many writes per key),
// which is the exact workload where sync.Map's read-optimised design is
// counter-productive.
type ProgressStore struct {
	mu         sync.RWMutex
	data       map[string]*DownloadProgress
	eventBus   *bus.Bus
	path       string
	dirty      chan struct{}
	stop       chan struct{}
	done       chan struct{}
	errMu      sync.RWMutex
	persistErr error
}

func NewProgressStore(eventBus *bus.Bus) *ProgressStore {
	return &ProgressStore{
		data:     make(map[string]*DownloadProgress),
		eventBus: eventBus,
	}
}

func (s *ProgressStore) Set(id string, dp *DownloadProgress) {
	dp.OnUpdate = func(snap ProgressSnapshot) {
		if s.eventBus != nil {
			s.eventBus.Publish(bus.Event{
				Type:       bus.EventProgress,
				DownloadID: id,
				Data:       snap,
			})
		}
		s.changed()
	}
	s.mu.Lock()
	s.data[id] = dp
	s.mu.Unlock()
	s.changed()
}

func (s *ProgressStore) Get(id string) (*DownloadProgress, bool) {
	s.mu.RLock()
	dp, ok := s.data[id]
	s.mu.RUnlock()
	return dp, ok
}

func (s *ProgressStore) Delete(id string) {
	s.mu.Lock()
	delete(s.data, id)
	s.mu.Unlock()
	s.changed()
	if s.eventBus != nil {
		s.eventBus.Publish(bus.Event{Type: bus.EventResync})
	}
}

func (dp *DownloadProgress) OutputRoot() string {
	dp.mu.RLock()
	defer dp.mu.RUnlock()
	return dp.OutputDirectory
}

// CleanupOldDownloads removes terminal downloads older than maxAge.
// Collects candidates under a read lock, then removes them under a write lock
// to keep the critical section as short as possible.
func (s *ProgressStore) CleanupOldDownloads(maxAge time.Duration) int {
	now := time.Now()
	protected := make(map[string]bool)
	for _, snap := range s.SnapshotAll() {
		if snap.Kind == "batch" && !Terminal(snap.Status) {
			for _, id := range snap.Children {
				protected[id] = true
			}
		}
	}

	s.mu.RLock()
	var toRemove []string
	for id, dp := range s.data {
		if protected[id] {
			continue
		}
		snap := dp.Snapshot()
		if snap.Status == "completed" || snap.Status == "failed" || snap.Status == "cancelled" {
			refTime := snap.StartedAt
			if snap.CompletedAt != nil {
				refTime = snap.CompletedAt
			}
			if refTime != nil && now.Sub(*refTime) > maxAge {
				toRemove = append(toRemove, id)
			}
		}
	}
	s.mu.RUnlock()

	if len(toRemove) == 0 {
		return 0
	}

	s.mu.Lock()
	for _, id := range toRemove {
		delete(s.data, id)
	}
	s.mu.Unlock()
	s.changed()

	return len(toRemove)
}

// SnapshotAll returns snapshots of all downloads in the store.
func (s *ProgressStore) SnapshotAll() []ProgressSnapshot {
	s.mu.RLock()
	out := make([]ProgressSnapshot, 0, len(s.data))
	for _, dp := range s.data {
		out = append(out, dp.Snapshot())
	}
	s.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i].QueuedAt, out[j].QueuedAt
		if a != nil && b != nil && !a.Equal(*b) {
			return a.After(*b)
		}
		return out[i].DownloadID < out[j].DownloadID
	})
	return out
}
