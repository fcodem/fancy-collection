@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=3088"
if exist "site-port.txt" set /p PORT=<site-port.txt

start "" "http://127.0.0.1:%PORT%/login"
echo Opening http://127.0.0.1:%PORT%/login
timeout /t 3 /nobreak >nul
