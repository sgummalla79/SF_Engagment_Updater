@echo off
REM Build script for Architect Cadence — Windows
REM Run from the project root: scripts\build.bat
REM Requires PowerShell 5+ (built into Windows 10/11).

cd /d "%~dp0\.."

set OUTPUT=%TEMP%\archcadence.zip

if exist "%OUTPUT%" del "%OUTPUT%"

powershell -NoProfile -Command ^
  "$src = Get-Location;" ^
  "$files = @('manifest.json','background.js','popup.html','popup.js','config.json');" ^
  "$tmp = Join-Path $env:TEMP 'archcadence_build';" ^
  "if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force };" ^
  "New-Item -ItemType Directory -Path $tmp | Out-Null;" ^
  "foreach ($f in $files) { Copy-Item (Join-Path $src $f) $tmp };" ^
  "Copy-Item (Join-Path $src 'icons') $tmp -Recurse;" ^
  "Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath '%OUTPUT%';" ^
  "Remove-Item $tmp -Recurse -Force;" ^
  "Write-Host 'Build complete: %OUTPUT%'"
