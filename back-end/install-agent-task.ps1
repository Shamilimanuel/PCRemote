# Registers a Scheduled Task that starts the Reveille agent automatically
# whenever you log in (including after the PC wakes from a Wake-on-LAN start).
#
# Run this once:
#   powershell -ExecutionPolicy Bypass -File install-agent-task.ps1
#
# No administrator rights needed. The agent only runs commands that affect the
# current user's own session (shutdown, restart, sleep, lock), none of which
# require elevation, so the task runs at your normal privilege level.

$ErrorActionPreference = 'Stop'

$taskName = 'ReveilleAgent'
$legacyTaskName = 'PCRemoteAgent'   # what the task was called before the rename

# Clear out the pre-rename task so the agent isn't started twice at login.
$legacy = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacy) {
    Write-Host "Removing the old '$legacyTaskName' task."
    Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error 'node.exe was not found on PATH. Install Node.js first: https://nodejs.org'
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $scriptDir 'start-agent-hidden.vbs'
if (-not (Test-Path $launcher)) {
    Write-Error "Missing $launcher - it should sit next to this script."
    exit 1
}

# Launch through the VBS shim so no console window appears at login.
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$launcher`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# StartWhenAvailable covers the case where the machine was busy booting after a
# Wake-on-LAN start; the battery settings keep it alive on laptops.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Scheduled task '$taskName' installed."
Write-Host "It starts the agent automatically each time you log in."
Write-Host "To start it right now without logging out:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
