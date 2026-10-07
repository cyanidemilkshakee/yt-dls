// Package validation provides URL and user-input validation helpers.
// The validation API stays compatible with the frontend while network checks
// share the downloader's public-address policy.
package validation

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/api"
	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/network"
)

// ─── Error type ──────────────────────────────────────────────────────────────

// Error is returned for invalid user input (corresponds to HTTP 400).
type Error struct {
	Message string
	Code    string
}

func (e *Error) Error() string { return e.Message }

// ─── IsPrivateIP ─────────────────────────────────────────────────────────────

// IsPrivateIP reports whether addr is not a public unicast address, including
// private, loopback, mapped, link-local, and reserved ranges.
func IsPrivateIP(addr string) bool {
	if addr == "" {
		return true
	}
	ip, err := netip.ParseAddr(addr)
	if err != nil {
		return false // unparseable → let callers decide
	}
	return !network.IsPublicIP(ip)
}

// ValidateMediaURLContext parses and canonicalises a media URL, rejects private
// targets unless explicitly allowed, and uses ctx to cancel DNS lookups.
func ValidateMediaURLContext(ctx context.Context, rawURL string, cfg *config.Config) (string, error) {
	limit := api.StringLimit("InfoRequest", "url")
	if len(rawURL) > limit {
		return "", &Error{fmt.Sprintf("Media URLs must be at most %d bytes.", limit), "URL_TOO_LONG"}
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", &Error{"A media URL is required.", "MISSING_URL"}
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return "", &Error{"The media URL is malformed.", "MALFORMED_URL"}
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", &Error{"Only HTTP and HTTPS URLs are supported.", "UNSUPPORTED_PROTOCOL"}
	}
	if parsed.User != nil {
		user := parsed.User.Username()
		pass, hasPass := parsed.User.Password()
		if user != "" || (hasPass && pass != "") {
			return "", &Error{"Credentials must not be embedded in the URL.", "URL_CREDENTIALS_NOT_ALLOWED"}
		}
	}

	if cfg.AllowPrivateURLs {
		return parsed.String(), nil
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return "", &Error{"Private and loopback URLs are disabled.", "PRIVATE_URL_NOT_ALLOWED"}
	}

	// Resolve to IPs and reject any private/reserved address.
	var addrs []string
	if net.ParseIP(host) != nil {
		addrs = []string{host}
	} else {
		resolved, lookupErr := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		err = lookupErr
		if err != nil {
			return "", &Error{
				fmt.Sprintf("Could not resolve the media host: %s", err.Error()),
				"HOST_RESOLUTION_FAILED",
			}
		}
		for _, addr := range resolved {
			addrs = append(addrs, addr.String())
		}
	}
	if len(addrs) == 0 {
		return "", &Error{"Private, reserved, and loopback network addresses are disabled.", "PRIVATE_URL_NOT_ALLOWED"}
	}
	for _, a := range addrs {
		if IsPrivateIP(a) {
			return "", &Error{"Private, reserved, and loopback network addresses are disabled.", "PRIVATE_URL_NOT_ALLOWED"}
		}
	}

	return parsed.String(), nil
}

// ─── ResolveDownloadDirectory ────────────────────────────────────────────────

// ResolveDownloadDirectory returns the absolute destination for a download.
// An empty or default requestedPath returns cfg.DownloadDir.
// Custom paths require AllowCustomDownloadPath to be enabled.
// Mirrors resolveDownloadDirectory() in validation.js.
//
// FIX: path traversal guard added — the resolved path must be confined to
// cfg.RootDir. Without this, "../../../etc" would escape the root directory.
func ResolveDownloadDirectory(requestedPath string, cfg *config.Config) (string, error) {
	trimmed := strings.TrimSpace(requestedPath)
	if trimmed == "" || defaultDirRe.MatchString(trimmed) {
		return cfg.DownloadDir, nil
	}
	if !cfg.AllowCustomDownloadPath {
		return "", &Error{"Custom download paths are disabled by the server.", "CUSTOM_PATH_DISABLED"}
	}

	// Reject absolute paths that escape the root (e.g. C:\Windows or /etc).
	// Relative paths are joined with RootDir and then confined.
	var resolved string
	if filepath.IsAbs(trimmed) {
		resolved = trimmed
	} else {
		resolved = filepath.Join(cfg.RootDir, trimmed)
	}
	resolved = filepath.Clean(resolved)
	requestedPathResolved := resolved

	// Resolve existing symlinks so an in-root symlink cannot redirect writes
	// outside the configured root.
	rootClean, err := canonicalPath(cfg.RootDir)
	if err != nil {
		return "", &Error{"The configured download root is unavailable.", "INVALID_PATH"}
	}
	canonicalResolved, err := canonicalPath(resolved)
	if err != nil {
		return "", &Error{"The requested download path is unavailable.", "INVALID_PATH"}
	}
	rel, err := filepath.Rel(rootClean, canonicalResolved)
	if err != nil || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", &Error{"Path traversal is not allowed.", "INVALID_PATH"}
	}

	return requestedPathResolved, nil
}

// canonicalPath resolves symlinks even when the requested leaf does not yet
// exist by resolving the nearest existing parent and reattaching missing parts.
func canonicalPath(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	current := filepath.Clean(absolute)
	var missing []string
	for {
		if _, err := os.Lstat(current); err == nil {
			resolved, err := filepath.EvalSymlinks(current)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, missing[i])
			}
			return filepath.Clean(resolved), nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", os.ErrNotExist
		}
		missing = append(missing, filepath.Base(current))
		current = parent
	}
}

// defaultDirRe matches the placeholder "downloads" path sent by the frontend.
var defaultDirRe = regexp.MustCompile(`(?i)^\.?[/\\]?downloads[/\\]?$`)

// ─── ValidateFilenameTemplate ─────────────────────────────────────────────────

// ValidateFilenameTemplate validates and normalises a yt-dlp -o output template.
// Mirrors validateFilenameTemplate() in validation.js.
func ValidateFilenameTemplate(value string) (string, error) {
	tpl := strings.TrimSpace(value)
	if tpl == "" {
		tpl = "%(title)s"
	}
	if len(tpl) > 200 {
		return "", &Error{"Filename templates must contain 1–200 characters.", "INVALID_FILENAME"}
	}
	if strings.ContainsRune(tpl, 0) ||
		strings.ContainsAny(tpl, `/\`) ||
		tpl == ".." || strings.HasPrefix(tpl, "..") {
		return "", &Error{
			"Filename templates cannot contain paths or traversal segments.",
			"INVALID_FILENAME",
		}
	}
	if !strings.HasSuffix(tpl, ".%(ext)s") {
		tpl += ".%(ext)s"
	}
	return tpl, nil
}

// ─── OneOf ───────────────────────────────────────────────────────────────────

// OneOf returns value if it is one of the allowed strings.
// An empty or "default" value returns ("", nil) — the option is simply omitted.
// Mirrors oneOf() in validation.js.
//
// FIX: previously returned the literal string "default" for the "default" case,
// which meant every caller had to guard against it with `!= "default"`.
// Now both "" and "default" normalise to "" so callers only need `!= ""`.
func OneOf(value string, allowed []string, name string) (string, error) {
	if value == "" || value == "default" {
		return "", nil
	}
	for _, a := range allowed {
		if a == value {
			return value, nil
		}
	}
	return "", &Error{
		fmt.Sprintf("Unsupported %s: %s", name, value),
		"UNSUPPORTED_OPTION",
	}
}
