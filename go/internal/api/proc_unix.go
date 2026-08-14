//go:build !windows
package api

import "os/exec"

func setSysProcAttr(cmd *exec.Cmd) {
	// No-op on non-Windows
}
