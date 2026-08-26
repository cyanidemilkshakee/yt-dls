//go:build !windows
package handlers

import "os/exec"

func setSysProcAttr(cmd *exec.Cmd) {
	// No-op on non-Windows
}
