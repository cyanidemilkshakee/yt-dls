package worker

import (
	"encoding/json"
	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"strings"
	"testing"
)

func TestPrintDoesNotSuppressProgressAndContainerIsGuaranteed(t *testing.T) {
	result, err := BuildCommand(DownloadOptions{URL: "https://example.com/video", Filename: "test", OutputFormat: "mp4"}, "downloads", &config.Config{YtDlpPath: "yt-dlp"})
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(result.Command, " ")
	for _, flag := range []string{"--progress ", "--remux-video mp4", "--merge-output-format mp4"} {
		if !strings.Contains(joined, flag) {
			t.Errorf("missing %s in %s", flag, joined)
		}
	}
}
func TestMultistreamBytesAreAccumulatedPerFormat(t *testing.T) {
	dp := store.NewDownloadProgress("multi", true, true)
	for _, line := range []string{`{"status":"finished","format_id":"v1","media_id":"a","downloaded_bytes":100,"total_bytes":100,"vcodec":"h264","acodec":"none"}`, `{"status":"downloading","format_id":"v2","media_id":"a","downloaded_bytes":50,"total_bytes":200,"vcodec":"h264","acodec":"none"}`, `{"status":"finished","format_id":"a1","media_id":"a","downloaded_bytes":30,"total_bytes":30,"vcodec":"none","acodec":"aac"}`} {
		if !HandleProgress(dp, []byte(line)) {
			t.Fatal("valid progress rejected")
		}
	}
	snap := dp.Snapshot()
	if snap.DownloadedBytes != 180 || snap.TotalBytes != 330 || len(snap.Streams) != 3 || snap.VideoProgress.DownloadedBytes != 150 {
		t.Fatalf("multistream overwritten: %+v", snap)
	}
}
func TestStrictStringsAndAudioFallback(t *testing.T) {
	cfg := &config.Config{YtDlpPath: "yt-dlp"}
	for _, value := range []string{strings.Repeat("x", 1001), "a\x00b"} {
		if _, err := BuildCommand(DownloadOptions{Filename: "test", AdvancedSettings: AdvancedSettings{Password: value}}, "downloads", cfg); err == nil {
			t.Fatal("invalid password silently dropped")
		}
	}
	result, err := BuildCommand(DownloadOptions{Filename: "test", DownloadMode: "audio"}, "downloads", cfg)
	if err != nil || !strings.Contains(strings.Join(result.Command, " "), "--extract-audio") {
		t.Fatal("audio fallback can retain video")
	}
	result, err = BuildCommand(DownloadOptions{Filename: "test", AdvancedSettings: AdvancedSettings{Password: " password "}}, "downloads", cfg)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for index, value := range result.Command {
		if value == "--password" {
			found = result.Command[index+1] == " password "
		}
	}
	if !found {
		t.Fatal("password whitespace changed")
	}
}
func TestRetryOptionsAreSecretFree(t *testing.T) {
	data, needsURL := RetryOptions(DownloadOptions{URL: "https://example.com/media?v=123&token=secret", AdvancedSettings: AdvancedSettings{Password: "password", Cookies: "privatepath", Exec: "command"}})
	if !needsURL || strings.Contains(string(data), "secret") || strings.Contains(string(data), "privatepath") || strings.Contains(string(data), "command") {
		t.Fatalf("secret retry record: %s", data)
	}
	var saved DownloadOptions
	if err := json.Unmarshal(data, &saved); err != nil || !strings.Contains(saved.URL, "v=123") {
		t.Fatal("safe source identifier lost")
	}
}
func TestIdentifiedStreamPreservesTotalsAndFragmentProgress(t *testing.T) {
	dp := store.NewDownloadProgress("fragments", true, false)
	HandleProgress(dp, []byte(`{"status":"downloading","format_id":"v1","total_bytes":100,"downloaded_bytes":50,"vcodec":"h264","acodec":"none"}`))
	HandleProgress(dp, []byte(`{"status":"finished","format_id":"v1","vcodec":"h264","acodec":"none"}`))
	if snapshot := dp.Snapshot(); snapshot.TotalBytes != 100 || snapshot.DownloadedBytes != 100 {
		t.Fatalf("terminal update discarded known bytes: %+v", snapshot)
	}
	fragmented := store.NewDownloadProgress("fragmented", true, false)
	HandleProgress(fragmented, []byte(`{"status":"downloading","format_id":"v1","fragment_index":2,"fragment_count":4,"vcodec":"h264","acodec":"none"}`))
	if snapshot := fragmented.Snapshot(); snapshot.VideoProgress.Progress != 50 || snapshot.Progress != 50 {
		t.Fatalf("fragment percentage was lost: %+v", snapshot)
	}
}

func TestPreparationFailureCannotReplaceCancellation(t *testing.T) {
	dp := store.NewDownloadProgress("cancelled", true, true)
	dp.Update(func(progress *store.DownloadProgress) { progress.Status = "cancelled" })
	new(Worker).fail(dp, "late directory failure")
	if dp.Snapshot().Status != "cancelled" {
		t.Fatal("late failure replaced terminal cancellation")
	}
}
