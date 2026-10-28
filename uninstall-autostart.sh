#!/bin/bash
# Ferma il server e rimuove l'avvio automatico al login.
set -euo pipefail

LABEL="com.yt-dlp-extension.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Avvio automatico rimosso e server fermato."
