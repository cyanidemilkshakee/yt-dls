package worker

import (
	"bytes"
	"context"
	"encoding/binary"
	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// Opt-in integration against the installed tools, using generated media and a
// local HTTP server. No external content or credentials are required.
func TestInstalledDownloaderProgressAndFFmpegConversion(t *testing.T) {
	executable := os.Getenv("YTDLS_TEST_PYTHON")
	if executable == "" {
		t.Skip("set YTDLS_TEST_PYTHON to a Python interpreter with yt-dlp installed")
	}
	var wav bytes.Buffer
	wav.WriteString("RIFF")
	_ = binary.Write(&wav, binary.LittleEndian, uint32(36+16000))
	wav.WriteString("WAVEfmt ")
	_ = binary.Write(&wav, binary.LittleEndian, uint32(16))
	_ = binary.Write(&wav, binary.LittleEndian, uint16(1))
	_ = binary.Write(&wav, binary.LittleEndian, uint16(1))
	_ = binary.Write(&wav, binary.LittleEndian, uint32(8000))
	_ = binary.Write(&wav, binary.LittleEndian, uint32(16000))
	_ = binary.Write(&wav, binary.LittleEndian, uint16(2))
	_ = binary.Write(&wav, binary.LittleEndian, uint16(16))
	wav.WriteString("data")
	_ = binary.Write(&wav, binary.LittleEndian, uint32(16000))
	wav.Write(make([]byte, 16000))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/wav")
		_, _ = w.Write(wav.Bytes())
	}))
	defer server.Close()
	directory := filepath.Join(t.TempDir(), "job")
	cfg := &config.Config{YtDlpPath: executable, YtDlpArgs: []string{"-m", "yt_dlp"}, MaxDownloadDurationMs: 30000, AllowPrivateURLs: true}
	options := DownloadOptions{URL: server.URL + "/sample.wav", Filename: "sample", DownloadMode: "audio", ExtractAudio: true, AudioFormat: "mp3"}
	s := store.NewProgressStore(nil)
	dp := store.NewDownloadProgress("real", false, true)
	dp.OutputDirectory = directory
	s.Set("real", dp)
	sawProgress := false
	dp.OnUpdate = func(snapshot store.ProgressSnapshot) {
		if snapshot.Status == "downloading" && snapshot.DownloadedBytes > 0 {
			sawProgress = true
		}
	}
	worker := NewWorker("real", options, directory, cfg, s)
	worker.Run(context.Background())
	snap := dp.Snapshot()
	if snap.Status != "completed" || !sawProgress || len(snap.Files) != 1 || filepath.Ext(snap.Files[0].Name) != ".mp3" {
		t.Fatalf("real downloader integration failed: %+v progress=%v logs=%v", snap, sawProgress, dp.GetLogs())
	}
}
