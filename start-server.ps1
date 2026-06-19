# Starts the Fancy Collection production server and opens the site in your browser.
param([switch]$ForceRestart, [switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$WebDir = Join-Path $ProjectRoot "web"
$Port = 3088
$Url = "http://127.0.0.1:$Port"
$LegacyPort = 3000
$BuildId = Join-Path $WebDir ".next\BUILD_ID"
$NodePath = "C:\Program Files\nodejs"

function Write-Step([string]$Message) {
  Write-Host "[start] $Message"
}

function Test-SiteHealth {
  param([int]$TimeoutSec = 6)
  try {
    $r = Invoke-WebRequest -Uri "$Url/login" -UseBasicParsing -TimeoutSec $TimeoutSec
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-PortListener([int]$ListenPort) {
  $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      Write-Step "Stopping old server on port $ListenPort (PID $($c.OwningProcess))..."
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

function Ensure-DirectUrl {
  $envFile = Join-Path $WebDir ".env"
  if (-not (Test-Path $envFile)) { return }
  $raw = Get-Content $envFile -Raw
  if ($raw -match "(?m)^DIRECT_URL=") { return }
  $dbLine = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1)
  if ($dbLine) {
    Add-Content -Path $envFile -Value "DIRECT_URL=$($dbLine.Substring('DATABASE_URL='.Length))"
    Write-Step "Added DIRECT_URL to web\.env"
  }
}

function Ensure-PortFile {
  $portFile = Join-Path $ProjectRoot "site-port.txt"
  Set-Content -Path $portFile -Value $Port -Encoding ASCII -NoNewline
}

Write-Host ""
Write-Host " Fancy Collection - starting site on port $Port" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Join-Path $WebDir "package.json"))) {
  throw "web\package.json not found. Run this from the project folder."
}

$env:Path = "$NodePath;" + $env:Path

if (-not $ForceRestart -and (Test-SiteHealth)) {
  Write-Host " Site already running at $Url" -ForegroundColor Green
  Ensure-PortFile
  Start-Process $Url
  exit 0
}

Stop-PortListener $LegacyPort
Stop-PortListener $Port
Start-Sleep -Seconds 1

Push-Location $WebDir
try {
  Ensure-DirectUrl
  Ensure-PortFile

  if ((-not $SkipBuild) -and (-not (Test-Path $BuildId))) {
    Write-Host ""
    Write-Step "Building production app (first run may take 1-2 minutes)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } elseif ((-not $SkipBuild) -and (Test-Path $BuildId)) {
    $buildTime = (Get-Item $BuildId).LastWriteTimeUtc
    $srcNewer = Get-ChildItem (Join-Path $WebDir "src") -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -gt $buildTime } |
      Select-Object -First 1
    if ($srcNewer) {
      Write-Host ""
      Write-Step "Source changed since last build — rebuilding..."
      npm run build
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
      Write-Step "Using existing production build."
    }
  } else {
    Write-Step "Using existing production build."
  }
} finally {
  Pop-Location
}

$serveBat = Join-Path $ProjectRoot "run-server.bat"
$serveContent = @"
@echo off
title Fancy Collection Server - DO NOT CLOSE (port $Port)
cd /d "$WebDir"
set "PATH=$NodePath;%PATH%"
set "PORT=$Port"
echo.
echo   Site URL:  http://127.0.0.1:$Port
echo   Login:     owner / admin123
echo.
echo   Keep this window open while using the site.
echo.
:serve
call npm run start:prod
echo.
echo Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto serve
"@
Set-Content -Path $serveBat -Value $serveContent -Encoding ASCII

Write-Step "Launching server window..."
Start-Process cmd.exe -ArgumentList "/k", "`"$serveBat`""

Write-Step "Waiting for $Url ..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  if (Test-SiteHealth) { $ready = $true; break }
}

Write-Host ""
if ($ready) {
  Write-Host " Site is ready: $Url" -ForegroundColor Green
  Start-Process $Url
  exit 0
}

Write-Host " Server did not respond in time." -ForegroundColor Yellow
Write-Host " Check the 'Fancy Collection Server' window for errors." -ForegroundColor Yellow
Write-Host " Then open: $Url" -ForegroundColor Yellow
exit 1
