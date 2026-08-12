//go:build linux || darwin

package worker

import "os/exec"

// setSysProcAttr is a no-op on Unix — no console window to hide.
func setSysProcAttr(cmd *exec.Cmd) {}
