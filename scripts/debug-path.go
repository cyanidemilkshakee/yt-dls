package main
import (
	"fmt"
	"os/exec"
)
func main() {
	path, err := exec.LookPath("./yt-dlp.exe")
	fmt.Printf("LookPath('./yt-dlp.exe'): path=%v, err=%v\n", path, err)
	path2, err2 := exec.LookPath("yt-dlp.exe")
	fmt.Printf("LookPath('yt-dlp.exe'): path=%v, err=%v\n", path2, err2)
}
