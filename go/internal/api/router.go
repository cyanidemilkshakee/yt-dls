package api

import (
	"context"
	"encoding/json"
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
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"}, // Adjust in prod
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
	fs := http.FileServer(http.FS(frontend.FS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		// If the requested path is not found in the embed FS, we serve index.html (for client-side routing)
		// But in this case, it's just static files.
		// However, http.FileServer handles everything naturally.
		// If the user requests root `/`, it serves `index.html`.
		// But if they request something that doesn't exist, we might want to let FileServer handle 404.
		// To intercept and serve index.html on 404, we'd need a custom filesystem.
		// For a simple static site with no client-side router, plain FileServer is fine.
		fs.ServeHTTP(w, r)
	})

	return r
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

// noTimeout is a middleware that strips any deadline from the request context.
// Used on the SSE /events endpoint to prevent chi's global 60-second timeout
// from disconnecting long-lived streaming connections.
func noTimeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.Background()))
	})
}
