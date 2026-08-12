package queue_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/queue"
)

func TestQueue_EnqueueDequeue(t *testing.T) {
	q := queue.New[int](5)

	for i := range 5 {
		if err := q.Enqueue(i); err != nil {
			t.Fatalf("Enqueue(%d) failed: %v", i, err)
		}
	}

	if q.Len() != 5 {
		t.Errorf("Len() = %d, want 5", q.Len())
	}

	ctx := context.Background()
	for want := range 5 {
		got, err := q.Next(ctx)
		if err != nil {
			t.Fatalf("Next() failed: %v", err)
		}
		if got != want {
			t.Errorf("Next() = %d, want %d", got, want)
		}
	}

	if q.Len() != 0 {
		t.Errorf("Len() after drain = %d, want 0", q.Len())
	}
}

func TestQueue_ErrQueueFull(t *testing.T) {
	q := queue.New[string](2)

	if err := q.Enqueue("a"); err != nil {
		t.Fatal(err)
	}
	if err := q.Enqueue("b"); err != nil {
		t.Fatal(err)
	}
	if err := q.Enqueue("c"); err != queue.ErrQueueFull {
		t.Errorf("expected ErrQueueFull, got %v", err)
	}
}

func TestQueue_NextBlocksUntilItem(t *testing.T) {
	q := queue.New[int](1)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Enqueue after a short delay
	go func() {
		time.Sleep(50 * time.Millisecond)
		_ = q.Enqueue(42)
	}()

	start := time.Now()
	got, err := q.Next(ctx)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Next() failed: %v", err)
	}
	if got != 42 {
		t.Errorf("Next() = %d, want 42", got)
	}
	// Must have blocked for at least the delay
	if elapsed < 40*time.Millisecond {
		t.Errorf("Next() returned too quickly (%v) — did not block", elapsed)
	}
}

func TestQueue_NextCancelledContext(t *testing.T) {
	q := queue.New[int](1)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled

	_, err := q.Next(ctx)
	if err == nil {
		t.Error("expected context cancellation error, got nil")
	}
}

func TestQueue_ConcurrentProducerConsumer(t *testing.T) {
	const N = 1000
	q := queue.New[int](N)

	var wg sync.WaitGroup
	var produced, consumed int64

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Producer
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range N {
			for {
				if err := q.Enqueue(i); err == nil {
					atomic.AddInt64(&produced, 1)
					break
				}
				time.Sleep(time.Microsecond)
			}
		}
	}()

	// Consumer
	wg.Add(1)
	go func() {
		defer wg.Done()
		for range N {
			if _, err := q.Next(ctx); err != nil {
				t.Errorf("Next() error: %v", err)
				return
			}
			atomic.AddInt64(&consumed, 1)
		}
	}()

	wg.Wait()

	if produced != N {
		t.Errorf("produced %d, want %d", produced, N)
	}
	if consumed != N {
		t.Errorf("consumed %d, want %d", consumed, N)
	}
}
