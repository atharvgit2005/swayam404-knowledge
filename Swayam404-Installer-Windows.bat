@echo off
:: Swayam404 Windows Desktop Installer & Updater
cd /d "%~dp0"
if exist "node_modules\.bin\electron.cmd" (
    call "node_modules\.bin\electron.cmd" installer-app\electron-main.cjs
) else if exist "installer-app\windows\Swayam404-Installer.bat" (
    call "installer-app\windows\Swayam404-Installer.bat"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        node installer-app\server.mjs --open
    ) else (
        echo ========================================================
        echo Swayam404 Extension Installer
        echo ========================================================
        echo Node.js is not installed on this PC.
        echo You can still install Swayam404 instantly in Chrome:
        echo  1. Open Chrome or Brave to chrome://extensions
        echo  2. Turn ON Developer mode (toggle switch top right)
        echo  3. Click 'Load unpacked' and select the 'dist' folder
        echo ========================================================
        start chrome chrome://extensions 2>nul || start brave brave://extensions 2>nul || start msedge edge://extensions 2>nul
        pause
    )
)
