package network

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

func TestPublicAddressPolicy(t *testing.T) {
	for _, value := range []string{"127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:127.0.0.1", "2001:db8::1", "100.64.0.1", "192.0.2.1", "64:ff9b::7f00:1"} {
		if IsPublicIP(netip.MustParseAddr(value)) {
			t.Errorf("reserved address allowed: %s", value)
		}
	}
	for _, value := range []string{"8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"} {
		if !IsPublicIP(netip.MustParseAddr(value)) {
			t.Errorf("public address rejected: %s", value)
		}
	}
	if _, err := ResolvePublic(context.Background(), "127.0.0.1"); err == nil {
		t.Fatal("private resolution accepted")
	}
}
func TestProxyAuthenticationAndPrivateTargets(t *testing.T) {
	g, err := NewGuard()
	if err != nil {
		t.Fatal(err)
	}
	defer g.Close()
	for _, method := range []string{"GET", "CONNECT"} {
		r := httptest.NewRequest(method, "http://127.0.0.1:80/", nil)
		r.Host = "127.0.0.1:80"
		w := httptest.NewRecorder()
		g.ServeHTTP(w, r)
		if w.Code != http.StatusProxyAuthRequired {
			t.Fatal("unauthenticated proxy access")
		}
		r.Header.Set("Proxy-Authorization", g.credential)
		w = httptest.NewRecorder()
		g.ServeHTTP(w, r)
		if w.Code != 403 && w.Code != 502 {
			t.Fatalf("private target not denied: %d", w.Code)
		}
	}
}
func TestHopHeadersAreRemoved(t *testing.T) {
	header := http.Header{"Connection": []string{"X-Secret, keep-alive"}, "X-Secret": []string{"value"}, "Proxy-Authorization": []string{"credential"}, "Keep-Alive": []string{"yes"}, "Accept": []string{"application/json"}}
	stripHopHeaders(header)
	if header.Get("X-Secret") != "" || header.Get("Proxy-Authorization") != "" || header.Get("Accept") == "" {
		t.Fatal("hop header filtering failed")
	}
}
