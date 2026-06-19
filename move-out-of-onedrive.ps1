# Copies the project to C:\Projects\ssdn-soft (outside OneDrive) for faster Next.js builds.
# Run: powershell -ExecutionPolicy Bypass -File move-out-of-onedrive.ps1

$ErrorActionPreference = "Stop"

$Source = $PSScriptRoot
$Dest = "C:\Projects\ssdn-soft"

Write-Host ""
Write-Host "========================================"
Write-Host " Move Fancy Collection out of OneDrive"
Write-Host "========================================"
Write-Host " From: $Source"
Write-Host " To:   $Dest"
Write-Host ""

# Stop dev server
$stopBat = Join-Path $Source "stop-web.bat"
if (Test-Path $stopBat) {
  & $stopBat
  Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Force -Path "C:\Projects" | Out-Null

$excludeDirs = @("node_modules", ".next", ".turbo", ".git")

Write-Host "Copying project (excluding heavy folders)..."
robocopy $Source $Dest /E /XD node_modules .next .turbo /XF *.log /NFL /NDL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) {
  Write-Host "Robocopy failed with code $LASTEXITCODE"
  exit 1
}

# Copy .env if present (not in repo)
$envSrc = Join-Path $Source "web\.env"
$envDst = Join-Path $Dest "web\.env"
if ((Test-Path $envSrc) -and -not (Test-Path $envDst)) {
  Copy-Item $envSrc $envDst -Force
  Write-Host "Copied web\.env"
}

Write-Host ""
Write-Host "Installing dependencies in new location..."
Push-Location (Join-Path $Dest "web")
try {
  npm install
  if ($LASTEXITCODE -ne 0) { exit 1 }
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
  Pop-Location
}

# Restore default distDir in new location (.next is fine outside OneDrive)
$nextConfig = Join-Path $Dest "web\next.config.ts"
if (Test-Path $nextConfig) {
  $content = Get-Content $nextConfig -Raw
  if ($content -match "distDir:") {
    $content = @'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: ["@prisma/client"],
  },
};

export default nextConfig;

'@
    Set-Content -Path $nextConfig -Value $content -Encoding UTF8
    Write-Host "Reset next.config.ts to use local .next (outside OneDrive)."
  }
}

$readme = Join-Path $Dest "MOVED-FROM-ONEDRIVE.txt"
@"
This project was moved from OneDrive for faster Next.js performance.

Old location: $Source
New location: $Dest

Open this folder in Cursor:
  File -> Open Folder -> $Dest

Start the app:
  Double-click start-web.bat

You can delete the old OneDrive copy after confirming everything works.
"@ | Set-Content $readme -Encoding UTF8

Write-Host ""
Write-Host "========================================"
Write-Host " DONE"
Write-Host " New project path: $Dest"
Write-Host " Open in Cursor: File -> Open Folder"
Write-Host " Then run: start-web.bat"
Write-Host "========================================"
Write-Host ""
