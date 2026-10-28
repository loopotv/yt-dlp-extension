#!/bin/bash
# Avvia il server automaticamente al login (macOS, launchd).
# Il server gira in background e viene riavviato se si chiude.
set -euo pipefail

LABEL="com.yt-dlp-extension.server"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/yt-dlp-extension.log"
PYTHON="$PROJECT_DIR/.venv/bin/python"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Questo script funziona solo su macOS." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg non trovato. Installalo con: brew install ffmpeg" >&2
  exit 1
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "Creo il virtualenv e installo le dipendenze..."
  python3 -m venv "$PROJECT_DIR/.venv"
  "$PROJECT_DIR/.venv/bin/pip" install -q -r "$PROJECT_DIR/server/requirements.txt"
fi

# launchd parte con un PATH minimo: senza questo yt-dlp non troverebbe ffmpeg
FFMPEG_DIR="$(dirname "$(command -v ffmpeg)")"
SERVICE_PATH="$FFMPEG_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Ferma l'eventuale versione già installata prima di riscriverla
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

if lsof -iTCP:5055 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "La porta 5055 è già in uso: probabilmente il server è avviato a mano in un terminale." >&2
  echo "Fermalo (Ctrl+C) e rilancia questo script." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON</string>
    <string>$PROJECT_DIR/server/server.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$SERVICE_PATH</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"

# Attende che il server risponda
for _ in {1..10}; do
  if curl -s -o /dev/null http://127.0.0.1:5055/jobs; then
    echo "Server avviato e configurato per partire a ogni login."
    echo "Log: $LOG"
    exit 0
  fi
  sleep 1
done

echo "Il server non risponde. Controlla il log: $LOG" >&2
exit 1
