package services

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
)

// YtDlpService provides a clean interface to yt-dlp
type YtDlpService struct {
	Cfg *config.Config
}

func NewYtDlpService(cfg *config.Config) *YtDlpService {
	return &YtDlpService{Cfg: cfg}
}

// GetRawInfo executes yt-dlp to get raw JSON info for a URL
func (s *YtDlpService) GetRawInfo(ctx context.Context, url string) ([]byte, error) {
	socketTimeoutSecs := int(s.Cfg.InfoTimeoutMs/1000) - 5
	if socketTimeoutSecs < 5 {
		socketTimeoutSecs = 5
	}

	args := []string{
		"--quiet", "--no-warnings", "--skip-download", "--flat-playlist", "--dump-single-json",
		"--socket-timeout", fmt.Sprintf("%d", socketTimeoutSecs),
		"--retries", "3", "--extractor-retries", "3",
		"--fragment-retries", "3",
	}

	if s.Cfg.YtDlpJSRuntime != "" {
		args = append(args, "--js-runtimes", s.Cfg.YtDlpJSRuntime)
	}

	args = append(args, url)

	// Note: timeout handling is already managed by the caller's context
	cmd := exec.CommandContext(ctx, s.Cfg.YtDlpPath, args...)
	
	// We need to hide window on Windows, but since this is cross-platform,
	// we will define setSysProcAttr elsewhere or just leave it. 
	// For simplicity in this extracted service, we'll omit the windows hiding 
	// or assume the caller sets it up. Actually we must hide it.
	SetSysProcAttr(cmd)

	out, cmdErr := cmd.Output()
	if cmdErr != nil {
		stderr := ""
		if exitErr, ok := cmdErr.(*exec.ExitError); ok {
			stderr = strings.ToLower(strings.TrimSpace(string(exitErr.Stderr)))
		}
		return nil, fmt.Errorf("yt-dlp error: %w (stderr: %s)", cmdErr, stderr)
	}

	return out, nil
}
