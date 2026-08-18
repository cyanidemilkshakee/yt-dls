package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/handlers"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/bus"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/worker"
)

func main() {
	cfg := config.Load()
	fmt.Printf("YT-DL Studio\n")
	fmt.Printf("  ytdlp   : %s\n", cfg.YtDlpPath)
	fmt.Printf("  host    : %s:%d\n", cfg.Host, cfg.Port)
	fmt.Printf("  dldir   : %s\n", cfg.DownloadDir)
	fmt.Printf("  workers : %d\n", cfg.MaxConcurrentDownloads)

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
	server := &http.Server{
		Addr:    fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Handler: router,
	}

	go func() {
		fmt.Printf("HTTP server listening on http://%s\n", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("HTTP server error: %v\n", err)
		}
	}()

	// Wait for interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	
	// Shutdown HTTP Server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		fmt.Printf("HTTP server shutdown error: %v\n", err)
	}

	// Stop worker pool
	pool.Stop()
	fmt.Println("Shutdown complete.")
}
