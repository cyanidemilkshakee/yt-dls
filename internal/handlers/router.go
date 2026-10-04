package handlers

import (
	"encoding/json"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/config"
	"github.com/cyanidemilkshakee/yt-dls/internal/sse"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
	"github.com/cyanidemilkshakee/yt-dls/web"
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
	InfoSlots  chan struct{}
	workMu     sync.Mutex
	admissions map[string]admission
	closing    bool
	batches    sync.WaitGroup
	healthMu   sync.Mutex
	healthAt   time.Time
	healthData map[string]any
	healthCode int
}

type admission struct {
	ID   string
	Hash [32]byte
}

// Router returns a fully configured chi.Router.
func (a *App) Router() chi.Router {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { sendError(w, 404, "Endpoint not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { sendError(w, 405, "Method not allowed") })
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("X-Frame-Options", "DENY")
			next.ServeHTTP(w, r)
		})
	})

	// CORS
	// FIX: replace the wildcard "*" origin (which is incompatible with
	// AllowCredentials:true per the CORS spec) with an explicit allowlist
	// seeded from the embedded frontend origin and any extras in config.
	allowedOrigins := buildCORSOrigins(a.Cfg)
	r.Use(requestBoundary(a.Cfg, allowedOrigins))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Idempotency-Key"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// API Routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", a.HandleHealth)
		r.Post("/info", a.HandleInfo)

		r.Route("/downloads", func(r chi.Router) {
			r.Get("/", a.HandleListDownloads)
			// No generic request timeout is applied: metadata and SSE each manage
			// their own lifetime, and SSE must retain client-disconnect cancellation.
			r.Get("/events", a.HandleSSEProgress)
			r.Get("/status/batch", a.HandleBatchStatus)
		})

		r.Route("/download", func(r chi.Router) {
			r.Post("/", a.HandleStartDownload)
			r.Post("/command-preview", a.HandleCommandPreview)
			r.Post("/batch", a.HandleStartBatch)

			r.Route("/{id}", func(r chi.Router) {
				r.Get("/status", a.HandleGetDownloadStatus)
				r.Delete("/", a.HandleDeleteDownload)
				r.Post("/cancel", a.HandleCancelDownload)
				r.Get("/log", a.HandleGetLog)
				r.Post("/retry", a.HandleRetryDownload)
				r.Get("/file/{index}", a.HandleResultFile)
				r.Get("/files", a.HandleRetainedFiles)
				r.Post("/files/cleanup", a.HandleCleanupFiles)
			})
		})
	})

	// Serve Embedded Frontend
	fileServer := http.FileServer(http.FS(web.FS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			sendError(w, http.StatusNotFound, "API endpoint not found")
			return
		}
		path := r.URL.Path
		if path == "/" {
			path = "index.html"
		} else {
			path = path[1:] // strip leading slash
		}

		_, err := fs.Stat(web.FS, path)
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
	origins := []string{
		"http://localhost:" + strconv.Itoa(cfg.Port),
		"http://127.0.0.1:" + strconv.Itoa(cfg.Port),
		"http://[::1]:" + strconv.Itoa(cfg.Port),
	}
	origins = append(origins, cfg.FrontendOrigins...)
	return origins
}

// requestBoundary rejects foreign Host values and cross-origin state-changing
// API requests. CORS response headers alone do not prevent simple requests from
// reaching handlers, so enforce the policy before dispatch.
func requestBoundary(cfg *config.Config, allowedOrigins []string) func(http.Handler) http.Handler {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origins[origin] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api" && !strings.HasPrefix(r.URL.Path, "/api/") {
				next.ServeHTTP(w, r)
				return
			}
			if !allowedRequestHost(r.Host, cfg) {
				sendError(w, http.StatusForbidden, "Untrusted Host header")
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" {
				if _, ok := origins[origin]; !ok {
					sendError(w, http.StatusForbidden, "Cross-origin API request rejected")
					return
				}
			}
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" && r.Header.Get("Origin") == "" {
				sendError(w, 403, "Cross-site API request rejected")
				return
			}
			if r.Method == http.MethodPost && (r.URL.Path == "/api/info" || r.URL.Path == "/api/download" || r.URL.Path == "/api/download/" || r.URL.Path == "/api/download/command-preview" || r.URL.Path == "/api/download/batch" || strings.HasSuffix(r.URL.Path, "/retry")) {
				mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
				if err != nil || mediaType != "application/json" {
					sendError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func allowedRequestHost(hostport string, cfg *config.Config) bool {
	host, port, err := net.SplitHostPort(hostport)
	if err != nil {
		host = strings.Trim(hostport, "[]")
	}
	if port != "" && port != strconv.Itoa(cfg.Port) {
		return false
	}
	if port == "" && cfg.Port != 80 {
		return false
	}
	host = strings.TrimSuffix(strings.ToLower(strings.Trim(host, "[]")), ".")
	return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == strings.ToLower(strings.Trim(cfg.Host, "[]"))
}

// Helper: sendJSON encodes data to JSON and writes it.
func sendJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Headers are already sent; a disconnected client needs no further response.
	_ = json.NewEncoder(w).Encode(data)
}

// Helper: sendError writes a structured JSON error.
func sendError(w http.ResponseWriter, status int, message string) {
	sendJSON(w, status, map[string]string{"error": message})
}
