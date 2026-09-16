# Grants the Reveille agent exactly one extra power: rebooting into the
# firmware (BIOS/UEFI) settings screen.
#
# MUST be run as administrator -- registering a task that runs elevated is
# itself a privileged operation. That is the point: you approve it once, here,
# rather than the agent holding administrator rights permanently.
#
#   powershell -ExecutionPolicy Bypass -File install-firmware-task.ps1
#
# The task runs one fixed command with no arguments. The agent can ask Task
# Scheduler to start it; it cannot change what it does. So the extra authority
# this grants, even if the agent's token leaked, is "reboot to firmware" and
# nothing else.

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error 'This script needs administrator rights. Right-click PowerShell and choose "Run as administrator", then run it again.'
    exit 1
}

# Only UEFI machines have a firmware screen Windows can boot into.
$firmware = $env:firmware_type
if (-not $firmware) {
    $firmware = if (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State') { 'UEFI' } else { 'Unknown' }
}
if ($firmware -eq 'Legacy') {
    Write-Error 'This PC boots in legacy BIOS mode, which has no firmware screen Windows can send it to. Nothing to install.'
    exit 1
}

$taskName = 'ReveilleFirmwareReboot'

$action = New-ScheduledTaskAction -Execute 'shutdown.exe' -Argument '/r /fw /t 5'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Runs as you, elevated. A non-elevated process (the agent) may ask Task
# Scheduler to start it, which is how the agent stays unprivileged.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Installed '$taskName'."
Write-Host 'The Reveille app will now show a "BIOS" button for this PC.'
Write-Host ''
Write-Host 'To remove it later:'
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
