@echo off
title Cloth Rental Manager
cd /d "%~dp0fancynew"
if not exist "app.py" (
    echo Error: fancynew\app.py not found.
    echo Run this file from the "ssdn soft" project folder.
    pause
    exit /b 1
)
echo.
echo  Cloth Rental Manager
echo  --------------------
echo  Starting on http://localhost:5000
echo  Keep this window open while using the app.
echo.
python -m pip install -r requirements.txt -q 2>nul
python app.py
if errorlevel 1 (
    echo.
    echo Server stopped with an error. Check the message above.
    pause
)
