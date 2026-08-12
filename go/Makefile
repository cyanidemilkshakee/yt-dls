.PHONY: build run run-dev test lint cross-windows cross-linux cross-macos

# Production build — embeds frontend, strips debug symbols
build:
	go build -ldflags="-s -w" -o ../ytdls-server ./cmd/server

# Production run — uses embedded frontend
run:
	go run ./cmd/server

# Dev run — serves frontend from disk (no recompile on HTML/CSS changes)
run-dev:
	go run -tags dev ./cmd/server

test:
	go test -race -count=1 ./...

test-verbose:
	go test -race -v -count=1 ./...

lint:
	golangci-lint run

# Cross-compile targets — pure Go, no CGO, no C toolchain required
cross-windows:
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../ytdls-server.exe ./cmd/server

cross-linux:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../ytdls-server-linux ./cmd/server

cross-macos:
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../ytdls-server-macos ./cmd/server

cross: cross-windows cross-linux cross-macos
