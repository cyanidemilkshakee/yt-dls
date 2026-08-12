// Package validation provides URL and user-input validation helpers.
// All logic is a direct port of backend/utils/validation.js; behaviour is
// identical so existing .env configurations and frontend payloads are compatible.
package validation

import (
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
)

// ─── Error type ──────────────────────────────────────────────────────────────

// Error is returned for invalid user input (corresponds to HTTP 400).
type Error struct {
	Message string
	Code    string
}

func (e *Error) Error() string { return e.Message }

// ─── IsPrivateIP ─────────────────────────────────────────────────────────────

// IsPrivateIP reports whether addr is a loopback, private, or otherwise
// reserved IP address. Mirrors isPrivateIp() in validation.js exactly,
// including the IPv4-mapped IPv6 handling.
func IsPrivateIP(addr string) bool {
	if addr == "" {
		return true
	}

	lower := strings.ToLower(addr)

	// IPv6 special cases that net.ParseIP handles as loopback / unspecified
	// but we also want to catch the full ULA / link-local prefixes.
	if lower == "::1" || lower == "::" {
		return true
	}
	if strings.HasPrefix(lower, "fe80:") ||
		strings.HasPrefix(lower, "fc") ||
		strings.HasPrefix(lower, "fd") {
		return true
	}

	// IPv4-mapped IPv6 ::ffff:x.x.x.x  →  check the embedded IPv4 address.
	if strings.HasPrefix(lower, "::ffff:") {
		if IsPrivateIP(addr[7:]) {
			return true
		}
	}

	ip := net.ParseIP(addr)
	if ip == nil {
		return false // unparseable → let callers decide
	}

	// Use the IPv4 form when available (mirrors JS behaviour which checks octets).
	if ip4 := ip.To4(); ip4 != nil {
		a, b := ip4[0], ip4[1]
		return a == 0 || // 0.0.0.0/8  — "this" network
			a == 10 || // 10.0.0.0/8 — private
			a == 127 || // 127.0.0.0/8 — loopback
			(a == 169 && b == 254) || // 169.254.0.0/16 — link-local
			(a == 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — private
			(a == 192 && b == 168) || // 192.168.0.0/16 — private
			a >= 224 // 224.0.0.0/4+ — multicast / reserved
	}

	// Pure IPv6 fall-through.
	return ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

// ─── ValidateMediaURL ────────────────────────────────────────────────────────

// ValidateMediaURL parses, canonicalises, and (unless AllowPrivateURLs is set)
// SSRF-guards rawURL by resolving it and rejecting private/reserved targets.
// Mirrors validateMediaUrl() in validation.js.
func ValidateMediaURL(rawURL string, cfg *config.Config) (string, error) {
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
		addrs, err = net.LookupHost(host)
		if err != nil {
			return "", &Error{
				fmt.Sprintf("Could not resolve the media host: %s", err.Error()),
				"HOST_RESOLUTION_FAILED",
			}
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
func ResolveDownloadDirectory(requestedPath string, cfg *config.Config) (string, error) {
	trimmed := strings.TrimSpace(requestedPath)
	if trimmed == "" || defaultDirRe.MatchString(trimmed) {
		return cfg.DownloadDir, nil
	}
	if !cfg.AllowCustomDownloadPath {
		return "", &Error{"Custom download paths are disabled by the server.", "CUSTOM_PATH_DISABLED"}
	}
	return filepath.Join(cfg.RootDir, trimmed), nil
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
func OneOf(value string, allowed []string, name string) (string, error) {
	if value == "" || value == "default" {
		return value, nil
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
