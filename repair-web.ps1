# Repairs the Next.js environment (cache, port, Prisma) before starting the site.
# Run automatically from start-web.bat, or double-click repair-web.bat after errors.

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$WebDir = Join-Path $ProjectRoot "web"
$LegacyNext = Join-Path $WebDir ".next"
$CacheRoot = Join-Path $env:LOCALAPPDATA "fancy-collection-next"
$CacheNext = Join-Path $CacheRoot "junction-next"
$Port = 3088
$LegacyPort = 3000
$OnOneDrive = $ProjectRoot -match "OneDrive"

function Write-Step([string]$Message) {
  Write-Host "[repair] $Message"
}

function Stop-PortListener([int]$ListenPort) {
  $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      Write-Step "Stopping stale process on port $ListenPort (PID $($c.OwningProcess))..."
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 1
}

function Remove-NextFolder([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }

  $item = Get-Item -LiteralPath $Path -Force
  $isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)

  if ($isReparse) {
    Write-Step "Removing reparse point at $Path ..."
    cmd /c "rmdir `"$Path`"" | Out-Null
    if (Test-Path -LiteralPath $Path) {
      cmd /c "rmdir /s /q `"$Path`"" | Out-Null
    }
  } else {
    Write-Step "Removing folder $Path ..."
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path -LiteralPath $Path) {
    throw "Could not remove $Path. Close all terminals using the dev server, then run repair-web.bat again."
  }
}

function Test-ValidNextJunction {
  if (-not (Test-Path -LiteralPath $LegacyNext)) { return $false }
  $item = Get-Item -LiteralPath $LegacyNext -Force
  if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $false }

  try {
    $target = $item.Target
    if ($target -and ($target | Where-Object { $_ -match [regex]::Escape($CacheNext) })) {
      return $true
    }
  } catch {
    # PowerShell cannot always read junction targets on this Windows build.
  }

  return (Test-Path -LiteralPath $CacheNext)
}

function Ensure-NextJunction {
  if (-not $OnOneDrive) {
    Write-Step "Project not on OneDrive - using local web\.next (no junction)."
    return
  }

  New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $CacheNext | Out-Null

  if (Test-ValidNextJunction) {
    Write-Step "web\.next junction is OK."
    return
  }

  if (Test-Path -LiteralPath $LegacyNext) {
    Write-Step "web\.next is not a valid local cache junction (OneDrive may have taken over). Recreating..."
    Remove-NextFolder $LegacyNext
  }

  $null = cmd /c mklink /J "$LegacyNext" "$CacheNext"
  if (-not (Test-Path -LiteralPath $LegacyNext)) {
    throw "Failed to create junction web\.next -> $CacheNext"
  }
  Write-Step "Linked web\.next -> $CacheNext"
}

function Clear-DevCache {
  if (-not $OnOneDrive) {
    if (Test-Path -LiteralPath $LegacyNext) {
      Remove-NextFolder $LegacyNext
    }
    Write-Step "Cleared local .next cache."
    return
  }

  $wipe = @(
    (Join-Path $CacheNext "cache"),
    (Join-Path $CacheNext "diagnostics"),
    (Join-Path $CacheNext "static"),
    (Join-Path $CacheNext "server"),
    (Join-Path $CacheNext "types"),
    (Join-Path $CacheNext "trace")
  )
  foreach ($p in $wipe) {
    if (Test-Path -LiteralPath $p) {
      Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($file in @("BUILD_ID", "export-marker.json")) {
    $f = Join-Path $CacheNext $file
    if (Test-Path -LiteralPath $f) {
      Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Step "Cleared stale dev/build cache."
}



Write-Host ""

Write-Host " Fancy Collection - repair web environment" -ForegroundColor Cyan

Write-Host ""



if (-not (Test-Path (Join-Path $WebDir "package.json"))) {

  throw "web\package.json not found."

}



Stop-PortListener $LegacyPort
Stop-PortListener $Port

Ensure-NextJunction

Clear-DevCache



Push-Location $WebDir

try {

  Write-Step "Running prisma generate..."

  $prev = $ErrorActionPreference

  $ErrorActionPreference = "Continue"

  & npx prisma generate 2>&1 | Out-Null

  $ErrorActionPreference = $prev

  if ($LASTEXITCODE -ne 0) {

    throw "prisma generate failed with exit code $LASTEXITCODE"

  }

} finally {

  Pop-Location

}



Write-Host ""

Write-Host " Repair complete. Start the site with start-web.bat" -ForegroundColor Green

Write-Host ""



if ($args -contains "-Start") {

  Start-Process -FilePath (Join-Path $ProjectRoot "start-web.bat") -WorkingDirectory $ProjectRoot

}

