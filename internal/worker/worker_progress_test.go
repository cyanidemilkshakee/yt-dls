package worker

import (
	"strings"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

func TestProcessOutputConsumesStructuredProgressFromEitherStream(t *testing.T) {
	for _, isStderr := range []bool{false, true} {
		t.Run(map[bool]string{false: "stdout", true: "stderr"}[isStderr], func(t *testing.T) {
			dp := store.NewDownloadProgress("progress-test", true, false)
			w := &Worker{}
			line := `download:{"status":"downloading","downloaded_bytes":250,"total_bytes":1000,"total_bytes_estimate":0,"speed":500,"eta":2,"filename":"video.mp4","vcodec":"h264","acodec":"none","format_id":"18"}`

			w.processOutput(dp, strings.NewReader(line+"\n"), isStderr)

			snap := dp.Snapshot()
			if snap.Progress != 25 {
				t.Fatalf("progress = %v, want 25", snap.Progress)
			}
			if snap.DownloadedBytes != 250 || snap.TotalBytes != 1000 {
				t.Fatalf("bytes = %d/%d, want 250/1000", snap.DownloadedBytes, snap.TotalBytes)
			}
			if len(dp.GetLogs()) != 0 {
				t.Fatalf("structured progress should not be copied into logs: %v", dp.GetLogs())
			}
		})
	}
}
