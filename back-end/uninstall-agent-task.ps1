# Removes the Scheduled Tasks created by install-agent-task.ps1 and
# install-firmware-task.ps1. The firmware one needs administrator rights.
#   powershell -ExecutionPolicy Bypass -File uninstall-agent-task.ps1

foreach ($taskName in @('ReveilleAgent', 'PCRemoteAgent', 'ReveilleFirmwareReboot')) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
Write-Host "Scheduled task removed (if it existed)."
