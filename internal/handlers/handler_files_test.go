package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

func TestRetainedFilesCleanup(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("owned-job", true, true)
	dp.Status = "failed"
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	if err := os.MkdirAll(filepath.Join(dp.OutputDirectory, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"output.mp4", "sub/output.mp4.part"} {
		if err := os.WriteFile(filepath.Join(dp.OutputDirectory, name), []byte("media"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	other := filepath.Join(a.Cfg.DownloadDir, "keep.mp4")
	if err := os.WriteFile(other, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	a.Store.Set(dp.DownloadID, dp)
	preview := request(router, "GET", "/api/download/owned-job/files", nil, nil)
	if preview.Code != 200 {
		t.Fatalf("preview: %d %s", preview.Code, preview.Body.String())
	}
	var data retainedPreview
	if err := json.Unmarshal(preview.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Files) != 2 || data.TotalBytes != 10 {
		t.Fatalf("unexpected preview: %+v", data)
	}
	if err := os.WriteFile(filepath.Join(dp.OutputDirectory, "new.info.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := request(router, "POST", "/api/download/owned-job/files/cleanup", map[string]string{"token": data.Token}, nil); got.Code != 409 {
		t.Fatalf("stale cleanup: %d", got.Code)
	}
	preview = request(router, "GET", "/api/download/owned-job/files", nil, nil)
	_ = json.Unmarshal(preview.Body.Bytes(), &data)
	dp.FilesMu.RLock()
	blocked := request(router, "POST", "/api/download/owned-job/files/cleanup", map[string]string{"token": data.Token}, nil)
	dp.FilesMu.RUnlock()
	if blocked.Code != 409 {
		t.Fatalf("worker guard: %d", blocked.Code)
	}
	cleaned := request(router, "POST", "/api/download/owned-job/files/cleanup", map[string]string{"token": data.Token}, nil)
	if cleaned.Code != 200 {
		t.Fatalf("cleanup: %d %s", cleaned.Code, cleaned.Body.String())
	}
	if _, err := os.Stat(dp.OutputDirectory); !os.IsNotExist(err) {
		t.Fatalf("job directory remains: %v", err)
	}
	if _, err := os.Stat(other); err != nil {
		t.Fatalf("unrelated file removed: %v", err)
	}
	if _, ok := a.Store.Get(dp.DownloadID); !ok {
		t.Fatal("cleanup removed history")
	}
	dp.OutputDirectory = a.Cfg.DownloadDir
	if got := request(router, "GET", "/api/download/owned-job/files", nil, nil); got.Code != 409 {
		t.Fatalf("root guard: %d", got.Code)
	}
}

func TestRetainedFilesMissingDirectoryIsIdempotent(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("missing-job", false, false)
	dp.Status = "cancelled"
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	a.Store.Set(dp.DownloadID, dp)
	for range 2 {
		preview := request(router, http.MethodGet, "/api/download/missing-job/files", nil, nil)
		var data retainedPreview
		if preview.Code != http.StatusOK || json.Unmarshal(preview.Body.Bytes(), &data) != nil {
			t.Fatalf("preview: %d %s", preview.Code, preview.Body)
		}
		if len(data.Files) != 0 || data.TotalBytes != 0 || data.Token == "" {
			t.Fatalf("missing-directory preview: %+v", data)
		}
		cleaned := request(router, http.MethodPost, "/api/download/missing-job/files/cleanup", map[string]string{"token": data.Token}, nil)
		if cleaned.Code != http.StatusOK {
			t.Fatalf("idempotent cleanup: %d %s", cleaned.Code, cleaned.Body)
		}
	}
}

func TestRetainedFilesOwnershipAndBatchGuards(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("owned-job", false, false)
	dp.Status = "completed"
	dp.OutputDirectory = filepath.Join(a.Cfg.RootDir, "custom", dp.DownloadID)
	a.Store.Set(dp.DownloadID, dp)
	assertCode := func(expected int) {
		t.Helper()
		got := request(router, http.MethodGet, "/api/download/owned-job/files", nil, nil)
		if got.Code != expected {
			t.Fatalf("expected %d, got %d %s", expected, got.Code, got.Body)
		}
	}
	assertCode(http.StatusConflict)
	a.Cfg.AllowCustomDownloadPath = true
	assertCode(http.StatusOK)
	dp.OutputDirectory = filepath.Join(a.Cfg.RootDir+"-sibling", dp.DownloadID)
	assertCode(http.StatusConflict)
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, "another-job")
	assertCode(http.StatusConflict)
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	parent := store.NewDownloadProgress("batch", false, false)
	parent.Kind = "batch"
	parent.Status = "downloading"
	parent.Children = []string{dp.DownloadID}
	a.Store.Set(parent.DownloadID, parent)
	assertCode(http.StatusConflict)
	parent.Update(func(p *store.DownloadProgress) { p.Status = "completed" })
	assertCode(http.StatusOK)
	dp.Update(func(p *store.DownloadProgress) { p.Kind = "batch" })
	assertCode(http.StatusConflict)
	// Even malformed persisted records whose IDs happen to match a configured
	// root's basename must never grant ownership of that whole root.
	malformed := store.NewDownloadProgress(filepath.Base(a.Cfg.RootDir), false, false)
	malformed.Status = "failed"
	malformed.OutputDirectory = a.Cfg.RootDir
	a.Store.Set(malformed.DownloadID, malformed)
	got := request(router, http.MethodGet, "/api/download/"+malformed.DownloadID+"/files", nil, nil)
	if got.Code != http.StatusConflict {
		t.Fatalf("project root accepted as job directory: %d %s", got.Code, got.Body)
	}
}

func TestCleanupPartialFailureKeepsResultIndexes(t *testing.T) {
	dp := store.NewDownloadProgress("partial-job", true, true)
	root := filepath.Join(t.TempDir(), dp.DownloadID)
	dp.Paths = []string{filepath.Join(root, "first.mp4"), filepath.Join(root, "second.srt")}
	dp.Files = []store.ResultFile{{Index: 0, Name: "first.mp4", Size: 10}, {Index: 1, Name: "second.srt", Size: 20}}
	before := dp.Snapshot().Version
	recordCleanedFiles(dp, root, map[string]bool{"first.mp4": true}, false)
	snapshot := dp.Snapshot()
	if len(snapshot.Files) != 1 || snapshot.Files[0].Index != 1 || snapshot.Files[0].Name != "second.srt" {
		t.Fatalf("partial cleanup changed remaining links: %+v", snapshot.Files)
	}
	if dp.Paths[0] != "" || dp.Paths[1] != filepath.Join(root, "second.srt") || snapshot.Version <= before {
		t.Fatalf("removed result retained or update not published: %+v", dp.Paths)
	}
	recordCleanedFiles(dp, root, map[string]bool{"second.srt": true}, true)
	if len(dp.Snapshot().Files) != 0 || len(dp.Paths) != 0 {
		t.Fatal("complete cleanup retained result metadata")
	}
}

func TestCleanupPinnedDirectoryDoesNotFollowReplacement(t *testing.T) {
	a, _ := testApp(t, false)
	dp := store.NewDownloadProgress("pinned-job", false, false)
	dp.Status = "completed"
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	if err := os.MkdirAll(dp.OutputDirectory, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dp.OutputDirectory, "output.mp4"), []byte("owned"), 0600); err != nil {
		t.Fatal(err)
	}
	directory, err := a.openOwnedDirectory(dp)
	if err != nil {
		t.Fatal(err)
	}
	defer directory.close()
	preview, err := previewRetainedFiles(directory)
	if err != nil || len(preview.Files) != 1 {
		t.Fatalf("preview: %+v %v", preview, err)
	}
	outside := t.TempDir()
	protected := filepath.Join(outside, "output.mp4")
	if err := os.WriteFile(protected, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	// Check support before changing the original directory; Windows machines
	// without Developer Mode or symlink privileges still run all other guards.
	probe := filepath.Join(a.Cfg.DownloadDir, "symlink-probe")
	if err := os.Symlink(outside, probe); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := os.Remove(probe); err != nil {
		t.Fatal(err)
	}
	moved := dp.OutputDirectory + "-moved"
	if err := os.Rename(dp.OutputDirectory, moved); err != nil {
		t.Skipf("open directory rename unavailable: %v", err)
	}
	if err := os.Symlink(outside, dp.OutputDirectory); err != nil {
		t.Fatal(err)
	}
	if err := directory.root.Remove("output.mp4"); err != nil {
		t.Fatal(err)
	}
	if contents, err := os.ReadFile(protected); err != nil || string(contents) != "keep" {
		t.Fatalf("replacement redirected cleanup: %q %v", contents, err)
	}
	if _, err := os.Stat(filepath.Join(moved, "output.mp4")); !os.IsNotExist(err) {
		t.Fatalf("pinned output was not removed: %v", err)
	}
	if _, err := a.openOwnedDirectory(dp); err == nil {
		t.Fatal("replacement symlink accepted for a new preview")
	}
}

func TestCleanupAllowsConfiguredRootAlias(t *testing.T) {
	a, router := testApp(t, false)
	physical := t.TempDir()
	a.Cfg.DownloadDir = filepath.Join(a.Cfg.RootDir, "configured-downloads")
	if err := os.Symlink(physical, a.Cfg.DownloadDir); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	dp := store.NewDownloadProgress("aliased-job", false, false)
	dp.Status = "completed"
	dp.OutputDirectory = filepath.Join(physical, dp.DownloadID)
	if err := os.Mkdir(dp.OutputDirectory, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dp.OutputDirectory, "owned.mp4"), []byte("media"), 0600); err != nil {
		t.Fatal(err)
	}
	protected := filepath.Join(physical, "protected.mp4")
	if err := os.WriteFile(protected, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	a.Store.Set(dp.DownloadID, dp)
	preview := request(router, http.MethodGet, "/api/download/aliased-job/files", nil, nil)
	var data retainedPreview
	if preview.Code != http.StatusOK || json.Unmarshal(preview.Body.Bytes(), &data) != nil {
		t.Fatalf("configured alias rejected: %d %s", preview.Code, preview.Body)
	}
	cleaned := request(router, http.MethodPost, "/api/download/aliased-job/files/cleanup", map[string]string{"token": data.Token}, nil)
	if cleaned.Code != http.StatusOK {
		t.Fatalf("configured alias cleanup: %d %s", cleaned.Code, cleaned.Body)
	}
	if contents, err := os.ReadFile(protected); err != nil || string(contents) != "keep" {
		t.Fatalf("configured-root sibling removed: %q %v", contents, err)
	}
}

func TestResultFileRejectsMissingAndCleanedSlots(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("missing-results", false, false)
	dp.Status = "completed"
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	dp.Paths = []string{"", filepath.Join(dp.OutputDirectory, "gone.mp4")}
	a.Store.Set(dp.DownloadID, dp)
	for _, suffix := range []string{"0", "1", "2", "-1"} {
		got := request(router, http.MethodGet, "/api/download/missing-results/file/"+suffix, nil, nil)
		if got.Code != http.StatusNotFound {
			t.Errorf("missing result index %s: %d %s", suffix, got.Code, got.Body)
		}
	}
	if got := request(router, http.MethodGet, "/api/download/missing-results/file/invalid", nil, nil); got.Code != http.StatusBadRequest {
		t.Fatalf("invalid result index: %d %s", got.Code, got.Body)
	}
}

func TestResultFileRejectsSymlinkReplacement(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("linked-results", false, false)
	dp.Status = "completed"
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	if err := os.MkdirAll(dp.OutputDirectory, 0755); err != nil {
		t.Fatal(err)
	}
	protected := filepath.Join(t.TempDir(), "protected.mp4")
	if err := os.WriteFile(protected, []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dp.OutputDirectory, "output.mp4")
	if err := os.Symlink(protected, path); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	dp.Paths = []string{path}
	a.Store.Set(dp.DownloadID, dp)
	got := request(router, http.MethodGet, "/api/download/linked-results/file/0", nil, nil)
	if got.Code != http.StatusNotFound || got.Body.String() == "private" {
		t.Fatalf("symlink result served: %d %s", got.Code, got.Body)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(dp.OutputDirectory); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Dir(protected), dp.OutputDirectory); err != nil {
		t.Fatal(err)
	}
	dp.Paths = []string{filepath.Join(dp.OutputDirectory, filepath.Base(protected))}
	got = request(router, http.MethodGet, "/api/download/linked-results/file/0", nil, nil)
	if got.Code != http.StatusForbidden || got.Body.String() == "private" {
		t.Fatalf("replaced result directory served: %d %s", got.Code, got.Body)
	}
}

func TestCompletedOutputUnderConfiguredRootAlias(t *testing.T) {
	a, router := testApp(t, false)
	physical := t.TempDir()
	a.Cfg.DownloadDir = filepath.Join(a.Cfg.RootDir, "download-alias")
	if err := os.Symlink(physical, a.Cfg.DownloadDir); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	a.Pool.Start()
	id := acceptedID(t, request(router, http.MethodPost, "/api/download", options("https://example.com/video"), nil))
	waitFor(t, a.Store, id, "completed")
	response := request(router, http.MethodGet, "/api/download/"+id+"/file/0", nil, nil)
	if response.Code != http.StatusOK || response.Body.String() != "fixture media" {
		t.Fatalf("canonical output unavailable through configured alias: %d %s", response.Code, response.Body)
	}
}

func TestRetainedFilesRejectSymlinkAndActiveJob(t *testing.T) {
	a, router := testApp(t, false)
	dp := store.NewDownloadProgress("linked-job", true, true)
	dp.OutputDirectory = filepath.Join(a.Cfg.DownloadDir, dp.DownloadID)
	a.Store.Set(dp.DownloadID, dp)
	if got := request(router, "GET", "/api/download/linked-job/files", nil, nil); got.Code != 409 {
		t.Fatalf("active job guard: %d", got.Code)
	}
	dp.Update(func(p *store.DownloadProgress) { p.Status = "completed" })
	if err := os.MkdirAll(dp.OutputDirectory, 0755); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "protected.txt")
	if err := os.WriteFile(outside, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dp.OutputDirectory, "linked.txt")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if got := request(router, "GET", "/api/download/linked-job/files", nil, nil); got.Code != 409 {
		t.Fatalf("symlink guard: %d", got.Code)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal(err)
	}
}
