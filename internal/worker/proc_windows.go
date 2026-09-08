//go:build !linux && !darwin

package worker

import (
	"os/exec"
	"syscall"
)

// setSysProcAttr sets Windows-specific process attributes to hide the console window.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
