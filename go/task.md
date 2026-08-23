# Architecture Refactoring Tasks

## Frontend (React)
- `[x]` Create `features` directory (`config`, `downloads`, `playlist`)
- `[x]` Move `ConfigSection.jsx` to `features/config/`
- `[x]` Move `DownloadsSection.jsx`, `DownloadItem.jsx`, and `useDownloads.js` to `features/downloads/`
- `[x]` Move `PlaylistSection.jsx` to `features/playlist/`
- `[x]` Break down `index.css` into modular feature CSS files (e.g. `ConfigSection.css`)
- `[x]` Update all import paths in `Home.jsx`, `App.jsx`, etc.
- `[x]` Run `npm run build` to verify frontend.

## Backend (Go)
- `[x]` Rename `internal/api` to `internal/handlers`
- `[x]` Create `internal/services` directory
- `[x]` Extract business logic from handlers/workers into `internal/services/`
- `[x]` Update all Go imports across the backend
- `[x]` Run `go build ./cmd/server` to verify backend.
