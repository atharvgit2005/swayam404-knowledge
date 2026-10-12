@echo off
:: Swayam404 Windows Desktop Installer & Updater Launcher
:: Double-click this file in Windows File Explorer to launch the Desktop App.

title Swayam404 Desktop Installer ^& Updater
cd /d "%~dp0\..\.."

echo ========================================================
echo [Swayam404] Launching Windows Desktop Installer ^& Updater
echo ========================================================

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/ to run Swayam404.
    pause
    exit /b 1
)

set PORT=52410
set APP_URL=http://127.0.0.1:%PORT%

:: Start the control server in background
start /b "" node installer-app/server.mjs

:: Wait for server to bind
timeout /t 2 /nobreak >nul

:: Launch browser in app mode or default browser
start "" chrome --app="%APP_URL%" 2>nul || start "" brave --app="%APP_URL%" 2>nul || start "" "%APP_URL%"

echo.
echo [OK] Swayam404 Desktop App is running at %APP_URL%
echo Keep this window open while using the Installer App.
echo Press any key to stop the app and exit.
pause >nul
