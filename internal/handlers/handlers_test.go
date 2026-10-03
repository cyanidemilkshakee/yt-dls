package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
)

// This real subprocess fixture exercises argv, streaming, file delivery,
// process errors, cancellation, and server-owned admission without internet.
func TestDownloaderFixture(t *testing.T) {
	fixture := false
	for _, arg := range os.Args {
		if arg == "--fixture" {
			fixture = true
		}
	}
	if !fixture {
		return
	}
	for _, arg := range os.Args {
		if arg == "--version" {
			fmt.Println("fixture-1")
			os.Exit(0)
		}
	}
	source := os.Args[len(os.Args)-1]
	if strings.Contains(source, "slow") {
		time.Sleep(30 * time.Second)
	}
	if strings.Contains(source, "fail") {
		fmt.Fprintln(os.Stderr, "ERROR: controlled fixture failure")
		os.Exit(3)
	}
	for _, arg := range os.Args {
		if arg == "--dump-single-json" {
			if strings.Contains(source, "large-metadata") {
				fmt.Print(strings.Repeat("x", 1<<20))
				os.Exit(0)
			}
			fmt.Println(`{"id":"fixture","title":"Fixture video","duration":62.5,"view_count":1234,"ext":"mp4","webpage_url":"https://example.com/video","formats":[{"format_id":"video","vcodec":"h264","acodec":"none","ext":"mp4","height":1080,"filesize":100},{"format_id":"audio","vcodec":"none","acodec":"aac","ext":"m4a","abr":128,"filesize":50}]}`)
			os.Exit(0)
		}
	}
	directory, _ := os.Getwd()
	path := filepath.Join(directory, "fixture.mp4")
	_ = os.WriteFile(path, []byte("fixture media"), 0600)
	fmt.Println(`{"status":"downloading","downloaded_bytes":5,"total_bytes":13,"format_id":"combined","media_id":"fixture","vcodec":"h264","acodec":"aac"}`)
	fmt.Println(`{"status":"finished","downloaded_bytes":13,"total_bytes":13,"format_id":"combined","media_id":"fixture","vcodec":"h264","acodec":"aac"}`)
	encoded, _ := json.Marshal(path)
	fmt.Println("YT_DLS_FINAL_PATH:" + string(encoded))
	os.Exit(0)
}

func testApp(t *testing.T, start bool) (*App, http.Handler) {
	t.Helper()
	root := t.TempDir()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{RootDir: root, DownloadDir: filepath.Join(root, "downloads"), Host: "127.0.0.1", Port: 7391, AllowPrivateURLs: true, YtDlpPath: executable, YtDlpArgs: []string{"-test.run=^TestDownloaderFixture$", "--", "--fixture"}, MaxConcurrentDownloads: 1, MaxDownloadDurationMs: 10000, InfoTimeoutMs: 5000, InfoMaxOutputBytes: 1 << 20, MaxConcurrentInfo: 1}
	s := store.NewProgressStore(nil)
	pool := worker.NewPool(cfg, s)
	if start {
		pool.Start()
	}
	app := &App{Cfg: cfg, Pool: pool, Store: s, InfoSlots: make(chan struct{}, 1)}
	t.Cleanup(func() { app.Close(); pool.Stop() })
	return app, app.Router()
}
func request(handler http.Handler, method, path string, payload any, headers map[string]string) *httptest.ResponseRecorder {
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	r := httptest.NewRequest(method, "http://localhost:7391"+path, bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		r.Header.Set(key, value)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}
func acceptedID(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	if w.Code != 202 {
		t.Fatalf("expected admission, got %d %s", w.Code, w.Body)
	}
	var response map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response["id"]
}
func waitFor(t *testing.T, s *store.ProgressStore, id, status string) store.ProgressSnapshot {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if dp, ok := s.Get(id); ok {
			snap := dp.Snapshot()
			if snap.Status == status {
				return snap
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	dp, _ := s.Get(id)
	t.Fatalf("job did not reach %s: %+v", status, dp.Snapshot())
	return store.ProgressSnapshot{}
}
func options(source string) map[string]any {
	return map[string]any{"url": source, "filename": "same-name", "downloadMode": "both"}
}

func TestHealthReportsDegradationAndCachesProbes(t *testing.T) {
	app, handler := testApp(t, false)
	if err := os.WriteFile(app.Cfg.DownloadDir, []byte("regular file"), 0600); err != nil {
		t.Fatal(err)
	}
	app.Cfg.YtDlpJSRuntime = "node:nonexistent-health-fixture"
	first := request(handler, "GET", "/api/health", nil, nil)
	if first.Code != 503 {
		t.Fatalf("unwritable directory was ready: %d %s", first.Code, first.Body)
	}
	var health map[string]any
	if err := json.Unmarshal(first.Body.Bytes(), &health); err != nil {
		t.Fatal(err)
	}
	if health["status"] != "degraded" || health["download_directory_writable"] != false || health["js_runtime_available"] != false || health["ejs_status"] != "unverified" || health["ejs_available"] != nil {
		t.Fatalf("inaccurate readiness: %v", health)
	}
	app.Cfg.YtDlpPath = "nonexistent-health-fixture"
	second := request(handler, "GET", "/api/health", nil, nil)
	if second.Body.String() != first.Body.String() {
		t.Fatal("health cache relaunched probes within the cache window")
	}
}

func TestMetadataOutputLimitReachesHandler(t *testing.T) {
	app, handler := testApp(t, false)
	app.Cfg.InfoMaxOutputBytes = 512
	response := request(handler, "POST", "/api/info", map[string]any{"url": "https://example.com/large-metadata"}, nil)
	if response.Code != 502 || app.Store.Count() != 0 {
		t.Fatalf("oversized metadata accepted: %d %s", response.Code, response.Body)
	}
}

func TestAdmissionCacheRetainsKeysForExistingJobs(t *testing.T) {
	app, _ := testApp(t, false)
	app.Store.Set("retained", store.NewDownloadProgress("retained", true, false))
	app.admissions = map[string]admission{"retained-key": {ID: "retained"}}
	for index := 0; index < 999; index++ {
		app.admissions[fmt.Sprintf("stale-%d", index)] = admission{ID: fmt.Sprintf("removed-%d", index)}
	}
	app.recordAdmission("new-key", "new", [32]byte{})
	if len(app.admissions) != 2 || app.admissions["retained-key"].ID != "retained" {
		t.Fatal("cache cleanup lost a live idempotency key")
	}
}

func TestAdmissionRejectsInvalidOptionsWithoutMutation(t *testing.T) {
	app, handler := testApp(t, false)
	for _, change := range []map[string]any{{"fixup": "ignore"}, {"formatCode": "bad;selector"}, {"advancedSettings": map[string]any{"exec": "echo unsafe"}}, {"advancedSettings": map[string]any{"password": strings.Repeat("x", 1001)}}, {"advancedSettings": map[string]any{"force-ipv4": true, "force-ipv6": true}}, {"unexpected": true}} {
		payload := options("https://example.com/video")
		for key, value := range change {
			payload[key] = value
		}
		w := request(handler, "POST", "/api/download", payload, nil)
		if w.Code != 400 || app.Store.Count() != 0 {
			t.Fatalf("invalid payload admitted: %d %s", w.Code, w.Body)
		}
	}
}
func TestLifecycleIsolationIdempotencyAndFiles(t *testing.T) {
	app, handler := testApp(t, true)
	payload := options("https://example.com/video")
	first := acceptedID(t, request(handler, "POST", "/api/download", payload, map[string]string{"Idempotency-Key": "first"}))
	duplicate := acceptedID(t, request(handler, "POST", "/api/download", payload, map[string]string{"Idempotency-Key": "first"}))
	if first != duplicate {
		t.Fatal("retry admitted duplicate")
	}
	second := acceptedID(t, request(handler, "POST", "/api/download", payload, nil))
	if w := request(handler, "POST", "/api/download", options("https://example.com/other"), map[string]string{"Idempotency-Key": "first"}); w.Code != 409 {
		t.Fatalf("key conflict accepted: %d", w.Code)
	}
	a, b := waitFor(t, app.Store, first, "completed"), waitFor(t, app.Store, second, "completed")
	if *a.Filename == *b.Filename || len(a.Files) != 1 || a.DownloadedBytes != 13 || a.Progress != 100 {
		t.Fatalf("isolation/progress/results failed: %+v %+v", a, b)
	}
	file := request(handler, "GET", "/api/download/"+first+"/file/0", nil, nil)
	if file.Code != 200 || file.Body.String() != "fixture media" || !strings.Contains(file.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("file delivery failed: %d %s", file.Code, file.Body)
	}
	retry := acceptedID(t, request(handler, "POST", "/api/download/"+first+"/retry", map[string]any{}, nil))
	waitFor(t, app.Store, retry, "completed")
}
func TestCancelQueuedAndRunning(t *testing.T) {
	app, handler := testApp(t, true)
	id := acceptedID(t, request(handler, "POST", "/api/download", options("https://example.com/slow"), nil))
	waitFor(t, app.Store, id, "preparing")
	if w := request(handler, "DELETE", "/api/download/"+id, nil, nil); w.Code != 409 {
		t.Fatalf("active record removed: %d", w.Code)
	}
	queued := acceptedID(t, request(handler, "POST", "/api/download", options("https://example.com/other"), nil))
	for _, value := range []string{queued, id} {
		if w := request(handler, "POST", "/api/download/"+value+"/cancel", nil, nil); w.Code != 200 {
			t.Fatal(w.Body)
		}
		waitFor(t, app.Store, value, "cancelled")
	}
}
func TestServerOwnedBatchCancellationAndProgress(t *testing.T) {
	app, handler := testApp(t, true)
	entries := make([]map[string]string, 20)
	for index := range entries {
		entries[index] = map[string]string{"url": "https://example.com/slow", "filename": "duplicate"}
	}
	id := acceptedID(t, request(handler, "POST", "/api/download/batch", map[string]any{"entries": entries, "options": map[string]any{}}, nil))
	dp, _ := app.Store.Get(id)
	if snap := dp.Snapshot(); len(snap.Children) != 20 || snap.Batch.Total != 20 {
		t.Fatal("batch lost entries")
	}
	request(handler, "POST", "/api/download/"+id+"/cancel", nil, nil)
	app.Close()
	for _, child := range dp.Snapshot().Children {
		waitFor(t, app.Store, child, "cancelled")
	}
}
func TestRouterBoundaryAndMetadata(t *testing.T) {
	_, handler := testApp(t, true)
	for _, headers := range []map[string]string{{"Origin": "https://foreign.example"}, {"Sec-Fetch-Site": "cross-site"}, {"Content-Type": "text/plain"}} {
		w := request(handler, "POST", "/api/info", map[string]string{"url": "https://example.com/video"}, headers)
		if w.Code != 403 && w.Code != 415 {
			t.Fatalf("boundary bypass: %d %s", w.Code, w.Body)
		}
	}
	if w := request(handler, "GET", "/api/info?url=https://example.com", nil, nil); w.Code != 405 {
		t.Fatalf("work-producing GET enabled: %d", w.Code)
	}
	if w := request(handler, "GET", "/api/missing", nil, nil); w.Code != 404 || !strings.Contains(w.Header().Get("Content-Type"), "json") {
		t.Fatal("API miss served SPA")
	}
	w := request(handler, "POST", "/api/info", map[string]string{"url": "https://example.com/video"}, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Fixture video") {
		t.Fatalf("metadata fixture failed: %d %s", w.Code, w.Body)
	}
	var metadata struct {
		ViewCount int    `json:"view_count"`
		Ext       string `json:"ext"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &metadata); err != nil || metadata.ViewCount != 1234 || metadata.Ext != "mp4" {
		t.Fatalf("frontend metadata fields missing: %s (err = %v)", w.Body, err)
	}
	foreign := httptest.NewRequest("GET", "http://evil.example:7391/api/downloads", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, foreign)
	if recorder.Code != 403 {
		t.Fatal("untrusted Host accepted")
	}
}
func TestResultCannotEscapeDirectory(t *testing.T) {
	app, handler := testApp(t, false)
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "private.mp4")
	_ = os.WriteFile(outside, []byte("private"), 0600)
	dp := store.NewDownloadProgress("escape", false, false)
	dp.Status = "completed"
	dp.Paths = []string{outside}
	dp.OutputDirectory = root
	app.Store.Set("escape", dp)
	if w := request(handler, "GET", "/api/download/escape/file/0", nil, nil); w.Code != 403 {
		t.Fatalf("escaped file served: %d", w.Code)
	}
}
func TestBatchCompletionAndPageOrder(t *testing.T) {
	app, handler := testApp(t, true)
	entries := []map[string]string{{"url": "https://example.com/video"}, {"url": "https://example.com/video"}, {"url": "https://example.com/fail"}}
	id := acceptedID(t, request(handler, "POST", "/api/download/batch", map[string]any{"entries": entries, "options": map[string]any{}}, nil))
	snap := waitFor(t, app.Store, id, "failed")
	if snap.Batch.Completed != 2 || snap.Batch.Failed != 1 {
		t.Fatalf("incorrect batch totals: %+v", snap.Batch)
	}
	w := request(handler, "GET", "/api/downloads?limit=2", nil, nil)
	var list struct {
		Downloads []store.ProgressSnapshot
		Total     int
	}
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list.Downloads) != 2 || list.Total != 4 {
		t.Fatalf("pagination/order: %s", w.Body)
	}
}
