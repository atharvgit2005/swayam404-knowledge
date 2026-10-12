# Swayam404 Windows PowerShell Launcher
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = (Resolve-Path "$ScriptDir\..\..").Path
Set-Location $RootDir

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "Launch Swayam404 Desktop Installer & Updater (Windows)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit..."
    exit 1
}

$Port = 52410
$AppUrl = "http://127.0.0.1:$Port"

Start-Process -NoNewWindow node "installer-app/server.mjs"
Start-Sleep -Seconds 1

try {
    Start-Process "chrome.exe" "--app=$AppUrl" -ErrorAction Stop
} catch {
    Start-Process $AppUrl
}

Write-Host "[OK] Desktop app running at $AppUrl" -ForegroundColor Green
