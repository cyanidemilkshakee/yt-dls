// Package network implements a DNS-pinning proxy for downloader HTTP(S) traffic.
package network

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"
)

var reserved = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"), netip.MustParsePrefix("2002::/16"),
}

func IsPublicIP(ip netip.Addr) bool {
	if !ip.IsValid() || ip.Zone() != "" { return false }
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() { return false }
	for _, prefix := range reserved { if prefix.Contains(ip) { return false } }
	return true
}

func ResolvePublic(ctx context.Context, host string) ([]netip.Addr, error) {
	var addrs []netip.Addr
	if ip, err := netip.ParseAddr(host); err == nil { addrs = []netip.Addr{ip} } else {
		resolved, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil { return nil, err }
		addrs = resolved
	}
	if len(addrs) == 0 { return nil, errors.New("media host has no addresses") }
	for _, ip := range addrs { if !IsPublicIP(ip) { return nil, errors.New("private and reserved network addresses are disabled") } }
	return addrs,nil
}

func dialPublic(ctx context.Context, network, address string) (net.Conn,error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil { return nil,err }
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 { return nil,errors.New("invalid port") }
	addrs,err := ResolvePublic(ctx,host)
	if err != nil { return nil,err }
	var last error
	for _, ip := range addrs {
		// Dial the checked IP itself; do not resolve the hostname a second time.
		conn,err := (&net.Dialer{Timeout:10*time.Second}).DialContext(ctx,network,net.JoinHostPort(ip.String(),port))
		if err == nil { return conn,nil }
		last = err
	}
	return nil,last
}

type Guard struct {
	URL string
	server *http.Server
	transport *http.Transport
	credential string
	mu sync.Mutex
	tunnels map[net.Conn]struct{}
	closed bool
}

func NewGuard() (*Guard,error) {
	listener,err := net.Listen("tcp","127.0.0.1:0")
	if err != nil { return nil,err }
	secret := make([]byte,32)
	if _,err := rand.Read(secret); err != nil { listener.Close(); return nil,err }
	password := hex.EncodeToString(secret)
	g := &Guard{URL:"http://yt-dls:"+password+"@"+listener.Addr().String(), credential:"Basic "+base64.StdEncoding.EncodeToString([]byte("yt-dls:"+password)), tunnels:make(map[net.Conn]struct{})}
	g.transport = &http.Transport{DialContext:dialPublic, DisableCompression:true, ResponseHeaderTimeout:30*time.Second, TLSHandshakeTimeout:10*time.Second, IdleConnTimeout:30*time.Second, MaxIdleConns:64, MaxIdleConnsPerHost:8}
	g.server = &http.Server{Handler:g, ReadHeaderTimeout:10*time.Second, IdleTimeout:30*time.Second}
	go func(){ _ = g.server.Serve(listener) }()
	return g,nil
}

func (g *Guard) Close() {
	g.mu.Lock()
	g.closed = true
	for conn := range g.tunnels { _ = conn.Close() }
	g.mu.Unlock()
	_ = g.server.Close()
	g.transport.CloseIdleConnections()
}

func (g *Guard) ServeHTTP(w http.ResponseWriter,r *http.Request) {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("Proxy-Authorization")),[]byte(g.credential)) != 1 {
		w.Header().Set("Proxy-Authenticate",`Basic realm="yt-dls"`)
		http.Error(w,"Proxy authentication required",http.StatusProxyAuthRequired); return
	}
	if r.Method == http.MethodConnect { g.connect(w,r); return }
	if r.URL.Scheme != "http" || r.URL.User != nil || r.URL.Host == "" { http.Error(w,"Unsupported proxy request",400); return }
	req := r.Clone(r.Context())
	req.RequestURI = ""
	stripHopHeaders(req.Header)
	resp,err := g.transport.RoundTrip(req)
	if err != nil { http.Error(w,"Network policy or connection failure: "+err.Error(),http.StatusBadGateway); return }
	defer resp.Body.Close()
	stripHopHeaders(resp.Header)
	for key, values := range resp.Header { for _,value := range values { w.Header().Add(key,value) } }
	w.WriteHeader(resp.StatusCode)
	_,_ = io.Copy(w,resp.Body)
}

func stripHopHeaders(h http.Header) {
	for _, name := range strings.Split(h.Get("Connection"),",") { h.Del(strings.TrimSpace(name)) }
	for _, name := range []string{"Connection","Proxy-Connection","Proxy-Authorization","Proxy-Authenticate","Keep-Alive","TE","Trailer","Transfer-Encoding","Upgrade"} { h.Del(name) }
}

func (g *Guard) connect(w http.ResponseWriter,r *http.Request) {
	upstream,err := dialPublic(r.Context(),"tcp",r.Host)
	if err != nil { http.Error(w,"Network policy or connection failure: "+err.Error(),http.StatusForbidden); return }
	defer upstream.Close()
	hijacker,ok := w.(http.Hijacker)
	if !ok { http.Error(w,"Tunnelling unavailable",500); return }
	client,buffer,err := hijacker.Hijack()
	if err != nil { return }
	defer client.Close()
	g.mu.Lock()
	if g.closed { g.mu.Unlock(); return }
	g.tunnels[client] = struct{}{}
	g.tunnels[upstream] = struct{}{}
	g.mu.Unlock()
	defer func(){ g.mu.Lock(); delete(g.tunnels,client); delete(g.tunnels,upstream); g.mu.Unlock() }()
	if _,err = buffer.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil { return }
	if err = buffer.Flush(); err != nil { return }
	done := make(chan struct{})
	go func(){ _,_ = io.Copy(upstream,buffer); _ = upstream.Close(); close(done) }()
	_,_ = io.Copy(client,upstream)
	_ = client.Close()
	<-done
}
