@echo off
setlocal EnableExtensions
title Fancy Collection - Start Site
cd /d "%~dp0"

echo.
echo  ========================================
echo   Fancy Collection
echo   Starting on http://127.0.0.1:3088
echo  ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" -ForceRestart
if errorlevel 1 (
  echo.
  echo Failed to start. Try repair-web.bat then run this again.
  pause
)
exit /b %ERRORLEVEL%
