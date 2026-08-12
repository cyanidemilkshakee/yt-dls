// Package config loads and validates runtime configuration from environment
// variables (and an optional .env file at the project root).
//
// Every exported field maps 1-to-1 to an environment variable whose name is
// identical to the original Node.js config.js, so existing .env files work
// without modification.
package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all server configuration. Fields are immutable after [Load].
type Config struct {
	// ── Paths ──────────────────────────────────────────────────────────────
	RootDir     string // project root (parent of the go/ directory)
	FrontendDir string // <RootDir>/frontend
	DownloadDir string // resolved download destination
	LogsDir     string // resolved log directory

	// ── yt-dlp ─────────────────────────────────────────────────────────────
	YtDlpPath      string // path or name of the yt-dlp executable
	YtDlpJSRuntime string // optional custom JS runtime (e.g. node, deno)

	// ── HTTP server ─────────────────────────────────────────────────────────
	Port            int
	Host            string
	AutoOpenBrowser bool

	// ── Security / access ───────────────────────────────────────────────────
	AllowCustomDownloadPath   bool
	AllowDangerousOptions     bool
	AllowPrivateURLs          bool
	FrontendOrigins           []string // extra allowed CORS origins

	// ── Logging ─────────────────────────────────────────────────────────────
	LogLevel string // "debug" | "info" | "warn" | "error"

	// ── Limits ──────────────────────────────────────────────────────────────
	MaxConcurrentDownloads    int
	MaxDownloadDurationMs     int64
	YtDlpCheckTimeoutMs       int64
	InfoTimeoutMs             int64
	InfoMaxOutputBytes        int64
	RequestsPerMinute         int
	DownloadRequestsPerMinute int
}

// Load reads configuration from the environment (and an optional .env file at
// the project root). Missing or malformed values fall back to the same defaults
// as the original Node.js config.js.
func Load() *Config {
	root := findRootDir()

	// Silently ignore a missing .env — environment-only deployments still work.
	_ = godotenv.Load(filepath.Join(root, ".env"))

	cfg := &Config{
		RootDir:     root,
		FrontendDir: filepath.Join(root, "frontend"),

		YtDlpPath:      strEnv("YTDLP_PATH", "yt-dlp"),
		YtDlpJSRuntime: strEnv("YTDLP_JS_RUNTIME", ""),
		Host:           strEnv("HOST", "127.0.0.1"),
		LogLevel:  strEnv("LOG_LEVEL", "info"),

		Port:            intEnv("PORT", 7391, 1, 65535),
		AutoOpenBrowser: boolEnv("AUTO_OPEN_BROWSER", true),

		AllowCustomDownloadPath: boolEnv("ALLOW_CUSTOM_DOWNLOAD_PATH", false),
		AllowDangerousOptions:   boolEnv("ALLOW_DANGEROUS_OPTIONS", false),
		AllowPrivateURLs:        boolEnv("ALLOW_PRIVATE_URLS", false),

		MaxConcurrentDownloads:    intEnv("MAX_CONCURRENT_DOWNLOADS", 3, 1, 32),
		MaxDownloadDurationMs:     i64Env("MAX_DOWNLOAD_DURATION_MS", 30*60*1000, 10_000),
		YtDlpCheckTimeoutMs:       i64Env("YTDLP_CHECK_TIMEOUT_MS", 15_000, 1_000),
		InfoTimeoutMs:             i64Env("INFO_TIMEOUT_MS", 120_000, 5_000),
		InfoMaxOutputBytes:        i64Env("INFO_MAX_OUTPUT_BYTES", 16*1024*1024, 1024*1024),
		RequestsPerMinute:         intEnv("REQUESTS_PER_MINUTE", 180, 10, 1<<30),
		DownloadRequestsPerMinute: intEnv("DOWNLOAD_REQUESTS_PER_MINUTE", 20, 1, 1<<30),
	}

	cfg.DownloadDir = resolvePath(root, strEnv("DOWNLOAD_DIR", ""), "downloads")
	cfg.LogsDir = resolvePath(root, strEnv("LOG_DIR", ""), "logs")

	for _, o := range strings.Split(strEnv("FRONTEND_ORIGIN", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.FrontendOrigins = append(cfg.FrontendOrigins, o)
		}
	}

	return cfg
}

// IsLoopback reports whether the configured Host is a loopback address.
func (c *Config) IsLoopback() bool {
	return c.Host == "127.0.0.1" || c.Host == "localhost" || c.Host == "::1"
}

// ─── internal helpers ────────────────────────────────────────────────────────

// findRootDir walks up from the binary's directory looking for the project root,
// identified by the presence of a frontend/ subdirectory.
func findRootDir() string {
	ex, err := os.Executable()
	if err != nil {
		if cwd, _ := os.Getwd(); cwd != "" {
			return cwd
		}
		return "."
	}

	dir := filepath.Dir(ex)
	for range 6 {
		if _, err := os.Stat(filepath.Join(dir, "frontend")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir { // filesystem root reached
			break
		}
		dir = parent
	}

	// During `go run` the executable sits in a temp dir; fall back to cwd.
	if cwd, _ := os.Getwd(); cwd != "" {
		// Walk up from cwd too.
		dir = cwd
		for range 6 {
			if _, err := os.Stat(filepath.Join(dir, "frontend")); err == nil {
				return dir
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
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
