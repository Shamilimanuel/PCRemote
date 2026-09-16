# Removes the Scheduled Tasks created by install-agent-task.ps1,
# install-firmware-task.ps1 and install-presence-task.ps1. The last two were
# registered from an elevated shell, so removing them needs one too.
#   powershell -ExecutionPolicy Bypass -File uninstall-agent-task.ps1

foreach ($taskName in @('ReveilleAgent', 'PCRemoteAgent', 'ReveilleFirmwareReboot', 'ReveillePresence')) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

# Left behind by install-presence-task.ps1. Harmless on its own -- nothing is
# listening on that port once the task is gone -- but a rule for something that
# no longer exists is the kind of thing that quietly accumulates.
Get-NetFirewallRule -DisplayName 'Reveille lock-screen responder' -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

Write-Host "Scheduled tasks removed (if they existed)."
