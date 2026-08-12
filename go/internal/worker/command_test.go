package worker_test

import (
	"strings"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/worker"
)

// testCfg returns a minimal config suitable for command builder tests.
func testCfg(dangerous bool) *config.Config {
	return &config.Config{
		YtDlpPath:             "yt-dlp",
		DownloadDir:           "/downloads",
		AllowDangerousOptions: dangerous,
	}
}

func buildOK(t *testing.T, opts worker.DownloadOptions, dlDir string, cfg *config.Config) worker.BuildResult {
	t.Helper()
	res, err := worker.BuildCommand(opts, dlDir, cfg)
	if err != nil {
		t.Fatalf("BuildCommand returned unexpected error: %v", err)
	}
	return res
}

// assertContains checks that target appears somewhere in cmd (exact string match).
func assertContains(t *testing.T, cmd []string, target string) {
	t.Helper()
	for _, arg := range cmd {
		if arg == target {
			return
		}
	}
	t.Errorf("expected %q in command %v", target, cmd)
}

// assertNotContains checks that target does NOT appear in cmd.
func assertNotContains(t *testing.T, cmd []string, target string) {
	t.Helper()
	for _, arg := range cmd {
		if arg == target {
			t.Errorf("unexpected %q in command %v", target, cmd)
			return
		}
	}
}

// assertConsecutive checks that flag is immediately followed by value.
func assertConsecutive(t *testing.T, cmd []string, flag, value string) {
	t.Helper()
	for i, arg := range cmd {
		if arg == flag {
			if i+1 >= len(cmd) {
				t.Errorf("flag %q has no following argument", flag)
				return
			}
			if cmd[i+1] != value {
				t.Errorf("flag %q followed by %q, want %q", flag, cmd[i+1], value)
			}
			return
		}
	}
	t.Errorf("flag %q not found in command", flag)
}

// ─── BuildCommand basics ─────────────────────────────────────────────────────

func TestBuildCommand_minimal(t *testing.T) {
	opts := worker.DownloadOptions{URL: "https://example.com/video"}
	res := buildOK(t, opts, "/downloads", testCfg(false))

	// yt-dlp must be first
	if res.Command[0] != "yt-dlp" {
		t.Errorf("first arg = %q, want yt-dlp", res.Command[0])
	}

	// Progress template flags must be present
	assertContains(t, res.Command, "--newline")
	assertContains(t, res.Command, "--progress-template")

	// Default format selector
	assertConsecutive(t, res.Command, "-f", "bestvideo+bestaudio/best")

	// Default filename template
	assertConsecutive(t, res.Command, "-o", "%(title)s.%(ext)s")

	// Download directory
	assertConsecutive(t, res.Command, "-P", "/downloads")

	// No overwrite (default)
	assertContains(t, res.Command, "--no-overwrites")
	assertNotContains(t, res.Command, "--force-overwrites")

	// Standard reliability flags
	assertContains(t, res.Command, "--retries")
	assertContains(t, res.Command, "--fragment-retries")
	assertContains(t, res.Command, "--no-colors")
	assertContains(t, res.Command, "--no-warnings")

	// URL must be last
	last := res.Command[len(res.Command)-1]
	if last != "https://example.com/video" {
		t.Errorf("last arg = %q, want URL", last)
	}
}

func TestBuildCommand_customFormat(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:        "https://example.com/v",
		FormatCode: "bestvideo[height<=1080]+bestaudio/best",
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertConsecutive(t, res.Command, "-f", "bestvideo[height<=1080]+bestaudio/best")
}

func TestBuildCommand_invalidFormatSelector(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:        "https://example.com/v",
		FormatCode: "bad;format$()",
	}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error for invalid format selector")
	}
}

func TestBuildCommand_overwrite(t *testing.T) {
	opts := worker.DownloadOptions{URL: "https://x.com/v", Overwrite: true}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertContains(t, res.Command, "--force-overwrites")
	assertNotContains(t, res.Command, "--no-overwrites")
}

func TestBuildCommand_mergeFormat(t *testing.T) {
	opts := worker.DownloadOptions{URL: "https://x.com/v", OutputFormat: "mkv"}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertConsecutive(t, res.Command, "--merge-output-format", "mkv")
}

func TestBuildCommand_invalidMergeFormat(t *testing.T) {
	opts := worker.DownloadOptions{URL: "https://x.com/v", OutputFormat: "exe"}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error for unsupported merge format")
	}
}

// ─── Subtitles ───────────────────────────────────────────────────────────────

func TestBuildCommand_subtitles(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:             "https://x.com/v",
		EnableSubtitles: true,
		SubtitleLang:    "en",
		EmbedSubs:       true,
		ConvertSubs:     "srt",
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertContains(t, res.Command, "--write-subs")
	assertContains(t, res.Command, "--write-auto-subs")
	assertConsecutive(t, res.Command, "--sub-langs", "en")
	assertContains(t, res.Command, "--embed-subs")
	assertConsecutive(t, res.Command, "--convert-subs", "srt")
}

func TestBuildCommand_subtitlesAll(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:             "https://x.com/v",
		EnableSubtitles: true,
		SubtitleLang:    "all",
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertContains(t, res.Command, "--write-subs")
	// "all" → no --sub-langs flag
	assertNotContains(t, res.Command, "--sub-langs")
}

// ─── Audio extraction ────────────────────────────────────────────────────────

func TestBuildCommand_extractAudio(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:          "https://x.com/v",
		ExtractAudio: true,
		AudioFormat:  "mp3",
		AudioQuality: "5",
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertContains(t, res.Command, "--extract-audio")
	assertConsecutive(t, res.Command, "--audio-format", "mp3")
	assertConsecutive(t, res.Command, "--audio-quality", "5")
}

func TestBuildCommand_audioQualityBitrate(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:          "https://x.com/v",
		ExtractAudio: true,
		AudioFormat:  "mp3",
		AudioQuality: "128K",
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertConsecutive(t, res.Command, "--audio-quality", "128K")
}

func TestBuildCommand_invalidAudioQuality(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:          "https://x.com/v",
		ExtractAudio: true,
		AudioQuality: "very-high",
	}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error for invalid audio quality")
	}
}

// ─── Dangerous options ───────────────────────────────────────────────────────

func TestBuildCommand_dangerousRejectedByDefault(t *testing.T) {
	opts := worker.DownloadOptions{
		URL: "https://x.com/v",
		AdvancedSettings: worker.AdvancedSettings{
			Exec: "echo done",
		},
	}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error: exec is a dangerous option")
	}
}

func TestBuildCommand_dangerousAllowedWhenEnabled(t *testing.T) {
	opts := worker.DownloadOptions{
		URL: "https://x.com/v",
		AdvancedSettings: worker.AdvancedSettings{
			Exec: "echo done",
		},
	}
	res := buildOK(t, opts, "/dl", testCfg(true))
	assertConsecutive(t, res.Command, "--exec", "echo done")
}

func TestBuildCommand_forceIPv4IPv6Conflict(t *testing.T) {
	opts := worker.DownloadOptions{
		URL: "https://x.com/v",
		AdvancedSettings: worker.AdvancedSettings{
			ForceIPv4: true,
			ForceIPv6: true,
		},
	}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error: IPv4 and IPv6 cannot both be forced")
	}
}

// ─── RedactCommand ───────────────────────────────────────────────────────────

func TestRedactCommand(t *testing.T) {
	cmd := []string{
		"yt-dlp", "--username", "alice", "--password", "secret",
		"--twofactor", "123456", "https://x.com/v",
	}
	redacted := worker.RedactCommand(cmd)

	// Username is not a secret flag
	assertConsecutive(t, redacted, "--username", "alice")

	// Password and twofactor must be redacted
	assertConsecutive(t, redacted, "--password", "[REDACTED]")
	assertConsecutive(t, redacted, "--twofactor", "[REDACTED]")

	// Original slice must not be mutated
	if cmd[4] == "[REDACTED]" {
		t.Error("RedactCommand mutated the original slice")
	}
}

// ─── FormatCommand ───────────────────────────────────────────────────────────

func TestFormatCommand(t *testing.T) {
	tests := []struct {
		cmd  []string
		want string
	}{
		{
			[]string{"yt-dlp", "-f", "best", "https://example.com/v"},
			"yt-dlp -f best https://example.com/v",
		},
		{
			// Values with spaces must be quoted
			[]string{"yt-dlp", "-o", "my video.%(ext)s"},
			`yt-dlp -o "my video.%(ext)s"`,
		},
		{
			// Values with double-quotes must be escaped
			[]string{"yt-dlp", "--exec", `echo "done"`},
			`yt-dlp --exec "echo \"done\""`,
		},
	}

	for _, tc := range tests {
		got := worker.FormatCommand(tc.cmd)
		if got != tc.want {
			t.Errorf("FormatCommand(%v)\n  got  %q\n  want %q", tc.cmd, got, tc.want)
		}
	}
}

// ─── BuildResult metadata ────────────────────────────────────────────────────

func TestBuildCommand_resultMetadata(t *testing.T) {
	opts := worker.DownloadOptions{
		URL:      "https://x.com/v",
		Filename: "%(uploader)s - %(title)s",
	}
	res := buildOK(t, opts, "/custom/dir", testCfg(false))

	if res.DownloadDirectory != "/custom/dir" {
		t.Errorf("DownloadDirectory = %q, want /custom/dir", res.DownloadDirectory)
	}
	if !strings.HasSuffix(res.FilenameTemplate, ".%(ext)s") {
		t.Errorf("FilenameTemplate = %q, expected suffix .%%(ext)s", res.FilenameTemplate)
	}
}

// ─── Extractor options ───────────────────────────────────────────────────────

func TestBuildCommand_extractorRetries(t *testing.T) {
	n := 10
	opts := worker.DownloadOptions{
		URL: "https://x.com/v",
		AdvancedSettings: worker.AdvancedSettings{
			ExtractorRetries: &n,
		},
	}
	res := buildOK(t, opts, "/dl", testCfg(false))
	assertConsecutive(t, res.Command, "--extractor-retries", "10")
}

func TestBuildCommand_extractorRetriesInvalid(t *testing.T) {
	n := 200 // > 100
	opts := worker.DownloadOptions{
		URL: "https://x.com/v",
		AdvancedSettings: worker.AdvancedSettings{
			ExtractorRetries: &n,
		},
	}
	_, err := worker.BuildCommand(opts, "/dl", testCfg(false))
	if err == nil {
		t.Fatal("expected error for extractor retries > 100")
	}
}
