# Redirects web\.next to LOCALAPPDATA so OneDrive does not sync the build cache.
# Run once from the project root (or automatically via start-web.bat).

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$WebDir = Join-Path $ProjectRoot "web"
$LegacyNext = Join-Path $WebDir ".next"
$CacheRoot = Join-Path $env:LOCALAPPDATA "fancy-collection-next"
$CacheNext = Join-Path $CacheRoot "junction-next"

New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
New-Item -ItemType Directory -Force -Path $CacheNext | Out-Null

if (Test-Path $LegacyNext) {
  $item = Get-Item $LegacyNext -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "web\.next is already a junction — OK"
    exit 0
  }
  Write-Host "Removing old OneDrive-synced web\.next ..."
  Remove-Item -LiteralPath $LegacyNext -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $LegacyNext) {
    Write-Host "Could not delete web\.next (dev server running?). Run stop-web.bat first."
    exit 1
  }
}

if (-not (Test-Path $LegacyNext)) {
  cmd /c mklink /J "$LegacyNext" "$CacheNext" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Junction failed. next.config.ts still uses LOCALAPPDATA distDir — continuing."
    exit 0
  }
  Write-Host "Linked web\.next -> $CacheNext"
}

# Also junction node_modules\.cache if it exists (webpack/turbo cache)
$WebpackCache = Join-Path $WebDir "node_modules\.cache"
$CacheWebpack = Join-Path $CacheRoot "webpack-cache"
New-Item -ItemType Directory -Force -Path $CacheWebpack | Out-Null
if ((Test-Path $WebpackCache) -and -not ((Get-Item $WebpackCache -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  Remove-Item -LiteralPath $WebpackCache -Recurse -Force -ErrorAction SilentlyContinue
}
if (-not (Test-Path $WebpackCache)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $WebpackCache -Parent) | Out-Null
  cmd /c mklink /J "$WebpackCache" "$CacheWebpack" 2>$null | Out-Null
}

Write-Host "Build cache is outside OneDrive."
