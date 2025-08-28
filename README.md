<div align="center">

# YT-DL Studio
### *The Ultimate Video Downloading Experience*

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/Python-3.8+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-red.svg?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-latest-orange.svg?style=for-the-badge&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)

**A sleek, modern, and privacy-focused web interface for the powerful command-line video downloader, `yt-dlp`.**

*YT-DL Studio provides a comprehensive GUI to harness the full potential of `yt-dlp` with ease, from simple downloads to complex post-processing workflows.*

---

<img src="https://img.shields.io/badge/Video_Downloads-ff6b6b?style=flat-square&labelColor=2c2c2c" alt="Video Downloads" />
<img src="https://img.shields.io/badge/Audio_Extraction-4ecdc4?style=flat-square&labelColor=2c2c2c" alt="Audio Extraction" />
<img src="https://img.shields.io/badge/Playlist_Support-45b7d1?style=flat-square&labelColor=2c2c2c" alt="Playlist Support" />
<img src="https://img.shields.io/badge/Real_Time_Progress-f9ca24?style=flat-square&labelColor=2c2c2c" alt="Real Time Progress" />
<img src="https://img.shields.io/badge/Privacy_First-6c5ce7?style=flat-square&labelColor=2c2c2c" alt="Privacy First" />

</div>

<div align="center">

## Core Philosophy

*Built on principles that matter to creators, educators, archivists, and enthusiasts worldwide*

</div>

### Privacy First
*Your activity is your business. Zero-log policy with self-hosted analytics.*

### No Ads, No Nonsense  
*Free from ads, trackers, and malware - forever.*

### Open & Accessible
*Making yt-dlp's power accessible to everyone through intuitive design.*

### Powerful & Transparent
*Full feature set with real-time command generation and transparency.*

<div align="center">

---

## Features Overview

*YT-DL Studio is packed with features that cater to both casual users and power users*

<img src="https://img.shields.io/badge/Configuration_Panel-ff9ff3?style=for-the-badge&labelColor=2c2c2c" />
<img src="https://img.shields.io/badge/Download_Queue-54a0ff?style=for-the-badge&labelColor=2c2c2c" />
<img src="https://img.shields.io/badge/Advanced_Settings-5f27cd?style=for-the-badge&labelColor=2c2c2c" />

</div>

### Powerful Download Configuration
*Once you enter a URL, a comprehensive configuration panel appears, giving you granular control over your download*

#### **Presets & Modes**
- **Quick Presets:** "Best Quality MP4," "Audio Only (MP3)," "Best Quality MKV"
- **Download Modes:** `Video + Audio`, `Video Only`, or `Audio Only`
- **One-Click Selection:** Instant configuration with intelligent defaults

#### **Advanced Format Selection**
- **Detailed Format Tables:** View resolution, bitrate, codec, and estimated file size
- **Auto-Highlighting:** "Best" formats are automatically highlighted for quick selection
- **Multi-Stream Support:** Download several quality levels or formats simultaneously
- **Format Tags:** HDR, DRC, ATMOS, and other quality indicators with visual badges

#### **Comprehensive Subtitle Control**
- **Language Selection:** Download subtitles for specific languages or all available
- **Format Options:** Choose between SRT, VTT, ASS subtitle formats
- **Embedding:** Embed subtitles directly into the video file
- **Auto-Generated:** Support for both manual and auto-generated subtitles

#### **Extensive Post-Processing**

*Advanced media processing capabilities powered by FFmpeg*

- **Audio Extraction:** Extract to MP3, M4A, FLAC, OGG, and more with quality control
- **Remux & Recode:** Convert between containers (MKV ↔ MP4) or recode video formats
- **Media Embedding:** Thumbnails, metadata, and chapter information
- **Custom FFmpeg Arguments:** Direct FFmpeg control for specialized workflows
- **Chapter Management:** Split videos by chapter markers automatically

#### **Metadata & Organization**

*Complete control over file naming and metadata*

- **Custom Filename Templates:** Use yt-dlp variables for organized file naming
- **Metadata Parsing:** Extract and customize metadata from video titles
- **Real-Time Command Preview:** See the exact yt-dlp command as you configure
- **Tag Management:** Automatic detection and display of audio/video quality tags

### Live Download Queue

*All your downloads in a clean, organized interface with real-time feedback*

#### **Progress Monitoring**
- **Real-Time Progress Bars:** Visual progress with smooth animations
- **Live Statistics:** Download speed, ETA, and total downloaded size
- **Dual-Stream Support:** Separate progress for video and audio when needed
- **Responsive Design:** Works perfectly on all screen sizes

#### **Download Control**
- **Play/Pause/Cancel:** Full control over active downloads
- **Queue Management:** Clear completed or failed downloads
- **Batch Operations:** Manage multiple downloads simultaneously
- **Resume Support:** Resume interrupted downloads automatically

#### **Detailed Logging**
- **Live Log Viewing:** Real-time yt-dlp output for active downloads
- **Log Download:** Save complete log files for debugging
- **Error Handling:** Clear error messages with troubleshooting tips
- **Performance Metrics:** Track download performance and statistics

### Advanced Global Settings

<div align="center">

*Comprehensive configuration for power users and specific use cases*

</div>

#### **Network Configuration**
- **Proxy Support:** HTTP, HTTPS, and SOCKS proxy configuration
- **Timeout Settings:** Socket timeout and retry configuration
- **IP Version Control:** Force IPv4 or IPv6 usage
- **Custom Headers:** Add custom HTTP headers for specific sites

#### **Authentication & Security**
- **Login Support:** Username/password authentication for premium sites
- **Two-Factor Authentication:** 2FA support for enhanced security
- **Netrc Integration:** Use .netrc files for credential management
- **Cookie Support:** Import and use browser cookies

#### **SponsorBlock Integration**
- **Skip Categories:** Remove sponsors, intros, outros, self-promotion
- **Mark vs Remove:** Choose to mark or completely remove segments
- **Custom Configuration:** Fine-tune SponsorBlock behavior
- **Statistics:** Track time saved from skipped content

#### **Geo-restriction & Extraction**
- **Geo-bypass:** Circumvent geographical restrictions
- **Extractor Arguments:** Site-specific extraction configuration
- **Fallback Options:** Multiple extraction methods for reliability
- **Custom Extractors:** Support for additional video platforms

<div align="center">

---

## Technology Stack

*Built with modern, reliable technologies for optimal performance*

</div>

<div align="center">

| Component | Technology | Description |
|:---------:|:----------:|:-----------:|
| **Backend** | ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white) ![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white) | **Python 3.8+**, **Flask**, **yt-dlp**, **psutil**, **Gunicorn** |
| **Frontend** | ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) | **HTML5**, **CSS3**, **ES6+ JavaScript**, **TailwindCSS**, **Three.js** |
| **Core Tools** | ![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white) ![yt-dlp](https://img.shields.io/badge/yt--dlp-FF0000?style=for-the-badge&logo=youtube&logoColor=white) | **yt-dlp** (downloading), **FFmpeg** (post-processing) |

</div>

<div align="center">

### **Backend Architecture**
- **Python Flask:** Lightweight, efficient web framework
- **yt-dlp Integration:** Direct API integration for maximum compatibility
- **Async Processing:** Non-blocking download operations
- **Process Management:** Real-time monitoring with psutil
- **Production Ready:** Gunicorn WSGI server support

### **Frontend Design**
- **Responsive Design:** Mobile-first approach with TailwindCSS
- **Dynamic Theming:** Dark/Light mode with smooth transitions
- **3D Background:** Interactive Three.js canvas animations
- **Real-Time Updates:** WebSocket-like communication for live updates
- **Accessibility:** WCAG compliant interface design

</div>

<div align="center">

---

## Getting Started

*Get YT-DL Studio running on your machine in minutes*

</div>

<div align="center">

### Prerequisites

![Python](https://img.shields.io/badge/Python_3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)
![yt-dlp](https://img.shields.io/badge/yt--dlp_latest-FF0000?style=for-the-badge&logo=youtube&logoColor=white)

</div>

#### **Python Requirements**
- **Python 3.8 or newer** - Required for modern syntax and performance
- **pip** - Package installer (usually included with Python)
- **Virtual Environment** - Recommended for dependency isolation

#### **Media Processing Tools**
- **FFmpeg** - Essential for merging formats and post-processing
  - Must be installed and accessible in your system's PATH
  - Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **yt-dlp** - Latest version recommended for best compatibility
  - Automatically installed via requirements.txt

<div align="center">

---

### Installation Guide

*Follow these steps to get YT-DL Studio up and running*

</div>

#### **Step 1: Clone the Repository**
```bash
# Clone the repository
git clone https://github.com/your-username/ytdl-studio.git
cd ytdl-studio
```

#### **Step 2: Set Up Python Environment**
```bash
# Create a virtual environment (recommended)
python -m venv venv

# Activate the virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install required packages
pip install -r requirements.txt
```

#### **Step 3: Verify Dependencies**
```bash
# Check if FFmpeg is installed
ffmpeg -version

# Check if yt-dlp is working
yt-dlp --version
```

#### **Step 4: Launch the Application**
```bash
# Start the backend server
python server.py
```

<div align="center">

**The server will start on `http://localhost:5000`**

</div>

#### **Step 5: Access the Interface**
- Open your web browser
- Navigate to the project folder
- Open `index.html` in your browser
- The frontend will automatically connect to the local server

<div align="center">

---

### Advanced Setup Options

</div>

#### **Docker Setup** *(Coming Soon)*
```bash
# Build the Docker image
docker build -t ytdl-studio .

# Run the container
docker run -p 5000:5000 -v $(pwd)/downloads:/app/downloads ytdl-studio
```

#### **Production Deployment**
```bash
# Install Gunicorn for production
pip install gunicorn

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

#### **Configuration Options**
- **Download Path:** Modify the default download directory in settings
- **Server Port:** Change the default port in `server.py`
- **Theme:** Choose between dark and light themes
- **Language:** Set your preferred language for the interface

### Troubleshooting

#### **Common Issues & Solutions**

| Issue | Solution |
|:------|:---------|
| **FFmpeg not found** | Install FFmpeg and add to system PATH |
| **Connection refused** | Check if server is running on correct port |
| **Download fails** | Verify yt-dlp is updated to latest version |
| **Audio extraction fails** | Ensure FFmpeg is properly installed |
| **Geo-blocked content** | Enable geo-bypass in advanced settings |

#### **Debug Mode**
```bash
# Run server in debug mode for detailed error messages
python server.py --debug
```

<div align="center">

---

## Project Structure

*Clean, organized codebase for easy navigation and contribution*

</div>

```
YT-DL Studio
├── index.html              # Main application interface
├── about.html               # About, Privacy Policy, and Terms of Service
├── settings.html            # Advanced global settings configuration
├── donate.html              # Support and donation page
├── style.css               # Main stylesheet with TailwindCSS
├── script.js               # Core frontend JavaScript logic
├── server.py               # Flask backend server and API
├── requirements.txt        # Python dependencies
├── README.md               # This comprehensive documentation
├── f.md                    # Additional documentation
└── downloads/              # Default download directory
    └── [downloaded files]   # Your downloaded media files
```

<div align="center">

### **File Descriptions**

</div>

| File | Purpose | Key Features |
|:-----|:--------|:-------------|
| **`index.html`** | Main Interface | URL input, configuration panel, download queue |
| **`settings.html`** | Global Settings | Network, auth, SponsorBlock, extractor options |
| **`donate.html`** | Support Page | Donation options, contribution guidelines |
| **`about.html`** | Information | Privacy policy, terms, acknowledgments |
| **`style.css`** | Styling | Responsive design, themes, animations |
| **`script.js`** | Frontend Logic | UI interactions, API communication, real-time updates |
| **`server.py`** | Backend API | yt-dlp integration, download management, file handling |

<div align="center">

### **Architecture Overview**

</div>

```
┌─────────────────┐    HTTP/REST API    ┌─────────────────┐
│   Frontend      │◄──────────────────►│   Backend       │
│   (Browser)     │                     │   (Flask)       │
├─────────────────┤                     ├─────────────────┤
│ • HTML/CSS/JS   │                     │ • Python Flask │
│ • TailwindCSS   │                     │ • yt-dlp       │
│ • Three.js      │                     │ • FFmpeg       │
│ • Real-time UI  │                     │ • Process Mgmt  │
└─────────────────┘                     └─────────────────┘
         │                                       │
         │                                       │
         ▼                                       ▼
┌─────────────────┐                     ┌─────────────────┐
│ Local Storage   │                     │ File System     │
│ • Settings      │                     │ • Downloads     │
│ • Preferences   │                     │ • Logs          │
│ • Theme         │                     │ • Metadata      │
└─────────────────┘                     └─────────────────┘
```

<div align="center">

---

## Supported Platforms

*YT-DL Studio works with thousands of video platforms thanks to yt-dlp*

</div>

<div align="center">

### **Popular Video Platforms**

[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com)
[![Vimeo](https://img.shields.io/badge/Vimeo-1AB7EA?style=for-the-badge&logo=vimeo&logoColor=white)](https://vimeo.com)
[![Twitch](https://img.shields.io/badge/Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://twitch.tv)
[![TikTok](https://img.shields.io/badge/TikTok-000000?style=for-the-badge&logo=tiktok&logoColor=white)](https://tiktok.com)

[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://facebook.com)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com)
[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white)](https://reddit.com)

### **Audio Platforms**

[![SoundCloud](https://img.shields.io/badge/SoundCloud-FF3300?style=for-the-badge&logo=soundcloud&logoColor=white)](https://soundcloud.com)
[![Spotify](https://img.shields.io/badge/Spotify-1ED760?style=for-the-badge&logo=spotify&logoColor=white)](https://spotify.com)
[![Bandcamp](https://img.shields.io/badge/Bandcamp-629AA0?style=for-the-badge&logo=bandcamp&logoColor=white)](https://bandcamp.com)
[![Mixcloud](https://img.shields.io/badge/Mixcloud-314359?style=for-the-badge&logo=mixcloud&logoColor=white)](https://mixcloud.com)

### **Streaming Services**

[![BBC iPlayer](https://img.shields.io/badge/BBC_iPlayer-000000?style=for-the-badge&logo=bbc&logoColor=white)](https://bbc.co.uk/iplayer)
[![Arte](https://img.shields.io/badge/Arte-FF6600?style=for-the-badge&logoColor=white)](https://arte.tv)
[![Dailymotion](https://img.shields.io/badge/Dailymotion-0066DC?style=for-the-badge&logo=dailymotion&logoColor=white)](https://dailymotion.com)

*And hundreds more platforms supported by yt-dlp!*

</div>

<div align="center">

---

## Use Cases

*Perfect for various professional and personal needs*

</div>

### **Educators & Students**
- Archive educational content for offline access
- Create course materials and presentations
- Research and academic content preservation

### **Content Creators**
- Download source material for video editing
- Extract audio for podcasts and music production
- Create content for social media platforms

### **Archivists & Preservationists**
- Digital preservation of cultural content
- Backup important videos and media
- Research and documentation projects

### **Professionals**
- Marketing and advertising material collection
- Competitive analysis and research
- Training and development resources

</div>

<div align="center">

---

## Advanced Features

*Power user capabilities for complex workflows*

</div>

### **Batch Processing**
- **Playlist Downloads:** Process entire playlists with custom filters
- **Range Selection:** Download specific video ranges (e.g., videos 1-10)
- **Date Filtering:** Download videos from specific date ranges
- **Tag-based Selection:** Filter by video tags and categories

### **Automation & Scripting**
- **Custom Scripts:** Integration with external automation tools
- **Scheduled Downloads:** Set up recurring download tasks
- **API Integration:** RESTful API for programmatic access
- **Webhook Support:** Notifications and integrations

### **Customization Options**
- **Custom Themes:** Create your own color schemes
- **Plugin System:** Extend functionality with custom plugins
- **Keyboard Shortcuts:** Efficient navigation and control
- **Multi-language Support:** Interface localization

<div align="center">

---

## Performance & Monitoring

*Built for efficiency and reliability*

</div>

### **Performance Features**
- **Concurrent Downloads:** Multiple simultaneous downloads
- **Memory Optimization:** Efficient resource usage
- **Resume Capability:** Continue interrupted downloads
- **Speed Optimization:** Dynamic quality selection for speed

### **Monitoring & Analytics**
- **Real-time Statistics:** Download speed, progress, ETA
- **Historical Data:** Track download history and statistics
- **Error Reporting:** Detailed error logs and debugging info
- **Storage Management:** Monitor disk space and usage

<div align="center">

---

## Contributing

*Join our community of contributors!*

</div>

<div align="center">

[![Contributors Welcome](https://img.shields.io/badge/Contributors-Welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)
[![GitHub Issues](https://img.shields.io/github/issues/username/ytdl-studio?style=for-the-badge)](https://github.com/username/ytdl-studio/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/username/ytdl-studio?style=for-the-badge)](https://github.com/username/ytdl-studio/pulls)

</div>

### **How to Contribute**
1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### **Bug Reports**
- Use the issue template for bug reports
- Include detailed reproduction steps
- Provide system information and logs
- Add appropriate labels and tags

### **Feature Requests**
- Discuss ideas in GitHub Discussions
- Use the feature request template
- Explain the use case and benefits
- Gather community feedback

<div align="center">

---

## Acknowledgements

*Standing on the shoulders of giants*

</div>

### **Special Thanks**

This project is fundamentally a user interface built on top of the incredible, versatile, and tirelessly maintained **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** project. We extend our deepest gratitude to:

- **The yt-dlp Team** - For creating and maintaining the most powerful video downloading tool
- **FFmpeg Developers** - For the essential media processing framework
- **TailwindCSS Team** - For the beautiful and efficient CSS framework
- **Three.js Community** - For the stunning 3D graphics capabilities
- **Flask Developers** - For the lightweight and flexible web framework
- **Open Source Community** - For inspiration, feedback, and contributions

### **Built With Love For**
- **Educators** creating engaging learning experiences
- **Creators** producing amazing content
- **Researchers** preserving important media
- **Everyone** who values privacy and open-source software

<div align="center">

---

## License

*Free and open-source forever*

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.**

*You are free to use, modify, and distribute this software for any purpose, commercial or non-commercial.*

---

## Support the Project

*Help us keep YT-DL Studio free and open-source*

</div>

<div align="center">

[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/ytdlstudio)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub_Sponsors-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/username)
[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/ytdlstudio)

**Star the repository • Share with friends • Report bugs • Suggest features**

---

*Made with love by the YT-DL Studio community*

**[Website](https://ytdl-studio.com) • [Contact](mailto:hello@ytdl-studio.com) • [Follow Us](https://twitter.com/ytdlstudio)**

