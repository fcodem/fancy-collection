# Installs pgvector v0.8.3 for PostgreSQL 18 on Windows (requires Administrator).
# Usage: Right-click PowerShell -> Run as Administrator, then:
#   cd C:\Projects\ssdn-soft\web
#   .\scripts\install-pgvector-windows.ps1

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Re-launching as Administrator..."
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

$pgMajor = 18
$pgRoot = "C:\Program Files\PostgreSQL\$pgMajor"
if (-not (Test-Path $pgRoot)) {
  throw "PostgreSQL $pgMajor not found at $pgRoot"
}

$tmpdir = Join-Path $env:TEMP "pgvector-install"
$zip = Join-Path $tmpdir "vector.v0.8.3-pg18.zip"
$uri = "https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.3_18.4/vector.v0.8.3-pg18.zip"

New-Item -ItemType Directory -Force -Path $tmpdir | Out-Null
if (-not (Test-Path (Join-Path $tmpdir "lib\vector.dll"))) {
  Write-Host "Downloading pgvector..."
  Invoke-WebRequest -Uri $uri -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tmpdir -Force
}

Write-Host "Stopping PostgreSQL service..."
Stop-Service "postgresql-x64-$pgMajor" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Installing to $pgRoot ..."
Copy-Item (Join-Path $tmpdir "lib\vector.dll") (Join-Path $pgRoot "lib\vector.dll") -Force
Copy-Item (Join-Path $tmpdir "share\extension\*") (Join-Path $pgRoot "share\extension\") -Force

Write-Host "Starting PostgreSQL service..."
Start-Service "postgresql-x64-$pgMajor"
Start-Sleep -Seconds 3

$pgBin = Join-Path $pgRoot "bin\psql.exe"
$env:PGPASSWORD = "postgres"
& $pgBin -U postgres -d cloth_rental -c "CREATE EXTENSION IF NOT EXISTS vector;"
$ext = & $pgBin -U postgres -d cloth_rental -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
Write-Host $ext
Write-Host "Done. Run: npx prisma migrate deploy"
