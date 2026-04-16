@echo off
REM Build script for Architect Cadence — Windows
REM Run from the project root: scripts\build.bat
REM Requires PowerShell 5+ (built into Windows 10/11).

cd /d "%~dp0\.."

set OUTPUT=archcadence.zip

if exist "%OUTPUT%" del "%OUTPUT%"

powershell -NoProfile -Command "Compress-Archive -Path manifest.json, background.js, popup.html, popup.js, config.json, icons\icon16.png, icons\icon48.png, icons\icon128.png -DestinationPath '%OUTPUT%'"

echo Build complete: %OUTPUT%
