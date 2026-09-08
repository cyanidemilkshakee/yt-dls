package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/handlers"

	"github.com/cyanidemilkshakee/yt-dls/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
)

func main() {
	cfg := config.Load()

	// ── Structured logging ───────────────────────────────────────────────────
	// FIX: wire the LogLevel config field to slog so log verbosity is runtime-
	// configurable via LOG_LEVEL env var (debug | info | warn | error).
	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	slog.Info("YT-DL Studio starting",
		"ytdlp", cfg.YtDlpPath,
		"host", fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
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
	}

	router := app.Router()

	// FIX: add HTTP server timeouts to prevent slow clients from holding
	// goroutines open indefinitely.
	//   - ReadHeaderTimeout: guards against Slowloris-style attacks.
	//   - ReadTimeout: total time to read the request (headers + body).
	//   - WriteTimeout: 0 because SSE connections must stream indefinitely;
	//     per-handler timeouts (chi's Timeout middleware) handle the rest.
	//   - IdleTimeout: how long keep-alive connections may sit idle.
	server := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
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

	// Shutdown HTTP Server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("HTTP server shutdown error", "err", err)
	}

	// Stop worker pool
	pool.Stop()
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
