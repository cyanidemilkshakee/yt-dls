package sse_test

import (
	"bufio"
	"context"
	"encoding/json"
	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type dummyWriter struct{ status int }

func (w *dummyWriter) Header() http.Header       { return make(http.Header) }
func (w *dummyWriter) Write([]byte) (int, error) { return 0, nil }
func (w *dummyWriter) WriteHeader(code int)      { w.status = code }
func TestUnsupportedStreaming(t *testing.T) {
	gateway := sse.NewGateway(bus.New())
	defer gateway.Close()
	writer := &dummyWriter{}
	gateway.ServeHTTP(writer, httptest.NewRequest("GET", "/events", nil))
	if writer.status != 500 {
		t.Fatal(writer.status)
	}
}

func TestActualFramesThrottleTerminalVersionAndReconnect(t *testing.T) {
	events := bus.New()
	gateway := sse.NewGateway(events)
	defer gateway.Close()
	gateway.Snapshots = func() []store.ProgressSnapshot {
		return []store.ProgressSnapshot{{DownloadID: "restored", Version: 7, Status: "completed"}}
	}
	server := httptest.NewServer(gateway)
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL, nil)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	scanner := bufio.NewScanner(response.Body)
	frames := make(chan map[string]any, 20)
	go func() {
		defer close(frames)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "data: ") {
				var data map[string]any
				if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &data) == nil {
					frames <- data
				}
			}
		}
	}()
	receive := func() map[string]any {
		select {
		case frame := <-frames:
			if frame == nil {
				t.Fatal("stream ended")
			}
			return frame
		case <-time.After(time.Second):
			t.Fatal("missing SSE frame")
			return nil
		}
	}
	if frame := receive(); frame["type"] != "snapshot" {
		t.Fatalf("missing reconnect snapshot: %v", frame)
	}
	publish := func(version uint64, progress float64, status string) {
		events.Publish(bus.Event{Type: bus.EventProgress, DownloadID: "job", Data: store.ProgressSnapshot{DownloadID: "job", Version: version, Progress: progress, Status: status}})
	}
	publish(1, 1, "downloading")
	receive()
	publish(2, 1.1, "downloading")
	publish(3, 1.2, "downloading")
	publish(4, 1.2, "completed")
	frame := receive()
	data := frame["data"].(map[string]any)
	if data["status"] != "completed" || data["version"] != float64(4) {
		t.Fatalf("throttle lost terminal: %v", frame)
	}
	publish(3, 20, "downloading")
	select {
	case frame := <-frames:
		t.Fatalf("stale version delivered: %v", frame)
	case <-time.After(100 * time.Millisecond):
	}
	events.Publish(bus.Event{Type: bus.EventResync})
	if frame := receive(); frame["type"] != "resync" {
		t.Fatal("overflow not observable")
	}
	gateway.Close()
	select {
	case <-frames:
	case <-time.After(time.Second):
		t.Fatal("gateway did not close client")
	}
}
