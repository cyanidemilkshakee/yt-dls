package process

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProcessFixture(t *testing.T) {
	index := -1
	for i, arg := range os.Args {
		if arg == "--process-fixture" {
			index = i
			break
		}
	}
	if index < 0 {
		return
	}
	switch os.Args[index+1] {
	case "large":
		fmt.Print(strings.Repeat("x", 4096))
	case "env":
		fmt.Print(os.Getenv("HTTPS_PROXY") + os.Getenv("NO_PROXY"))
	case "child":
		time.Sleep(time.Second)
		_ = os.WriteFile(os.Args[index+2], []byte("orphan"), 0600)
	case "tree":
		executable, _ := os.Executable()
		child := exec.Command(executable, "-test.run=^TestProcessFixture$", "--", "--process-fixture", "child", os.Args[index+2])
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
		fmt.Println("spawned")
		time.Sleep(30 * time.Second)
	}
	os.Exit(0)
}
func fixtureCommand(t *testing.T, args ...string) []string {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return append([]string{executable, "-test.run=^TestProcessFixture$", "--", "--process-fixture"}, args...)
}
func TestOutputBoundsAndProxyIsolation(t *testing.T) {
	if _, _, err := Output(context.Background(), fixtureCommand(t, "large"), "", 100); !errors.Is(err, ErrOutputLimit) {
		t.Fatalf("output not bounded: %v", err)
	}
	t.Setenv("HTTPS_PROXY", "sensitive")
	t.Setenv("NO_PROXY", "*")
	out, _, err := Output(context.Background(), fixtureCommand(t, "env"), "", 100)
	if err != nil || len(out) != 0 {
		t.Fatalf("ambient proxy leaked: %q %v", out, err)
	}
	if err = Run(context.Background(), nil, "", nil, nil); err == nil {
		t.Fatal("empty argv accepted")
	}
}
func TestCancellationKillsProcessTree(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "orphan.txt")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ready := make(chan struct{}, 1)
	done := make(chan error, 1)
	lines := &Lines{Handle: func(line string) {
		if line == "spawned" {
			ready <- struct{}{}
		}
	}}
	go func() { done <- Run(ctx, fixtureCommand(t, "tree", marker), "", lines, nil) }()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("fixture did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled process succeeded")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancellation hung")
	}
	time.Sleep(1200 * time.Millisecond)
	if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("descendant survived cancellation")
	}
}
func TestLinesChunkingAndLimit(t *testing.T) {
	var lines []string
	cancelled := false
	writer := &Lines{Handle: func(line string) { lines = append(lines, line) }, Cancel: func() { cancelled = true }}
	_, _ = writer.Write([]byte("one\ntw"))
	_, _ = writer.Write([]byte("o\nlast"))
	writer.Flush()
	if strings.Join(lines, "|") != "one|two|last" {
		t.Fatal(lines)
	}
	_, err := writer.Write([]byte(strings.Repeat("x", (1<<20)+1)))
	if !cancelled || err == nil {
		t.Fatal("unterminated output was not bounded")
	}
}
