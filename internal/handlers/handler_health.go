package handlers

import (
	"context"
	"github.com/cyanidemilkshakee/yt-dls/internal/process"
	buildversion "github.com/cyanidemilkshakee/yt-dls/internal/version"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

// Health probes are cached and serialized to bound dependency subprocesses.
func (a *App) HandleHealth(w http.ResponseWriter, r *http.Request) {
	a.healthMu.Lock()
	defer a.healthMu.Unlock()
	if a.healthData != nil && time.Since(a.healthAt) < 10*time.Second {
		sendJSON(w, a.healthCode, a.healthData)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	probe := func(command []string) (bool, string) {
		child, stop := context.WithTimeout(ctx, 3*time.Second)
		defer stop()
		out, _, err := process.Output(child, command, "", 64<<10)
		version := strings.TrimSpace(strings.SplitN(strings.TrimSpace(string(out)), "\n", 2)[0])
		return err == nil, version
	}
	command := append([]string{a.Cfg.YtDlpPath}, a.Cfg.YtDlpArgs...)
	command = append(command, "--version")
	ytdlp, version := probe(command)
	ejsAvailable, ejsChecked, ejsVersion := false, false, ""
	for _, arg := range a.Cfg.YtDlpArgs {
		if arg == "yt_dlp" {
			ejsChecked = true
			ejsAvailable, ejsVersion = probe([]string{a.Cfg.YtDlpPath, "-c", "import importlib.metadata as m; print(m.version('yt-dlp-ejs'))"})
			break
		}
	}
	ffmpeg, ffmpegVersion := probe([]string{"ffmpeg", "-version"})
	ffprobe, ffprobeVersion := probe([]string{"ffprobe", "-version"})
	runtimeName, _, _ := strings.Cut(a.Cfg.YtDlpJSRuntime, ":")
	jsAvailable, jsVersion, jsIssue := probeJSRuntime(ctx, a.Cfg.YtDlpJSRuntime)
	writable := false
	if err := os.MkdirAll(a.Cfg.DownloadDir, 0755); err == nil {
		if file, err := os.CreateTemp(a.Cfg.DownloadDir, ".write-check-*"); err == nil {
			name := file.Name()
			closeErr := file.Close()
			removeErr := os.Remove(name)
			writable = closeErr == nil && removeErr == nil
		}
	}
	status, code := "ok", http.StatusOK
	issues := make([]string, 0)
	if !ytdlp {
		issues = append(issues, "yt-dlp is unavailable; install it or configure YTDLP_PATH")
	}
	if !ffmpeg || !ffprobe {
		issues = append(issues, "FFmpeg and ffprobe are required for merging, conversion, and media inspection")
	}
	if !jsAvailable {
		issues = append(issues, jsIssue)
	}
	if ejsChecked && !ejsAvailable {
		issues = append(issues, "The Python yt-dlp installation is missing yt-dlp-ejs; run npm run setup:runtime")
	}
	if !writable {
		issues = append(issues, "The download directory is not writable")
	}
	if err := a.Store.PersistenceError(); err != nil {
		issues = append(issues, "Download history could not be saved: "+err.Error())
	}
	if len(issues) > 0 {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}
	var ejsReadiness any
	ejsStatus := "unverified"
	if ejsChecked {
		ejsReadiness = ejsAvailable
		ejsStatus = "missing"
		if ejsAvailable {
			ejsStatus = "available"
		}
	}
	a.healthData = map[string]any{
		"app_version": buildversion.Version, "commit": buildversion.Commit, "build_time": buildversion.BuildTime,
		"status": status, "platform": runtime.GOOS, "issues": issues,
		"ytdlp_available": ytdlp, "ytdlp_version": version,
		"ejs_available": ejsReadiness, "ejs_status": ejsStatus, "ejs_version": ejsVersion,
		"ffmpeg_available": ffmpeg, "ffmpeg_version": ffmpegVersion, "ffprobe_available": ffprobe, "ffprobe_version": ffprobeVersion,
		"js_runtime": runtimeName, "js_runtime_available": jsAvailable, "js_runtime_version": jsVersion,
		"download_directory_exists": writable, "download_directory_writable": writable,
		"supports_pause_resume": false, "max_concurrent_downloads": a.Cfg.MaxConcurrentDownloads, "info_timeout_ms": a.Cfg.InfoTimeoutMs,
		"capabilities": map[string]bool{"cancel": true, "batch": true, "retry": true, "result_files": true, "events": true, "playlist_concat": true, "file_cleanup": true, "pause_resume": false, "network_guard": !a.Cfg.AllowPrivateURLs, "custom_download_path": a.Cfg.AllowCustomDownloadPath, "dangerous_options": a.Cfg.AllowDangerousOptions},
	}
	a.healthAt = time.Now()
	a.healthCode = code
	sendJSON(w, code, a.healthData)
}
