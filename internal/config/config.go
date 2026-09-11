// Package config loads and validates runtime configuration from environment
// variables (and an optional .env file at the project root).
//
// Every exported field maps 1-to-1 to an environment variable whose name is
// identical to the original Node.js config.js, so existing .env files work
// without modification.
package config

import (
	"os"
	osexec "os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all server configuration. Fields are immutable after [Load].
type Config struct {
	// ── Paths ──────────────────────────────────────────────────────────────
	RootDir     string // project root (parent of the go/ directory)
	DownloadDir string // resolved download destination

	// ── yt-dlp ─────────────────────────────────────────────────────────────
	YtDlpPath      string   // path or name of the yt-dlp executable
	YtDlpArgs      []string // optional launcher arguments, e.g. -m yt_dlp
	YtDlpJSRuntime string   // optional custom JS runtime (e.g. node, deno)

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
}

// Load reads configuration from the environment (and an optional .env file at
// the project root). Missing or malformed values fall back to the same defaults
// as the original Node.js config.js.
func Load() *Config {
	root := findRootDir()

	// Silently ignore a missing .env — environment-only deployments still work.
	_ = godotenv.Load(filepath.Join(root, ".env"))

	ytDlpPath, ytDlpArgs := resolveYtDlpCommand(root)
	if configured := strEnv("YTDLP_PATH", ""); configured != "" {
		ytDlpPath = configured
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
	}

	cfg.DownloadDir = resolvePath(root, strEnv("DOWNLOAD_DIR", ""), "downloads")

	for _, o := range strings.Split(strEnv("FRONTEND_ORIGIN", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.FrontendOrigins = append(cfg.FrontendOrigins, o)
		}
	}

	return cfg
}

// resolveYtDlpCommand finds a usable yt-dlp command for local development.
// Prefer an installed Python module when available because a PyInstaller
// executable can be blocked by Windows extraction policies. Fall back to a
// standalone executable beside the server, then to PATH for normal installs.
func resolveYtDlpCommand(root string) (string, []string) {
	for _, name := range []string{"py", "python", "python3"} {
		path, err := osexec.LookPath(name)
		if err != nil {
			continue
		}
		if err := osexec.Command(path, "-m", "yt_dlp", "--version").Run(); err == nil {
			return path, []string{"-m", "yt_dlp"}
		}
	}

	for _, name := range []string{"yt-dlp.exe", "yt-dlp"} {
		candidate := filepath.Join(root, name)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "yt-dlp", nil
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
// identified by the presence of a frontend/ subdirectory. Falls back to cwd on
// `go run` (where the binary lives in a temp dir).
func findRootDir() string {
	ex, err := os.Executable()
	if err != nil {
		if cwd, _ := os.Getwd(); cwd != "" {
			return cwd
		}
		return "."
	}

	if found := walkUp(filepath.Dir(ex), "frontend", 6); found != "" {
		return found
	}

	// During `go run` the executable sits in a temp dir; fall back to cwd.
	if cwd, _ := os.Getwd(); cwd != "" {
		if found := walkUp(cwd, "frontend", 6); found != "" {
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
