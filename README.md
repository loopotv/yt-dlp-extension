# YT-DLP Downloader

A Chrome extension that downloads the video on the current page with [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Chrome extensions can't run programs like yt-dlp or ffmpeg directly, so this project has two parts:

- **`extension/`**: a Manifest V3 extension. Its popup sends the URL of the active tab to the local server and shows download progress.
- **`server/`**: a small Flask server running on your computer. It downloads the file with yt-dlp and saves it in `~/Downloads`.

```
Chrome popup ──POST /download──▶ local server (127.0.0.1:5055) ──▶ yt-dlp + ffmpeg ──▶ ~/Downloads
             ◀──GET /jobs──────  (progress, speed, ETA)
```

## Features

- Downloads the best video quality as **mp4**, or **audio only as mp3**
- Downloads run in the background on the server, so you can close the popup and reopen it later to check progress
- Shows progress, speed and ETA for each download
- If you click again on a video that is already downloading, it doesn't start a second copy
- Works on any site yt-dlp supports ([list of supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md))

## Requirements

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/), needed to merge video and audio and to convert to mp3
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
  - Windows: `winget install ffmpeg`
- Google Chrome, or another Chromium-based browser

## Installation

### 1. Start the server

```bash
git clone https://github.com/loopotv/yt-dlp-extension.git
cd yt-dlp-extension
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
.venv/bin/python server/server.py
```

On Windows, use `.venv\Scripts\pip` and `.venv\Scripts\python` instead.

Keep the server running whenever you want to use the extension.

### 2. Load the extension

1. Open `chrome://extensions/`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` folder.

## Usage

1. Open a page that has a video.
2. Click the extension icon.
3. Choose **Video (mp4)** or **Solo audio (mp3)** and click **Scarica Video Pagina** (the UI is in Italian).

## Configuration

At the top of `server/server.py`:

| Setting | Default | Notes |
|---|---|---|
| `PORT` | `5055` | Port 5000 is avoided because AirPlay Receiver uses it on macOS. If you change it, also change `SERVER` in `extension/popup.js` and `host_permissions` in `extension/manifest.json`. |
| `DOWNLOAD_FOLDER` | `~/Downloads` | Where downloaded files are saved. |

## Security

The server only listens on `127.0.0.1`, so other devices on your network can't reach it. It also rejects any request that comes from a web page (identified by a non-extension `Origin` header). Without this check, any site open in your browser could start downloads on your computer.

## Troubleshooting

- **"impossibile contattare il server locale"**: the server isn't running. Start it with `.venv/bin/python server/server.py`.
- **`CERTIFICATE_VERIFY_FAILED`**: Python can't find SSL certificates. This is common with the python.org installer on macOS. Make sure `certifi` is installed (it's in `requirements.txt`).
- **A site that used to work stops working**: sites change often, so update yt-dlp with `.venv/bin/pip install -U yt-dlp`.

## Disclaimer

Only download content you have the right to download, and respect the terms of service of the sites you use.

## License

[MIT](LICENSE)
