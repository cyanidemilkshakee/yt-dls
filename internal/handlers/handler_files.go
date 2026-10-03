package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/go-chi/chi/v5"
)

type retainedFile struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"`
}
type retainedPreview struct {
	Files      []retainedFile `json:"files"`
	TotalBytes int64          `json:"total_bytes"`
	Token      string         `json:"token"`
}

func within(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !filepath.IsAbs(rel) && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

type ownedDirectory struct {
	path   string
	name   string
	parent *os.Root
	root   *os.Root
	info   fs.FileInfo
}

func (directory *ownedDirectory) close() {
	if directory.root != nil {
		_ = directory.root.Close()
	}
	if directory.parent != nil {
		_ = directory.parent.Close()
	}
}

// Open from the configured root so a directory replaced by a symlink cannot
// redirect a deletion outside that root between validation and removal.
func (a *App) openOwnedDirectory(dp *store.DownloadProgress) (*ownedDirectory, error) {
	root := filepath.Clean(dp.OutputRoot())
	id := dp.Snapshot().DownloadID
	if !filepath.IsAbs(root) || filepath.Base(root) != id || root == filepath.Clean(a.Cfg.DownloadDir) {
		return nil, fmt.Errorf("this record has no owned job directory")
	}
	defaultAnchor, err := canonicalConfiguredDirectory(a.Cfg.DownloadDir)
	if err != nil {
		return nil, fmt.Errorf("configured download root is unavailable")
	}
	customAnchor, err := canonicalConfiguredDirectory(a.Cfg.RootDir)
	if err != nil {
		return nil, fmt.Errorf("configured project root is unavailable")
	}
	// The worker saves canonical output paths. Configured root aliases remain
	// valid, but a symlink at the owned ID leaf remains forbidden below.
	if root == filepath.Join(a.Cfg.DownloadDir, id) {
		root = filepath.Join(defaultAnchor, id)
	} else if within(a.Cfg.RootDir, root) {
		rel, _ := filepath.Rel(a.Cfg.RootDir, root)
		root = filepath.Join(customAnchor, rel)
	}
	if root == defaultAnchor || root == customAnchor {
		return nil, fmt.Errorf("configured root directories are not owned job directories")
	}
	defaultRoot := filepath.Join(defaultAnchor, id)
	anchor := defaultAnchor
	if root != defaultRoot && (!a.Cfg.AllowCustomDownloadPath || !within(customAnchor, root)) {
		return nil, fmt.Errorf("job directory is outside configured download roots")
	}
	if root != defaultRoot {
		anchor = customAnchor
	}
	resolved, err := filepath.EvalSymlinks(root)
	if errors.Is(err, os.ErrNotExist) {
		return &ownedDirectory{path: root}, nil
	}
	if err != nil || filepath.Clean(resolved) != root {
		return nil, fmt.Errorf("job directory is unavailable or contains a symbolic link")
	}
	parent, err := os.OpenRoot(anchor)
	if err != nil {
		return nil, fmt.Errorf("configured download root is unavailable")
	}
	directory := &ownedDirectory{path: root, parent: parent}
	directory.name, err = filepath.Rel(anchor, root)
	if err != nil || !within(anchor, root) {
		directory.close()
		return nil, fmt.Errorf("job directory is outside configured download roots")
	}
	directory.info, err = parent.Lstat(directory.name)
	if err != nil || !directory.info.IsDir() || directory.info.Mode()&os.ModeSymlink != 0 {
		directory.close()
		return nil, fmt.Errorf("job directory is unavailable or contains a symbolic link")
	}
	directory.root, err = parent.OpenRoot(directory.name)
	if err != nil {
		directory.close()
		return nil, fmt.Errorf("job directory is unavailable or outside its configured root")
	}
	opened, err := directory.root.Stat(".")
	if err != nil || !os.SameFile(directory.info, opened) {
		directory.close()
		return nil, fmt.Errorf("job directory changed while being opened")
	}
	return directory, nil
}

func canonicalConfiguredDirectory(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if errors.Is(err, os.ErrNotExist) {
		return filepath.Clean(path), nil
	}
	return filepath.Clean(resolved), err
}

func previewRetainedFiles(directory *ownedDirectory) (retainedPreview, error) {
	preview := retainedPreview{Files: []retainedFile{}}
	if directory.root == nil {
		return finishRetainedPreview(preview, directory.path), nil
	}
	entries := 0
	err := fs.WalkDir(directory.root.FS(), ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		entries++
		if entries > 10000 {
			return fmt.Errorf("job contains too many paths for a safe cleanup preview")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("cleanup is blocked by a symbolic link in the job directory")
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("cleanup is blocked by a non-regular file")
		}
		if len(preview.Files) >= 5000 {
			return fmt.Errorf("job contains too many files for a safe cleanup preview")
		}
		preview.Files = append(preview.Files, retainedFile{path, info.Size(), info.ModTime().UnixNano()})
		preview.TotalBytes += info.Size()
		return nil
	})
	if err != nil {
		return preview, err
	}
	return finishRetainedPreview(preview, directory.path), nil
}

func finishRetainedPreview(preview retainedPreview, root string) retainedPreview {
	sort.Slice(preview.Files, func(i, j int) bool { return preview.Files[i].Name < preview.Files[j].Name })
	data, _ := json.Marshal(preview.Files)
	hash := sha256.Sum256(append([]byte(root+"\x00"), data...))
	preview.Token = hex.EncodeToString(hash[:])
	return preview
}

func (a *App) fileJob(w http.ResponseWriter, r *http.Request) (*store.DownloadProgress, bool) {
	id := chi.URLParam(r, "id")
	dp, ok := a.Store.Get(id)
	if !ok {
		sendError(w, 404, "Download not found")
		return nil, false
	}
	snapshot := dp.Snapshot()
	if !store.Terminal(snapshot.Status) || snapshot.Kind == "batch" || a.Store.ActiveBatchContains(id) {
		sendError(w, 409, "Finish the job and its parent batch before managing its files")
		return nil, false
	}
	return dp, true
}

func (a *App) HandleRetainedFiles(w http.ResponseWriter, r *http.Request) {
	dp, ok := a.fileJob(w, r)
	if !ok {
		return
	}
	if !dp.FilesMu.TryRLock() {
		sendError(w, 409, "File cleanup is in progress")
		return
	}
	defer dp.FilesMu.RUnlock()
	directory, err := a.openOwnedDirectory(dp)
	if err != nil {
		sendError(w, 409, err.Error())
		return
	}
	defer directory.close()
	preview, err := previewRetainedFiles(directory)
	if err != nil {
		sendError(w, 409, err.Error())
		return
	}
	sendJSON(w, 200, preview)
}

func (a *App) HandleCleanupFiles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if !decodeRequest(w, r, &body, 4096) {
		return
	}
	dp, ok := a.fileJob(w, r)
	if !ok {
		return
	}
	if !dp.FilesMu.TryLock() {
		sendError(w, 409, "Wait for the worker and file transfers to finish before cleaning files")
		return
	}
	defer dp.FilesMu.Unlock()
	directory, err := a.openOwnedDirectory(dp)
	if err != nil {
		sendError(w, 409, err.Error())
		return
	}
	defer directory.close()
	preview, err := previewRetainedFiles(directory)
	if err != nil {
		sendError(w, 409, err.Error())
		return
	}
	if body.Token == "" || body.Token != preview.Token {
		sendError(w, 409, "Files changed since preview. Refresh the preview before deleting.")
		return
	}
	removed := make(map[string]bool)
	complete := false
	defer func() { recordCleanedFiles(dp, directory.path, removed, complete) }()
	for _, file := range preview.Files {
		info, err := directory.root.Lstat(file.Name)
		if err != nil || !info.Mode().IsRegular() || info.Size() != file.Size || info.ModTime().UnixNano() != file.Modified {
			sendError(w, 409, fmt.Sprintf("Files changed during cleanup after removing %d files. Refresh the preview.", len(removed)))
			return
		}
		if err := directory.root.Remove(file.Name); err != nil {
			sendError(w, 500, fmt.Sprintf("Could not remove a job file after removing %d files. Refresh the preview and retry.", len(removed)))
			return
		}
		removed[file.Name] = true
	}
	// Only remove empty directories, deepest first. RemoveAll is deliberately not used.
	var directories []string
	if directory.root != nil {
		err := fs.WalkDir(directory.root.FS(), ".", func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.Type()&os.ModeSymlink != 0 || (!entry.IsDir() && path != ".") {
				return fmt.Errorf("files changed during cleanup")
			}
			if path != "." {
				if len(directories) >= 10000 {
					return fmt.Errorf("job directory count changed during cleanup")
				}
				directories = append(directories, path)
			}
			return nil
		})
		if err != nil {
			sendError(w, 409, "Files changed during cleanup. Refresh the preview.")
			return
		}
		sort.Slice(directories, func(i, j int) bool { return len(directories[i]) > len(directories[j]) })
		for _, name := range directories {
			if err := directory.root.Remove(name); err != nil {
				sendError(w, 500, "Could not remove an empty job directory. Refresh the preview and retry.")
				return
			}
		}
		_ = directory.root.Close()
		directory.root = nil
		current, err := directory.parent.Lstat(directory.name)
		if err != nil || !os.SameFile(directory.info, current) {
			sendError(w, 409, "Job directory changed during cleanup. Refresh the preview.")
			return
		}
		if err := directory.parent.Remove(directory.name); err != nil {
			sendError(w, 500, "Could not remove the empty job directory. Refresh the preview and retry.")
			return
		}
	}
	complete = true
	sendJSON(w, 200, map[string]any{"removed": len(preview.Files), "bytes_freed": preview.TotalBytes})
}

// Keep stable result indexes when only part of a cleanup succeeds. Deleted
// outputs must disappear from both the UI and persisted history immediately.
func recordCleanedFiles(dp *store.DownloadProgress, root string, removed map[string]bool, complete bool) {
	if len(removed) == 0 && !complete {
		return
	}
	dp.Update(func(p *store.DownloadProgress) {
		if complete {
			p.Files = nil
			p.Paths = nil
			p.AddLogLocked("Job-owned files were explicitly cleaned")
			return
		}
		removedIndexes := make(map[int]bool)
		for index, path := range p.Paths {
			rel, err := filepath.Rel(root, path)
			if err == nil && removed[filepath.ToSlash(rel)] {
				p.Paths[index] = ""
				removedIndexes[index] = true
			}
		}
		remaining := make([]store.ResultFile, 0, len(p.Files))
		for _, file := range p.Files {
			if !removedIndexes[file.Index] {
				remaining = append(remaining, file)
			}
		}
		p.Files = remaining
		p.AddLogLocked(fmt.Sprintf("File cleanup removed %d files before stopping; refresh the retained-file preview", len(removed)))
	})
}
