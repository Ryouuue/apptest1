@echo off
rem Starts a local server and opens Tempo in an app window. 127.0.0.1 (not localhost) is what Spotify accepts as a redirect.
cd /d "%~dp0"
start "Tempo server" /min python -m http.server 5173 --bind 127.0.0.1
timeout /t 1 >nul
start "" msedge --app=http://127.0.0.1:5173/
