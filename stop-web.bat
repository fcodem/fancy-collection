@echo off
title Stop Fancy Collection Web Server
echo Stopping processes on port 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  echo Killing PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
echo Done.
timeout /t 3 >nul
