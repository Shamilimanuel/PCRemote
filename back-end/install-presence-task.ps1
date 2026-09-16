# Makes the PC answer the phone while it is sitting at the lock screen.
#
# The agent itself starts when you log in, so a PC woken from a full shutdown
# by Wake-on-LAN looks offline in the app until someone types their PIN. This
# registers a second, far smaller thing -- src/presence.js -- that starts at
# boot instead, on its own port, and can only answer "yes, this PC is on".
#
# MUST be run as administrator. Registering anything to start before log on is
# a privileged operation, and there is no way around that: an ordinary user
# cannot create a boot-triggered task at all. You approve it once, here.
#
#   powershell -ExecutionPolicy Bypass -File install-presence-task.ps1
#
# What runs is NOT elevated. The task is registered to run as you, with your
# normal privileges, using an S4U logon -- no stored password, no administrator
# rights, no interactive desktop. Administrator is needed to *create* the task,
# not by the thing the task starts.
#
# The responder has no shutdown, restart, sleep or lock code in it, so a machine
# left at the lock screen is not sitting there running something that could act
# on it. Every control still goes to the real agent, which still needs you to be
# logged in.

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error 'This script needs administrator rights. Right-click PowerShell and choose "Run as administrator", then run it again.'
    exit 1
}

$taskName = 'ReveillePresence'
$ruleName = 'Reveille lock-screen responder'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$entry = Join-Path $scriptDir 'src\presence.js'
if (-not (Test-Path $entry)) {
    Write-Error "Missing $entry - it should sit under this script's folder."
    exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error 'node.exe was not found on PATH. Install Node.js first: https://nodejs.org'
    exit 1
}
# Resolve node to a full path: the task runs before any user profile is loaded,
# where PATH is the machine's and not necessarily the one this shell inherited.
$nodeExe = $nodeCmd.Source

# Which port to open. Kept in step with presence.js: the agent's port + 1 unless
# config.json names one outright.
$port = 5534
$configPath = Join-Path $scriptDir 'config.json'
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($config.presencePort) { $port = [int]$config.presencePort }
    elseif ($config.port)     { $port = [int]$config.port + 1 }
}

# No window to hide: an S4U task has no desktop to draw one on, so node runs
# directly rather than through the VBS shim the log-on task needs.
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$entry`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -AtStartup

# StartWhenAvailable matters more here than for the agent: this is the task that
# is meant to be up while the machine boots after a Wake-on-LAN start.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

# S4U: runs as you, without a password and without an interactive session, which
# is the only combination that both starts at boot and stays unprivileged.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

# The agent gets its firewall rule from Node's own "allow this app?" prompt on
# first listen. This one never sees that prompt -- nobody is logged in when it
# starts -- so the rule has to be made here. Private and domain networks only:
# this is a LAN tool, and a coffee shop is not a LAN you want answering.
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port `
    -Profile Private, Domain | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "Installed '$taskName', listening on port $port."
Write-Host 'The app will now show this PC as awake while it sits at the lock screen.'
Write-Host ''
Write-Host 'To remove it later:'
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
Write-Host "  Remove-NetFirewallRule -DisplayName '$ruleName'"
