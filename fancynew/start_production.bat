@echo off
REM ─── Fancy Collection — Production Server Startup ────────────────────────
REM Run this file to start the app with Gunicorn (2 workers, 60s timeout).
REM Set SECRET_KEY before running. Example:
REM   set SECRET_KEY=your-long-random-secret-key-here
REM   start_production.bat

cd /d "%~dp0"

IF "%SECRET_KEY%"=="" (
    echo ERROR: SECRET_KEY environment variable is not set.
    echo Set it before running this file:
    echo   set SECRET_KEY=your-long-random-secret-key-here
    pause
    exit /b 1
)

echo Starting Fancy Collection in production mode...
echo Listening on http://0.0.0.0:5000

gunicorn -w 2 --timeout 60 -b 0.0.0.0:5000 app:app
