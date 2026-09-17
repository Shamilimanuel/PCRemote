<#
    Reveille -- one-line setup for the PC agent.

        irm github.com/Shamilimanuel/PCRemote/raw/main/setup.ps1 | iex

    Installs the agent under %LOCALAPPDATA%\Reveille, makes it start when you
    log in, and finishes by opening the pairing code for the phone to scan.

    No administrator rights needed. The agent only ever runs commands that
    affect your own session, so it is registered at your normal privilege
    level. The one exception -- rebooting into the BIOS screen -- is a separate
    opt-in step that does ask for elevation, and is not installed by default.

    Options (these need the longer form, because `iex` cannot take arguments):

        & ([scriptblock]::Create((irm <url>))) -Uninstall
        & ([scriptblock]::Create((irm <url>))) -Firmware
        & ([scriptblock]::Create((irm <url>))) -Path 'D:\somewhere'

    Re-running it upgrades in place and keeps your existing token, so the phone
    does not need re-pairing.
#>

[CmdletBinding()]
param(
    # Remove the agent, its scheduled tasks and its files.
    [switch]$Uninstall,
    # Grant the "Reboot to BIOS" power without being asked about it.
    [switch]$Firmware,
    # Where to install. Defaults to %LOCALAPPDATA%\Reveille.
    [string]$Path,
    # Skip opening the pairing page at the end.
    [switch]$NoPair,
    # Install without registering it to start at login.
    [switch]$NoAutoStart,
    # Skip the reboot-to-BIOS question entirely. For scripted installs.
    [switch]$NoFirmware,
    # Answer the lock-screen question yes without being asked about it.
    [switch]$LockScreen,
    # Skip the lock-screen question entirely. For scripted installs.
    [switch]$NoLockScreen
)

$ErrorActionPreference = 'Stop'

$Repo       = 'Shamilimanuel/PCRemote'
$Branch     = 'main'
$TaskName   = 'ReveilleAgent'
$LegacyTask = 'PCRemoteAgent'
$FirmwareTask = 'ReveilleFirmwareReboot'
$PresenceTask = 'ReveillePresence'
$InstallDir = if ($Path) { $Path } else { Join-Path $env:LOCALAPPDATA 'Reveille' }

function Write-Step  { param([string]$m) Write-Host "  $m" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "  $m" -ForegroundColor Green }
function Write-Warn2 { param([string]$m) Write-Host "  $m" -ForegroundColor Yellow }
function Write-Dim   { param([string]$m) Write-Host "  $m" -ForegroundColor DarkGray }

<#
    The banner.

    Drawn from a bitmap rather than pasted as literal block characters, so this
    file stays plain ASCII -- PowerShell 5.1 reads a .ps1 as ANSI unless it has
    a byte-order mark, and pasted block art turns to mojibake. Built from
    [char] codes it renders correctly however the script is fetched or run.

    The R is the logo's colour; the rest of the word sits behind it.
#>

$script:Glyphs = @{
    'R' = @('####.', '#...#', '####.', '#..#.', '#...#')
    'E' = @('#####', '#....', '####.', '#....', '#####')
    'V' = @('#...#', '#...#', '#...#', '.#.#.', '..#..')
    'I' = @('#####', '..#..', '..#..', '..#..', '#####')
    'L' = @('#....', '#....', '#....', '#....', '#####')
}

function Write-Banner {
    $block = [string][char]0x2588      # full block
    $rule = [string][char]0x2500       # horizontal rule
    $word = 'REVEILLE'

    # Cyan at the top falling to blue at the bottom -- the same gradient the
    # beam has in the app icon. The R keeps the bright end on every row so the
    # monogram still reads as the mark.
    $gradient = @('Cyan', 'Cyan', 'DarkCyan', 'DarkCyan', 'Blue')

    Write-Host ''
    for ($row = 0; $row -lt 5; $row++) {
        Write-Host '  ' -NoNewline
        for ($i = 0; $i -lt $word.Length; $i++) {
            $line = $script:Glyphs[[string]$word[$i]][$row]
            $text = ($line -replace '#', $block) -replace '\.', ' '
            $colour = if ($i -eq 0) { 'White' } else { $gradient[$row] }
            Write-Host "$text " -ForegroundColor $colour -NoNewline
        }
        Write-Host ''
    }

    Write-Host ''
    Write-Host ('  ' + ($rule * 50)) -ForegroundColor DarkGray
    Write-Host '   wake, lock and shut down this PC from your phone' -ForegroundColor Gray
    Write-Host ('  ' + ($rule * 50)) -ForegroundColor DarkGray
    Write-Host ''
}

# ---------------------------------------------------------------- uninstall --

function Invoke-Uninstall {
    Write-Banner
    Write-Step 'Removing Reveille...'

    foreach ($name in @($TaskName, $LegacyTask)) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
            Write-Dim "removed scheduled task '$name'"
        }
    }

    if (Get-ScheduledTask -TaskName $FirmwareTask -ErrorAction SilentlyContinue) {
        try {
            Unregister-ScheduledTask -TaskName $FirmwareTask -Confirm:$false -ErrorAction Stop
            Write-Dim "removed scheduled task '$FirmwareTask'"
        } catch {
            Write-Warn2 "'$FirmwareTask' needs an administrator PowerShell to remove. Skipped."
        }
    }

    if (Get-ScheduledTask -TaskName $PresenceTask -ErrorAction SilentlyContinue) {
        try {
            Stop-ScheduledTask -TaskName $PresenceTask -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $PresenceTask -Confirm:$false -ErrorAction Stop
            Get-NetFirewallRule -DisplayName 'Reveille lock-screen responder' -ErrorAction SilentlyContinue |
                Remove-NetFirewallRule -ErrorAction SilentlyContinue
            Write-Dim "removed scheduled task '$PresenceTask'"
        } catch {
            Write-Warn2 "'$PresenceTask' needs an administrator PowerShell to remove. Skipped."
        }
    }

    Stop-WhateverHoldsThePort -Port (Read-AgentPort -Destination $InstallDir)

    if (Test-Path $InstallDir) {
        Remove-Item $InstallDir -Recurse -Force
        Write-Dim "deleted $InstallDir"
    }

    Write-Host ''
    Write-Ok 'Reveille removed.'
    Write-Dim 'The app on your phone can be uninstalled the normal way.'
    Write-Host ''
}

# ------------------------------------------------------------------- node.js --

function Resolve-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $version = (& $node.Source --version).TrimStart('v')
        if ([int]($version -split '\.')[0] -ge 20) {
            Write-Dim "Node.js $version"
            return $node.Source
        }
        Write-Warn2 "Node.js $version is too old (20 or newer needed)."
    } else {
        Write-Step 'Node.js is not installed. It is what runs the agent.'
    }

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Step 'Installing Node.js via winget...'
        winget install --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Null

        # winget does not refresh this session's PATH.
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [Environment]::GetEnvironmentVariable('Path', 'User')
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node) {
            Write-Ok "Node.js installed."
            return $node.Source
        }
        Write-Warn2 'Node.js was installed but this window cannot see it yet.'
        Write-Warn2 'Close this terminal, open a new one, and run the same command again.'
        exit 1
    }

    Write-Host ''
    Write-Warn2 'Install Node.js first, then run this again:'
    Write-Warn2 '  https://nodejs.org  (take the LTS download)'
    Write-Host ''
    exit 1
}

# ------------------------------------------------------------------ download --

function Get-AgentFiles {
    param([string]$Destination)

    $zipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "reveille-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $zip = Join-Path $tmp 'src.zip'

    Write-Step 'Downloading the agent...'
    $progress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'   # the progress bar makes this 10x slower
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
    } finally {
        $ProgressPreference = $progress
    }

    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $source = Join-Path $tmp "PCRemote-$Branch\back-end"
    if (-not (Test-Path $source)) {
        throw "The download did not contain the agent. Expected $source"
    }

    # Keep the existing token, or the phone would have to be paired again.
    $existingConfig = Join-Path $Destination 'config.json'
    $savedConfig = $null
    if (Test-Path $existingConfig) {
        $savedConfig = Get-Content $existingConfig -Raw
        Write-Dim 'keeping your existing token'
    }

    if (Test-Path $Destination) {
        # node_modules is re-installed below; everything else is replaceable.
        Get-ChildItem $Destination -Force | Where-Object { $_.Name -ne 'node_modules' } |
            Remove-Item -Recurse -Force
    } else {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }

    Copy-Item (Join-Path $source '*') $Destination -Recurse -Force

    if ($savedConfig) {
        # No BOM: Set-Content -Encoding UTF8 adds one, and JSON.parse rejects it.
        [System.IO.File]::WriteAllText($existingConfig, $savedConfig, (New-Object System.Text.UTF8Encoding $false))
    }

    # Record which commit this copy came from. The agent compares it against
    # main to notice when the PC half has fallen behind -- it is fetched from a
    # branch, not a release, so a commit is the only honest version it has.
    try {
        $head = Invoke-RestMethod "https://api.github.com/repos/$Repo/commits/$Branch" `
            -Headers @{ 'User-Agent' = 'reveille-setup' } -TimeoutSec 10
        $stamp = @{ sha = $head.sha; installedAt = (Get-Date).ToString('o') } | ConvertTo-Json
        [System.IO.File]::WriteAllText(
            (Join-Path $Destination 'installed.json'), $stamp,
            (New-Object System.Text.UTF8Encoding $false))
    } catch {
        Write-Dim 'could not record the installed version (update checks will stay quiet)'
    }

    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Dim "installed to $Destination"
}

# --------------------------------------------------------------- scheduling --

function Register-Agent {
    param([string]$Destination)

    foreach ($name in @($TaskName, $LegacyTask)) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
        }
    }

    $launcher = Join-Path $Destination 'start-agent-hidden.vbs'
    $action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$launcher`"" -WorkingDirectory $Destination
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force | Out-Null
    Write-Dim 'starts automatically when you log in'
}

function Install-FirmwareTask {
    param([string]$Destination)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)

    $script = Join-Path $Destination 'install-firmware-task.ps1'
    if ($isAdmin) {
        & powershell -ExecutionPolicy Bypass -File $script
        return
    }

    Write-Step 'Reboot-to-BIOS needs administrator approval once...'
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru `
        -ArgumentList '-ExecutionPolicy', 'Bypass', '-File', "`"$script`""
    if ($p.ExitCode -eq 0) {
        Write-Ok 'Reboot to BIOS is available.'
    } else {
        Write-Warn2 'Reboot to BIOS was not set up. Everything else still works.'
    }
}

# ------------------------------------------------------------ bios prompt --

function Test-Uefi {
    $firmware = $env:firmware_type
    if ($firmware) { return $firmware -ne 'Legacy' }
    # Not every Windows build sets that variable; the Secure Boot key only
    # exists on UEFI machines either way.
    return (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State')
}

<#
    Asks whether to add the "Reboot to BIOS" button, and says plainly what
    saying yes grants.

    It is a separate question rather than part of the install because it is the
    only thing here that needs administrator rights. Everything else the agent
    does affects your own session and needs nothing special, and keeping it that
    way is the point -- a program listening on the network should hold as little
    authority as it can.
#>
function Confirm-Firmware {
    if (-not (Test-Uefi)) {
        Write-Dim 'This PC boots in legacy BIOS mode, so Windows cannot restart into firmware. Skipping.'
        return $false
    }
    if (Get-ScheduledTask -TaskName $FirmwareTask -ErrorAction SilentlyContinue) {
        Write-Dim 'Reboot to BIOS is already set up.'
        return $false
    }
    # Read-Host needs a console. A piped or scheduled run gets a quiet no.
    if (-not [Environment]::UserInteractive) { return $false }

    Write-Host ''
    Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
    Write-Host '  Optional: add a "Reboot to BIOS" button?' -ForegroundColor White
    Write-Host ''
    Write-Dim '  Restarts this PC straight into its BIOS/UEFI settings'
    Write-Dim '  screen, from the phone.'
    Write-Host ''
    Write-Dim '  Saying yes:'
    Write-Dim '   - asks Windows for administrator once, right now'
    Write-Dim '   - creates one task that runs exactly one command:'
    Write-Dim '     shutdown /r /fw  (restart into firmware)'
    Write-Host ''
    Write-Dim '  It grants nothing else. The agent stays unprivileged and'
    Write-Dim '  cannot change what that task does -- only ask it to run.'
    Write-Dim '  So the most anyone could do with a stolen token is reboot'
    Write-Dim '  this PC into its settings screen.'
    Write-Host ''
    Write-Dim '  Saying no changes nothing. Everything else works the same,'
    Write-Dim '  and you can add it later by running this again.'
    Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
    Write-Host ''

    $answer = Read-Host '  Add the Reboot to BIOS button? (y/N)'
    return $answer -match '^\s*(y|yes|j|ja)\s*$'
}

# --------------------------------------------------- lock-screen responder --

function Install-PresenceTask {
    param([string]$Destination)

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)

    $script = Join-Path $Destination 'install-presence-task.ps1'
    if ($isAdmin) {
        & powershell -ExecutionPolicy Bypass -File $script
        return
    }

    Write-Step 'Answering at the lock screen needs administrator approval once...'
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru `
        -ArgumentList '-ExecutionPolicy', 'Bypass', '-File', "`"$script`""
    if ($p.ExitCode -eq 0) {
        Write-Ok 'This PC will show as awake at the lock screen.'
    } else {
        Write-Warn2 'Not set up. The PC will show as awake once you log in, as before.'
    }
}

<#
    Asks whether the PC should answer the phone while it sits at the lock
    screen.

    Worth asking rather than assuming, for the same reason as the BIOS
    question: it needs administrator once. Windows does not let an ordinary
    user register anything to start before log on, at all -- so the agent's own
    task is triggered by logging in, and a PC woken from a full shutdown looks
    offline until someone types their PIN.
#>
function Confirm-Presence {
    if (Get-ScheduledTask -TaskName $PresenceTask -ErrorAction SilentlyContinue) {
        Write-Dim 'Answering at the lock screen is already set up.'
        return $false
    }
    # Read-Host needs a console. A piped or scheduled run gets a quiet no.
    if (-not [Environment]::UserInteractive) { return $false }

    Write-Host ''
    Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
    Write-Host '  Optional: show this PC as awake at the lock screen?' -ForegroundColor White
    Write-Host ''
    Write-Dim '  Right now, waking this PC from off leaves the app'
    Write-Dim '  showing it as offline until someone types their PIN,'
    Write-Dim '  because the agent starts when you log in.'
    Write-Host ''
    Write-Dim '  Saying yes:'
    Write-Dim '   - asks Windows for administrator once, right now'
    Write-Dim '   - starts one small program at boot that answers'
    Write-Dim '     one question: is this PC on?'
    Write-Host ''
    Write-Dim '  That program runs as you, unprivileged, and has no'
    Write-Dim '  shutdown, restart, sleep or lock code in it. Only'
    Write-Dim '  creating it needs administrator, not running it.'
    Write-Host ''
    Write-Dim '  Saying no changes nothing, and you can add it later'
    Write-Dim '  by running this again.'
    Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
    Write-Host ''

    $answer = Read-Host '  Answer at the lock screen? (y/N)'
    return $answer -match '^\s*(y|yes|j|ja)\s*$'
}

# -------------------------------------------------------------------- verify --

# An older install -- or a copy started by hand -- will still be holding the
# port, and the new one would fail to bind with nothing on screen to say why.
function Stop-WhateverHoldsThePort {
    param([int]$Port)

    $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($owner in $owners) {
        $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Dim "stopping what was already on port $Port ($($proc.ProcessName), pid $owner)"
            Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
        }
    }
    if ($owners) { Start-Sleep -Seconds 1 }
}

function Read-AgentPort {
    param([string]$Destination)
    $configPath = Join-Path $Destination 'config.json'
    if (Test-Path $configPath) {
        try { return [int]((Get-Content $configPath -Raw | ConvertFrom-Json).port) } catch { }
    }
    return 5533
}

function Test-Agent {
    param([string]$Destination)

    $configPath = Join-Path $Destination 'config.json'
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-Path $configPath) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path $configPath)) { return $null }

    $config = Get-Content $configPath -Raw | ConvertFrom-Json

    for ($i = 0; $i -lt 20; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$($config.port)/health" `
                -Headers @{ Authorization = "Bearer $($config.token)" } `
                -TimeoutSec 3 -UseBasicParsing
            if ($r.StatusCode -eq 200) { return ($r.Content | ConvertFrom-Json) }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

# --------------------------------------------------------------- pairing --

<#
    Throws away the pairing token and issues a new one.

    Worth having because the token is the whole of the security model: whoever
    holds it can shut this machine down. Before this, changing it meant editing
    config.json by hand, so in practice nobody ever did -- a token that leaked
    stayed valid forever.

    Every paired phone stops working and has to scan again. That is the point.
#>
function Reset-Token {
    param([string]$Destination)

    $configPath = Join-Path $Destination 'config.json'
    if (-not (Test-Path $configPath)) {
        Write-Warn2 '  There is no pairing code here yet; install first.'
        return $false
    }

    Write-Host ''
    Write-Warn2 '  This replaces the pairing code on this PC.'
    Write-Dim   '  Every phone already paired with it stops working until it scans'
    Write-Dim   '  the new code. That is exactly what makes it useful if the old'
    Write-Dim   '  one has been seen by someone else.'
    Write-Host ''
    $answer = Read-Host '  Type yes to continue'
    if ($answer.Trim().ToLower() -ne 'yes') {
        Write-Dim '  Left alone.'
        return $false
    }

    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
    } catch {
        Write-Warn2 '  config.json could not be read. Try Repair instead.'
        return $false
    }

    # 24 random bytes as hex, matching generateToken in back-end/src/config.js.
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $config.token = -join ($bytes | ForEach-Object { $_.ToString('x2') })

    # No BOM: JSON.parse rejects one, and the agent reads this file.
    [System.IO.File]::WriteAllText(
        $configPath,
        ($config | ConvertTo-Json -Depth 6),
        (New-Object System.Text.UTF8Encoding $false))

    Write-Ok '  New pairing code issued.'

    # Both the agent and the lock-screen responder hold the old one in memory.
    Write-Step 'Restarting so the new code takes effect...'
    foreach ($name in @($TaskName, $PresenceTask)) {
        if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
            Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 400
            Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
    return $true
}

# ----------------------------------------------------------------- menu --

<#
    Shown when an install already exists and nobody passed a flag.

    The one-line command is the only thing anyone memorises, so it has to be
    the way in to everything -- not just first-time install. Typing the same
    line again should let you update, repair or remove, rather than silently
    reinstalling and leaving you to find the flags in a README.
#>
function Show-Menu {
    param([string]$Destination)

    $installed = $null
    $stamp = Join-Path $Destination 'installed.json'
    if (Test-Path $stamp) {
        try { $installed = (Get-Content $stamp -Raw | ConvertFrom-Json).sha } catch { }
    }

    Write-Host '  Reveille is already installed here:' -ForegroundColor White
    Write-Dim "  $Destination"
    if ($installed) { Write-Dim "  version $($installed.Substring(0,7))" }

    $running = Get-NetTCPConnection -LocalPort (Read-AgentPort -Destination $Destination) `
        -State Listen -ErrorAction SilentlyContinue
    if ($running) { Write-Ok '  The agent is running.' } else { Write-Warn2 '  The agent is not running.' }

    Write-Host ''
    Write-Host '   1  Update to the latest version' -ForegroundColor White
    Write-Host '   2  Repair  ' -ForegroundColor White -NoNewline
    Write-Dim '(reinstall, re-register, restart)'
    Write-Host '   3  Show the pairing code' -ForegroundColor White
    Write-Host '   4  New pairing code  ' -ForegroundColor White -NoNewline
    Write-Dim '(revokes the old one)'
    Write-Host '   5  Remove Reveille' -ForegroundColor White
    Write-Host '   Q  Quit' -ForegroundColor White
    Write-Host ''

    $choice = Read-Host '  Choose'
    switch ($choice.Trim().ToUpper()) {
        '1' { return 'update' }
        '2' { return 'repair' }
        '3' { return 'pair' }
        '4' { return 'rotate' }
        '5' { return 'remove' }
        'Q' { return 'quit' }
        default {
            Write-Warn2 '  Not one of the options.'
            return 'quit'
        }
    }
}

function Show-PairingCode {
    param([string]$Destination, [string]$NodePath)
    Push-Location $Destination
    try { & $NodePath 'pair.js' } finally { Pop-Location }
}

# --------------------------------------------------- execution policy --

<#
    Reveille does not need PowerShell's execution policy changed: the one thing
    that would have tripped over it, npm, is called through npm.cmd instead.

    But the helper scripts here are .ps1 files, and a machine on the Windows
    default refuses to run those at all. Worth saying once, plainly, rather
    than letting someone hit it later and assume the install was broken.
#>
function Show-PolicyNote {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -notin @('Restricted', 'AllSigned', 'Undefined')) { return }

    $effective = Get-ExecutionPolicy
    if ($effective -notin @('Restricted', 'AllSigned')) { return }

    Write-Host ''
    Write-Warn2 '  Windows is set to block PowerShell script files on this PC.'
    Write-Dim   '  Reveille works anyway -- nothing it installs needs that changed.'
    Write-Dim   '  It only matters if you later want to run one of the .ps1 helper'
    Write-Dim   '  scripts here by hand. If you do, this allows your own scripts'
    Write-Dim   '  while still requiring downloaded ones to be signed:'
    Write-Host ''
    Write-Dim   '    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned'
    Write-Host ''
}

# ---------------------------------------------------------------------- main --

if ($Uninstall) { Invoke-Uninstall; return }

Write-Banner

$nodePath = Resolve-Node

# An existing install and no flags means the user typed the one-line command
# again on purpose. Ask what they want rather than assuming.
#
# node_modules, not package.json: the files are copied into place before npm
# runs, so a run that died during npm leaves a folder that looks installed but
# cannot start. Offering that person a menu is the wrong answer -- they just
# want the install to finish, so fall through and finish it.
$alreadyInstalled = (Test-Path (Join-Path $InstallDir 'package.json')) -and
                    (Test-Path (Join-Path $InstallDir 'node_modules'))
$repairing = $false
if ($alreadyInstalled -and -not $Firmware -and -not $NoAutoStart -and
    -not $NoPair -and [Environment]::UserInteractive) {

    switch (Show-Menu -Destination $InstallDir) {
        'quit'   { Write-Host ''; return }
        'remove' { Invoke-Uninstall; return }
        'pair'   { Show-PairingCode -Destination $InstallDir -NodePath $nodePath; return }
        'rotate' {
            if (Reset-Token -Destination $InstallDir) {
                Show-PairingCode -Destination $InstallDir -NodePath $nodePath
            }
            return
        }
        'repair' { $repairing = $true; Write-Host '' }
        'update' { Write-Host '' }
    }
}
Get-AgentFiles -Destination $InstallDir

Write-Step 'Installing what it needs...'
Push-Location $InstallDir
try {
    # npm.cmd, not npm. In PowerShell `npm` resolves to npm.ps1, and a fresh
    # Windows install refuses to run any .ps1 at all -- "cannot be loaded
    # because running scripts is disabled on this system". The .cmd shim does
    # the same job and no execution policy applies to it, so the installer
    # works on a machine whose settings have never been touched.
    & npm.cmd install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Check your internet connection and try again.' }
} finally {
    Pop-Location
}

if ($NoAutoStart) {
    Write-Dim 'skipping the start-at-login step, as asked'
} else {
    Write-Step $(if ($repairing) { 'Re-registering the start-at-login task...' }
                 else { 'Setting it to start with Windows...' })
    Register-Agent -Destination $InstallDir
}

Write-Step 'Starting the agent...'
Stop-WhateverHoldsThePort -Port (Read-AgentPort -Destination $InstallDir)

if ($NoAutoStart) {
    Start-Process wscript.exe -ArgumentList "`"$(Join-Path $InstallDir 'start-agent-hidden.vbs')`"" -WorkingDirectory $InstallDir
} else {
    Start-ScheduledTask -TaskName $TaskName
}

$health = Test-Agent -Destination $InstallDir
if (-not $health) {
    Write-Host ''
    Write-Warn2 'The agent did not answer. Something is wrong.'
    Write-Warn2 "Run this to see why:  cd `"$InstallDir`"; node src\index.js"
    Write-Host ''
    exit 1
}

# Ask rather than expecting anyone to have known about a flag.
if ($Firmware) {
    Install-FirmwareTask -Destination $InstallDir
} elseif (-not $NoFirmware) {
    if (Confirm-Firmware) {
        Install-FirmwareTask -Destination $InstallDir
    } else {
        Write-Dim 'Skipped. Run this again any time to add it.'
    }
}

if ($LockScreen) {
    Install-PresenceTask -Destination $InstallDir
} elseif (-not $NoLockScreen) {
    if (Confirm-Presence) {
        Install-PresenceTask -Destination $InstallDir
    } else {
        Write-Dim 'Skipped. Run this again any time to add it.'
    }
}

# Windows Firewall prompts on first listen; if it was dismissed, say so rather
# than letting the phone fail with a silent timeout.
$blocked = -not (Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match 'node' -and $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' -and $_.Direction -eq 'Inbound' })

Write-Host ''
Write-Ok "Done. $($health.hostname) is ready."
Write-Host ''
Write-Dim 'Addresses this PC can be reached on:'
foreach ($i in $health.interfaces) {
    Write-Host ("   {0,-14} {1,-15} {2}" -f $i.interface, $i.ip, $i.mac.ToUpper()) -ForegroundColor Gray
}
Write-Host ''

if ($blocked) {
    Write-Warn2 'Windows Firewall has no rule allowing Node.js in. If the phone'
    Write-Warn2 'cannot connect, allow it when Windows asks, or add it manually.'
    Write-Host ''
}

Write-Host '  Get the Android app:' -ForegroundColor White
Write-Dim "  https://github.com/$Repo/releases/latest"
Write-Host ''
Write-Host '  Or use any browser -- iPhone, iPad, laptop:' -ForegroundColor White
$primary = $health.interfaces | Select-Object -First 1
if ($primary) {
    Write-Dim "  http://$($primary.ip):$(Read-AgentPort -Destination $InstallDir)"
    Write-Dim '  (everything except Wake, which a browser is not allowed to send)'
}
Write-Host ''
Show-PolicyNote

Write-Host '  To show the pairing code again later:' -ForegroundColor White
Write-Dim "  cd `"$InstallDir`"; node pair.js"
Write-Host ''

if (-not $NoPair) {
    Write-Step 'Opening the pairing code...'
    Push-Location $InstallDir
    try { & $nodePath 'pair.js' } finally { Pop-Location }
}
