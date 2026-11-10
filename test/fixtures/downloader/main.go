// This executable is a deterministic subprocess fixture for browser tests.
// It is never used by the production server or release build.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	args := os.Args[1:]
	has := func(flag string) bool {
		for _, arg := range args {
			if arg == flag {
				return true
			}
		}
		return false
	}
	value := func(flag string) string {
		for i, arg := range args {
			if arg == flag && i+1 < len(args) {
				return args[i+1]
			}
		}
		return ""
	}
	if has("--version") {
		fmt.Println("browser-fixture-1")
		return
	}
	if len(args) == 0 {
		os.Exit(2)
	}
	source := args[len(args)-1]
	if has("--dump-single-json") {
		if strings.Contains(source, "playlist") {
			entries := []map[string]any{}
			for i := 1; i <= 3; i++ {
				entries = append(entries, map[string]any{"id": fmt.Sprintf("item%d", i), "title": fmt.Sprintf("Playlist item %d", i), "webpage_url": fmt.Sprintf("https://example.com/item%d", i), "duration": 60, "playlist_index": i, "uploader": "Fixture author", "view_count": 1200})
			}
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"_type": "playlist", "id": "playlist", "title": "Fixture playlist", "uploader": "Fixture author", "entries": entries})
		} else {
			fmt.Println(`{"id":"fixture","title":"Fixture video","description":"A deterministic fixture for interface checks.","upload_date":"20261003","view_count":1234,"duration":63,"ext":"mp4","uploader":"Fixture author","chapters":[{"start_time":0,"end_time":63,"title":"Intro"}],"formats":[{"format_id":"v","vcodec":"h264","acodec":"none","ext":"mp4","width":1920,"height":1080,"fps":60,"filesize":100},{"format_id":"a","vcodec":"none","acodec":"aac","ext":"m4a","abr":128,"filesize":50}],"subtitles":{"en":[{"ext":"vtt","name":"English"}]}}`)
		}
		return
	}
	encodedArgs, _ := json.Marshal(args)
	fmt.Println("FIXTURE_ARGS:" + string(encodedArgs))
	if strings.Contains(source, "slow") {
		_ = os.WriteFile("fixture.part", []byte("partial media"), 0600)
		fmt.Println(`{"status":"downloading","downloaded_bytes":4,"total_bytes":16,"format_id":"combined","media_id":"fixture","vcodec":"h264","acodec":"aac"}`)
		time.Sleep(30 * time.Second)
	}
	if strings.Contains(source, "fail") {
		fmt.Fprintln(os.Stderr, "ERROR: controlled fixture failure")
		os.Exit(3)
	}
	directory, _ := os.Getwd()
	extension := "mp4"
	if value("--merge-output-format") != "" {
		extension = value("--merge-output-format")
	}
	if has("--extract-audio") && value("--audio-format") != "" && value("--audio-format") != "best" {
		extension = value("--audio-format")
	}
	name := value("-o")
	if name == "" {
		name = "fixture.%(ext)s"
	}
	name = strings.NewReplacer("%(title)s", "Fixture video", "%(id)s", "fixture", "%(ext)s", extension).Replace(name)
	if value("--concat-playlist") == "always" || value("--concat-playlist") == "multi_video" {
		name = "joined-playlist.mp4"
	}
	path := filepath.Join(directory, name)
	_ = os.WriteFile(path, []byte("fixture media!!!"), 0600)
	_ = os.WriteFile(filepath.Join(directory, "fixture.info.json"), []byte(`{"title":"Fixture video"}`), 0600)
	for i := 1; i <= 4; i++ {
		fmt.Printf("{\"status\":\"downloading\",\"downloaded_bytes\":%d,\"total_bytes\":16,\"format_id\":\"combined\",\"media_id\":\"fixture\",\"vcodec\":\"h264\",\"acodec\":\"aac\"}\n", i*4)
		time.Sleep(250 * time.Millisecond)
	}
	fmt.Println(`{"status":"finished","downloaded_bytes":16,"total_bytes":16,"format_id":"combined","media_id":"fixture","vcodec":"h264","acodec":"aac"}`)
	encoded, _ := json.Marshal(path)
	fmt.Println("YT_DLS_FINAL_PATH:" + string(encoded))
}
