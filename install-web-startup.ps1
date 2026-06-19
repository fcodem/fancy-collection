# Register Fancy Collection web app to start automatically when you log in to Windows.
# Run once: right-click -> Run with PowerShell (or: powershell -ExecutionPolicy Bypass -File install-web-startup.ps1)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Bat = Join-Path $Root "start-web.bat"
$TaskName = "FancyCollectionWebDev"

if (-not (Test-Path $Bat)) {
  Write-Error "start-web.bat not found at $Bat"
}

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Bat`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Starts Fancy Collection Next.js on http://localhost:3000 at login" -Force | Out-Null

Write-Host ""
Write-Host "Installed scheduled task: $TaskName" -ForegroundColor Green
Write-Host "The web app will start automatically when you sign in to Windows." -ForegroundColor Cyan
Write-Host ""
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Yellow
Write-Host "To start now:  Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
Write-Host ""

$start = Read-Host "Start the server now? (Y/n)"
if ($start -ne "n" -and $start -ne "N") {
  Start-Process -FilePath $Bat -WorkingDirectory $Root
  Write-Host "Started start-web.bat — open http://localhost:3000 in ~10 seconds" -ForegroundColor Green
}
