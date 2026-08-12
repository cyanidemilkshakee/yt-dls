package bus

import (
	"sync"
)

// EventType defines the type of event being published.
type EventType string

const (
	// EventProgress is emitted when a download's progress changes.
	EventProgress EventType = "progress"
)

// Event represents a single message published to the bus.
type Event struct {
	Type       EventType
	DownloadID string
	Data       any
}

// Subscriber is a channel that receives events.
type Subscriber chan Event

// Bus is a simple thread-safe publish-subscribe event broker.
type Bus struct {
	mu          sync.RWMutex
	subscribers map[Subscriber]struct{}
}

// New returns a new Event Bus.
func New() *Bus {
	return &Bus{
		subscribers: make(map[Subscriber]struct{}),
	}
}

// Subscribe creates a new buffered channel, registers it, and returns it.
// The caller MUST call Unsubscribe when done to prevent memory leaks.
func (b *Bus) Subscribe() Subscriber {
	b.mu.Lock()
	defer b.mu.Unlock()

	// 100 buffer size to absorb sudden bursts of progress events
	sub := make(Subscriber, 100)
	b.subscribers[sub] = struct{}{}
	return sub
}

// Unsubscribe removes a channel from the bus and closes it.
func (b *Bus) Unsubscribe(sub Subscriber) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, ok := b.subscribers[sub]; ok {
		delete(b.subscribers, sub)
		close(sub)
	}
}

// Publish broadcasts an event to all active subscribers.
// If a subscriber's buffer is full, the event is dropped for that subscriber
// to prevent blocking the publisher (e.g., worker goroutine).
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for sub := range b.subscribers {
		select {
		case sub <- e:
			// Sent successfully
		default:
			// Subscriber buffer full — drop event.
			// In an SSE context, dropping an intermediate progress event is
			// fine because the frontend only cares about the latest state,
			// and throttling will ensure we don't spam anyway.
		}
	}
}
