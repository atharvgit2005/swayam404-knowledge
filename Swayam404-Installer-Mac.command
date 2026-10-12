#!/usr/bin/env bash
# Swayam404 macOS Desktop Installer & Updater
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -x "node_modules/.bin/electron" ]; then
    exec ./node_modules/.bin/electron installer-app/electron-main.cjs
elif command -v npx >/dev/null 2>&1; then
    exec npx electron installer-app/electron-main.cjs
elif command -v node >/dev/null 2>&1; then
    exec node installer-app/server.mjs --open
else
    echo "========================================================"
    echo "Swayam404 Extension Installer"
    echo "========================================================"
    echo "Node.js is not installed on this machine."
    echo "You can still load and use Swayam404 in Chrome immediately:"
    echo " 1. Open Chrome -> chrome://extensions"
    echo " 2. Enable 'Developer mode' (toggle switch in upper right)"
    echo " 3. Click 'Load unpacked' and select the 'dist' folder"
    echo "========================================================"
    open "chrome://extensions" 2>/dev/null || open -a "Google Chrome" "chrome://extensions" 2>/dev/null || open "https://www.google.com/chrome/"
fi
