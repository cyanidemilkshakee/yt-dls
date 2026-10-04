// Package config loads and validates runtime configuration from environment
// variables (and an optional .env file at the project root).
//
// Environment-backed values are loaded from the project root's .env file;
// NetworkProxy is assigned internally after the outbound guard starts.
package config

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all server configuration. Fields are immutable after [Load].
type Config struct {
	// ── Paths ──────────────────────────────────────────────────────────────
	RootDir     string // directory containing go.mod
	DownloadDir string // resolved download destination
	StateDir    string // bounded local history

	// ── yt-dlp ─────────────────────────────────────────────────────────────
	YtDlpPath      string   // path or name of the yt-dlp executable
	YtDlpArgs      []string // optional launcher arguments, e.g. -m yt_dlp
	YtDlpJSRuntime string   // optional custom JS runtime (e.g. node, deno)
	NetworkProxy   string   // internal DNS-pinning proxy used when private URLs are disabled

	// ── HTTP server ─────────────────────────────────────────────────────────
	Port int
	Host string

	// ── Security / access ───────────────────────────────────────────────────
	AllowCustomDownloadPath bool
	AllowDangerousOptions   bool
	AllowPrivateURLs        bool
	FrontendOrigins         []string // extra allowed CORS origins

	// ── Logging ─────────────────────────────────────────────────────────────
	LogLevel string // "debug" | "info" | "warn" | "error"

	// ── Limits ──────────────────────────────────────────────────────────────
	MaxConcurrentDownloads int
	MaxDownloadDurationMs  int64
	InfoTimeoutMs          int64
	InfoMaxOutputBytes     int
	MaxConcurrentInfo      int
	envError               error
}

// Load reads configuration from the environment (and an optional .env file at
// the project root). Missing values use defaults; Validate rejects malformed
// or out-of-range values before the server starts.
func Load() *Config {
	root := findRootDir()

	// Silently ignore a missing .env — environment-only deployments still work.
	_ = godotenv.Load(filepath.Join(root, ".env"))

	ytDlpPath, ytDlpArgs := resolveYtDlpCommand(root)
	if configured := strEnv("YTDLP_PATH", ""); configured != "" {
		// An explicit path is authoritative. Surface an invalid path at health
		// check or job start instead of silently using another installation.
		ytDlpPath = resolveCommandPath(root, configured)
		ytDlpArgs = nil
	}

	cfg := &Config{
		RootDir: root,

		YtDlpPath:      ytDlpPath,
		YtDlpArgs:      ytDlpArgs,
		YtDlpJSRuntime: strEnv("YTDLP_JS_RUNTIME", ""),
		Host:           strEnv("HOST", "127.0.0.1"),
		LogLevel:       strEnv("LOG_LEVEL", "info"),

		Port: intEnv("PORT", 7391, 1, 65535),

		AllowCustomDownloadPath: boolEnv("ALLOW_CUSTOM_DOWNLOAD_PATH", false),
		AllowDangerousOptions:   boolEnv("ALLOW_DANGEROUS_OPTIONS", false),
		AllowPrivateURLs:        boolEnv("ALLOW_PRIVATE_URLS", false),

		MaxConcurrentDownloads: intEnv("MAX_CONCURRENT_DOWNLOADS", 3, 1, 32),
		MaxDownloadDurationMs:  i64Env("MAX_DOWNLOAD_DURATION_MS", 30*60*1000, 10_000),
		InfoTimeoutMs:          i64Env("INFO_TIMEOUT_MS", 120_000, 5_000),
		InfoMaxOutputBytes:     intEnv("INFO_MAX_OUTPUT_BYTES", 16<<20, 1<<10, 256<<20),
		MaxConcurrentInfo:      intEnv("MAX_CONCURRENT_INFO", 4, 1, 16),
	}

	cfg.DownloadDir = resolvePath(root, strEnv("DOWNLOAD_DIR", ""), "downloads")
	cfg.StateDir = resolvePath(root, strEnv("STATE_DIR", ""), ".yt-dls")
	if cfg.YtDlpJSRuntime == "" {
		for _, name := range []string{"deno", "node"} {
			if path, err := osexec.LookPath(name); err == nil {
				cfg.YtDlpJSRuntime = name + ":" + path
				break
			}
		}
	}

	for _, o := range strings.Split(strEnv("FRONTEND_ORIGIN", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.FrontendOrigins = append(cfg.FrontendOrigins, o)
		}
	}

	cfg.envError = validateEnvironment()
	return cfg
}

// Validate rejects security-sensitive combinations that would expose the
// unauthenticated local service with options that can access private resources,
// write outside the default directory, or execute arbitrary commands.
func (c *Config) Validate() error {
	if c.envError != nil {
		return c.envError
	}
	if !isLoopbackHost(c.Host) {
		return fmt.Errorf("HOST must be a loopback address because the API has no authentication")
	}
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("PORT must be between 1 and 65535")
	}
	for _, origin := range c.FrontendOrigins {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Scheme != "http" && parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return fmt.Errorf("FRONTEND_ORIGIN must contain complete HTTP origins without paths or wildcards")
		}
		if strings.Contains(origin, "*") {
			return fmt.Errorf("wildcard origins are not allowed")
		}
	}
	if runtime := strings.SplitN(c.YtDlpJSRuntime, ":", 2)[0]; runtime != "" && runtime != "node" && runtime != "deno" && runtime != "bun" && runtime != "quickjs" {
		return fmt.Errorf("YTDLP_JS_RUNTIME must name node, deno, bun, or quickjs")
	}
	return nil
}

func validateEnvironment() error {
	ranges := map[string][2]int64{"PORT": {1, 65535}, "MAX_CONCURRENT_DOWNLOADS": {1, 32}, "MAX_DOWNLOAD_DURATION_MS": {10000, 86400000}, "INFO_TIMEOUT_MS": {5000, 600000}, "INFO_MAX_OUTPUT_BYTES": {1 << 10, 256 << 20}, "MAX_CONCURRENT_INFO": {1, 16}}
	for key, bounds := range ranges {
		value, ok := os.LookupEnv(key)
		if !ok || value == "" {
			continue
		}
		number, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
		if err != nil || number < bounds[0] || number > bounds[1] {
			return fmt.Errorf("%s must be an integer between %d and %d", key, bounds[0], bounds[1])
		}
	}
	for _, key := range []string{"ALLOW_CUSTOM_DOWNLOAD_PATH", "ALLOW_DANGEROUS_OPTIONS", "ALLOW_PRIVATE_URLS"} {
		value, ok := os.LookupEnv(key)
		if !ok || value == "" {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "1", "true", "yes", "on", "0", "false", "no", "off":
		default:
			return fmt.Errorf("%s must be a boolean", key)
		}
	}
	if level := strEnv("LOG_LEVEL", "info"); level != "debug" && level != "info" && level != "warn" && level != "error" {
		return fmt.Errorf("LOG_LEVEL must be debug, info, warn, or error")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	if strings.EqualFold(host, "localhost") || strings.HasSuffix(strings.ToLower(host), ".localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func commandRuns(path string, args ...string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return osexec.CommandContext(ctx, path, args...).Run() == nil
}

// resolveYtDlpCommand finds a usable yt-dlp command for local development.
// Prefer an installed Python module when available because a PyInstaller
// executable can be blocked by Windows extraction policies. Fall back to a
// standalone executable beside the server, then to PATH for normal installs.
func resolveYtDlpCommand(root string) (string, []string) {
	for _, relative := range []string{filepath.Join(".venv", "Scripts", "python.exe"), filepath.Join(".venv", "bin", "python")} {
		path := filepath.Join(root, relative)
		if info, err := os.Stat(path); err == nil && !info.IsDir() && commandRuns(path, "-m", "yt_dlp", "--version") {
			return path, []string{"-m", "yt_dlp"}
		}
	}
	for _, name := range []string{"py", "python", "python3"} {
		path, err := osexec.LookPath(name)
		if err != nil {
			continue
		}
		if commandRuns(path, "-m", "yt_dlp", "--version") {
			return path, []string{"-m", "yt_dlp"}
		}
	}

	for _, name := range []string{"yt-dlp.exe", "yt-dlp"} {
		candidate := filepath.Join(root, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() && commandRuns(candidate, "--version") {
			return candidate, nil
		}
	}
	return "yt-dlp", nil
}

// resolveCommandPath makes configured filesystem paths absolute. Downloads
// run with their output directory as the process working directory, so a
// relative YTDLP_PATH would otherwise work for /info and fail for /download.
// Bare command names (for example "yt-dlp") are intentionally left for PATH
// lookup.
func resolveCommandPath(root, configured string) string {
	if filepath.IsAbs(configured) {
		return configured
	}
	if strings.ContainsAny(configured, `/\\`) {
		return filepath.Join(root, configured)
	}
	// A bare name may still refer to a bundled executable beside the server;
	// prefer that file when present, otherwise leave it for PATH resolution.
	candidate := filepath.Join(root, configured)
	if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
		return candidate
	}
	return configured
}

// ─── internal helpers ────────────────────────────────────────────────────────

// walkUp walks up from dir looking for a subdirectory named marker, checking up
// to maxDepth levels. Returns the directory that contains marker, or "".
func walkUp(dir, marker string, maxDepth int) string {
	for range maxDepth {
		if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir { // filesystem root reached
			return ""
		}
		dir = parent
	}
	return ""
}

// findRootDir walks up from the binary's directory looking for the project root,
// identified by go.mod. Falls back to cwd on `go run` (where the binary lives
// in a temp dir), and supports packaged binaries whose directory has no go.mod.
func findRootDir() string {
	ex, err := os.Executable()
	if err != nil {
		if cwd, _ := os.Getwd(); cwd != "" {
			return cwd
		}
		return "."
	}

	if found := walkUp(filepath.Dir(ex), "go.mod", 6); found != "" {
		return found
	}

	// During `go run` the executable sits in a temp dir; fall back to cwd.
	if cwd, _ := os.Getwd(); cwd != "" {
		if found := walkUp(cwd, "go.mod", 6); found != "" {
			return found
		}
	}

	return filepath.Dir(ex)
}

func resolvePath(root, requested, fallback string) string {
	if requested == "" {
		requested = fallback
	}
	if filepath.IsAbs(requested) {
		return requested
	}
	return filepath.Join(root, requested)
}

func strEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func boolEnv(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return fallback
}

func intEnv(key string, fallback, min, max int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func i64Env(key string, fallback, min int64) int64 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	return n
}
