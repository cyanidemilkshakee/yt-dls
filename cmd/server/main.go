package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/handlers"
	"github.com/cyanidemilkshakee/yt-dls/internal/network"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		fmt.Fprintln(os.Stderr, "Invalid server configuration:", err)
		os.Exit(1)
	}

	// ── Structured logging ───────────────────────────────────────────────────
	// FIX: wire the LogLevel config field to slog so log verbosity is runtime-
	// configurable via LOG_LEVEL env var (debug | info | warn | error).
	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	var networkGuard *network.Guard
	if !cfg.AllowPrivateURLs {
		var err error
		networkGuard, err = network.NewGuard()
		if err != nil {
			slog.Error("Failed to start outbound network guard", "err", err)
			os.Exit(1)
		}
		cfg.NetworkProxy = networkGuard.URL
	}

	slog.Info("YT-DL Studio starting",
		"ytdlp", cfg.YtDlpPath,
		"host", net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port)),
		"dldir", cfg.DownloadDir,
		"workers", cfg.MaxConcurrentDownloads,
	)

	eventBus := bus.New()
	sseGateway := sse.NewGateway(eventBus)

	progressStore := store.NewProgressStore(eventBus)
	pool := worker.NewPool(cfg, progressStore)

	// Start worker pool
	pool.Start()

	app := &handlers.App{
		Cfg:        cfg,
		Pool:       pool,
		Store:      progressStore,
		SSEGateway: sseGateway,
		InfoSlots:  make(chan struct{}, cfg.MaxConcurrentInfo),
	}

	router := app.Router()

	// ReadHeaderTimeout and ReadTimeout bound inbound request handling. The
	// application gives metadata requests their configured deadline; SSE keeps
	// the request context so client disconnects cancel the stream.
	server := &http.Server{
		Addr:              net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port)),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // SSE requires no global write deadline
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("HTTP server listening", "addr", "http://"+server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "err", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigChan

	slog.Info("Shutting down", "signal", sig.String())
	sseGateway.Close()

	// Shutdown HTTP Server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("HTTP server shutdown error", "err", err)
		if closeErr := server.Close(); closeErr != nil {
			slog.Error("HTTP server close error", "err", closeErr)
		}
	}

	// Stop worker pool
	pool.Stop()
	if networkGuard != nil {
		networkGuard.Close()
	}
	slog.Info("Shutdown complete")
}

// newLogger builds a slog.Logger whose minimum level is controlled by levelStr.
func newLogger(levelStr string) *slog.Logger {
	var level slog.Level
	switch levelStr {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
}
