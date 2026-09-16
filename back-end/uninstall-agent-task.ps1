# Removes the Scheduled Task created by install-agent-task.ps1.
#   powershell -ExecutionPolicy Bypass -File uninstall-agent-task.ps1

$taskName = 'PCRemoteAgent'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Scheduled task '$taskName' removed (if it existed)."
