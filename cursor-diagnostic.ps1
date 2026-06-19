# Cursor Internal Server Error - Local Diagnostic Script
# Platform: Windows (PowerShell)
# Safe to run: read-only checks only (no cache deletion)

$ErrorActionPreference = "Continue"
$Host.UI.RawUI.WindowTitle = "Cursor Diagnostic"

function Write-Section($Title) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host ("=" * 72) -ForegroundColor Cyan
}

function Test-AIEndpoint {
    param(
        [string]$HostName,
        [string]$Label
    )

    Write-Host ""
    Write-Host "[$Label] $HostName" -ForegroundColor Yellow

    # DNS resolution
    try {
        $dns = Resolve-DnsName -Name $HostName -ErrorAction Stop | Select-Object -First 3
        Write-Host "  DNS: OK" -ForegroundColor Green
        foreach ($r in $dns) {
            if ($r.IPAddress) { Write-Host "    -> $($r.IPAddress)" }
        }
    } catch {
        Write-Host "  DNS: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }

    # ICMP ping (4 packets)
    try {
        $ping = Test-Connection -ComputerName $HostName -Count 4 -ErrorAction Stop
        $avgMs = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1)
        Write-Host "  Ping: OK (avg ${avgMs}ms, 4/4 replies)" -ForegroundColor Green
    } catch {
        Write-Host "  Ping: FAILED or blocked - $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    Note: Some networks block ICMP; HTTPS may still work." -ForegroundColor DarkYellow
    }

    # HTTPS reachability (port 443)
    try {
        $tcp = Test-NetConnection -ComputerName $HostName -Port 443 -WarningAction SilentlyContinue
        if ($tcp.TcpTestSucceeded) {
            Write-Host "  HTTPS (443): OK" -ForegroundColor Green
        } else {
            Write-Host "  HTTPS (443): BLOCKED or unreachable" -ForegroundColor Red
        }
    } catch {
        Write-Host "  HTTPS (443): Check failed - $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Get-ExtensionFolders {
    $paths = @(
        (Join-Path $env:USERPROFILE ".cursor\extensions"),
        (Join-Path $env:USERPROFILE ".vscode\extensions"),
        (Join-Path $env:APPDATA "Cursor\User\globalStorage")
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Get-InstalledExtensions {
    param([string]$RootPath)

    if (-not $RootPath -or -not (Test-Path $RootPath)) {
        return @()
    }

    $extensions = @()
    Get-ChildItem -Path $RootPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $manifest = Join-Path $_.FullName "package.json"
        if (Test-Path $manifest) {
            try {
                $pkg = Get-Content $manifest -Raw | ConvertFrom-Json
                $extensions += [PSCustomObject]@{
                    Id = if ($pkg.publisher -and $pkg.name) { "$($pkg.publisher).$($pkg.name)" } else { $_.Name }
                    DisplayName = $pkg.displayName
                    Version = $pkg.version
                    Folder = $_.Name
                }
            } catch {
                $extensions += [PSCustomObject]@{
                    Id = $_.Name
                    DisplayName = "(unreadable package.json)"
                    Version = "?"
                    Folder = $_.Name
                }
            }
        }
    }
    return $extensions | Sort-Object Id
}

Write-Host ""
Write-Host "  CURSOR INTERNAL SERVER ERROR - DIAGNOSTIC REPORT" -ForegroundColor White
Write-Host "  Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host "  Machine:   $env:COMPUTERNAME | User: $env:USERNAME" -ForegroundColor DarkGray
Write-Host "  OS:        $([System.Environment]::OSVersion.VersionString)" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
Write-Section "1. NETWORK CHECK - AI API Endpoints"
Write-Host "Testing connectivity to common AI provider endpoints used by Cursor..."
Test-AIEndpoint -HostName "api.openai.com" -Label "OpenAI"
Test-AIEndpoint -HostName "api.anthropic.com" -Label "Anthropic"

# Optional: Cursor-related endpoints
Test-AIEndpoint -HostName "cursor.com" -Label "Cursor"
Test-AIEndpoint -HostName "www.cursor.com" -Label "Cursor Web"

# ---------------------------------------------------------------------------
Write-Section "2. PROXY CHECK - System and Environment"

Write-Host ""
Write-Host "Environment variables:" -ForegroundColor Yellow
$proxyVars = @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy")
$foundProxy = $false
foreach ($v in $proxyVars) {
    $val = [Environment]::GetEnvironmentVariable($v, "Process")
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($v, "User") }
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($v, "Machine") }
    if ($val) {
        $foundProxy = $true
        Write-Host "  $v = $val" -ForegroundColor Magenta
    }
}
if (-not $foundProxy) {
    Write-Host "  (none set in Process/User/Machine environment)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Windows Internet Settings (WinINET / user registry):" -ForegroundColor Yellow
try {
    $inet = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction Stop
    $proxyEnable = $inet.ProxyEnable
    $proxyServer = $inet.ProxyServer
    $autoConfig = $inet.AutoConfigURL
    Write-Host "  ProxyEnable: $proxyEnable"
    if ($proxyServer) { Write-Host "  ProxyServer: $proxyServer" -ForegroundColor $(if ($proxyEnable -eq 1) { "Magenta" } else { "DarkGray" }) }
    if ($autoConfig) { Write-Host "  AutoConfigURL (PAC): $autoConfig" -ForegroundColor Magenta }
    if ($proxyEnable -ne 1 -and -not $autoConfig) {
        Write-Host "  System proxy: not enabled via WinINET" -ForegroundColor Green
    }
} catch {
    Write-Host "  Could not read registry: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "WinHTTP proxy (used by some system services):" -ForegroundColor Yellow
try {
    $winhttp = netsh winhttp show proxy 2>&1
    $winhttp | ForEach-Object { Write-Host "  $_" }
} catch {
    Write-Host "  netsh winhttp unavailable: $($_.Exception.Message)" -ForegroundColor Red
}

# ---------------------------------------------------------------------------
Write-Section "3. EXTENSION AUDIT - Installed Cursor / VS Code Extensions"

$cursorExtPath = Join-Path $env:USERPROFILE ".cursor\extensions"
$vscodeExtPath = Join-Path $env:USERPROFILE ".vscode\extensions"

Write-Host ""
Write-Host "Extension search paths:" -ForegroundColor Yellow
Write-Host "  Cursor:  $cursorExtPath $(if (Test-Path $cursorExtPath) { '[EXISTS]' } else { '[NOT FOUND]' })"
Write-Host "  VS Code: $vscodeExtPath $(if (Test-Path $vscodeExtPath) { '[EXISTS]' } else { '[NOT FOUND]' })"

$allExtensions = @()
if (Test-Path $cursorExtPath) {
    $allExtensions += Get-InstalledExtensions -RootPath $cursorExtPath | ForEach-Object {
        $_ | Add-Member -NotePropertyName Source -NotePropertyValue "Cursor" -PassThru
    }
}
if (Test-Path $vscodeExtPath) {
    $vscodeExts = Get-InstalledExtensions -RootPath $vscodeExtPath | ForEach-Object {
        $_ | Add-Member -NotePropertyName Source -NotePropertyValue "VS Code" -PassThru
    }
    # Avoid duplicates by Id
    $existingIds = $allExtensions | ForEach-Object { $_.Id }
    foreach ($e in $vscodeExts) {
        if ($e.Id -notin $existingIds) { $allExtensions += $e }
    }
}

$conflictPatterns = @(
    @{ Pattern = "github\.copilot"; Name = "GitHub Copilot" },
    @{ Pattern = "tabnine"; Name = "Tabnine" },
    @{ Pattern = "supermaven"; Name = "Supermaven" },
    @{ Pattern = "codeium"; Name = "Codeium" },
    @{ Pattern = "continue"; Name = "Continue" },
    @{ Pattern = "amazonwebservices\.aws-toolkit"; Name = "AWS Toolkit" }
)

if ($allExtensions.Count -eq 0) {
    Write-Host ""
    Write-Host "  No extensions found in standard locations." -ForegroundColor DarkYellow
} else {
    Write-Host ""
    Write-Host "  Total extensions found: $($allExtensions.Count)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host ("  {0,-45} {1,-10} {2}" -f "Extension ID", "Version", "Source") -ForegroundColor DarkGray
    Write-Host ("  " + ("-" * 68)) -ForegroundColor DarkGray

    $highlighted = @()
    foreach ($ext in ($allExtensions | Sort-Object Id)) {
        $line = "  $($ext.Id.PadRight(45)) $($ext.Version.PadRight(10)) $($ext.Source)"
        $isConflict = $false
        foreach ($c in $conflictPatterns) {
            if ($ext.Id -match $c.Pattern -or ($ext.DisplayName -and $ext.DisplayName -match $c.Pattern)) {
                $isConflict = $true
                $highlighted += $c.Name
                break
            }
        }
        if ($isConflict) {
            Write-Host $line -ForegroundColor Red
        } else {
            Write-Host $line
        }
    }

    if ($highlighted.Count -gt 0) {
        Write-Host ""
        Write-Host "  *** POTENTIAL AI CONFLICTS DETECTED ***" -ForegroundColor Red
        $highlighted | Select-Object -Unique | ForEach-Object {
            Write-Host "    - $_ (may compete with Cursor AI - try disabling temporarily)" -ForegroundColor Red
        }
    } else {
        Write-Host ""
        Write-Host "  No known AI-assistant conflicts (Copilot/Tabnine/Supermaven) detected." -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------------
Write-Section "4. CACHE / STATE LOCATION"

$cursorAppData = Join-Path $env:APPDATA "Cursor"
$cursorLocal = Join-Path $env:LOCALAPPDATA "Cursor"

Write-Host ""
Write-Host "Cursor application data folders:" -ForegroundColor Yellow
Write-Host "  Roaming (settings, state):  $cursorAppData"
Write-Host "    Exists: $(Test-Path $cursorAppData)"
Write-Host "  Local (cache, GPU cache):   $cursorLocal"
Write-Host "    Exists: $(Test-Path $cursorLocal)"

if (Test-Path $cursorAppData) {
    $sizeRoaming = (Get-ChildItem $cursorAppData -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($sizeRoaming) {
        Write-Host "  Roaming size: $([math]::Round($sizeRoaming / 1MB, 1)) MB" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Key subfolders (if present):" -ForegroundColor Yellow
@(
    "Cache",
    "CachedData",
    "CachedExtensions",
    "Code Cache",
    "GPUCache",
    "logs",
    "User\globalStorage",
    "User\workspaceStorage"
) | ForEach-Object {
    $sub = Join-Path $cursorAppData $_
    if (Test-Path $sub) {
        Write-Host "  [FOUND] $sub" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "TO CLEAR CURSOR CACHE (run manually - Cursor must be fully quit first):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  # Step 1: Quit Cursor completely (check Task Manager for lingering processes)" -ForegroundColor White
Write-Host ""
Write-Host "  # Step 2: Clear cache folders (PowerShell - DOES NOT delete settings/extensions):" -ForegroundColor White
Write-Host @"

  `$cursor = "$cursorAppData"
  @('Cache','CachedData','CachedExtensions','Code Cache','GPUCache','logs') | ForEach-Object {
    `$p = Join-Path `$cursor `$_
    if (Test-Path `$p) {
      Remove-Item `$p -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "Removed: `$p"
    }
  }
  Write-Host "Done. Restart Cursor."

"@ -ForegroundColor Green

Write-Host ""
Write-Host "  Nuclear option (removes ALL Cursor state - you will need to sign in again):" -ForegroundColor DarkYellow
Write-Host "  Remove-Item `"$cursorAppData`" -Recurse -Force" -ForegroundColor DarkYellow

# ---------------------------------------------------------------------------
Write-Section "5. MANUAL CHECKLIST"

Write-Host @"

  After reviewing the results above, also try these steps manually:

  [ ] 1. API BILLING / KEYS
         If you use custom API keys (OpenAI, Anthropic, etc.), verify:
         - Keys are valid and not expired
         - Account has available credits / billing is active
         - Keys are entered correctly in Cursor Settings > Models

  [ ] 2. LOG OUT AND BACK IN
         In Cursor: Settings > Account - sign out, then sign back in.
         This refreshes your auth token and can fix "Internal Server Error".

  [ ] 3. DISABLE VPN / FIREWALL TEMPORARILY
         Turn off VPN or corporate proxy and retry.
         If ping/HTTPS checks above failed, your network is likely blocking AI APIs.

  [ ] 4. DISABLE CONFLICTING EXTENSIONS
         Temporarily disable any extensions highlighted in Section 3, then restart Cursor.

  [ ] 5. CHECK CURSOR STATUS
         Visit https://status.cursor.com or https://cursor.com for outage reports.

  [ ] 6. UPDATE CURSOR
         Help > Check for Updates - ensure you are on the latest version.

"@ -ForegroundColor White

Write-Host ("=" * 72) -ForegroundColor Cyan
Write-Host " Diagnostic complete." -ForegroundColor Green
Write-Host ("=" * 72) -ForegroundColor Cyan
Write-Host ""
