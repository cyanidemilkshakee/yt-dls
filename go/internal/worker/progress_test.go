package worker_test

import (
	"encoding/json"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/worker"
)

// ─── ExpectedStreams ──────────────────────────────────────────────────────────

func TestExpectedStreams(t *testing.T) {
	tests := []struct {
		name          string
		opts          worker.DownloadOptions
		wantVideo     bool
		wantAudio     bool
	}{
		{"default", worker.DownloadOptions{}, true, true},
		{"extractAudio flag", worker.DownloadOptions{ExtractAudio: true}, false, true},
		{"mode=audio", worker.DownloadOptions{DownloadMode: "audio"}, false, true},
		{"mode=video", worker.DownloadOptions{DownloadMode: "video"}, true, false},
		{"mode=both", worker.DownloadOptions{DownloadMode: "both"}, true, true},
		{"format audio only", worker.DownloadOptions{FormatCode: "bestaudio"}, false, true},
		{"format video only", worker.DownloadOptions{FormatCode: "bestvideo"}, true, false},
		{"format merged", worker.DownloadOptions{FormatCode: "bestvideo+bestaudio"}, true, true},
		{"unknown format", worker.DownloadOptions{FormatCode: "best"}, true, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotV, gotA := worker.ExpectedStreams(tc.opts)
			if gotV != tc.wantVideo || gotA != tc.wantAudio {
				t.Errorf("ExpectedStreams() = video=%v audio=%v, want video=%v audio=%v",
					gotV, gotA, tc.wantVideo, tc.wantAudio)
			}
		})
	}
}

// ─── HandleProgress ──────────────────────────────────────────────────────────

func makeDP(video, audio bool) *store.DownloadProgress {
	return store.NewDownloadProgress("test-id", video, audio)
}

// jsonProgress builds a raw JSON progress object for testing.
func jsonProgress(fields map[string]any) []byte {
	b, _ := json.Marshal(fields)
	return b
}

func TestHandleProgress_downloading(t *testing.T) {
	dp := makeDP(true, true)

	pkt := jsonProgress(map[string]any{
		"status":           "downloading",
		"total_bytes":      float64(1000),
		"downloaded_bytes": float64(500),
		"speed":            float64(1024),
		"eta":              float64(30),
		"vcodec":           "h264",
		"acodec":           "aac",
	})

	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	if snap.Status != "downloading" {
		t.Errorf("status = %q, want downloading", snap.Status)
	}
	if snap.Progress != 50 {
		t.Errorf("progress = %v, want 50", snap.Progress)
	}
	if snap.Speed != 1024 {
		t.Errorf("speed = %v, want 1024", snap.Speed)
	}
	if snap.ETA == nil || *snap.ETA != 30 {
		t.Errorf("eta = %v, want 30", snap.ETA)
	}
	if snap.TotalBytes != 1000 {
		t.Errorf("total bytes = %d, want 1000", snap.TotalBytes)
	}
	if snap.DownloadedBytes != 500 {
		t.Errorf("downloaded bytes = %d, want 500", snap.DownloadedBytes)
	}
}

func TestHandleProgress_downloadingFallbackEstimate(t *testing.T) {
	dp := makeDP(true, false)

	// total_bytes = 0, total_bytes_estimate = 2000
	pkt := jsonProgress(map[string]any{
		"status":               "downloading",
		"total_bytes":          float64(0),
		"total_bytes_estimate": float64(2000),
		"downloaded_bytes":     float64(400),
		"speed":                float64(512),
	})

	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	if snap.TotalBytes != 2000 {
		t.Errorf("estimate fallback total bytes = %d, want 2000", snap.TotalBytes)
	}
	if snap.Progress != 20 {
		t.Errorf("progress = %v, want 20", snap.Progress)
	}
}

func TestHandleProgress_finished(t *testing.T) {
	dp := makeDP(true, false)

	// First put it in downloading state
	worker.HandleProgress(dp, jsonProgress(map[string]any{
		"status":           "downloading",
		"total_bytes":      float64(500),
		"downloaded_bytes": float64(250),
		"speed":            float64(100),
	}))

	// Now finish
	filename := "video.mp4"
	worker.HandleProgress(dp, jsonProgress(map[string]any{
		"status":   "finished",
		"filename": filename,
	}))

	snap := dp.Snapshot()
	if snap.Status != "processing" {
		t.Errorf("status = %q, want processing", snap.Status)
	}
	if snap.Speed != 0 {
		t.Errorf("speed after finished = %v, want 0", snap.Speed)
	}
	if snap.ETA != nil {
		t.Errorf("eta after finished = %v, want nil", snap.ETA)
	}
	if snap.Filename == nil || *snap.Filename != filename {
		t.Errorf("filename = %v, want %q", snap.Filename, filename)
	}
	if snap.VideoProgress.Status != "completed" {
		t.Errorf("video stream status = %q, want completed", snap.VideoProgress.Status)
	}
}

func TestHandleProgress_error(t *testing.T) {
	dp := makeDP(true, false)
	errMsg := "HTTP Error 403: Forbidden"

	worker.HandleProgress(dp, jsonProgress(map[string]any{
		"status": "error",
		"error":  errMsg,
	}))

	snap := dp.Snapshot()
	if snap.Status != "failed" {
		t.Errorf("status = %q, want failed", snap.Status)
	}
	if snap.Error == nil || *snap.Error != errMsg {
		t.Errorf("error = %v, want %q", snap.Error, errMsg)
	}
	if snap.CompletedAt == nil {
		t.Error("completedAt not set on error")
	}
}

func TestHandleProgress_invalidJSON(t *testing.T) {
	dp := makeDP(true, false)
	initialSnap := dp.Snapshot()

	// Should silently ignore malformed JSON — no panic, no state change
	worker.HandleProgress(dp, []byte("not-json"))

	snap := dp.Snapshot()
	if snap.Status != initialSnap.Status {
		t.Errorf("status changed on bad JSON: %q → %q", initialSnap.Status, snap.Status)
	}
}

func TestHandleProgress_audioOnlyByCodec(t *testing.T) {
	dp := makeDP(true, true) // both expected

	pkt := jsonProgress(map[string]any{
		"status":           "downloading",
		"total_bytes":      float64(1000),
		"downloaded_bytes": float64(200),
		"speed":            float64(50),
		// audio codec present, no video codec
		"acodec": "mp3",
		"vcodec": "none",
	})

	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	// Only audio stream should be at 20%, video should remain "waiting"
	if snap.AudioProgress.Status != "downloading" {
		t.Errorf("audio status = %q, want downloading", snap.AudioProgress.Status)
	}
	if snap.VideoProgress.Status != "waiting" {
		t.Errorf("video status = %q, want waiting (unchanged)", snap.VideoProgress.Status)
	}
}

func TestHandleProgress_ETAZeroBecomesNil(t *testing.T) {
	dp := makeDP(true, false)

	pkt := jsonProgress(map[string]any{
		"status": "downloading",
		"eta":    float64(0), // zero → nil
	})

	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	if snap.ETA != nil {
		t.Errorf("eta = %v, want nil (eta=0 should be nil)", snap.ETA)
	}
}

func TestHandleProgress_NaNInfinityIgnored(t *testing.T) {
	dp := makeDP(true, false)

	// We can't easily embed NaN/Inf in JSON (it's invalid), but we can test
	// the nil-pointer fallback by omitting numeric fields.
	pkt := jsonProgress(map[string]any{
		"status": "downloading",
		// no total_bytes, downloaded_bytes, speed, or eta
	})

	// Should not panic, should set sensible defaults (0)
	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	if snap.Speed != 0 {
		t.Errorf("speed = %v, want 0 (no speed field)", snap.Speed)
	}
}

func TestHandleProgress_filenameNA(t *testing.T) {
	dp := makeDP(true, false)
	initial := dp.Snapshot()
	if initial.Filename != nil {
		t.Errorf("initial filename should be nil, got %v", initial.Filename)
	}

	// "NA" string should not set filename
	pkt := jsonProgress(map[string]any{
		"status":   "downloading",
		"filename": "NA",
	})
	worker.HandleProgress(dp, pkt)

	snap := dp.Snapshot()
	if snap.Filename != nil {
		t.Errorf("filename should stay nil for NA, got %v", snap.Filename)
	}
}
