#!/usr/bin/env bash
# Swayam404 macOS Desktop Installer & Updater Launcher
# Double-click this file from macOS Finder to launch the Desktop App.

DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "🍎 Launching Swayam404 Desktop Installer & Updater (macOS)"
echo "========================================================"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/ to continue."
    read -p "Press Enter to exit..."
    exit 1
fi

PORT=52410
APP_URL="http://127.0.0.1:${PORT}"

# Start server in background
node installer-app/server.mjs &
SERVER_PID=$!

trap "kill $SERVER_PID 2>/dev/null" EXIT

# Wait a moment for server to bind
sleep 1

# Open in native macOS window, or isolated App Mode
if [ -x "$DIR/installer-app/mac/native-window-mac" ]; then
    "$DIR/installer-app/mac/native-window-mac"
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "/Applications/Brave Browser.app" --args --app="$APP_URL" --user-data-dir="/tmp/swayam404-app-profile"
elif [ -d "/Applications/Google Chrome.app" ]; then
    open -na "/Applications/Google Chrome.app" --args --app="$APP_URL" --user-data-dir="/tmp/swayam404-app-profile"
else
    open "$APP_URL"
fi

echo "✅ Desktop App is running at $APP_URL"
echo "Close this terminal window when finished."

wait $SERVER_PID
