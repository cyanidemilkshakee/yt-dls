package queue

import (
	"context"
	"errors"
)

// ErrQueueFull is returned when the queue is at maximum capacity.
var ErrQueueFull = errors.New("queue is full")

// Queue is a generic bounded in-memory queue.
type Queue[T any] struct {
	items chan T
}

// New creates a new queue with the given capacity.
func New[T any](capacity int) *Queue[T] {
	return &Queue[T]{
		items: make(chan T, capacity),
	}
}

// Enqueue adds an item to the queue. Returns ErrQueueFull if the queue is full.
func (q *Queue[T]) Enqueue(item T) error {
	select {
	case q.items <- item:
		return nil
	default:
		return ErrQueueFull
	}
}

// Next blocks until an item is available or the context is cancelled.
func (q *Queue[T]) Next(ctx context.Context) (T, error) {
	select {
	case item := <-q.items:
		return item, nil
	case <-ctx.Done():
		var zero T
		return zero, ctx.Err()
	}
}

// Len returns the current number of items in the queue.
func (q *Queue[T]) Len() int {
	return len(q.items)
}
