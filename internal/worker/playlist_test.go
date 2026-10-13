package worker_test

import (
	"strconv"
	"strings"
	"testing"

	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
)

func TestSelectedPlaylistCommand(t *testing.T) {
	options := worker.DownloadOptions{URL: "https://example.com/playlist", DownloadMode: "both", PlaylistItems: []int{2, 5, 9}, ConcatPlaylist: "always"}
	command := buildOK(t, options, "/downloads/job", testCfg(false)).Command
	for _, value := range []string{"--yes-playlist", "--playlist-items", "2,5,9", "--concat-playlist", "always"} {
		assertContains(t, command, value)
	}
	for _, value := range command {
		if value == "--no-playlist" {
			t.Fatal("selected playlist disabled by --no-playlist")
		}
	}
	for _, items := range [][]int{{0}, {2, 2}, {5, 2}, {100001}} {
		options.PlaylistItems = items
		if _, err := worker.BuildCommand(options, "/downloads/job", testCfg(false)); err == nil {
			t.Fatalf("invalid indexes accepted: %v", items)
		}
	}
}

func TestOrdinaryDownloadDoesNotExpandPlaylist(t *testing.T) {
	options := worker.DownloadOptions{URL: "https://example.com/watch?v=selected&list=whole-playlist", DownloadMode: "both"}
	command := buildOK(t, options, "/downloads/job", testCfg(false)).Command
	assertContains(t, command, "--no-playlist")
	for _, value := range command {
		if value == "--yes-playlist" || value == "--playlist-items" {
			t.Fatal("ordinary download enabled playlist expansion")
		}
	}
	for _, policy := range []string{"always", "multi_video"} {
		options.ConcatPlaylist = policy
		if _, err := worker.BuildCommand(options, "/downloads/job", testCfg(false)); err == nil {
			t.Fatalf("implicit concatenation accepted for %s", policy)
		}
	}
	options.ConcatPlaylist = "never"
	_ = buildOK(t, options, "/downloads/job", testCfg(false))
}

func TestSelectedPlaylistLimits(t *testing.T) {
	options := worker.DownloadOptions{URL: "https://example.com/playlist", DownloadMode: "both", PlaylistItems: []int{1, 100000}}
	command := buildOK(t, options, "/downloads/job", testCfg(false)).Command
	assertContains(t, command, "1,100000")
	items := make([]int, 500)
	values := make([]string, len(items))
	for index := range items {
		items[index] = index + 1
		values[index] = strconv.Itoa(index + 1)
	}
	options.PlaylistItems = items
	command = buildOK(t, options, "/downloads/job", testCfg(false)).Command
	assertContains(t, command, strings.Join(values, ","))
	options.PlaylistItems = append(items, 501)
	if _, err := worker.BuildCommand(options, "/downloads/job", testCfg(false)); err == nil {
		t.Fatal("501 playlist indexes accepted")
	}
}

func TestPostprocessingOptionsActivateTheirProcessing(t *testing.T) {
	for _, test := range []struct {
		name    string
		options worker.DownloadOptions
		flags   []string
	}{
		{"remux", worker.DownloadOptions{RemuxVideo: "mov"}, []string{"--remux-video", "mov"}},
		{"recode", worker.DownloadOptions{RecodeVideo: "gif"}, []string{"--recode-video", "gif"}},
		{"thumbnail", worker.DownloadOptions{ConvertThumb: "png"}, []string{"--write-thumbnail", "--convert-thumbnails", "png"}},
		{"retain-original", worker.DownloadOptions{KeepVideo: true}, []string{"--keep-video"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			options := test.options
			options.URL, options.DownloadMode = "https://example.com/media", "both"
			command := buildOK(t, options, "/downloads/job", testCfg(false)).Command
			for _, flag := range test.flags {
				assertContains(t, command, flag)
			}
		})
	}
	for _, overwrite := range []bool{false, true} {
		options := worker.DownloadOptions{URL: "https://example.com/media", DownloadMode: "both", PostOverwrites: &overwrite}
		command := buildOK(t, options, "/downloads/job", testCfg(false)).Command
		flag := "--no-post-overwrites"
		if overwrite {
			flag = "--post-overwrites"
		}
		assertContains(t, command, flag)
	}
}
