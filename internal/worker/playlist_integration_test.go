package worker

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/process"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

// A real generic HTML playlist proves selected-index extraction and FFmpeg
// joining work together; browser fixtures separately test UI/API behavior.
func TestInstalledDownloaderSelectedPlaylistConcatenation(t *testing.T) {
	python := os.Getenv("YTDLS_TEST_PYTHON")
	if python == "" {
		t.Skip("set YTDLS_TEST_PYTHON to the installed yt-dlp interpreter")
	}
	var wav bytes.Buffer
	wav.WriteString("RIFF")
	_ = binary.Write(&wav, binary.LittleEndian, uint32(36+16000))
	wav.WriteString("WAVEfmt ")
	for _, value := range []any{uint32(16), uint16(1), uint16(1), uint32(8000), uint32(16000), uint16(2), uint16(16)} {
		_ = binary.Write(&wav, binary.LittleEndian, value)
	}
	wav.WriteString("data")
	_ = binary.Write(&wav, binary.LittleEndian, uint32(16000))
	wav.Write(make([]byte, 16000))
	var requestedMu sync.Mutex
	requested := make(map[string]int)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/playlist" {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, `<html><head><title>Selected audio playlist</title></head><body><video src="/one.wav"></video><video src="/two.wav"></video><video src="/three.wav"></video></body></html>`)
		} else {
			if r.Method == "GET" {
				requestedMu.Lock()
				requested[r.URL.Path]++
				requestedMu.Unlock()
			}
			w.Header().Set("Content-Type", "audio/wav")
			_, _ = w.Write(wav.Bytes())
		}
	}))
	defer server.Close()
	directory := filepath.Join(t.TempDir(), "joined-job")
	cfg := &config.Config{YtDlpPath: python, YtDlpArgs: []string{"-m", "yt_dlp"}, MaxDownloadDurationMs: 60000, AllowPrivateURLs: true}
	options := DownloadOptions{URL: server.URL + "/playlist", DownloadMode: "audio", FormatCode: "bestaudio/best", AudioFormat: "mp3", PlaylistItems: []int{1, 3}, ConcatPlaylist: "always", Filename: "joined_selection"}
	s := store.NewProgressStore(nil)
	dp := store.NewDownloadProgress("joined", false, true)
	s.Set("joined", dp)
	NewWorker("joined", options, directory, cfg, s).Run(context.Background())
	snapshot := dp.Snapshot()
	if snapshot.Status != "completed" || len(snapshot.Files) != 1 || filepath.Ext(snapshot.Files[0].Name) != ".mp3" {
		t.Fatalf("playlist concatenation failed: %+v logs=%v", snapshot, dp.GetLogs())
	}
	if snapshot.Files[0].Name != "joined_selection.mp3" {
		t.Fatalf("joined output ignored filename: %s", snapshot.Files[0].Name)
	}
	requestedMu.Lock()
	defer requestedMu.Unlock()
	if requested["/one.wav"] == 0 || requested["/three.wav"] == 0 || requested["/two.wav"] > 0 {
		t.Fatalf("wrong playlist items downloaded: %v", requested)
	}
	path, _, ok := dp.File(snapshot.Files[0].Index)
	if !ok {
		t.Fatal("joined result missing")
	}
	output, _, err := process.Output(context.Background(), []string{"ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path}, "", 1024)
	var duration float64
	_, parseErr := fmt.Sscanf(string(output), "%f", &duration)
	// MP3 encoder padding makes each 1-second clip roughly 1.15 seconds.
	if err != nil || parseErr != nil || duration < 2.0 || duration > 2.6 {
		t.Fatalf("expected two selected 1-second clips, got duration %q (err=%v)", output, err)
	}
}
