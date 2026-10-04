package handlers

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/process"
)

var runtimeSemver = regexp.MustCompile(`\b(?:v)?(\d+)\.(\d+)\.(\d+)\b`)
var runtimeDate = regexp.MustCompile(`\b(\d{4})-(\d{1,2})-(\d{1,2})\b`)

// Supported versions follow https://github.com/yt-dlp/yt-dlp/wiki/EJS.
// Keep these checks aligned with the pinned downloader when updating it.
func runtimeCompatibility(name, version string) string {
	pattern, minimum := runtimeSemver, [3]int{}
	switch name {
	case "node":
		minimum = [3]int{22, 0, 0}
	case "deno":
		minimum = [3]int{2, 3, 0}
	case "bun":
		minimum = [3]int{1, 2, 11}
	case "quickjs":
		if strings.Contains(strings.ToLower(version), "quickjs-ng") {
			minimum = [3]int{0, 0, 1}
		} else {
			pattern, minimum = runtimeDate, [3]int{2023, 12, 9}
		}
	default:
		return "Choose Node.js or Deno as a supported JavaScript runtime"
	}
	parts := pattern.FindStringSubmatch(version)
	if len(parts) != 4 {
		return "Could not identify the JavaScript runtime version"
	}
	var actual [3]int
	for index := range actual {
		actual[index], _ = strconv.Atoi(parts[index+1])
	}
	compare := func(left, right [3]int) int {
		for index := range left {
			if left[index] < right[index] {
				return -1
			}
			if left[index] > right[index] {
				return 1
			}
		}
		return 0
	}
	if compare(actual, minimum) < 0 {
		return "The JavaScript runtime is too old for yt-dlp; upgrade it"
	}
	if name == "bun" && compare(actual, [3]int{1, 3, 14}) > 0 {
		return "This Bun version is unsupported by yt-dlp; use Node.js or Deno"
	}
	return ""
}

func probeJSRuntime(ctx context.Context, specification string) (bool, string, string) {
	name, path, _ := strings.Cut(specification, ":")
	executable := name
	if name == "quickjs" {
		executable = "qjs"
	}
	if path == "" {
		path = executable
	}
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		path = filepath.Join(path, executable)
	}
	resolved, err := exec.LookPath(path)
	if err != nil || name == "" {
		return false, "", "No working JavaScript runtime is enabled; install Node.js or Deno for YouTube support"
	}
	flag := "--version"
	if name == "quickjs" {
		flag = "--help"
	}
	child, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	out, diagnostic, err := process.Output(child, []string{resolved, flag}, "", 64<<10)
	banner := strings.TrimSpace(string(out))
	if banner == "" {
		banner = strings.TrimSpace(diagnostic)
	}
	version := strings.TrimSpace(strings.SplitN(banner, "\n", 2)[0])
	// Original QuickJS prints its version in help and exits with status 1.
	var exit *exec.ExitError
	if name == "quickjs" && errors.As(err, &exit) && exit.ExitCode() == 1 && strings.HasPrefix(banner, "QuickJS") && child.Err() == nil {
		err = nil
	}
	if err != nil || child.Err() != nil {
		return false, version, "The JavaScript runtime probe failed or timed out; check its installation"
	}
	if issue := runtimeCompatibility(name, version); issue != "" {
		return false, version, issue
	}
	return true, version, ""
}
