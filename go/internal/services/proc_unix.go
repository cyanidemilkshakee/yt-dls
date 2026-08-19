//go:build !windows

package services

import (
	"os/exec"
)

func SetSysProcAttr(cmd *exec.Cmd) {
	// Not needed on unix
}
