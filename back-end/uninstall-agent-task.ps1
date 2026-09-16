# Removes the Scheduled Task created by install-agent-task.ps1.
#   powershell -ExecutionPolicy Bypass -File uninstall-agent-task.ps1

foreach ($taskName in @('ReveilleAgent', 'PCRemoteAgent')) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}
Write-Host "Scheduled task removed (if it existed)."
