package handlers

import (
	"net/http"
)

// HandleHealth provides a basic health check endpoint.
func (a *App) HandleHealth(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
