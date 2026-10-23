package worker

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

func TestCollectResultsSupportsAllSelectedPlaylistOutputs(t *testing.T) {
	root := t.TempDir()
	// A maximum-size selection can retain 500 individual clips plus the
	// concatenated output. Every requested output needs a usable result link.
	for index := range 501 {
		name := filepath.Join(root, fmt.Sprintf("clip-%03d.mp4", index))
		if err := os.WriteFile(name, []byte("media"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	dp := store.NewDownloadProgress("large-playlist", true, true)
	dp.OutputDirectory = root
	w := &Worker{DlDir: root}
	w.collectResults(dp)
	if got := len(dp.Snapshot().Files); got != 501 {
		t.Fatalf("selected playlist outputs silently truncated: %d of 501", got)
	}
}

func TestCollectResultsIncludesRequestedSidecarsAndExcludesPartials(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	outputs := []string{"movie.mp4", "audio.alac", "animation.gif", "movie.en.lrc", "movie.ass", "movie.info.json", "movie.description", "cover.jpg", "cover.png", "cover.webp", "nested/extra.MKV"}
	for _, name := range append(append([]string(nil), outputs...), "movie.mp4.part", "movie.mp4.ytdl", "manifest.csv") {
		if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(name)), []byte("result"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	dp := store.NewDownloadProgress("results", true, true)
	dp.OutputDirectory = root
	w := &Worker{DlDir: root}
	w.collectResults(dp)
	snapshot := dp.Snapshot()
	if len(snapshot.Files) != len(outputs) {
		t.Fatalf("expected %d completed outputs, got %+v", len(outputs), snapshot.Files)
	}
	seen := map[string]bool{}
	for _, file := range snapshot.Files {
		path, directory, ok := dp.File(file.Index)
		if !ok || directory != root || !filepath.IsAbs(path) || file.Size != 6 {
			t.Fatalf("unusable output link: %+v path=%s root=%s", file, path, directory)
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			t.Fatal(err)
		}
		seen[filepath.ToSlash(rel)] = true
	}
	for _, name := range outputs {
		if !seen[name] {
			t.Errorf("requested output %s is unavailable", name)
		}
	}
}
