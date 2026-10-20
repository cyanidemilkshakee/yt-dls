package queue

import (
	"context"
	"errors"
	"sync"
)

// ErrQueueFull is returned when the queue is at maximum capacity.
var ErrQueueFull = errors.New("queue is full")

// Queue is a bounded in-memory FIFO. Items can also be removed before a worker
// claims them, so cancelling a queued job releases capacity immediately.
type Queue[T any] struct {
	mu       sync.Mutex
	items    []T
	capacity int
	wake     chan struct{}
	space    chan struct{}
}

// New creates a new queue with the given capacity.
func New[T any](capacity int) *Queue[T] {
	if capacity < 0 {
		capacity = 0
	}
	return &Queue[T]{capacity: capacity, wake: make(chan struct{}, 1), space: make(chan struct{})}
}

// EnqueueWait reserves capacity without retry loops or lost wakeups. A batch
// stops admitting jobs immediately when its cancellation context is closed.
func (q *Queue[T]) EnqueueWait(ctx context.Context, item T) error {
	for {
		q.mu.Lock()
		if err := ctx.Err(); err != nil {
			q.mu.Unlock()
			return err
		}
		if len(q.items) < q.capacity {
			q.items = append(q.items, item)
			q.mu.Unlock()
			select {
			case q.wake <- struct{}{}:
			default:
			}
			return nil
		}
		space := q.space
		q.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-space:
		}
	}
}

// Enqueue adds an item to the queue. Returns ErrQueueFull if the queue is full.
func (q *Queue[T]) Enqueue(item T) error {
	q.mu.Lock()
	if len(q.items) >= q.capacity {
		q.mu.Unlock()
		return ErrQueueFull
	}
	q.items = append(q.items, item)
	q.mu.Unlock()

	select {
	case q.wake <- struct{}{}:
	default:
	}
	return nil
}

// Next blocks until an item is available or ctx is cancelled.
func (q *Queue[T]) Next(ctx context.Context) (T, error) {
	for {
		if err := ctx.Err(); err != nil {
			var zero T
			return zero, err
		}
		q.mu.Lock()
		if len(q.items) > 0 {
			item := q.items[0]
			var zero T
			q.items[0] = zero
			q.items = q.items[1:]
			close(q.space)
			q.space = make(chan struct{})
			q.mu.Unlock()
			return item, nil
		}
		q.mu.Unlock()

		select {
		case <-ctx.Done():
			var zero T
			return zero, ctx.Err()
		case <-q.wake:
		}
	}
}

// Remove deletes the first queued item matching predicate and reports whether
// it was found. An item already returned by Next is owned by its worker.
func (q *Queue[T]) Remove(predicate func(T) bool) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	for index, item := range q.items {
		if !predicate(item) {
			continue
		}
		copy(q.items[index:], q.items[index+1:])
		var zero T
		q.items[len(q.items)-1] = zero
		q.items = q.items[:len(q.items)-1]
		close(q.space)
		q.space = make(chan struct{})
		return true
	}
	return false
}
