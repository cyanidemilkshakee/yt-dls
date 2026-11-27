package store_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

func TestDurableHistoryRecoversInterruptedJobsAndBoundsLogs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "history.json")
	s, err := store.NewPersistentStore(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	dp := store.NewDownloadProgress("durable", true, true)
	dp.URL = "https://example.com/media?token=secret"
	dp.Secrets = []string{"password-value"}
	dp.RetryOptions = json.RawMessage(`{"url":"https://example.com/media","downloadMode":"both"}`)
	dp.Status = "downloading"
	dp.RetryNeedsURL = true
	s.Set("durable", dp)
	for range 300 {
		dp.AddLog("password-value https://example.com/media?token=secret " + strings.Repeat("x", 4096))
	}
	bytes := 0
	for _, line := range dp.GetLogs() {
		bytes += len(line)
		if strings.Contains(line, "password-value") || strings.Contains(line, "token=secret") {
			t.Fatal("secret in log")
		}
	}
	if bytes > 64<<10 {
		t.Fatal("log budget exceeded")
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(content), "token=secret") || strings.Contains(string(content), "password-value") {
		t.Fatal("secret persisted")
	}
	restored, err := store.NewPersistentStore(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	job, ok := restored.Get("durable")
	if !ok || job.Snapshot().Status != "failed" || !job.Snapshot().RetryNeedsURL || job.Snapshot().Error == nil {
		t.Fatal("interrupted job recovery failed")
	}
}

func TestHistoryTrimmingProtectsAnActiveBatch(t *testing.T) {
	s := store.NewProgressStore(nil)
	parent := store.NewDownloadProgress("parent", false, false)
	parent.Kind = "batch"
	parent.Children = []string{"child"}
	s.Set("parent", parent)
	child := store.NewDownloadProgress("child", false, false)
	child.Status = "completed"
	s.Set("child", child)
	s.TrimHistory(0)
	if _, ok := s.Get("child"); !ok {
		t.Fatal("active batch lost completed child")
	}
	parent.Update(func(p *store.DownloadProgress) { p.Status = "completed" })
	s.TrimHistory(0)
	if s.Count() != 0 {
		t.Fatal("terminal history not trimmed")
	}
}
func TestSnapshotsAreStableAndUpdatesOrdered(t *testing.T) {
	s := store.NewProgressStore(nil)
	timeValue := time.Unix(123, 0)
	for _, id := range []string{"c", "a", "b"} {
		dp := store.NewDownloadProgress(id, false, false)
		dp.QueuedAt = &timeValue
		s.Set(id, dp)
	}
	for range 50 {
		snapshots := s.SnapshotAll()
		if snapshots[0].DownloadID != "a" || snapshots[1].DownloadID != "b" {
			t.Fatal("unstable order")
		}
	}
	dp, _ := s.Get("a")
	var previous uint64
	dp.OnUpdate = func(snapshot store.ProgressSnapshot) {
		if snapshot.Version <= previous {
			t.Errorf("update order regressed")
		}
		previous = snapshot.Version
	}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 20 {
				dp.Update(func(p *store.DownloadProgress) { p.Progress++ })
			}
		}()
	}
	wg.Wait()
	if dp.Snapshot().Version != 400 {
		t.Fatal("lost update")
	}
}
func TestCorruptHistoryIsReportedWithoutOverwriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "history.json")
	_ = os.WriteFile(path, []byte("corrupt"), 0600)
	if _, err := store.NewPersistentStore(nil, path); err == nil {
		t.Fatal("corrupt history silently accepted")
	}
	content, _ := os.ReadFile(path)
	if string(content) != "corrupt" {
		t.Fatal("corrupt history overwritten")
	}
}
