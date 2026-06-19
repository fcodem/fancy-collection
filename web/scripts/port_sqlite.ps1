# Port fancynew/cloth_rental.db (SQLite) -> local PostgreSQL
# Usage:
#   .\scripts\port_sqlite.ps1 -Password "your_postgres_password"
#   .\scripts\port_sqlite.ps1 -Password "secret" -DryRun

param(
  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$Host = "localhost",
  [int]$Port = 5432,
  [string]$User = "postgres",
  [string]$Database = "cloth_rental",

  [switch]$DryRun,
  [switch]$SkipBootstrap
)

$ErrorActionPreference = "Stop"
$webRoot = Split-Path $PSScriptRoot -Parent
$env:DATABASE_URL = "postgresql://${User}:$([uri]::EscapeDataString($Password))@${Host}:${Port}/${Database}"

Set-Location $webRoot

Write-Host "=== Fancy Collection: SQLite -> PostgreSQL ===" -ForegroundColor Cyan
Write-Host "Source: ..\fancynew\cloth_rental.db"
Write-Host "Target: postgresql://${User}@${Host}:${Port}/${Database}"
Write-Host ""

python -m pip install psycopg2-binary python-dotenv -q

$args = @("scripts/port_sqlite_to_postgres.py", "--password", $Password)
if ($DryRun) { $args += "--dry-run" }
if ($SkipBootstrap) { $args += "--skip-bootstrap" }

python @args

if ($LASTEXITCODE -eq 0 -and -not $DryRun) {
  $envContent = @"
DATABASE_URL="$($env:DATABASE_URL)"
SESSION_SECRET="change-this-to-a-long-random-string-at-least-32-chars"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
"@
  Set-Content -Path (Join-Path $webRoot ".env") -Value $envContent -Encoding UTF8
  Write-Host ""
  Write-Host "Wrote web/.env with DATABASE_URL" -ForegroundColor Green
  Write-Host "Next: cd web && npm install && npm run dev" -ForegroundColor Yellow
}
