@echo off
title Repair Fancy Collection Web
echo.
echo  Repairing cache and port 3000...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair-web.ps1"
if errorlevel 1 (
  echo.
  echo Repair failed. See messages above.
  pause
  exit /b 1
)
echo.
echo Done. Run start-web.bat to open the site.
echo.
pause
