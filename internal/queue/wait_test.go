package queue_test

import (
	"context"
	"errors"
	"github.com/cyanidemilkshakee/yt-dls/internal/queue"
	"testing"
	"time"
)

func TestWaitingAdmissionWakesOnRemovalAndCancellation(t *testing.T) {
	q := queue.New[int](1)
	_ = q.Enqueue(1)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- q.EnqueueWait(ctx, 2) }()
	q.Remove(func(value int) bool { return value == 1 })
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("waiting admission lost capacity wakeup")
	}
	go func() { done <- q.EnqueueWait(ctx, 3) }()
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("waiting admission ignored cancellation")
	}
	if got, err := q.Next(context.Background()); err != nil || got != 2 {
		t.Fatalf("waiting job = %d, err = %v; want 2", got, err)
	}
	if err := q.Enqueue(4); err != nil {
		t.Fatalf("cancelled job consumed queue capacity: %v", err)
	}
}
