package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/validation"
)

var (
	nonAlphanumeric = regexp.MustCompile(`[^a-zA-Z0-9.\-_]`)
)

func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, " ", "_")
	name = nonAlphanumeric.ReplaceAllString(name, "")
	if len(name) > 200 {
		name = name[:200]
	}
	if name == "" {
		return "video"
	}
	return name
}

// HandleInfo processes a request for video/playlist metadata.
func (a *App) HandleInfo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	// Also accept query param for GET compatibility, though POST is preferred in JSON
	req.URL = r.URL.Query().Get("url")
	if req.URL == "" {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB cap
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
			sendError(w, http.StatusBadRequest, "Missing or invalid 'url' parameter")
			return
		}
	}

	validURL, err := validation.ValidateMediaURL(req.URL, a.Cfg)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{
			"error":      err.Error(),
			"error_code": "INVALID_URL",
		})
		return
	}

	// In a real app we'd add an LRU cache here. For this port we'll just run it directly.
	// (Cache logic can be added later if needed).

	timeout := time.Duration(a.Cfg.InfoTimeoutMs) * time.Millisecond
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	// Derive yt-dlp socket timeout (seconds) from the config value
	socketTimeoutSecs := int(a.Cfg.InfoTimeoutMs/1000) - 5
	if socketTimeoutSecs < 5 {
		socketTimeoutSecs = 5
	}

	args := []string{
		"--quiet", "--no-warnings", "--skip-download", "--flat-playlist", "--dump-single-json",
		"--socket-timeout", fmt.Sprintf("%d", socketTimeoutSecs),
		"--retries", "3", "--extractor-retries", "3",
		"--fragment-retries", "3",
	}

	if a.Cfg.YtDlpJSRuntime != "" {
		args = append(args, "--js-runtimes", a.Cfg.YtDlpJSRuntime)
	}

	args = append(args, validURL)

	cmd := exec.CommandContext(ctx, a.Cfg.YtDlpPath, args...)
	// Hide console window on Windows
	setSysProcAttr(cmd)

	out, cmdErr := cmd.Output()
	if cmdErr != nil {
		// FIX: check deadline first — if the context expired, always send 504
		// regardless of what the process exit error says.
		if ctx.Err() == context.DeadlineExceeded {
			sendJSON(w, http.StatusGatewayTimeout, map[string]string{
				"error":      "Metadata request timed out.",
				"error_code": "PROCESS_TIMEOUT",
			})
			return
		}

		stderr := ""
		if exitErr, ok := cmdErr.(*exec.ExitError); ok {
			stderr = strings.ToLower(strings.TrimSpace(string(exitErr.Stderr)))
		}

		status := http.StatusBadGateway
		code := "PROCESSING_ERROR"
		if strings.Contains(stderr, "unsupported url") {
			status = http.StatusBadRequest
			code = "UNSUPPORTED_URL"
		} else if strings.Contains(stderr, "private") || strings.Contains(stderr, "not available") || strings.Contains(stderr, "deleted") {
			status = http.StatusNotFound
			code = "CONTENT_UNAVAILABLE"
		} else if strings.Contains(stderr, "403") || strings.Contains(stderr, "forbidden") {
			status = http.StatusForbidden
			code = "ACCESS_FORBIDDEN"
		}

		sendJSON(w, status, map[string]string{
			"error":      "Could not retrieve media information.",
			"error_code": code,
		})
		return
	}

	var rawInfo map[string]any
	if err := json.Unmarshal(out, &rawInfo); err != nil {
		sendJSON(w, http.StatusBadGateway, map[string]string{
			"error":      "Failed to parse yt-dlp output.",
			"error_code": "PARSE_ERROR",
		})
		return
	}

	// Playlist handling
	if typ, _ := rawInfo["_type"].(string); typ == "playlist" || rawInfo["entries"] != nil {
		sendJSON(w, http.StatusOK, processPlaylist(rawInfo, validURL))
		return
	}

	sendJSON(w, http.StatusOK, processInfoDict(rawInfo))
}

func processPlaylist(info map[string]any, originalURL string) map[string]any {
	var parsedEntries []map[string]any

	entries, _ := info["entries"].([]any)
	for i, e := range entries {
		entry, ok := e.(map[string]any)
		if !ok {
			continue
		}
		
		extractor, _ := entry["ie_key"].(string)
		if extractor == "" {
			extractor, _ = entry["extractor_key"].(string)
		}
		extractor = strings.ToLower(extractor)

		url, _ := entry["webpage_url"].(string)
		if url == "" {
			altURL, _ := entry["url"].(string)
			if strings.HasPrefix(strings.ToLower(altURL), "http") {
				url = altURL
			}
		}
		
		id, _ := entry["id"].(string)
		if url == "" && id != "" && strings.Contains(extractor, "youtube") {
			url = "https://www.youtube.com/watch?v=" + id
		} else if url == "" && id != "" && strings.Contains(extractor, "vimeo") {
			url = "https://vimeo.com/" + id
		}

		if url == "" {
			continue
		}

		if id == "" {
			id = fmt.Sprintf("entry_%d", i)
		}
		
		title, _ := entry["title"].(string)
		if title == "" {
			title = "Untitled Video"
		}

		var thumb any
		if t, ok := entry["thumbnail"].(string); ok && t != "" {
			thumb = t
		} else if thumbs, ok := entry["thumbnails"].([]any); ok && len(thumbs) > 0 {
			if last, ok := thumbs[len(thumbs)-1].(map[string]any); ok {
				thumb = last["url"]
			}
		}

		uploader, _ := entry["uploader"].(string)
		if uploader == "" {
			uploader, _ = entry["channel"].(string)
		}
		
		var duration any = entry["duration"]
		var viewCount any = entry["view_count"]

		parsedEntries = append(parsedEntries, map[string]any{
			"id":         id,
			"url":        url,
			"title":      title,
			"duration":   duration,
			"thumbnail":  thumb,
			"uploader":   uploader,
			"view_count": viewCount,
		})
	}

	id, _ := info["id"].(string)
	if id == "" {
		id = "unknown"
	}
	title, _ := info["title"].(string)
	if title == "" {
		title = "Untitled Playlist"
	}
	uploader, _ := info["uploader"].(string)
	if uploader == "" {
		uploader, _ = info["channel"].(string)
	}

	return map[string]any{
		"_type":        "playlist",
		"id":           id,
		"title":        title,
		"uploader":     uploader,
		"description":  info["description"],
		"entries":      parsedEntries,
		"entry_count":  len(parsedEntries),
		"original_url": originalURL,
	}
}

func processInfoDict(info map[string]any) map[string]any {
	var combinedFormats, videoFormats, audioFormats []map[string]any
	
	durationF, _ := info["duration"].(float64)

	formats, _ := info["formats"].([]any)
	for _, f := range formats {
		fmtMap, ok := f.(map[string]any)
		if !ok {
			continue
		}

		vcodec, _ := fmtMap["vcodec"].(string)
		formatNote, _ := fmtMap["format_note"].(string)
		ext, _ := fmtMap["ext"].(string)

		if vcodec == "images" || formatNote == "storyboard" || ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" {
			continue
		}

		isApprox := false
		var filesize any
		if fs, ok := fmtMap["filesize"].(float64); ok && fs > 0 {
			filesize = fs
		} else if fsa, ok := fmtMap["filesize_approx"].(float64); ok && fsa > 0 {
			filesize = fsa
			isApprox = true
		} else if durationF > 0 {
			var br float64
			if v, ok := fmtMap["vbr"].(float64); ok { br = v }
			if v, ok := fmtMap["abr"].(float64); ok && v > br { br = v }
			if v, ok := fmtMap["tbr"].(float64); ok && v > br { br = v }
			if br > 0 {
				filesize = math.Floor((br * 1000 / 8) * durationF)
				isApprox = true
			}
		}

		acodec, _ := fmtMap["acodec"].(string)
		vc := strings.Split(vcodec, ".")[0]
		ac := strings.Split(acodec, ".")[0]
		if vc == "" { vc = "N/A" }
		if ac == "" { ac = "N/A" }

		hasVideo := vcodec != "" && vcodec != "none"
		hasAudio := acodec != "" && acodec != "none"

		res, _ := fmtMap["resolution"].(string)
		width, _ := fmtMap["width"].(float64)
		height, _ := fmtMap["height"].(float64)

		formatInfo := map[string]any{
			"id":                 fmtMap["format_id"],
			"ext":                ext,
			"filesize":           filesize,
			"filesize_is_approx": isApprox,
			"tbr":                fmtMap["tbr"],
			"abr":                fmtMap["abr"],
			"vbr":                fmtMap["vbr"],
			"fps":                fmtMap["fps"],
			"vcodec":             vc,
			"acodec":             ac,
			"width":              width,
			"height":             height,
			"format_note":        formatNote,
			"format":             fmtMap["format"],
		}

		if hasVideo && hasAudio {
			if res == "" {
				res = fmt.Sprintf("%vx%v", width, height)
			}
			formatInfo["resolution"] = res
			formatInfo["type"] = "combined"
			combinedFormats = append(combinedFormats, formatInfo)
		} else if hasVideo {
			if res == "" {
				res = fmt.Sprintf("%vx%v", width, height)
			}
			formatInfo["resolution"] = res
			formatInfo["type"] = "video"
			videoFormats = append(videoFormats, formatInfo)
		} else if hasAudio {
			formatInfo["resolution"] = "audio only"
			formatInfo["type"] = "audio"
			audioFormats = append(audioFormats, formatInfo)
		}
	}

	// FIX: allocate a fresh slice to avoid aliasing combinedFormats' backing array.
	// append(combinedFormats, videoFormats...) would silently overwrite combinedFormats
	// if it had spare capacity from a prior append.
	allVideoFormats := make([]map[string]any, 0, len(combinedFormats)+len(videoFormats))
	allVideoFormats = append(allVideoFormats, combinedFormats...)
	allVideoFormats = append(allVideoFormats, videoFormats...)
	
	// Sort videos by height desc, vbr desc, fps desc
	sort.SliceStable(allVideoFormats, func(i, j int) bool {
		hi, _ := allVideoFormats[i]["height"].(float64)
		hj, _ := allVideoFormats[j]["height"].(float64)
		if hi != hj { return hi > hj }
		vi, _ := allVideoFormats[i]["vbr"].(float64)
		vj, _ := allVideoFormats[j]["vbr"].(float64)
		if vi != vj { return vi > vj }
		fi, _ := allVideoFormats[i]["fps"].(float64)
		fj, _ := allVideoFormats[j]["fps"].(float64)
		return fi > fj
	})

	// Sort audio by abr desc
	sort.SliceStable(audioFormats, func(i, j int) bool {
		ai, _ := audioFormats[i]["abr"].(float64)
		aj, _ := audioFormats[j]["abr"].(float64)
		return ai > aj
	})

	var bestVideoIds []string
	if len(allVideoFormats) > 0 {
		bestH, _ := allVideoFormats[0]["height"].(float64)
		bestV, _ := allVideoFormats[0]["vbr"].(float64)
		for _, f := range allVideoFormats {
			h, _ := f["height"].(float64)
			v, _ := f["vbr"].(float64)
			if h == bestH && v == bestV {
				if id, ok := f["id"].(string); ok {
					bestVideoIds = append(bestVideoIds, id)
				}
			}
		}
	}

	var bestAudioIds []string
	if len(audioFormats) > 0 {
		bestA, _ := audioFormats[0]["abr"].(float64)
		for _, f := range audioFormats {
			a, _ := f["abr"].(float64)
			if a == bestA {
				if id, ok := f["id"].(string); ok {
					bestAudioIds = append(bestAudioIds, id)
				}
			}
		}
	}

	var subtitles []map[string]any
	subtitleLangs := make(map[string]bool)

	subs, _ := info["subtitles"].(map[string]any)
	for lang, slist := range subs {
		subtitleLangs[lang] = true
		list, _ := slist.([]any)
		for _, subAny := range list {
			sub, ok := subAny.(map[string]any)
			if !ok { continue }
			ext, _ := sub["ext"].(string)
			if ext == "vtt" || ext == "srt" || ext == "ass" {
				name, _ := sub["name"].(string)
				if name == "" { name = lang }
				subtitles = append(subtitles, map[string]any{
					"lang": lang, "name": name, "ext": ext, "auto": false,
				})
			}
		}
	}

	autoSubs, _ := info["automatic_captions"].(map[string]any)
	for lang, slist := range autoSubs {
		if subtitleLangs[lang] { continue } // skip auto if manual exists
		list, _ := slist.([]any)
		for _, subAny := range list {
			sub, ok := subAny.(map[string]any)
			if !ok { continue }
			ext, _ := sub["ext"].(string)
			if ext == "vtt" || ext == "srt" || ext == "ass" {
				name, _ := sub["name"].(string)
				if name == "" { name = lang }
				subtitles = append(subtitles, map[string]any{
					"lang": lang, "name": name + " (auto)", "ext": ext, "auto": true,
				})
			}
		}
	}

	var langsList []string
	for l := range subtitleLangs {
		langsList = append(langsList, l)
	}
	sort.Strings(langsList)
	
	// Subtitles must not be null in JSON (frontend expects array)
	if subtitles == nil {
		subtitles = make([]map[string]any, 0)
	}

	// Make summary string
	desc, _ := info["description"].(string)
	up, _ := info["uploader"].(string)
	if up == "" { up = "Unknown" }
	
	var summaryParts []string
	if up != "Unknown" { summaryParts = append(summaryParts, "Uploaded by: "+up) }
	if durationF > 0 {
		d := int(durationF)
		h := d / 3600
		m := (d % 3600) / 60
		s := d % 60
		if h > 0 {
			summaryParts = append(summaryParts, fmt.Sprintf("Duration: %02d:%02d:%02d", h, m, s))
		} else {
			summaryParts = append(summaryParts, fmt.Sprintf("Duration: %02d:%02d", m, s))
		}
	}
	if desc != "" {
		cleanDesc := strings.Join(strings.Fields(desc), " ") // collapse whitespace
		if len(cleanDesc) > 200 {
			cleanDesc = cleanDesc[:200] + "..."
		}
		summaryParts = append(summaryParts, cleanDesc)
	}
	
	summary := "No additional information available."
	if len(summaryParts) > 0 {
		summary = strings.Join(summaryParts, " | ")
	}

	title, _ := info["title"].(string)
	if title == "" { title = "video" }
	suggestedFilename := fmt.Sprintf("%s.%%(ext)s", sanitizeFilename(title))

	return map[string]any{
		"title":              title,
		"thumbnail":          info["thumbnail"],
		"description":        summary,
		"duration":           durationF,
		"uploader":           info["uploader"],
		"upload_date":        info["upload_date"],
		"suggested_filename": suggestedFilename,
		"video_formats":      allVideoFormats,
		"audio_formats":      audioFormats,
		"best_video_ids":     bestVideoIds,
		"best_audio_ids":     bestAudioIds,
		"subtitles":          subtitles,
		"subtitle_languages": langsList,
		"has_chapters":       info["chapters"] != nil,
		"is_live":            info["is_live"] == true || info["is_live"] == "true",
	}
}
