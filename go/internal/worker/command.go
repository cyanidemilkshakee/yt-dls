// Package worker — command.go
//
// Builds the yt-dlp argv slice from typed download options.
// This is a direct, line-for-line port of backend/services/commandBuilder.js.
// All flag names, option lists, validation rules, and secret-redaction logic
// match the original exactly so the frontend payload format is unchanged.
package worker

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/validation"
)

// ProgressTemplate is the --progress-template value passed to yt-dlp.
// It produces one JSON object per line on stdout, which worker.go parses.
const ProgressTemplate = `download:{"status":%(progress.status)j,"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j,"eta":%(progress.eta)j,"filename":%(progress.filename,info.filepath|)j,"vcodec":%(info.vcodec)j,"acodec":%(info.acodec)j,"format_id":%(info.format_id)j}`

// Allowed value sets — mirrors the JS constants.
var (
	mergeFormats    = []string{"avi", "flv", "mkv", "mov", "mp4", "webm"}
	audioFormats    = []string{"aac", "alac", "flac", "m4a", "mp3", "opus", "vorbis", "wav"}
	videoFormats    = []string{"avi", "flv", "gif", "mkv", "mov", "mp4", "webm"}
	subtitleFormats = []string{"ass", "lrc", "srt", "vtt"}
	concatPolicies  = []string{"never", "always", "multi_video"}
	fixupPolicies   = []string{"never", "warn", "detect_or_warn", "force"}
	thumbFormats    = []string{"jpg", "png", "webp"}

	// secretFlags are the yt-dlp flags whose next argument must be redacted in logs.
	secretFlags = map[string]bool{
		"--password":                    true,
		"--twofactor":                   true,
		"--video-password":              true,
		"--ap-password":                 true,
		"--client-certificate-password": true,
	}
)

// ─── Option types ─────────────────────────────────────────────────────────────

// AdvancedSettings mirrors the advancedSettings JSON object sent by the frontend.
// JSON tags exactly match the keys used in the frontend JavaScript.
type AdvancedSettings struct {
	Proxy                    string `json:"proxy"`
	SocketTimeout            *int   `json:"socket-timeout"`
	SourceAddress            string `json:"source-address"`
	GeoVerificationProxy     string `json:"geo-verification-proxy"`
	Xff                      string `json:"xff"`
	Impersonate              string `json:"impersonate"`
	ForceIPv4                bool   `json:"force-ipv4"`
	ForceIPv6                bool   `json:"force-ipv6"`
	EnableFileURLs           bool   `json:"enable-file-urls"`
	Username                 string `json:"username"`
	Password                 string `json:"password"`
	TwoFactor                string `json:"twofactor"`
	VideoPassword            string `json:"video-password"`
	ApMso                    string `json:"ap-mso"`
	ApUsername               string `json:"ap-username"`
	ApPassword               string `json:"ap-password"`
	Netrc                    bool   `json:"netrc"`
	NetrcLocation            string `json:"netrc-location"`
	NetrcCmd                 string `json:"netrc-cmd"`
	ClientCertificate        string `json:"client-certificate"`
	ClientCertificateKey     string `json:"client-certificate-key"`
	ClientCertPassword       string `json:"client-certificate-password"`
	ExtractorRetries         *int   `json:"extractor-retries"`
	IgnoreDynamicMpd         bool   `json:"ignore-dynamic-mpd"`
	HlsSplitDiscontinuity    bool   `json:"hls-split-discontinuity"`
	ExtractorArgs            string `json:"extractor-args"`
	FfmpegLocation           string `json:"ffmpeg-location"`
	Exec                     string `json:"exec"`
	NoExec                   bool   `json:"no-exec"`
}

// DownloadOptions mirrors the JSON request body sent by the frontend on
// POST /api/download and POST /api/command-preview.
type DownloadOptions struct {
	URL                  string           `json:"url"`
	FormatCode           string           `json:"formatCode"`
	Filename             string           `json:"filename"`
	OutputFormat         string           `json:"outputFormat"`
	Overwrite            bool             `json:"overwrite"`
	DownloadMode         string           `json:"downloadMode"`
	DownloadPath         string           `json:"downloadPath"`
	EnableSubtitles      bool             `json:"enableSubtitles"`
	SubtitleLang         string           `json:"subtitleLang"`
	EmbedSubs            bool             `json:"embedSubs"`
	ConvertSubs          string           `json:"convertSubs"`
	SubtitleFormat       string           `json:"subtitleFormat"`
	EmbedThumbnail       bool             `json:"embedThumbnail"`
	EmbedMetadata        bool             `json:"embedMetadata"`
	AddChapters          bool             `json:"addChapters"`
	EmbedInfoJson        bool             `json:"embedInfoJson"`
	Xattrs               bool             `json:"xattrs"`
	ParseMetadata        string           `json:"parseMetadata"`
	ReplaceInMetadata    string           `json:"replaceInMetadata"`
	EnablePostprocessing bool             `json:"enablePostprocessing"`
	ExtractAudio         bool             `json:"extractAudio"`
	AudioFormat          string           `json:"audioFormat"`
	AudioQuality         string           `json:"audioQuality"`
	RemuxVideo           string           `json:"remuxVideo"`
	RecodeVideo          string           `json:"recodeVideo"`
	ConvertThumb         string           `json:"convertThumb"`
	PostprocessorArgs    string           `json:"postprocessorArgs"`
	KeepVideo            bool             `json:"keepVideo"`
	PostOverwrites       *bool            `json:"postOverwrites"`
	SplitChapters        bool             `json:"splitChapters"`
	ForceKeyframes       bool             `json:"forceKeyframes"`
	ConcatPlaylist       string           `json:"concatPlaylist"`
	Fixup                string           `json:"fixup"`
	AdvancedSettings     AdvancedSettings `json:"advancedSettings"`
}

// BuildResult holds the built argv and related metadata.
type BuildResult struct {
	Command           []string
	FilenameTemplate  string
	DownloadDirectory string
}

// ─── BuildCommand ─────────────────────────────────────────────────────────────

// BuildCommand constructs the yt-dlp argv from opts.
// downloadDirectory must already be resolved via validation.ResolveDownloadDirectory.
// Mirrors buildYtDlpCommand() in commandBuilder.js exactly.
func BuildCommand(opts DownloadOptions, downloadDirectory string, cfg *config.Config) (BuildResult, error) {
	b := &builder{cfg: cfg}
	b.add(cfg.YtDlpPath, "--newline", "--progress-template", ProgressTemplate)
	if cfg.YtDlpJSRuntime != "" {
		b.add("--js-runtimes", cfg.YtDlpJSRuntime)
	}

	// ── Format selector ──────────────────────────────────────────────────────
	fs, err := validateFormatSelector(opts.FormatCode)
	if err != nil {
		return BuildResult{}, err
	}
	b.add("-f", fs)

	// ── Filename template ────────────────────────────────────────────────────
	filenameTpl, err := validation.ValidateFilenameTemplate(opts.Filename)
	if err != nil {
		return BuildResult{}, err
	}
	b.add("-o", filenameTpl, "-P", downloadDirectory)

	// ── Merge output format ──────────────────────────────────────────────────
	outputFmt, err := validation.OneOf(opts.OutputFormat, mergeFormats, "merge output format")
	if err != nil {
		return BuildResult{}, err
	}
	if outputFmt != "" && outputFmt != "default" {
		b.add("--merge-output-format", outputFmt)
	}

	// ── Overwrite ────────────────────────────────────────────────────────────
	if opts.Overwrite {
		b.add("--force-overwrites")
	} else {
		b.add("--no-overwrites")
	}

	// ── Subtitles ────────────────────────────────────────────────────────────
	if opts.EnableSubtitles {
		subLang := strOpt(opts.SubtitleLang, 100)
		if subLang != "" && subLang != "none" {
			b.add("--write-subs", "--write-auto-subs")
			if subLang != "all" {
				b.add("--sub-langs", subLang)
			}
			if opts.EmbedSubs {
				b.add("--embed-subs")
			}
			convertSubs, err := validation.OneOf(opts.ConvertSubs, subtitleFormats, "subtitle conversion format")
			if err != nil {
				return BuildResult{}, err
			}
			if convertSubs != "" {
				b.add("--convert-subs", convertSubs)
			}
		}
		subFmt := opts.SubtitleFormat
		if subFmt != "best" {
			subFmt, err = validation.OneOf(subFmt, subtitleFormats, "subtitle format")
			if err != nil {
				return BuildResult{}, err
			}
		}
		if subFmt != "" && subFmt != "best" {
			b.add("--sub-format", subFmt)
		}
	}

	// ── Embedding options ────────────────────────────────────────────────────
	if opts.EmbedThumbnail {
		b.add("--embed-thumbnail")
	}
	if opts.EmbedMetadata {
		b.add("--embed-metadata")
	}
	if opts.AddChapters {
		b.add("--embed-chapters")
	}
	if opts.EmbedInfoJson {
		b.add("--embed-info-json")
	}
	if opts.Xattrs {
		b.add("--xattrs")
	}

	// ── Metadata manipulation ────────────────────────────────────────────────
	if pm := strOpt(opts.ParseMetadata, 500); pm != "" {
		b.add("--parse-metadata", pm)
	}
	if opts.ReplaceInMetadata != "" {
		tokens, err := splitArgs(opts.ReplaceInMetadata, 1000)
		if err != nil {
			return BuildResult{}, err
		}
		if len(tokens) > 0 {
			if len(tokens) != 3 {
				return BuildResult{}, &validation.Error{
					Message: "Replace-in-metadata requires exactly three parts: FIELDS REGEX REPLACE.",
					Code:    "INVALID_OPTION",
				}
			}
			b.add("--replace-in-metadata")
			b.add(tokens...)
		}
	}

	// ── Post-processing ──────────────────────────────────────────────────────
	if opts.EnablePostprocessing || opts.ExtractAudio {
		if opts.ExtractAudio {
			b.add("--extract-audio")

			audioFmt := opts.AudioFormat
			if audioFmt != "best" {
				audioFmt, err = validation.OneOf(audioFmt, audioFormats, "audio format")
				if err != nil {
					return BuildResult{}, err
				}
			}
			if audioFmt != "" && audioFmt != "best" {
				b.add("--audio-format", audioFmt)
			}

			q, err := validateAudioQuality(opts.AudioQuality)
			if err != nil {
				return BuildResult{}, err
			}
			if q != "" {
				b.add("--audio-quality", q)
			}
		}

		remuxAll := append(videoFormats, audioFormats...)
		remux, err := validation.OneOf(opts.RemuxVideo, remuxAll, "remux format")
		if err != nil {
			return BuildResult{}, err
		}
		if remux != "" {
			b.add("--remux-video", remux)
		}

		recode, err := validation.OneOf(opts.RecodeVideo, videoFormats, "recode format")
		if err != nil {
			return BuildResult{}, err
		}
		if recode != "" {
			b.add("--recode-video", recode)
		}

		thumb, err := validation.OneOf(opts.ConvertThumb, thumbFormats, "thumbnail format")
		if err != nil {
			return BuildResult{}, err
		}
		if thumb != "" {
			b.add("--convert-thumbnails", thumb)
		}

		if ppArgs := strOpt(opts.PostprocessorArgs, 1000); ppArgs != "" {
			if err := b.dangerous("--postprocessor-args", ppArgs, "Raw postprocessor arguments"); err != nil {
				return BuildResult{}, err
			}
		}

		if opts.KeepVideo {
			b.add("--keep-video")
		}

		if opts.PostOverwrites != nil && !*opts.PostOverwrites {
			b.add("--no-post-overwrites")
		} else {
			b.add("--post-overwrites")
		}
	}

	// ── Chapter / playlist ───────────────────────────────────────────────────
	if opts.SplitChapters {
		b.add("--split-chapters")
	}
	if opts.ForceKeyframes {
		b.add("--force-keyframes-at-cuts")
	}

	concat, err := validation.OneOf(opts.ConcatPlaylist, concatPolicies, "playlist concatenation policy")
	if err != nil {
		return BuildResult{}, err
	}
	if concat != "" && concat != "multi_video" {
		b.add("--concat-playlist", concat)
	}

	fixup, err := validation.OneOf(opts.Fixup, fixupPolicies, "fixup policy")
	if err != nil {
		return BuildResult{}, err
	}
	if fixup != "" && fixup != "detect_or_warn" {
		b.add("--fixup", fixup)
	}

	// ── Advanced settings ────────────────────────────────────────────────────
	adv := opts.AdvancedSettings

	if proxy := strOpt(adv.Proxy, 500); proxy != "" {
		b.add("--proxy", proxy)
	}
	if adv.SocketTimeout != nil {
		t := *adv.SocketTimeout
		if t < 1 || t > 3600 {
			return BuildResult{}, &validation.Error{
				"socket timeout must be between 1 and 3600.", "INVALID_OPTION",
			}
		}
		b.add("--socket-timeout", strconv.Itoa(t))
	}
	if sa := strOpt(adv.SourceAddress, 100); sa != "" {
		b.add("--source-address", sa)
	}
	if gp := strOpt(adv.GeoVerificationProxy, 500); gp != "" {
		b.add("--geo-verification-proxy", gp)
	}
	if xff := strOpt(adv.Xff, 100); xff != "" {
		b.add("--xff", xff)
	}
	if imp := strOpt(adv.Impersonate, 100); imp != "" {
		b.add("--impersonate", imp)
	}

	if adv.ForceIPv4 && adv.ForceIPv6 {
		return BuildResult{}, &validation.Error{
			"IPv4 and IPv6 cannot both be forced.", "CONFLICTING_OPTIONS",
		}
	}
	if adv.ForceIPv4 {
		b.add("--force-ipv4")
	}
	if adv.ForceIPv6 {
		b.add("--force-ipv6")
	}

	if adv.EnableFileURLs {
		if err := b.dangerousFlag("--enable-file-urls", "Local file URLs"); err != nil {
			return BuildResult{}, err
		}
	}

	// Credentials (in same order as JS)
	for _, pair := range []struct{ val, flag string }{
		{adv.Username, "--username"},
		{adv.Password, "--password"},
		{adv.TwoFactor, "--twofactor"},
		{adv.VideoPassword, "--video-password"},
		{adv.ApMso, "--ap-mso"},
		{adv.ApUsername, "--ap-username"},
		{adv.ApPassword, "--ap-password"},
	} {
		if v := strOpt(pair.val, 1000); v != "" {
			b.add(pair.flag, v)
		}
	}

	if adv.Netrc {
		if err := b.dangerousFlag("--netrc", "Reading .netrc credentials"); err != nil {
			return BuildResult{}, err
		}
	}
	if nl := strOpt(adv.NetrcLocation, 500); nl != "" {
		if err := b.dangerous("--netrc-location", nl, "Custom .netrc files"); err != nil {
			return BuildResult{}, err
		}
	}
	if nc := strOpt(adv.NetrcCmd, 1000); nc != "" {
		if err := b.dangerous("--netrc-cmd", nc, "netrc commands"); err != nil {
			return BuildResult{}, err
		}
	}
	if cc := strOpt(adv.ClientCertificate, 500); cc != "" {
		if err := b.dangerous("--client-certificate", cc, "Client certificate files"); err != nil {
			return BuildResult{}, err
		}
	}
	if cck := strOpt(adv.ClientCertificateKey, 500); cck != "" {
		if err := b.dangerous("--client-certificate-key", cck, "Client certificate key files"); err != nil {
			return BuildResult{}, err
		}
	}
	if ccp := strOpt(adv.ClientCertPassword, 1000); ccp != "" {
		// Certificate password is not a "dangerous" option — it's always allowed
		// when a certificate is provided.
		b.add("--client-certificate-password", ccp)
	}

	// Extractor options
	extractorRetries := 3
	if adv.ExtractorRetries != nil {
		r := *adv.ExtractorRetries
		if r < 0 || r > 100 {
			return BuildResult{}, &validation.Error{
				"extractor retries must be between 0 and 100.", "INVALID_OPTION",
			}
		}
		extractorRetries = r
	}
	b.add("--extractor-retries", strconv.Itoa(extractorRetries))

	if adv.IgnoreDynamicMpd {
		b.add("--ignore-dynamic-mpd")
	}
	if adv.HlsSplitDiscontinuity {
		b.add("--hls-split-discontinuity")
	}
	if ea := strOpt(adv.ExtractorArgs, 1000); ea != "" {
		b.add("--extractor-args", ea)
	}
	if fl := strOpt(adv.FfmpegLocation, 500); fl != "" {
		if err := b.dangerous("--ffmpeg-location", fl, "Custom FFmpeg executables"); err != nil {
			return BuildResult{}, err
		}
	}
	if !adv.NoExec {
		if ex := strOpt(adv.Exec, 2000); ex != "" {
			if err := b.dangerous("--exec", ex, "Post-download commands"); err != nil {
				return BuildResult{}, err
			}
		}
	}

	// ── Standard reliability flags ───────────────────────────────────────────
	b.add(
		"--retries", "3",
		"--fragment-retries", "3",
		"--retry-sleep", "http:exp=1:20",
		"--no-colors",
		"--no-warnings",
	)

	// URL is always the last argument.
	b.add(opts.URL)

	return BuildResult{
		Command:           b.cmd,
		FilenameTemplate:  filenameTpl,
		DownloadDirectory: downloadDirectory,
	}, nil
}

// ─── RedactCommand ────────────────────────────────────────────────────────────

// RedactCommand replaces values following sensitive flags with "[REDACTED]".
// Mirrors redactCommand() in commandBuilder.js.
func RedactCommand(cmd []string) []string {
	out := make([]string, len(cmd))
	copy(out, cmd)
	for i := 1; i < len(out); i++ {
		if secretFlags[out[i-1]] {
			out[i] = "[REDACTED]"
		}
	}
	return out
}

// ─── FormatCommand ────────────────────────────────────────────────────────────

// FormatCommand formats an argv slice into a human-readable shell string,
// quoting arguments that contain special characters.
// Mirrors formatCommand() in commandBuilder.js.
func FormatCommand(cmd []string) string {
	parts := make([]string, len(cmd))
	for i, arg := range cmd {
		if safeArgRe.MatchString(arg) {
			parts[i] = arg
		} else {
			escaped := strings.ReplaceAll(arg, `\`, `\\`)
			escaped = strings.ReplaceAll(escaped, `"`, `\"`)
			parts[i] = `"` + escaped + `"`
		}
	}
	return strings.Join(parts, " ")
}

// safeArgRe matches arguments that don't require shell quoting.
// Mirrors the regex in formatCommand() in commandBuilder.js.
var safeArgRe = regexp.MustCompile(`^[A-Za-z0-9_./:\\%()+,=@\-]+$`)

// ─── builder ─────────────────────────────────────────────────────────────────

// builder is an internal helper that accumulates argv fragments.
type builder struct {
	cfg *config.Config
	cmd []string
}

func (b *builder) add(args ...string) {
	b.cmd = append(b.cmd, args...)
}

// dangerous appends flag+value only when AllowDangerousOptions is true.
func (b *builder) dangerous(flag, value, label string) error {
	if value == "" {
		return nil
	}
	if !b.cfg.AllowDangerousOptions {
		return &validation.Error{
			Message: fmt.Sprintf(
				"%s is disabled by the server. Set ALLOW_DANGEROUS_OPTIONS=true only on a trusted local machine.",
				label,
			),
			Code: "DANGEROUS_OPTION_DISABLED",
		}
	}
	b.cmd = append(b.cmd, flag, value)
	return nil
}

// dangerousFlag appends a lone flag only when AllowDangerousOptions is true.
func (b *builder) dangerousFlag(flag, label string) error {
	if !b.cfg.AllowDangerousOptions {
		return &validation.Error{
			Message: fmt.Sprintf(
				"%s is disabled by the server. Set ALLOW_DANGEROUS_OPTIONS=true only on a trusted local machine.",
				label,
			),
			Code: "DANGEROUS_OPTION_DISABLED",
		}
	}
	b.cmd = append(b.cmd, flag)
	return nil
}

// ─── private helpers ─────────────────────────────────────────────────────────

// validateFormatSelector validates and returns the yt-dlp -f selector.
// Mirrors validateFormatSelector() in commandBuilder.js.
func validateFormatSelector(value string) (string, error) {
	if value == "" {
		return "bestvideo+bestaudio/best", nil
	}
	s := strings.TrimSpace(value)
	if len(s) > 300 {
		return "", &validation.Error{"Format selector is too long.", "INVALID_FORMAT_SELECTOR"}
	}
	if !formatSelectorRe.MatchString(s) {
		return "", &validation.Error{
			"The format selector contains unsupported characters.",
			"INVALID_FORMAT_SELECTOR",
		}
	}
	return s, nil
}

// formatSelectorRe mirrors the JS regex /^[\w+\-.,/:\[\]()?<>=!*~^'" ]+$/
var formatSelectorRe = regexp.MustCompile(`^[A-Za-z0-9_+\-.,/:[\]()?<>=!*~^'" ]+$`)

// validateAudioQuality validates a yt-dlp --audio-quality value.
// Mirrors audioQuality() in commandBuilder.js.
func validateAudioQuality(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	q := strings.TrimSpace(value)
	if !audioQualityRe.MatchString(q) {
		return "", &validation.Error{
			"Audio quality must be 0–10 or a bitrate such as 128K.",
			"INVALID_OPTION",
		}
	}
	return q, nil
}

var audioQualityRe = regexp.MustCompile(`^(?:10|[0-9])$|^\d{2,4}(?:[kK])?$`)

// strOpt trims value and returns "" if it is empty, contains null bytes, or
// exceeds maxLen. Safe to use inline — never returns an error.
// Mirrors stringOption() for the common "skip if missing" case.
func strOpt(value string, maxLen int) string {
	v := strings.TrimSpace(value)
	if v == "" || strings.ContainsRune(v, 0) || len(v) > maxLen {
		return ""
	}
	return v
}

// splitArgs tokenises a shell-like string honouring double and single quotes.
// Mirrors splitArguments() in commandBuilder.js.
func splitArgs(value string, maxLen int) ([]string, error) {
	v := strOpt(value, maxLen)
	if v == "" {
		return nil, nil
	}
	return shellSplit(v), nil
}

// shellSplit is a minimal POSIX-shell-word splitter.
func shellSplit(s string) []string {
	var tokens []string
	var cur strings.Builder
	inDouble, inSingle := false, false

	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"' && !inSingle:
			inDouble = !inDouble
		case c == '\'' && !inDouble:
			inSingle = !inSingle
		case (c == ' ' || c == '\t') && !inDouble && !inSingle:
			if cur.Len() > 0 {
				tokens = append(tokens, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteByte(c)
		}
	}
	if cur.Len() > 0 {
		tokens = append(tokens, cur.String())
	}
	return tokens
}
