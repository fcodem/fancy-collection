@echo off
title Cloth Rental Manager
cd /d "%~dp0"
echo.
echo  Cloth Rental Manager
echo  --------------------
echo  Starting on http://localhost:5000
echo  Keep this window open while using the app.
echo.
python -m pip install -r requirements.txt -q 2>nul
python app.py
if errorlevel 1 pause
