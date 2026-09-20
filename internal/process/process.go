// Package process runs bounded subprocesses and owns their entire process tree.
package process

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

var ErrOutputLimit = errors.New("process output exceeded the configured limit")

func Run(ctx context.Context, command []string, dir string, stdout, stderr io.Writer) error {
	if err := ctx.Err(); err != nil { return err }
	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	cmd.Dir, cmd.Stdout, cmd.Stderr = dir, stdout, stderr
	// Ambient proxies must not bypass the application's explicit network policy.
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		switch strings.ToLower(key) {
		case "http_proxy", "https_proxy", "all_proxy", "no_proxy": continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	cmd.WaitDelay = time.Second
	afterStart, cleanup, err := prepare(cmd)
	if err != nil { return err }
	defer cleanup()
	if err := cmd.Start(); err != nil { return err }
	if err := afterStart(); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return err
	}
	return cmd.Wait()
}

type limitedOutput struct {
	bytes.Buffer
	limit int
	cancel context.CancelFunc
	exceeded bool
}

func (w *limitedOutput) Write(p []byte) (int, error) {
	if len(p) > w.limit-w.Len() {
		w.exceeded = true
		w.cancel()
		return 0, ErrOutputLimit
	}
	return w.Buffer.Write(p)
}

func Output(ctx context.Context, command []string, dir string, limit int) ([]byte, string, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stdout := &limitedOutput{limit:limit, cancel:cancel}
	stderr := &limitedOutput{limit:64<<10, cancel:cancel}
	err := Run(ctx, command, dir, stdout, stderr)
	if stdout.exceeded || stderr.exceeded { err = ErrOutputLimit }
	return stdout.Bytes(), stderr.String(), err
}

// Lines streams complete lines without letting an unterminated line grow forever.
type Lines struct {
	buffer []byte
	Handle func(string)
	Cancel context.CancelFunc
}

func (w *Lines) Write(p []byte) (int, error) {
	n := len(p)
	for len(p) > 0 {
		i := bytes.IndexByte(p, '\n')
		end := len(p)
		if i >= 0 { end = i }
		if len(w.buffer)+end > 1<<20 {
			w.Cancel()
			return 0, ErrOutputLimit
		}
		w.buffer = append(w.buffer, p[:end]...)
		if i < 0 { break }
		w.Flush()
		p = p[i+1:]
	}
	return n, nil
}

func (w *Lines) Flush() {
	if line := strings.TrimSpace(string(w.buffer)); line != "" { w.Handle(line) }
	w.buffer = w.buffer[:0]
}
