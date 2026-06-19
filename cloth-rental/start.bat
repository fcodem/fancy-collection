@echo off
cd /d "%~dp0"
echo Starting RentStyle Cloth Rental Manager...
echo.
python -m pip install -r requirements.txt -q
python app.py
pause
