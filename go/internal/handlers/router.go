package handlers

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/frontend"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/go/internal/worker"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// App holds the application's dependencies for routing.
type App struct {
	Cfg        *config.Config
	Pool       *worker.Pool
	Store      *store.ProgressStore
	SSEGateway *sse.Gateway
}

// Router returns a fully configured chi.Router.
func (a *App) Router() chi.Router {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second)) // generic timeout

	// CORS
	// FIX: replace the wildcard "*" origin (which is incompatible with
	// AllowCredentials:true per the CORS spec) with an explicit allowlist
	// seeded from the embedded frontend origin and any extras in config.
	allowedOrigins := buildCORSOrigins(a.Cfg)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// API Routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", a.HandleHealth)
		r.Get("/info", a.HandleInfo)
		r.Post("/info", a.HandleInfo)

		r.Route("/downloads", func(r chi.Router) {
			r.Get("/", a.HandleListDownloads)
			// SSE is a long-lived connection — override the global timeout by
			// wrapping with a middleware that replaces the request context with
			// one that has no deadline. chi's Timeout middleware uses context.WithTimeout,
			// which we cancel by replacing the context before it is evaluated.
			r.With(noTimeout).Get("/events", a.HandleSSEProgress)
			r.Get("/status/batch", a.HandleBatchStatus)
		})

		r.Route("/download", func(r chi.Router) {
			r.Post("/", a.HandleStartDownload)
			r.Post("/command-preview", a.HandleCommandPreview)

			r.Route("/{id}", func(r chi.Router) {
				r.Get("/status", a.HandleGetDownloadStatus)
				r.Delete("/", a.HandleDeleteDownload)
				r.Post("/cancel", a.HandleCancelDownload)
				r.Post("/pause", a.HandlePauseDownload)
				r.Post("/resume", a.HandleResumeDownload)
				r.Get("/log", a.HandleGetLog)
			})
		})
	})

	// Serve Embedded Frontend
	fileServer := http.FileServer(http.FS(frontend.FS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			path = "index.html"
		} else {
			path = path[1:] // strip leading slash
		}

		_, err := fs.Stat(frontend.FS, path)
		if err != nil {
			// File does not exist, serve index.html for client-side routing
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	return r
}

// buildCORSOrigins returns the CORS allowed-origins list.
// Always includes the default local frontend; appends any extras from config.
func buildCORSOrigins(cfg *config.Config) []string {
	// Default: the embedded frontend served by this server.
	origins := []string{
		"http://localhost:7391",
		"http://127.0.0.1:7391",
	}
	origins = append(origins, cfg.FrontendOrigins...)
	return origins
}

// Helper: sendJSON encodes data to JSON and writes it.
func sendJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// Just log or ignore since we can't do much if connection dropped
	}
}

// Helper: sendError writes a structured JSON error.
func sendError(w http.ResponseWriter, status int, message string) {
	sendJSON(w, status, map[string]string{"error": message})
}

// noTimeout is a middleware that strips any deadline from the request context
// while preserving all parent context values (request ID, real IP, etc.).
//
// FIX: the previous version used context.Background() which discarded all
// parent values. context.WithoutCancel inherits values but has no deadline,
// which is exactly what long-lived SSE connections need.
func noTimeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithoutCancel(r.Context())))
	})
}
