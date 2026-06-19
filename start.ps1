# Cloth Rental Manager — PowerShell launcher
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $Root "fancynew"

if (-not (Test-Path (Join-Path $AppDir "app.py"))) {
    Write-Error "fancynew\app.py not found. Run this script from the project root."
    exit 1
}

Set-Location $AppDir
Write-Host ""
Write-Host " Cloth Rental Manager" -ForegroundColor Cyan
Write-Host " Starting on http://localhost:5000" -ForegroundColor Green
Write-Host " Keep this window open while using the app." -ForegroundColor Yellow
Write-Host ""

python -m pip install -r requirements.txt -q 2>$null
python app.py
