package sse

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
)

const (
	sseMinDeltaPct = 0.5 // minimum % change before forced broadcast
	sseMaxInterval = 500 * time.Millisecond
)

type throttleMeta struct {
	lastBroadcast time.Time
	lastProgress  float64
}

// client is an SSE connection. The channel carries serialised SSE frames.
// closeOnce ensures the backing channel is only closed once regardless of
// which path (broadcast zombie eviction or ServeHTTP defer) runs first.
type client struct {
	ch        chan []byte
	closeOnce sync.Once
}

func (c *client) close() {
	c.closeOnce.Do(func() { close(c.ch) })
}

func (c *client) send(msg []byte) bool {
	select {
	case c.ch <- msg:
		return true
	default:
		return false // buffer full
	}
}

// Gateway manages SSE connections and broadcasts events from the event bus.
type Gateway struct {
	eventBus *bus.Bus

	mu       sync.Mutex // protects clients and throttle maps
	clients  map[*client]struct{}
	throttle map[string]throttleMeta
}

// NewGateway creates a new SSE gateway listening to the provided event bus.
func NewGateway(eventBus *bus.Bus) *Gateway {
	gw := &Gateway{
		eventBus: eventBus,
		clients:  make(map[*client]struct{}),
		throttle: make(map[string]throttleMeta),
	}

	go gw.listenLoop()
	return gw
}

// listenLoop reads from the global event bus and broadcasts to all clients.
func (gw *Gateway) listenLoop() {
	sub := gw.eventBus.Subscribe()
	defer gw.eventBus.Unsubscribe(sub)

	for event := range sub {
		if event.Type == bus.EventProgress {
			snap, ok := event.Data.(store.ProgressSnapshot)
			if !ok {
				continue
			}
			gw.handleProgressEvent(snap)
		}
	}
}

func (gw *Gateway) handleProgressEvent(snap store.ProgressSnapshot) {
	gw.mu.Lock()
	meta, exists := gw.throttle[snap.DownloadID]

	now := time.Now()
	deltaPct := math.Abs(snap.Progress - meta.lastProgress)
	elapsed := now.Sub(meta.lastBroadcast)

	shouldBroadcast := false

	if snap.Status == "completed" || snap.Status == "failed" || snap.Status == "cancelled" {
		shouldBroadcast = true
		delete(gw.throttle, snap.DownloadID)
	} else if !exists || deltaPct >= sseMinDeltaPct || elapsed >= sseMaxInterval {
		shouldBroadcast = true
		gw.throttle[snap.DownloadID] = throttleMeta{
			lastBroadcast: now,
			lastProgress:  snap.Progress,
		}
	}
	gw.mu.Unlock()

	if !shouldBroadcast {
		return
	}

	payload := map[string]any{
		"type":       "progress",
		"downloadId": snap.DownloadID,
		"data":       snap,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	msg := []byte(fmt.Sprintf("data: %s\n\n", data))
	gw.broadcast(msg)
}

func (gw *Gateway) broadcast(msg []byte) {
	// Collect zombie clients (those whose channel is full) while holding the lock,
	// then remove them in a second pass under the same lock.
	// We MUST NOT call client.close() while holding gw.mu, because close() itself
	// uses a sync.Once (cheap, but could theoretically block if another goroutine
	// is in the middle of Once.Do). Keep the critical section short.
	var zombies []*client

	gw.mu.Lock()
	for c := range gw.clients {
		if !c.send(msg) {
			zombies = append(zombies, c)
			delete(gw.clients, c)
		}
	}
	gw.mu.Unlock()

	// Close zombies outside the lock — safe because we already removed them
	// from the map. ServeHTTP's defer will also try to close them (via
	// client.close's sync.Once), which is idempotent.
	for _, c := range zombies {
		c.close()
	}
}

// ServeHTTP handles incoming SSE connections.
func (gw *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering

	c := &client{ch: make(chan []byte, 100)}

	gw.mu.Lock()
	gw.clients[c] = struct{}{}
	gw.mu.Unlock()

	defer func() {
		gw.mu.Lock()
		delete(gw.clients, c)
		gw.mu.Unlock()
		c.close() // idempotent — sync.Once guards against double-close
	}()

	// Initial heartbeat to confirm connection
	if _, err := w.Write([]byte(":\n\n")); err != nil {
		return
	}
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-c.ch:
			if !ok {
				// Channel was closed by broadcast (zombie eviction)
				return
			}
			if _, err := w.Write(msg); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			if _, err := w.Write([]byte(":\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
