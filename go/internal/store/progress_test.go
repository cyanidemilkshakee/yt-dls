package store_test

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
)

// ─── DownloadProgress ────────────────────────────────────────────────────────

func TestNewDownloadProgress_videoAudio(t *testing.T) {
	dp := store.NewDownloadProgress("id-1", true, true)

	snap := dp.Snapshot()
	if snap.Status != "initializing" {
		t.Errorf("initial status = %q, want initializing", snap.Status)
	}
	if !snap.VideoProgress.Expected {
		t.Error("video expected = false, want true")
	}
	if snap.VideoProgress.Status != "waiting" {
		t.Errorf("video status = %q, want waiting", snap.VideoProgress.Status)
	}
	if !snap.AudioProgress.Expected {
		t.Error("audio expected = false, want true")
	}
	if snap.AudioProgress.Status != "waiting" {
		t.Errorf("audio status = %q, want waiting", snap.AudioProgress.Status)
	}
}

func TestNewDownloadProgress_audioOnly(t *testing.T) {
	dp := store.NewDownloadProgress("id-2", false, true)
	snap := dp.Snapshot()
	if snap.VideoProgress.Status != "not_requested" {
		t.Errorf("video status = %q, want not_requested", snap.VideoProgress.Status)
	}
	if snap.AudioProgress.Status != "waiting" {
		t.Errorf("audio status = %q, want waiting", snap.AudioProgress.Status)
	}
}

// ─── AddLog / GetLogs ─────────────────────────────────────────────────────────

func TestAddLog_basic(t *testing.T) {
	dp := store.NewDownloadProgress("id-log", true, false)

	dp.AddLog("line 1")
	dp.AddLog("line 2")

	logs := dp.GetLogs()
	if len(logs) != 2 {
		t.Fatalf("len(logs) = %d, want 2", len(logs))
	}
	if logs[0] != "line 1" || logs[1] != "line 2" {
		t.Errorf("unexpected logs: %v", logs)
	}
}

func TestAddLog_ringBuffer(t *testing.T) {
	dp := store.NewDownloadProgress("id-ring", true, false)

	// Add 210 lines — ring buffer caps at 200
	for i := range 210 {
		dp.AddLog(fmt.Sprintf("line %d", i))
	}

	logs := dp.GetLogs()
	if len(logs) != 200 {
		t.Fatalf("ring buffer size = %d, want 200", len(logs))
	}
	// Oldest retained should be "line 10" (0-9 were evicted)
	if logs[0] != "line 10" {
		t.Errorf("first retained log = %q, want %q", logs[0], "line 10")
	}
	// Last should be "line 209"
	if logs[199] != "line 209" {
		t.Errorf("last log = %q, want %q", logs[199], "line 209")
	}
}

func TestAddLog_concurrentSafe(t *testing.T) {
	dp := store.NewDownloadProgress("id-concurrent", true, false)

	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			dp.AddLog("concurrent line")
		}()
	}
	wg.Wait()

	logs := dp.GetLogs()
	if len(logs) == 0 {
		t.Error("expected at least one log entry")
	}
}

// ─── Clamp ────────────────────────────────────────────────────────────────────

func TestSnapshot_clampProgress(t *testing.T) {
	dp := store.NewDownloadProgress("id-clamp", true, false)

	// Set progress to values outside [0,100] via Update
	dp.Update(func(p *store.DownloadProgress) {
		p.Progress = 150
		p.VideoProgress.Progress = -5
	})

	snap := dp.Snapshot()
	if snap.Progress != 100 {
		t.Errorf("clamped progress = %v, want 100", snap.Progress)
	}
	if snap.VideoProgress.Progress != 0 {
		t.Errorf("clamped video progress = %v, want 0", snap.VideoProgress.Progress)
	}
}

// ─── RecalculateAggregate ─────────────────────────────────────────────────────

func TestRecalculateAggregate_bothKnown(t *testing.T) {
	dp := store.NewDownloadProgress("id-agg", true, true)

	dp.Update(func(p *store.DownloadProgress) {
		p.VideoProgress.TotalBytes = 1000
		p.VideoProgress.DownloadedBytes = 500
		p.VideoProgress.Progress = 50
		p.AudioProgress.TotalBytes = 500
		p.AudioProgress.DownloadedBytes = 250
		p.AudioProgress.Progress = 50
		p.RecalculateAggregate()
	})

	snap := dp.Snapshot()
	// totalBytes = 1500, downloadedBytes = 750 → 50%
	if snap.TotalBytes != 1500 {
		t.Errorf("total bytes = %d, want 1500", snap.TotalBytes)
	}
	if snap.DownloadedBytes != 750 {
		t.Errorf("downloaded bytes = %d, want 750", snap.DownloadedBytes)
	}
	if snap.Progress != 50 {
		t.Errorf("aggregate progress = %v, want 50", snap.Progress)
	}
}

func TestRecalculateAggregate_unknownTotal(t *testing.T) {
	dp := store.NewDownloadProgress("id-agg-unknown", true, true)

	dp.Update(func(p *store.DownloadProgress) {
		// totalBytes unknown (0) — fall back to average of progress values
		p.VideoProgress.TotalBytes = 0
		p.VideoProgress.Progress = 40
		p.AudioProgress.TotalBytes = 0
		p.AudioProgress.Progress = 60
		p.RecalculateAggregate()
	})

	snap := dp.Snapshot()
	if snap.Progress != 50 { // (40 + 60) / 2
		t.Errorf("fallback progress = %v, want 50", snap.Progress)
	}
}

func TestRecalculateAggregate_combined(t *testing.T) {
	dp := store.NewDownloadProgress("id-agg-combined", true, true)

	dp.Update(func(p *store.DownloadProgress) {
		// Both streams are combined — only one stream's data counted
		p.VideoProgress.Combined = true
		p.AudioProgress.Combined = true
		p.VideoProgress.TotalBytes = 2000
		p.VideoProgress.DownloadedBytes = 1000
		p.VideoProgress.Progress = 50
		p.AudioProgress.TotalBytes = 2000
		p.AudioProgress.DownloadedBytes = 2000
		p.AudioProgress.Progress = 100
		p.RecalculateAggregate()
	})

	snap := dp.Snapshot()
	// Only first stream (video) counted
	if snap.TotalBytes != 2000 {
		t.Errorf("combined total bytes = %d, want 2000", snap.TotalBytes)
	}
}

// ─── MarkIncompleteStreams ─────────────────────────────────────────────────────

func TestMarkIncompleteStreams(t *testing.T) {
	dp := store.NewDownloadProgress("id-mark", true, true)

	dp.Update(func(p *store.DownloadProgress) {
		p.VideoProgress.Status = "downloading"
		p.AudioProgress.Status = "completed"
		p.MarkIncompleteStreams("cancelled")
	})

	snap := dp.Snapshot()
	if snap.VideoProgress.Status != "cancelled" {
		t.Errorf("video status = %q, want cancelled", snap.VideoProgress.Status)
	}
	// Completed stream should NOT be changed
	if snap.AudioProgress.Status != "completed" {
		t.Errorf("audio status = %q, want completed (should not be touched)", snap.AudioProgress.Status)
	}
}

// ─── ProgressStore ────────────────────────────────────────────────────────────

func TestProgressStore_SetGetDelete(t *testing.T) {
	s := store.NewProgressStore(nil)

	dp := store.NewDownloadProgress("x", true, false)
	s.Set("x", dp)

	got, ok := s.Get("x")
	if !ok || got == nil {
		t.Fatal("Get returned nothing after Set")
	}
	if got.Snapshot().DownloadID != "x" {
		t.Errorf("download id mismatch")
	}

	s.Delete("x")
	_, ok = s.Get("x")
	if ok {
		t.Error("Get returned entry after Delete")
	}
}

func TestProgressStore_CleanupOldDownloads(t *testing.T) {
	s := store.NewProgressStore(nil)

	// Create a download that is already completed and older than maxAge
	dpOld := store.NewDownloadProgress("old", true, false)
	dpOld.Update(func(p *store.DownloadProgress) {
		p.Status = "completed"
		old := time.Now().Add(-2 * time.Hour)
		p.CompletedAt = &old
	})
	s.Set("old", dpOld)

	// Create a download that completed recently — should NOT be cleaned up
	dpNew := store.NewDownloadProgress("new", true, false)
	dpNew.Update(func(p *store.DownloadProgress) {
		p.Status = "completed"
		recent := time.Now()
		p.CompletedAt = &recent
	})
	s.Set("new", dpNew)

	// Create an active download — should NOT be cleaned up
	dpActive := store.NewDownloadProgress("active", true, false)
	dpActive.Update(func(p *store.DownloadProgress) {
		p.Status = "downloading"
	})
	s.Set("active", dpActive)

	removed := s.CleanupOldDownloads(1 * time.Hour)
	if removed != 1 {
		t.Errorf("removed %d, want 1", removed)
	}

	if _, ok := s.Get("old"); ok {
		t.Error("old download still present after cleanup")
	}
	if _, ok := s.Get("new"); !ok {
		t.Error("new download should still be present")
	}
	if _, ok := s.Get("active"); !ok {
		t.Error("active download should still be present")
	}
}

func TestProgressStore_ConcurrentAccess(t *testing.T) {
	s := store.NewProgressStore(nil)

	var wg sync.WaitGroup
	const N = 100

	// Concurrent writers
	for i := range N {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("dl-%d", i)
			dp := store.NewDownloadProgress(id, true, false)
			s.Set(id, dp)
		}(i)
	}

	// Concurrent readers (some IDs may not exist yet — that's fine)
	for i := range N {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := fmt.Sprintf("dl-%d", i)
			if dp, ok := s.Get(id); ok {
				_ = dp.Snapshot()
			}
		}(i)
	}

	wg.Wait()
}

// ─── AddLogLocked inside Update (deadlock regression) ─────────────────────────

func TestAddLogLocked_insideUpdate_noDeadlock(t *testing.T) {
	dp := store.NewDownloadProgress("id-deadlock-check", true, false)

	done := make(chan struct{})
	go func() {
		dp.Update(func(p *store.DownloadProgress) {
			p.Status = "failed"
			p.AddLogLocked("error from inside Update")
		})
		close(done)
	}()

	select {
	case <-done:
		// OK — no deadlock
	case <-time.After(2 * time.Second):
		t.Fatal("DEADLOCK: AddLogLocked inside Update did not return in 2s")
	}

	logs := dp.GetLogs()
	if len(logs) != 1 || logs[0] != "error from inside Update" {
		t.Errorf("unexpected logs: %v", logs)
	}
}
