package worker

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/go/internal/store"
)

var (
	videoExtRe = regexp.MustCompile(`(?i)\.(mp4|mkv|webm|avi|mov|flv|m4v|ts)$`)
	audioExtRe = regexp.MustCompile(`(?i)\.(mp3|m4a|wav|aac|flac|ogg|opus|alac|vorbis)$`)
	audioStrRe = regexp.MustCompile(`(?i)audio`)
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
	VCodec             *string  `json:"vcodec"`
	ACodec             *string  `json:"acodec"`
	Error              *string  `json:"error"`
}

func hasCodec(codec *string) bool {
	if codec == nil {
		return false
	}
	lower := strings.ToLower(*codec)
	return lower != "none" && lower != "n/a" && lower != "na" && lower != "null" && lower != ""
}

// HandleProgress processes a JSON progress line from yt-dlp and updates the DownloadProgress.
func HandleProgress(dp *store.DownloadProgress, rawJSON []byte) {
	var d YtDlpProgress
	if err := json.Unmarshal(rawJSON, &d); err != nil {
		return
	}

	status := d.Status
	if status == "" {
		status = "unknown"
	}

	dp.Update(func(p *store.DownloadProgress) {
		filename := "download"
		if p.Filename != nil {
			filename = *p.Filename
		}
		if d.Filename != nil && *d.Filename != "NA" && *d.Filename != "" {
			filename = *d.Filename
		}

		hasVid := hasCodec(d.VCodec)
		hasAud := hasCodec(d.ACodec)

		videoByName := videoExtRe.MatchString(filename) && !audioStrRe.MatchString(filename)
		audioByName := audioExtRe.MatchString(filename) || audioStrRe.MatchString(filename)

		// Determine which streams are actively being downloaded
		var activeStreams []*store.StreamProgress

		// Logic ported exactly from progressTracker.js
		if hasVid && hasAud && p.VideoProgress.Expected && p.AudioProgress.Expected {
			activeStreams = append(activeStreams, &p.VideoProgress, &p.AudioProgress)
		} else if (hasAud && !hasVid) || audioByName {
			activeStreams = append(activeStreams, &p.AudioProgress)
		} else if (hasVid && !hasAud) || videoByName {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if p.VideoProgress.Expected && !p.AudioProgress.Expected {
			activeStreams = append(activeStreams, &p.VideoProgress)
		} else if p.AudioProgress.Expected && !p.VideoProgress.Expected {
			activeStreams = append(activeStreams, &p.AudioProgress)
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
			for _, stream := range activeStreams {
				stream.Combined = combined
				stream.Status = "completed"
				stream.Progress = 100
				stream.Speed = 0
				stream.ETA = nil
				if stream.TotalBytes > 0 {
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
}
