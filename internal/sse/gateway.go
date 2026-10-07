package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
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
	ctx      context.Context
	cancel   context.CancelFunc

	mu        sync.Mutex // protects clients and throttle maps
	clients   map[*client]struct{}
	throttle  map[string]throttleMeta
	closed    bool
	Snapshots func() []store.ProgressSnapshot
	versions  map[string]uint64
}

// NewGateway creates a new SSE gateway listening to the provided event bus.
func NewGateway(eventBus *bus.Bus) *Gateway {
	ctx, cancel := context.WithCancel(context.Background())
	gw := &Gateway{
		eventBus: eventBus,
		ctx:      ctx,
		cancel:   cancel,
		clients:  make(map[*client]struct{}),
		throttle: make(map[string]throttleMeta),
		versions: make(map[string]uint64),
	}

	sub := eventBus.Subscribe()
	go gw.listenLoop(sub)
	return gw
}

// Close stops the bus listener and closes all active SSE clients.
func (gw *Gateway) Close() {
	gw.cancel()
	gw.mu.Lock()
	gw.closed = true
	clients := make([]*client, 0, len(gw.clients))
	for c := range gw.clients {
		delete(gw.clients, c)
		clients = append(clients, c)
	}
	gw.mu.Unlock()
	for _, c := range clients {
		c.close()
	}
}

// listenLoop reads from the global event bus and broadcasts to all clients.
func (gw *Gateway) listenLoop(sub bus.Subscriber) {
	defer gw.eventBus.Unsubscribe(sub)

	for {
		select {
		case <-gw.ctx.Done():
			return
		case event, ok := <-sub:
			if !ok {
				return
			}
			if event.Type == bus.EventProgress {
				snap, ok := event.Data.(store.ProgressSnapshot)
				if !ok {
					continue
				}
				gw.handleProgressEvent(snap)
			}
			if event.Type == bus.EventResync {
				gw.broadcast([]byte("data: {\"type\":\"resync\"}\n\n"))
			}
		}
	}
}

func (gw *Gateway) handleProgressEvent(snap store.ProgressSnapshot) {
	gw.mu.Lock()
	if snap.Version > 0 {
		if snap.Version <= gw.versions[snap.DownloadID] {
			gw.mu.Unlock()
			return
		}
		if len(gw.versions) > 2000 {
			gw.versions = make(map[string]uint64)
		}
		gw.versions[snap.DownloadID] = snap.Version
	}
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
	if gw.closed {
		gw.mu.Unlock()
		http.Error(w, "Event stream is shutting down", http.StatusServiceUnavailable)
		return
	}
	gw.clients[c] = struct{}{}
	gw.mu.Unlock()

	defer func() {
		gw.mu.Lock()
		delete(gw.clients, c)
		gw.mu.Unlock()
		c.close() // idempotent — sync.Once guards against double-close
	}()

	// Initial heartbeat to confirm connection
	if !writeFrame(w, flusher, []byte(":\n\n")) {
		return
	}
	if gw.Snapshots != nil {
		data, err := json.Marshal(map[string]any{"type": "snapshot", "downloads": gw.Snapshots()})
		if err != nil || !writeFrame(w, flusher, append(append([]byte("data: "), data...), []byte("\n\n")...)) {
			return
		}
	}

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
			if !writeFrame(w, flusher, msg) {
				return
			}
		case <-ticker.C:
			if !writeFrame(w, flusher, []byte(":\n\n")) {
				return
			}
		}
	}
}

func writeFrame(w http.ResponseWriter, flusher http.Flusher, frame []byte) bool {
	controller := http.NewResponseController(w)
	_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err := w.Write(frame)
	if err == nil {
		flusher.Flush()
	}
	_ = controller.SetWriteDeadline(time.Time{})
	return err == nil
}
