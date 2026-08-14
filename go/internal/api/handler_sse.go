package api

import (
	"net/http"
)

// HandleSSEProgress routes the request to the SSE Gateway.
func (a *App) HandleSSEProgress(w http.ResponseWriter, r *http.Request) {
	a.SSEGateway.ServeHTTP(w, r)
}
