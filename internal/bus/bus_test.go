package bus_test

import (
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
)

func TestBus_PubSub(t *testing.T) {
	b := bus.New()

	sub1 := b.Subscribe()
	sub2 := b.Subscribe()
	defer b.Unsubscribe(sub1)
	defer b.Unsubscribe(sub2)

	b.Publish(bus.Event{
		Type:       bus.EventProgress,
		DownloadID: "dl-1",
		Data:       "hello",
	})

	// Both subscribers should receive the event
	checkReceive := func(sub bus.Subscriber, name string) {
		select {
		case ev := <-sub:
			if ev.DownloadID != "dl-1" {
				t.Errorf("%s got DownloadID %q, want dl-1", name, ev.DownloadID)
			}
		case <-time.After(100 * time.Millisecond):
			t.Errorf("%s did not receive event", name)
		}
	}

	checkReceive(sub1, "sub1")
	checkReceive(sub2, "sub2")
}

func TestBus_Unsubscribe(t *testing.T) {
	b := bus.New()
	sub := b.Subscribe()
	b.Unsubscribe(sub)

	// Channel should be closed
	select {
	case ev, ok := <-sub:
		if ok {
			t.Errorf("expected closed channel, got event %v", ev)
		}
	default:
		t.Error("expected closed channel, but it was empty and open")
	}
}

func TestBus_NonBlockingWhenFull(t *testing.T) {
	b := bus.New()
	sub := b.Subscribe()
	defer b.Unsubscribe(sub)

	// Subscriber channel has buffer size 100.
	// We send 150 events. It should not block, but sub should only have 100.
	for i := range 150 {
		b.Publish(bus.Event{
			Type:       bus.EventProgress,
			DownloadID: "test",
			Data:       i,
		})
	}

	resync, latest := false, -1
	for {
		select {
		case event := <-sub:
			if event.Type == bus.EventResync {
				resync = true
			}
			if value, ok := event.Data.(int); ok {
				latest = value
			}
		default:
			if !resync || latest != 149 {
				t.Fatalf("overflow lost resync or latest: resync=%v latest=%d", resync, latest)
			}
			return
		}
	}
}
