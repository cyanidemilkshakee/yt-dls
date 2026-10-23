package worker

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/internal/store"
)

var (
	videoExtRe = regexp.MustCompile(`(?i)\.(mp4|mkv|webm|avi|mov|flv|m4v|ts)$`)
	audioExtRe = regexp.MustCompile(`(?i)\.(mp3|m4a|wav|aac|flac|ogg|opus|alac|vorbis)$`)
)

// ExpectedStreams determines which streams (video, audio) to expect based on DownloadOptions.
func ExpectedStreams(opts DownloadOptions) (expectedVideo, expectedAudio bool) {
	if opts.ExtractAudio || opts.DownloadMode == "audio" {
		return false, true
	}
	if opts.DownloadMode == "video" {
		return true, false
	}
	if opts.DownloadMode == "both" {
		return true, true
	}

	format := strings.ToLower(opts.FormatCode)
	if strings.Contains(format, "audio") && !strings.Contains(format, "video") && !strings.Contains(format, "+") {
		return false, true
	}
	if strings.Contains(format, "video") && !strings.Contains(format, "audio") && !strings.Contains(format, "+") {
		return true, false
	}
	return true, true
}

// YtDlpProgress represents the JSON output from yt-dlp's --progress-template.
type YtDlpProgress struct {
	Status             string   `json:"status"`
	Filename           *string  `json:"filename"`
	TotalBytes         *float64 `json:"total_bytes"`
	TotalBytesEstimate *float64 `json:"total_bytes_estimate"`
	DownloadedBytes    *float64 `json:"downloaded_bytes"`
	Speed              *float64 `json:"speed"`
	ETA                *float64 `json:"eta"`
	FragmentIndex      *float64 `json:"fragment_index"`
	FragmentCount      *float64 `json:"fragment_count"`
	VCodec             *string  `json:"vcodec"`
	ACodec             *string  `json:"acodec"`
	Error              *string  `json:"error"`
	FormatID           string   `json:"format_id"`
	MediaID            string   `json:"media_id"`
}

func hasCodec(codec *string) bool {
	if codec == nil {
		return false
	}
	lower := strings.ToLower(*codec)
	return lower != "none" && lower != "n/a" && lower != "na" && lower != "null" && lower != ""
}

// HandleProgress processes a JSON progress line from yt-dlp and updates the DownloadProgress.
// It returns false when the line is not valid progress JSON so callers can
// keep malformed/unrelated output in the human-readable log.
func HandleProgress(dp *store.DownloadProgress, rawJSON []byte) bool {
	var d YtDlpProgress
	if err := json.Unmarshal(rawJSON, &d); err != nil {
		return false
	}

	status := d.Status
	if status == "" {
		status = "unknown"
	}

	dp.Update(func(p *store.DownloadProgress) {
		if p.Status == "cancelled" || p.Status == "failed" || p.Status == "completed" {
			return
		}
		if d.FormatID != "" && (status == "downloading" || status == "finished") {
			handleIdentifiedStream(p, d)
			return
		}
		filename := "download"
		if p.Filename != nil {
			filename = *p.Filename
		}
		if d.Filename != nil && *d.Filename != "NA" && *d.Filename != "" {
			filename = *d.Filename
		}

		hasVid := hasCodec(d.VCodec)
		hasAud := hasCodec(d.ACodec)

		videoByName := videoExtRe.MatchString(filename)
		audioByName := audioExtRe.MatchString(filename)

		// Determine which streams are actively being downloaded
		var activeStreams []*store.StreamProgress

		// Older progress frames without IDs still use codec/filename detection.
		if hasVid && hasAud && p.VideoProgress.Expected && p.AudioProgress.Expected {
			activeStreams = append(activeStreams, &p.VideoProgress, &p.AudioProgress)
		} else if !hasVid && !hasAud && p.VideoProgress.Expected && p.AudioProgress.Expected {
			// Generic/direct downloads can omit codec metadata even though the
			// selected format is one combined file. Treat it as a single shared
			// stream so aggregate progress is not incorrectly halved.
			activeStreams = append(activeStreams, &p.VideoProgress, &p.AudioProgress)
		} else if hasAud && !hasVid {
			activeStreams = append(activeStreams, &p.AudioProgress)
		} else if hasVid && !hasAud {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if audioByName {
			activeStreams = append(activeStreams, &p.AudioProgress)
		} else if videoByName {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if p.VideoProgress.Expected && !p.AudioProgress.Expected {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if p.AudioProgress.Expected && !p.VideoProgress.Expected {
			activeStreams = append(activeStreams, &p.AudioProgress)
		} else if p.VideoProgress.Expected && p.AudioProgress.Expected {
			// Some extractors omit codec and filename metadata from the
			// progress template. When both streams are expected, treat the
			// update as a combined download instead of assigning it to video
			// and leaving the aggregate stuck at half progress.
			activeStreams = append(activeStreams, &p.VideoProgress, &p.AudioProgress)
		} else if p.VideoProgress.Status == "downloading" {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if p.AudioProgress.Status == "downloading" {
			activeStreams = append(activeStreams, &p.AudioProgress)
		} else {
			activeStreams = append(activeStreams, &p.VideoProgress)
		}

		combined := len(activeStreams) > 1
		if !combined {
			p.VideoProgress.Combined = false
			p.AudioProgress.Combined = false
		}

		safeNum := func(f *float64) float64 {
			if f == nil || math.IsNaN(*f) || math.IsInf(*f, 0) {
				return 0
			}
			return *f
		}
		safeInt := func(f *float64) int64 {
			if f == nil || math.IsNaN(*f) || math.IsInf(*f, 0) {
				return 0
			}
			return int64(*f)
		}

		if status == "downloading" {
			p.Status = "downloading"
			if d.Filename != nil && *d.Filename != "NA" && *d.Filename != "" {
				p.Filename = d.Filename
			}

			totalBytes := safeInt(d.TotalBytes)
			if totalBytes == 0 {
				totalBytes = safeInt(d.TotalBytesEstimate)
			}
			downloadedBytes := safeInt(d.DownloadedBytes)
			speed := safeNum(d.Speed)
			etaVal := safeInt(d.ETA)
			var eta *int64
			if etaVal > 0 {
				eta = &etaVal
			}

			var pct float64
			if totalBytes > 0 {
				pct = math.Min((float64(downloadedBytes)/float64(totalBytes))*100, 100)
			} else {
				// Fragmented HLS/DASH downloads frequently have no byte total.
				// yt-dlp still exposes a 0-based fragment index and count, which
				// gives the UI a useful percentage while bytes remain unknown.
				fragmentIndex := safeInt(d.FragmentIndex)
				fragmentCount := safeInt(d.FragmentCount)
				if fragmentCount > 0 && fragmentIndex >= 0 {
					pct = math.Min((float64(fragmentIndex)/float64(fragmentCount))*100, 100)
				}
			}

			for _, stream := range activeStreams {
				stream.Combined = combined
				stream.Status = "downloading"
				stream.TotalBytes = totalBytes
				stream.DownloadedBytes = downloadedBytes
				stream.Progress = pct
				stream.Speed = speed
				stream.ETA = eta
			}

			p.RecalculateAggregate()
			p.Speed = speed
			p.ETA = eta

		} else if status == "finished" {
			finalTotal := safeInt(d.TotalBytes)
			if finalTotal == 0 {
				finalTotal = safeInt(d.TotalBytesEstimate)
			}
			finalDownloaded := safeInt(d.DownloadedBytes)
			if finalTotal == 0 && finalDownloaded > 0 {
				finalTotal = finalDownloaded
			}
			for _, stream := range activeStreams {
				stream.Combined = combined
				stream.Status = "completed"
				stream.Progress = 100
				stream.Speed = 0
				stream.ETA = nil
				if finalTotal > 0 {
					stream.TotalBytes = finalTotal
				}
				if finalDownloaded > 0 {
					stream.DownloadedBytes = finalDownloaded
				} else if stream.TotalBytes > 0 {
					stream.DownloadedBytes = stream.TotalBytes
				}
			}
			p.RecalculateAggregate()
			p.Status = "processing"
			if d.Filename != nil && *d.Filename != "NA" && *d.Filename != "" {
				p.Filename = d.Filename
			}
			p.Speed = 0
			p.ETA = nil

		} else if status == "error" {
			p.Status = "failed"
			now := time.Now()
			p.CompletedAt = &now
			errStr := "Unknown error"
			if d.Error != nil {
				errStr = *d.Error
			}
			p.Error = &errStr
			p.Speed = 0
			p.ETA = nil
			for _, stream := range activeStreams {
				stream.Status = "failed"
			}
			p.MarkIncompleteStreams("failed")
			p.AddLogLocked("Download failed: " + errStr)
		}
	})
	return true
}

// Each selected format has its own accumulator. A second video or audio format
// must not overwrite the bytes from a format that already completed.
func handleIdentifiedStream(p *store.DownloadProgress, d YtDlpProgress) {
	if p.Streams == nil {
		p.Streams = make(map[string]store.StreamProgress)
	}
	id := d.MediaID + ":" + d.FormatID
	stream := p.Streams[id]
	stream.ID = id
	stream.Expected = true
	hasVideo, hasAudio := hasCodec(d.VCodec), hasCodec(d.ACodec)
	switch {
	case hasVideo && hasAudio:
		stream.Kind = "combined"
		stream.Combined = true
	case hasAudio:
		stream.Kind = "audio"
	case hasVideo:
		stream.Kind = "video"
	case p.AudioProgress.Expected && !p.VideoProgress.Expected:
		stream.Kind = "audio"
	default:
		stream.Kind = "combined"
		stream.Combined = true
	}
	number := func(value *float64) float64 {
		if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 {
			return 0
		}
		return math.Min(*value, float64(math.MaxInt64-1024))
	}
	if total := int64(number(d.TotalBytes)); total > 0 {
		stream.TotalBytes = total
	} else if estimate := int64(number(d.TotalBytesEstimate)); estimate > 0 {
		stream.TotalBytes = estimate
	}
	if d.DownloadedBytes != nil {
		stream.DownloadedBytes = int64(number(d.DownloadedBytes))
	}
	stream.Speed = number(d.Speed)
	stream.ETA = nil
	if eta := int64(number(d.ETA)); eta > 0 {
		stream.ETA = &eta
	}
	if stream.TotalBytes > 0 {
		stream.Progress = math.Min(100, float64(stream.DownloadedBytes)/float64(stream.TotalBytes)*100)
	} else if count := number(d.FragmentCount); count > 0 {
		stream.Progress = math.Min(100, number(d.FragmentIndex)/count*100)
	}
	stream.Status = "downloading"
	p.Status = "downloading"
	if d.Status == "finished" {
		stream.Status = "completed"
		stream.Progress = 100
		stream.Speed = 0
		stream.ETA = nil
		p.Status = "processing"
		if stream.TotalBytes == 0 {
			stream.TotalBytes = stream.DownloadedBytes
		}
		if d.DownloadedBytes == nil || stream.DownloadedBytes == 0 {
			stream.DownloadedBytes = stream.TotalBytes
		}
	}
	p.Streams[id] = stream
	if d.Filename != nil && *d.Filename != "" && *d.Filename != "NA" {
		p.Filename = d.Filename
	}
	for _, kind := range []string{"video", "audio"} {
		group := store.StreamProgress{Status: "waiting"}
		if kind == "video" {
			group.Expected = p.VideoProgress.Expected
		} else {
			group.Expected = p.AudioProgress.Expected
		}
		allComplete, found, knownTotals := true, false, true
		var progressSum float64
		var members int
		for _, member := range p.Streams {
			if member.Kind != kind && member.Kind != "combined" {
				continue
			}
			found = true
			members++
			progressSum += member.Progress
			knownTotals = knownTotals && member.TotalBytes > 0
			group.TotalBytes += member.TotalBytes
			group.DownloadedBytes += member.DownloadedBytes
			group.Speed += member.Speed
			group.Combined = member.Combined
			if member.Status != "completed" {
				allComplete = false
				group.ETA = member.ETA
			}
		}
		if !group.Expected {
			group.Status = "not_requested"
		} else if found && allComplete {
			group.Status = "completed"
			group.Progress = 100
		} else if found {
			group.Status = "downloading"
			if knownTotals && group.TotalBytes > 0 {
				group.Progress = math.Min(100, float64(group.DownloadedBytes)/float64(group.TotalBytes)*100)
			} else {
				group.Progress = progressSum / float64(members)
			}
		}
		if kind == "video" {
			p.VideoProgress = group
		} else {
			p.AudioProgress = group
		}
	}
	p.RecalculateAggregate()
	p.Speed = stream.Speed
	p.ETA = stream.ETA
}
