package validation_test

import (
	"path/filepath"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/validation"
)

// ─── IsPrivateIP ─────────────────────────────────────────────────────────────

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		addr    string
		private bool
	}{
		// Loopback
		{"127.0.0.1", true},
		{"127.255.255.255", true},
		{"::1", true},
		{"::", true},

		// Private IPv4
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.0.1", true},
		{"192.168.255.255", true},

		// Link-local
		{"169.254.0.1", true},
		{"169.254.255.255", true},
		{"fe80::1", true},

		// ULA IPv6
		{"fc00::1", true},
		{"fd12:3456::1", true},

		// IPv4-mapped IPv6 containing a private address
		{"::ffff:10.0.0.1", true},
		{"::ffff:192.168.1.1", true},

		// Multicast / reserved
		{"224.0.0.1", true},
		{"255.255.255.255", true},

		// Public addresses — must NOT be flagged as private
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"2606:4700:4700::1111", false}, // Cloudflare IPv6
		{"172.32.0.1", false},           // just outside the 172.16/12 range
		{"192.169.0.1", false},
		{"11.0.0.1", false},

		// Edge cases
		{"", true}, // empty → private by convention
	}

	for _, tc := range tests {
		got := validation.IsPrivateIP(tc.addr)
		if got != tc.private {
			t.Errorf("IsPrivateIP(%q) = %v, want %v", tc.addr, got, tc.private)
		}
	}
}

// ─── ValidateFilenameTemplate ─────────────────────────────────────────────────

func TestValidateFilenameTemplate(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		// Default
		{"", "%(title)s.%(ext)s", false},
		{"   ", "%(title)s.%(ext)s", false},

		// Already has extension placeholder
		{"%(title)s.%(ext)s", "%(title)s.%(ext)s", false},
		{"%(uploader)s - %(title)s.%(ext)s", "%(uploader)s - %(title)s.%(ext)s", false},

		// Template without extension — gets appended
		{"%(title)s", "%(title)s.%(ext)s", false},
		{"my video", "my video.%(ext)s", false},

		// Too long
		{string(make([]byte, 201)), "", true},

		// Path traversal
		{"../evil", "", true},
		{"..evil", "", true},
		{"..", "", true},

		// Slashes
		{"path/to/file", "", true},
		{`path\to\file`, "", true},

		// Null byte
		{"file\x00name", "", true},
	}

	for _, tc := range tests {
		got, err := validation.ValidateFilenameTemplate(tc.input)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateFilenameTemplate(%q): err=%v, wantErr=%v", tc.input, err, tc.wantErr)
			continue
		}
		if !tc.wantErr && got != tc.want {
			t.Errorf("ValidateFilenameTemplate(%q) = %q, want %q", tc.input, got, tc.want)
		}
		if tc.wantErr {
			if _, ok := err.(*validation.Error); !ok {
				t.Errorf("ValidateFilenameTemplate(%q): expected *validation.Error, got %T", tc.input, err)
			}
		}
	}
}

// ─── OneOf ───────────────────────────────────────────────────────────────────

func TestOneOf(t *testing.T) {
	allowed := []string{"mp4", "mkv", "webm"}

	tests := []struct {
		value   string
		want    string
		wantErr bool
	}{
		{"mp4", "mp4", false},
		{"mkv", "mkv", false},
		{"webm", "webm", false},
		{"", "", false},         // empty → passthrough
		{"default", "default", false}, // "default" → passthrough
		{"avi", "", true},       // not in allowed list
		{"MP4", "", true},       // case-sensitive
	}

	for _, tc := range tests {
		got, err := validation.OneOf(tc.value, allowed, "test format")
		if (err != nil) != tc.wantErr {
			t.Errorf("OneOf(%q): err=%v, wantErr=%v", tc.value, err, tc.wantErr)
			continue
		}
		if !tc.wantErr && got != tc.want {
			t.Errorf("OneOf(%q) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

// ─── ResolveDownloadDirectory ─────────────────────────────────────────────────

func TestResolveDownloadDirectory(t *testing.T) {
	cfg := &config.Config{
		DownloadDir:             "/default/downloads",
		RootDir:                 "/root",
		AllowCustomDownloadPath: false,
	}

	// Default paths always resolve to DownloadDir.
	for _, p := range []string{"", "downloads", "./downloads", "/downloads", "downloads/"} {
		got, err := validation.ResolveDownloadDirectory(p, cfg)
		if err != nil {
			t.Errorf("ResolveDownloadDirectory(%q): unexpected error: %v", p, err)
			continue
		}
		if got != cfg.DownloadDir {
			t.Errorf("ResolveDownloadDirectory(%q) = %q, want %q", p, got, cfg.DownloadDir)
		}
	}

	// Custom path rejected when AllowCustomDownloadPath is false.
	_, err := validation.ResolveDownloadDirectory("/custom/path", cfg)
	if err == nil {
		t.Error("expected error for custom path when AllowCustomDownloadPath=false")
	}

	// Custom path allowed when AllowCustomDownloadPath is true.
	cfgCustom := *cfg
	cfgCustom.RootDir = "/root"
	cfgCustom.AllowCustomDownloadPath = true
	got, err := validation.ResolveDownloadDirectory("mydir", &cfgCustom)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	// Use filepath.Join so the expected value is OS-portable (backslash on Windows).
	want := filepath.Join("/root", "mydir")
	if got != want {
		t.Errorf("ResolveDownloadDirectory(mydir) = %q, want %q", got, want)
	}
}

// ─── ValidateMediaURL (non-DNS tests) ────────────────────────────────────────

func TestValidateMediaURL_syntax(t *testing.T) {
	// Use AllowPrivateURLs=true to skip DNS resolution so tests are fast and
	// deterministic in offline/CI environments.
	cfg := &config.Config{AllowPrivateURLs: true}

	tests := []struct {
		url     string
		wantErr bool
		errCode string
	}{
		// Valid
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", false, ""},
		{"http://example.com/video.mp4", false, ""},

		// Empty
		{"", true, "MISSING_URL"},
		{"   ", true, "MISSING_URL"},

		// Malformed
		{"not-a-url", true, "MALFORMED_URL"},
		{"://no-scheme", true, "MALFORMED_URL"},

		// Unsupported scheme (has a host)
		{"ftp://example.com/file", true, "UNSUPPORTED_PROTOCOL"},
		// javascript: URIs are opaque (no host) → MALFORMED_URL, not UNSUPPORTED_PROTOCOL.
		// This is correct Go net/url behaviour and is safe either way.
		{"javascript:alert(1)", true, "MALFORMED_URL"},

		// Embedded credentials
		{"https://user:pass@example.com/", true, "URL_CREDENTIALS_NOT_ALLOWED"},
		{"https://user@example.com/", true, "URL_CREDENTIALS_NOT_ALLOWED"},
	}

	for _, tc := range tests {
		_, err := validation.ValidateMediaURL(tc.url, cfg)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateMediaURL(%q): err=%v, wantErr=%v", tc.url, err, tc.wantErr)
			continue
		}
		if tc.wantErr {
			ve, ok := err.(*validation.Error)
			if !ok {
				t.Errorf("ValidateMediaURL(%q): expected *validation.Error, got %T", tc.url, err)
				continue
			}
			if ve.Code != tc.errCode {
				t.Errorf("ValidateMediaURL(%q): code=%q, want %q", tc.url, ve.Code, tc.errCode)
			}
		}
	}
}

func TestValidateMediaURL_privateBlocked(t *testing.T) {
	// Without AllowPrivateURLs, localhost must be rejected without DNS.
	cfg := &config.Config{AllowPrivateURLs: false}

	_, err := validation.ValidateMediaURL("http://localhost/video", cfg)
	if err == nil {
		t.Error("expected error for localhost URL")
	}
	ve, ok := err.(*validation.Error)
	if !ok || ve.Code != "PRIVATE_URL_NOT_ALLOWED" {
		t.Errorf("expected PRIVATE_URL_NOT_ALLOWED, got %v", err)
	}
}
