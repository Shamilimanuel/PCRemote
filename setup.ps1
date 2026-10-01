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
        & ([scriptblock]::Create((irm <url>))) -Console

    On a desktop it opens as a window. -Console, or any of the scripted options
    above, gets the text version instead -- as does a run with no desktop at
    all, over SSH or on Server Core.

    Installing also makes a command, so afterwards typing

        reveille

    in PowerShell (or cmd, or Win+R) opens the window again.

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
    [switch]$NoLockScreen,
    # The text version, even where a window could open.
    [switch]$Console
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
    Remove-Reveille
}

# The work of removing, without the banner: the window's worker calls this.
function Remove-Reveille {
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
    Remove-ReveilleCommand

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
        throw 'Node.js was installed, but this session cannot see it yet.'
    }

    Write-Host ''
    Write-Warn2 'Install Node.js first, then run this again:'
    Write-Warn2 '  https://nodejs.org  (take the LTS download)'
    Write-Host ''
    # Thrown rather than exit: the window runs this in a worker, and an exit
    # there would end the worker without a word about why.
    throw 'Node.js is not installed and winget is not available to install it.'
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

# ------------------------------------------------------------- the install --

<#
    Downloads the agent, installs what it needs, registers it to start at log
    on, starts it, and waits for it to answer. Returns the agent's /health
    reply, or $null if it never answered.

    One function so the terminal and the window run exactly the same steps --
    the window calls this from its worker and shows each Write-Step as a line
    of its progress log.
#>
function Install-Reveille {
    param([string]$Destination, [switch]$Repairing, [switch]$NoAutoStart)

    Get-AgentFiles -Destination $Destination

    Write-Step 'Installing what it needs...'
    Push-Location $Destination
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
        Write-Step $(if ($Repairing) { 'Re-registering the start-at-login task...' }
                     else { 'Setting it to start with Windows...' })
        Register-Agent -Destination $Destination
    }

    Write-Step 'Starting the agent...'
    Stop-WhateverHoldsThePort -Port (Read-AgentPort -Destination $Destination)

    if ($NoAutoStart) {
        Start-Process wscript.exe -ArgumentList "`"$(Join-Path $Destination 'start-agent-hidden.vbs')`"" -WorkingDirectory $Destination
    } else {
        Start-ScheduledTask -TaskName $TaskName
    }

    Write-Step 'Waiting for it to answer...'
    return (Test-Agent -Destination $Destination)
}

# ------------------------------------------------- turning the extras off --

<#
    Removes one of the two administrator-created tasks.

    Creating them needed administrator, and so does removing them: a task an
    administrator registered is not one an ordinary user may delete. So this
    tries once as it stands, and asks Windows for elevation only if that is
    refused. The command it elevates is built here and passed encoded, so no
    quoting can turn it into something else.
#>
function Remove-AdminTask {
    param([string]$Name, [switch]$Firewall)

    if (-not (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue)) { return $true }

    $command = "Stop-ScheduledTask -TaskName '$Name' -ErrorAction SilentlyContinue; " +
               "Unregister-ScheduledTask -TaskName '$Name' -Confirm:`$false"
    if ($Firewall) {
        $command += "; Get-NetFirewallRule -DisplayName 'Reveille lock-screen responder' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue"
    }

    try {
        Invoke-Expression $command
        return $true
    } catch {
        Write-Step 'Removing it needs administrator approval once...'
    }

    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    try {
        $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden `
            -ArgumentList '-NoProfile', '-EncodedCommand', $encoded
    } catch {
        # Saying no to the Windows prompt lands here.
        return $false
    }
    return (-not (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue))
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

    return (Invoke-TokenReset -Destination $Destination)
}

<#
    The work half of Reset-Token, without the question. The window asks in its
    own way and then calls this.
#>
function Invoke-TokenReset {
    param([string]$Destination)

    $configPath = Join-Path $Destination 'config.json'
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

# -------------------------------------------------------------- the command --

<#
    Makes "reveille" a command, the way Housecall does it: a small .cmd file in
    %LOCALAPPDATA%\Microsoft\WindowsApps, a folder Windows already puts on the
    PATH. Typed in PowerShell, in cmd or in Win+R, it runs this same script
    from GitHub again -- so it always opens the newest version of the window.

    Nothing else changes: no profile, no execution policy. The command is a
    one-off process that fetches this file and runs it, exactly as the
    one-line install does. Removing Reveille removes it again.

    reveile.cmd as well, with one L: the spelling people type first.
#>
$script:RvCommandNames = @('reveille', 'reveile')

function Install-ReveilleCommand {
    $folder = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    if (-not (Test-Path $folder)) { return $false }

    # A copy installed somewhere other than the default has to be told where.
    # A path cmd would mangle (% or ") is left out; the window still finds the
    # default location, and such a path is rare enough not to design for.
    $where = ''
    if ($InstallDir -ne (Join-Path $env:LOCALAPPDATA 'Reveille') -and $InstallDir -notmatch '[%"]') {
        $where = " -Path '" + ($InstallDir -replace "'", "''") + "'"
    }

    $lines = @(
        '@echo off'
        'rem Reveille. Made by the Reveille installer, and removed with it.'
        'rem Opens the Reveille window. "reveille -Console" gives the text version.'
        ('powershell.exe -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = ' +
         '[Net.ServicePointManager]::SecurityProtocol -bor 3072; ' +
         "& ([scriptblock]::Create((irm 'https://github.com/$Repo/raw/$Branch/setup.ps1')))$where %*" + '"')
    )
    $text = ($lines -join "`r`n") + "`r`n"
    try {
        foreach ($name in $script:RvCommandNames) {
            [IO.File]::WriteAllText((Join-Path $folder "$name.cmd"), $text, (New-Object Text.ASCIIEncoding))
        }
    } catch {
        return $false
    }
    Write-Dim 'type reveille in PowerShell to open this again'
    return $true
}

function Remove-ReveilleCommand {
    $folder = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    foreach ($name in $script:RvCommandNames) {
        $file = Join-Path $folder "$name.cmd"
        # Only ever our own file: something else called reveille.cmd is left be.
        if ((Test-Path $file) -and ((Get-Content $file -Raw) -match 'Made by the Reveille installer')) {
            Remove-Item $file -Force -ErrorAction SilentlyContinue
        }
    }
}

# --------------------------------------------------------- what the window shows --

<#
    Everything the window's installed pages show, gathered in one go by the
    worker so the window never waits on the network or on node.

    The pairing values come from pair.js --json rather than being read from
    config.json here: pair.js already knows which adapter is the primary one
    and how to encode the code, and a second copy of either would drift.
#>
function Get-RvStatus {
    param([string]$Destination)

    # Native programs writing to stderr must not end the job.
    $ErrorActionPreference = 'Continue'

    $port = Read-AgentPort -Destination $Destination
    $s = @{
        Port = $port; Running = $false; Since = $null
        Pair = $null; PairError = $null
        Firmware = [bool](Get-ScheduledTask -TaskName $FirmwareTask -ErrorAction SilentlyContinue)
        Presence = [bool](Get-ScheduledTask -TaskName $PresenceTask -ErrorAction SilentlyContinue)
        Uefi = (Test-Uefi); Sha = $null; Ahead = $null; Compared = $false
    }

    $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listen) {
        $s.Running = $true
        try { $s.Since = (Get-Process -Id $listen.OwningProcess -ErrorAction Stop).StartTime } catch { }
    }
    $s.PresenceRunning = [bool](Get-NetTCPConnection -LocalPort ($port + 1) -State Listen -ErrorAction SilentlyContinue)

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node -and (Test-Path (Join-Path $Destination 'pair.js'))) {
        Push-Location $Destination
        try {
            $raw = (& $node.Source 'pair.js' '--json' 2>$null) -join "`n"
        } finally {
            Pop-Location
        }
        try {
            $s.Pair = $raw | ConvertFrom-Json
            if (-not $s.Pair.token) { $s.Pair = $null; $s.PairError = 'missing' }
        } catch {
            # A copy from before --json existed prints its terminal card instead.
            $s.PairError = 'old'
        }
    } else {
        $s.PairError = 'missing'
    }

    $stamp = Join-Path $Destination 'installed.json'
    if (Test-Path $stamp) {
        try { $s.Sha = (Get-Content $stamp -Raw | ConvertFrom-Json).sha } catch { }
    }
    if ($s.Sha) {
        try {
            $compare = Invoke-RestMethod "https://api.github.com/repos/$Repo/compare/$($s.Sha)...$Branch" `
                -Headers @{ 'User-Agent' = 'reveille-setup' } -TimeoutSec 8
            $s.Ahead = [int]$compare.ahead_by
            $s.Compared = $true
        } catch { }
    }
    return $s
}

<#
    The walkthrough's second step: looks, changes nothing. What it finds
    decides whether Install can be pressed at all.
#>
function Get-RvChecks {
    $ErrorActionPreference = 'Continue'
    $r = @{ Windows = 'Windows'; NodeVersion = $null; NodeOk = $false; Winget = $false
            Adapter = $null; Ip = $null; Port = (Read-AgentPort -Destination $InstallDir); PortOwner = $null; PortOurs = $false }

    try { $r.Windows = (Get-CimInstance Win32_OperatingSystem).Caption -replace '^Microsoft\s+', '' } catch { }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        try { $r.NodeVersion = "$(& $node.Source --version)".Trim().TrimStart('v') } catch { }
    }
    if ($r.NodeVersion) { $r.NodeOk = [int](($r.NodeVersion -split '\.')[0]) -ge 20 }
    $r.Winget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

    $net = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
    if ($net) {
        $r.Adapter = $net.InterfaceAlias
        $r.Ip = @($net.IPv4Address)[0].IPAddress
    }

    $listen = Get-NetTCPConnection -LocalPort $r.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listen) {
        $proc = Get-Process -Id $listen.OwningProcess -ErrorAction SilentlyContinue
        $r.PortOwner = if ($proc) { $proc.ProcessName } else { "pid $($listen.OwningProcess)" }
        $r.PortOurs = $r.PortOwner -eq 'node'
    }
    return $r
}

# ---------------------------------------------------------------- the window --

<#
    The window the one-line command opens on a desktop. It is WPF, built
    straight from PowerShell with nothing extra to download, the same way
    Housecall's is -- close it and nothing is left running.

    Anything slow (downloading, npm, asking Windows for administrator) runs in
    one worker runspace, so the window keeps painting. The worker gets this
    script's own functions, so the window and the terminal run exactly the
    same steps; each Write-Step the worker prints becomes a line of the
    window's log as it happens.

    No administrator is asked for by opening it. Only turning on one of the two
    extras does, at the moment it is clicked, after saying what it grants.
#>

# Text in the window, English and Dutch. This file is plain ASCII (see the
# banner), so anything else is written \uXXXX and decoded once at start.
$script:RvStrings = @{
    en = @{
        brandSetup = 'Setup'; brandFirst = 'First install'
        'nav.pair' = 'Pair a phone'; 'nav.pc' = 'This PC'; 'nav.perms' = 'Permissions'; 'nav.maint' = 'Maintenance'
        agentOn = 'Agent running \u00b7 port {0}'; agentOff = 'Agent not running'; agentNone = 'Not installed yet'
        agentLooking = 'Looking\u2026'; themeTip = 'Light or dark'; refresh = 'Refresh'

        pairTitle = 'Pair a phone'
        pairSub = 'Two codes, in order. The first gets the app onto the phone; the second tells the app where this PC is, so there is nothing to type.'
        appTitle = 'Get the app'
        appHow = 'Point the phone\u2019s own camera at it. It downloads the newest Reveille, so this code never goes out of date.'
        appAside = 'Already have the app? Go straight to 2.'
        linkTitle = 'Pair this PC'
        scanHow = 'Inside Reveille: tap **+ Add PC**, then **Scan code**. It carries the address, the port and the pairing code.'
        colourNote = 'Different colours on purpose: the orange one is for the phone\u2019s camera, the blue one is for the Reveille app.'
        typeHead = 'OR TYPE THESE IN'; name = 'Name'; address = 'Address'; port = 'Port'; token = 'Pairing code'; mac = 'MAC'
        show = 'Show'; hide = 'Hide'; copy = 'Copy'; copied = 'Copied'
        tokenWarn = 'That pairing code is the password to this PC. Anyone who has it can shut it down \u2014 don\u2019t share it or photograph it for someone else.'
        newCode = 'New pairing code'; browser = 'Open in a browser'
        pairLoading = 'Reading the pairing code\u2026'
        pairOld = 'This copy of Reveille is too old to show its code here. Update it under Maintenance and the code appears.'
        pairMissing = 'The pairing code could not be read. Repair, under Maintenance, usually fixes that.'
        pairNoNet = 'This PC has no network address right now. Connect Wi-Fi or Ethernet, then click Refresh.'

        pcTitle = 'This PC'; pcSub = 'What is installed, what is running, and whether it is up to date.'
        agent = 'Agent'; running = 'Running'; stopped = 'Not running'
        agentMeta = 'Port {0} \u00b7 since {1}'; agentMetaPort = 'Port {0}'; agentMetaOff = 'Repair, under Maintenance, starts it again.'
        lockResp = 'Lock-screen answer'; on = 'On'; off = 'Off'; setUp = 'Set up'; notSet = 'Not set up'
        lockMetaOn = 'Port {0} \u00b7 answers before sign-in'; lockMetaOff = 'Can be turned on under Permissions.'
        bios = 'Reboot to BIOS'; allowed = 'Allowed'; biosMeta = 'One scheduled task, nothing more'
        biosLegacy = 'Not possible'; biosLegacyMeta = 'This PC starts in legacy BIOS mode.'
        version = 'Version'; upToDate = 'Up to date'; updAvail = '{0} changes available'; updOne = '1 change available'
        verUnknown = 'Unknown'; verMeta = 'Installed from {0}'; verMetaNone = 'No version recorded. Update records one.'
        verOffline = 'Installed from {0} \u00b7 GitHub could not be reached to compare'
        network = 'NETWORK'; adapter = 'Adapter'; ip = 'Address'; macH = 'MAC'; primary = 'Used for waking'; other = 'Other'
        wolNote = 'Wake-on-LAN itself is a BIOS setting and can\u2019t be checked from here. If Wake does nothing, that is the first place to look.'

        permsTitle = 'Permissions'
        permsSub = 'Both are optional and both need administrator once. Each one says what it grants before it asks.'
        biosDesc = 'Adds a button to the app that restarts this PC straight into its BIOS or firmware settings.'
        grants = 'Grants'; notGrant = 'Doesn\u2019t grant'; needs = 'Needs'
        biosGrants = 'One scheduled task that runs `shutdown /r /fw`.'
        biosNot = 'The agent can start that task. It can\u2019t change what it runs.'
        admin = 'Administrator, once'
        lockTitle = 'Answer at the lock screen'
        lockDesc = 'Lets the app see this PC is on while it still sits at the sign-in screen, instead of showing it as off until someone logs in.'
        lockGrants = 'A small responder on port {0} that answers \u201cI\u2019m on\u201d.'
        lockNot = 'It can\u2019t shut down, lock or read anything \u2014 it contains no code that could.'
        biosNoUefi = 'This PC starts in legacy BIOS mode, so Windows can\u2019t restart it into its settings. There is nothing to turn on.'
        permAsk = 'Windows asks for permission now. Say yes in its window to go ahead.'
        permOn = '{0} is on.'; permOff = '{0} is off.'; permDenied = 'Windows did not get permission, so nothing changed.'

        maintTitle = 'Maintenance'; maintSub = 'Everything the one-line command used to ask about in a menu.'
        update = 'Update'; updateDesc = '{0} changes since this copy was installed. Keeps the pairing code, so paired phones keep working.'
        updateDescOne = '1 change since this copy was installed. Keeps the pairing code, so paired phones keep working.'
        updateDescNone = 'This copy is up to date. Running it anyway reinstalls the newest version and keeps the pairing code.'
        repair = 'Repair'; repairDesc = 'Reinstalls, re-registers and restarts the agent. Use it when the app can\u2019t reach this PC.'
        rotate = 'New pairing code'; rotateBtn = 'Replace'
        rotateDesc = 'Every paired phone stops working until it scans the new code. That is the point, if the old one was seen.'
        remove = 'Remove Reveille'; removeBtn = 'Remove'; removeDesc = 'Stops the agent and deletes it from this PC. The app on your phone stays.'
        cancel = 'Cancel'; confirmRotate = 'Replace the code'; confirmRemove = 'Remove'
        sureRotate = 'Phones paired with the current code will need to scan again.'
        sureRemove = 'Reveille will stop answering and be deleted from this PC.'
        cmdHint = 'Next time, type **reveille** in PowerShell to open this window.'
        doneUpdate = 'Updated. Paired phones keep working.'; doneRepair = 'Repaired. The agent is answering again.'
        doneRotate = 'New pairing code issued. Scan it again on every phone.'; doneRemove = 'Reveille was removed from this PC.'
        noAnswer = 'The agent did not answer. Try Repair. If that fails too, run node src/index.js in {0} to see why.'
        failed = 'That did not work: {0}'; busyClose = 'Wait for this to finish before closing.'
        wUpdate = 'Updating'; wRepair = 'Repairing'; wRotate = 'Issuing a new pairing code'; wRemove = 'Removing Reveille'

        s1 = 'Get the app'; s2 = 'Check'; s3 = 'Install'; s4 = 'Extras'; s5 = 'Pair'
        appStepTitle = 'First, get the app on the phone'
        appStepSub = 'Setup ends with the phone scanning this PC, so the app needs to be on it first. It can download while the next steps get this PC ready.'
        appStepAside = 'Already have it? Just continue.'
        haveIt = 'I have the app \u2014 continue'
        checkTitle = 'Checking this PC'; checkSub = 'Nothing has been changed yet. This only looks.'
        checking = 'Looking\u2026'
        nodeName = 'Node.js {0}'; nodeNone = 'Node.js'
        nodeOk = 'already installed'; nodeOld = 'too old \u2014 a newer one is installed with winget'
        nodeWinget = 'not installed yet \u2014 it is installed with winget'
        nodeBlocked = 'not installed, and this PC has no winget to install it. Install the LTS version from nodejs.org, then check again.'
        networkName = 'Network'; noNetwork = 'not connected. Connect Wi-Fi or Ethernet, then check again.'
        portName = 'Port {0}'; portFree = 'free'; portHeld = 'in use by {0} \u2014 it will be stopped'
        portOwn = 'in use by an older copy \u2014 it will be replaced'
        checkAgain = 'Check again'; installBtn = 'Install'
        installTitle = 'Installing'; installSub = 'About half a minute. No administrator needed for any of this.'
        installDone = 'Installed, and answering on port {0}.'
        installFailed = 'The install stopped: {0}'; tryAgain = 'Try again'
        next = 'Continue'; back = 'Back'
        extrasTitle = 'Two optional extras'
        extrasSub = 'Both are off unless you turn them on. You can change either later under Permissions.'
        extrasApplying = 'Setting up what you turned on. Windows asks for permission once for each.'
        pairNow = 'Pair your phone'
        pairNowSub = 'Open Reveille on the phone and scan this. It carries the address, the port and the pairing code, so there is nothing to type.'
        finish = 'Finish'
    }
    nl = @{
        brandSetup = 'Installatie'; brandFirst = 'Eerste installatie'
        'nav.pair' = 'Telefoon koppelen'; 'nav.pc' = 'Deze pc'; 'nav.perms' = 'Toestemmingen'; 'nav.maint' = 'Onderhoud'
        agentOn = 'Agent draait \u00b7 poort {0}'; agentOff = 'Agent draait niet'; agentNone = 'Nog niet ge\u00efnstalleerd'
        agentLooking = 'Kijken\u2026'; themeTip = 'Licht of donker'; refresh = 'Vernieuwen'

        pairTitle = 'Telefoon koppelen'
        pairSub = 'Twee codes, op volgorde. De eerste zet de app op de telefoon; de tweede vertelt de app waar deze pc is, dus je hoeft niets over te typen.'
        appTitle = 'Download de app'
        appHow = 'Richt de gewone camera van je telefoon erop. Hij downloadt de nieuwste Reveille, dus deze code verloopt nooit.'
        appAside = 'Heb je de app al? Ga meteen naar 2.'
        linkTitle = 'Koppel deze pc'
        scanHow = 'In Reveille: tik op **+ Pc toevoegen** en dan op **Code scannen**. Het adres, de poort en de koppelcode zitten erin.'
        colourNote = 'Verschillende kleuren met opzet: de oranje is voor de camera van je telefoon, de blauwe voor de Reveille-app.'
        typeHead = 'OF TYP ZE OVER'; name = 'Naam'; address = 'Adres'; port = 'Poort'; token = 'Koppelcode'; mac = 'MAC'
        show = 'Toon'; hide = 'Verberg'; copy = 'Kopieer'; copied = 'Gekopieerd'
        tokenWarn = 'Die koppelcode is het wachtwoord van deze pc. Wie hem heeft, kan de pc uitzetten \u2014 deel hem niet en maak er geen foto van voor een ander.'
        newCode = 'Nieuwe koppelcode'; browser = 'Openen in een browser'
        pairLoading = 'De koppelcode lezen\u2026'
        pairOld = 'Deze kopie van Reveille is te oud om de code hier te tonen. Werk hem bij onder Onderhoud, dan verschijnt de code.'
        pairMissing = 'De koppelcode kon niet gelezen worden. Repareren, onder Onderhoud, lost dat meestal op.'
        pairNoNet = 'Deze pc heeft nu geen netwerkadres. Maak verbinding met wifi of ethernet en klik dan op Vernieuwen.'

        pcTitle = 'Deze pc'; pcSub = 'Wat er ge\u00efnstalleerd is, wat er draait en of het bijgewerkt is.'
        agent = 'Agent'; running = 'Draait'; stopped = 'Draait niet'
        agentMeta = 'Poort {0} \u00b7 sinds {1}'; agentMetaPort = 'Poort {0}'; agentMetaOff = 'Repareren, onder Onderhoud, start hem weer.'
        lockResp = 'Antwoord op vergrendelscherm'; on = 'Aan'; off = 'Uit'; setUp = 'Ingesteld'; notSet = 'Niet ingesteld'
        lockMetaOn = 'Poort {0} \u00b7 antwoordt v\u00f3\u00f3r het inloggen'; lockMetaOff = 'Kan aangezet worden onder Toestemmingen.'
        bios = 'Herstarten naar BIOS'; allowed = 'Toegestaan'; biosMeta = 'E\u00e9n geplande taak, verder niets'
        biosLegacy = 'Niet mogelijk'; biosLegacyMeta = 'Deze pc start in de oude BIOS-modus.'
        version = 'Versie'; upToDate = 'Bijgewerkt'; updAvail = '{0} wijzigingen beschikbaar'; updOne = '1 wijziging beschikbaar'
        verUnknown = 'Onbekend'; verMeta = 'Ge\u00efnstalleerd vanaf {0}'; verMetaNone = 'Geen versie bekend. Bijwerken legt er een vast.'
        verOffline = 'Ge\u00efnstalleerd vanaf {0} \u00b7 GitHub was niet bereikbaar om te vergelijken'
        network = 'NETWERK'; adapter = 'Adapter'; ip = 'Adres'; macH = 'MAC'; primary = 'Gebruikt om te wekken'; other = 'Overig'
        wolNote = 'Wake-on-LAN zelf is een BIOS-instelling en kan hier niet gecontroleerd worden. Doet Wekken niets, kijk dan daar eerst.'

        permsTitle = 'Toestemmingen'
        permsSub = 'Allebei optioneel en allebei \u00e9\u00e9n keer beheerdersrechten nodig. Elk zegt eerst wat het toestaat.'
        biosDesc = 'Voegt een knop toe aan de app die deze pc rechtstreeks naar het BIOS of de firmware-instellingen herstart.'
        grants = 'Staat toe'; notGrant = 'Staat niet toe'; needs = 'Nodig'
        biosGrants = 'E\u00e9n geplande taak die `shutdown /r /fw` uitvoert.'
        biosNot = 'De agent kan die taak starten, maar niet veranderen wat hij doet.'
        admin = 'Beheerdersrechten, \u00e9\u00e9n keer'
        lockTitle = 'Antwoorden op het vergrendelscherm'
        lockDesc = 'Laat de app zien dat deze pc aan staat terwijl hij nog op het aanmeldscherm staat, in plaats van \u201cuit\u201d tot iemand inlogt.'
        lockGrants = 'Een kleine responder op poort {0} die \u201cik sta aan\u201d antwoordt.'
        lockNot = 'Hij kan niets uitzetten, vergrendelen of lezen \u2014 er zit geen code in die dat kan.'
        biosNoUefi = 'Deze pc start in de oude BIOS-modus, dus Windows kan hem niet naar de instellingen herstarten. Er is niets aan te zetten.'
        permAsk = 'Windows vraagt nu om toestemming. Zeg ja in dat venster om door te gaan.'
        permOn = '{0} staat aan.'; permOff = '{0} staat uit.'; permDenied = 'Windows kreeg geen toestemming, dus er is niets veranderd.'

        maintTitle = 'Onderhoud'; maintSub = 'Alles wat het eenregelige commando vroeger in een menu vroeg.'
        update = 'Bijwerken'; updateDesc = '{0} wijzigingen sinds deze kopie is ge\u00efnstalleerd. De koppelcode blijft, dus gekoppelde telefoons blijven werken.'
        updateDescOne = '1 wijziging sinds deze kopie is ge\u00efnstalleerd. De koppelcode blijft, dus gekoppelde telefoons blijven werken.'
        updateDescNone = 'Deze kopie is bijgewerkt. Toch uitvoeren installeert de nieuwste versie opnieuw en houdt de koppelcode.'
        repair = 'Repareren'; repairDesc = 'Installeert, registreert en start de agent opnieuw. Gebruik dit als de app deze pc niet bereikt.'
        rotate = 'Nieuwe koppelcode'; rotateBtn = 'Vervangen'
        rotateDesc = 'Elke gekoppelde telefoon werkt pas weer als hij de nieuwe code scant. Precies de bedoeling als de oude gezien is.'
        remove = 'Reveille verwijderen'; removeBtn = 'Verwijderen'; removeDesc = 'Stopt de agent en verwijdert hem van deze pc. De app op je telefoon blijft.'
        cancel = 'Annuleren'; confirmRotate = 'Code vervangen'; confirmRemove = 'Verwijderen'
        sureRotate = 'Telefoons met de huidige code moeten opnieuw scannen.'
        sureRemove = 'Reveille antwoordt dan niet meer en wordt van deze pc verwijderd.'
        cmdHint = 'Typ de volgende keer **reveille** in PowerShell om dit venster te openen.'
        doneUpdate = 'Bijgewerkt. Gekoppelde telefoons blijven werken.'; doneRepair = 'Gerepareerd. De agent antwoordt weer.'
        doneRotate = 'Nieuwe koppelcode uitgegeven. Scan hem opnieuw op elke telefoon.'; doneRemove = 'Reveille is van deze pc verwijderd.'
        noAnswer = 'De agent antwoordde niet. Probeer Repareren. Lukt dat ook niet, voer dan node src/index.js uit in {0} om te zien waarom.'
        failed = 'Dat lukte niet: {0}'; busyClose = 'Wacht tot dit klaar is voordat je sluit.'
        wUpdate = 'Bijwerken'; wRepair = 'Repareren'; wRotate = 'Nieuwe koppelcode uitgeven'; wRemove = 'Reveille verwijderen'

        s1 = 'App downloaden'; s2 = 'Controle'; s3 = 'Installeren'; s4 = 'Extra\u2019s'; s5 = 'Koppelen'
        appStepTitle = 'Eerst de app op je telefoon'
        appStepSub = 'De installatie eindigt met je telefoon die deze pc scant, dus de app moet er eerst op. Hij kan downloaden terwijl de volgende stappen deze pc klaarmaken.'
        appStepAside = 'Heb je hem al? Ga gewoon verder.'
        haveIt = 'Ik heb de app \u2014 verder'
        checkTitle = 'Deze pc controleren'; checkSub = 'Er is nog niets veranderd. Dit kijkt alleen.'
        checking = 'Kijken\u2026'
        nodeName = 'Node.js {0}'; nodeNone = 'Node.js'
        nodeOk = 'al ge\u00efnstalleerd'; nodeOld = 'te oud \u2014 een nieuwere wordt ge\u00efnstalleerd met winget'
        nodeWinget = 'nog niet ge\u00efnstalleerd \u2014 wordt ge\u00efnstalleerd met winget'
        nodeBlocked = 'niet ge\u00efnstalleerd, en deze pc heeft geen winget om het te installeren. Installeer de LTS-versie van nodejs.org en controleer dan opnieuw.'
        networkName = 'Netwerk'; noNetwork = 'geen verbinding. Maak verbinding met wifi of ethernet en controleer dan opnieuw.'
        portName = 'Poort {0}'; portFree = 'vrij'; portHeld = 'in gebruik door {0} \u2014 wordt gestopt'
        portOwn = 'in gebruik door een oudere kopie \u2014 wordt vervangen'
        checkAgain = 'Opnieuw controleren'; installBtn = 'Installeren'
        installTitle = 'Bezig met installeren'; installSub = 'Ongeveer een halve minuut. Hiervoor zijn geen beheerdersrechten nodig.'
        installDone = 'Ge\u00efnstalleerd, en antwoordt op poort {0}.'
        installFailed = 'De installatie stopte: {0}'; tryAgain = 'Opnieuw proberen'
        next = 'Verder'; back = 'Terug'
        extrasTitle = 'Twee optionele extra\u2019s'
        extrasSub = 'Allebei uit, tenzij je ze aanzet. Je kunt het later wijzigen onder Toestemmingen.'
        extrasApplying = 'Instellen wat je hebt aangezet. Windows vraagt voor elk \u00e9\u00e9n keer om toestemming.'
        pairNow = 'Koppel je telefoon'
        pairNowSub = 'Open Reveille op je telefoon en scan dit. Het adres, de poort en de koppelcode zitten erin, dus je hoeft niets over te typen.'
        finish = 'Klaar'
    }
}

# The worker's log lines are the terminal's own Write-Step text; these are
# what they say in Dutch. Anything not here is shown as it is.
$script:RvLogNl = @{
    'Downloading the agent...' = 'De agent downloaden\u2026'
    'Installing what it needs...' = 'Installeren wat nodig is\u2026'
    'Setting it to start with Windows...' = 'Laten starten met Windows\u2026'
    'Re-registering the start-at-login task...' = 'De starttaak opnieuw registreren\u2026'
    'Starting the agent...' = 'De agent starten\u2026'
    'Waiting for it to answer...' = 'Wachten tot hij antwoordt\u2026'
    'Node.js is not installed. It is what runs the agent.' = 'Node.js is niet ge\u00efnstalleerd; dat is wat de agent draait.'
    'Installing Node.js via winget...' = 'Node.js installeren via winget\u2026'
    'Node.js installed.' = 'Node.js ge\u00efnstalleerd.'
    'keeping your existing token' = 'je bestaande koppelcode blijft'
    'starts automatically when you log in' = 'start vanzelf als je inlogt'
    'type reveille in PowerShell to open this again' = 'typ reveille in PowerShell om dit weer te openen'
    'New pairing code issued.' = 'Nieuwe koppelcode uitgegeven.'
    'Restarting so the new code takes effect...' = 'Opnieuw starten zodat de nieuwe code werkt\u2026'
    'Removing Reveille...' = 'Reveille verwijderen\u2026'
    'Reveille removed.' = 'Reveille verwijderd.'
    'The app on your phone can be uninstalled the normal way.' = 'De app op je telefoon verwijder je op de gewone manier.'
    'Removing it needs administrator approval once...' = 'Verwijderen vraagt \u00e9\u00e9n keer om beheerdersrechten\u2026'
    'Reboot-to-BIOS needs administrator approval once...' = 'Herstarten naar BIOS vraagt \u00e9\u00e9n keer om beheerdersrechten\u2026'
    'Reboot to BIOS is available.' = 'Herstarten naar BIOS is beschikbaar.'
    'Reboot to BIOS was not set up. Everything else still works.' = 'Herstarten naar BIOS is niet ingesteld. De rest werkt gewoon.'
    'Answering at the lock screen needs administrator approval once...' = 'Antwoorden op het vergrendelscherm vraagt \u00e9\u00e9n keer om beheerdersrechten\u2026'
    'This PC will show as awake at the lock screen.' = 'Deze pc toont als wakker op het vergrendelscherm.'
    'Not set up. The PC will show as awake once you log in, as before.' = 'Niet ingesteld. De pc toont als wakker zodra je inlogt, zoals eerst.'
}

# How far along the install is when each step starts.
$script:RvProgress = @{
    'Installing Node.js via winget...' = 0.05
    'Downloading the agent...' = 0.12
    'Installing what it needs...' = 0.35
    'Setting it to start with Windows...' = 0.7
    'Re-registering the start-at-login task...' = 0.7
    'Starting the agent...' = 0.8
    'Waiting for it to answer...' = 0.9
    'Restarting so the new code takes effect...' = 0.6
    'Removing Reveille...' = 0.4
}

# The window's two palettes: Dusk, from THEMES in front-end/src/theme/clay.ts,
# so the setup window and the app are the same object. The *Soft brushes are
# the strong colour at 12-18% over the page, for tinted notes and pills.
$script:RvThemes = @{
    dark = @{
        Bg = '#0E111A'; Side = '#121620'; Panel = '#161B27'; Raised = '#1D2331'; Line = '#283044'
        Ink = '#E8ECF7'; Ink2 = '#98A2BA'; Ink3 = '#646E88'
        Dusk = '#5D8BFF'; DuskDeep = '#3D66E0'; DuskPale = '#B9CCFF'; OnFill = '#FFFFFF'
        Moss = '#4FD69A'; Amber = '#E8B15C'; Danger = '#FF6B84'
        MossSoft = '#2E4FD69A'; AmberSoft = '#21E8B15C'; DangerSoft = '#21FF6B84'; DuskSoft = '#1F5D8BFF'; DuskPill = '#2E5D8BFF'
        DoneInk = '#0B1A12'
    }
    light = @{
        Bg = '#F4F6FB'; Side = '#EBEEF6'; Panel = '#FFFFFF'; Raised = '#F7F9FD'; Line = '#D6DCEA'
        Ink = '#1A2033'; Ink2 = '#515B76'; Ink3 = '#8690A8'
        Dusk = '#3D66E0'; DuskDeep = '#2E52C4'; DuskPale = '#B9CCFF'; OnFill = '#FFFFFF'
        Moss = '#23875A'; Amber = '#A86A12'; Danger = '#C8364F'
        MossSoft = '#2E23875A'; AmberSoft = '#21A86A12'; DangerSoft = '#21C8364F'; DuskSoft = '#1F3D66E0'; DuskPill = '#2E3D66E0'
        DoneInk = '#FFFFFF'
    }
}

# Line icons, drawn on a 24 by 24 grid -- the same ones as the design.
$script:RvIcons = @{
    pair  = 'M3.5,3.5 h6.5 v6.5 h-6.5 Z M14,3.5 h6.5 v6.5 h-6.5 Z M3.5,14 h6.5 v6.5 h-6.5 Z M14,14 h2.5 v2.5 M20.5,14 v6.5 h-6.5 M17.5,17.5 h0.01'
    pc    = 'M4.6,4 H19.4 A1.6,1.6 0 0 1 21,5.6 V14.4 A1.6,1.6 0 0 1 19.4,16 H4.6 A1.6,1.6 0 0 1 3,14.4 V5.6 A1.6,1.6 0 0 1 4.6,4 Z M9,20 H15 M12,16 V20'
    perms = 'M12,3.5 L19,6 V11.5 C19,15.8 16,19.1 12,20.5 C8,19.1 5,15.8 5,11.5 V6 Z M9,12 L11,14 L15,10'
    maint = 'M14.7,6.3 A4,4 0 0 0 9.4,11.6 L4,17 L7,20 L12.4,14.6 A4,4 0 0 0 17.7,9.3 L15.3,11.7 L12.7,11.1 L12.1,8.5 Z'
    sun   = 'M8,12 A4,4 0 1 0 16,12 A4,4 0 1 0 8,12 Z M12,2.5 V4.5 M12,19.5 V21.5 M4.6,4.6 L6,6 M18,18 L19.4,19.4 M2.5,12 H4.5 M19.5,12 H21.5 M4.6,19.4 L6,18 M18,6 L19.4,4.6'
    moon  = 'M20,14.5 A8,8 0 1 1 9.5,4 A6.5,6.5 0 0 0 20,14.5 Z'
    update = 'M20,12 A8,8 0 1 1 17.7,6.3 M20,4 V9 H15'
    key   = 'M4,15 A4,4 0 1 0 12,15 A4,4 0 1 0 4,15 Z M11,12 L19.5,3.5 M16,7 L18.5,9.5 M18.5,4.5 L21,7'
    trash = 'M4,7 H20 M10,11 V17 M14,11 V17 M6,7 L7,20 H17 L18,7 M9,7 V4 H15 V7'
    check = 'M5,12.5 L9.5,17 L19,7.5'
    cross = 'M7,7 L17,17 M17,7 L7,17'
    refresh = 'M20,12 A8,8 0 1 1 17.7,6.3 M20,4 V9 H15'
}

function Initialize-RvStrings {
    if ($script:RvStringsReady) { return }
    foreach ($lang in @('en', 'nl')) {
        $table = $script:RvStrings[$lang]
        foreach ($key in @($table.Keys)) { $table[$key] = [regex]::Unescape($table[$key]) }
    }
    foreach ($key in @($script:RvLogNl.Keys)) { $script:RvLogNl[$key] = [regex]::Unescape($script:RvLogNl[$key]) }
    $script:RvStringsReady = $true
}

function RvT {
    param([string]$Key, [object[]]$Arg)
    $lang = if ($script:RvWin) { $script:RvWin.Lang } else { 'en' }
    $text = $script:RvStrings[$lang][$Key]
    if ($null -eq $text) { $text = $script:RvStrings.en[$Key] }
    if ($null -eq $text) { return $Key }
    if ($Arg) { $text = $text -f $Arg }
    return $text
}

function Get-RvDefaultLanguage {
    try { if ((Get-UICulture).TwoLetterISOLanguageName -eq 'nl') { return 'nl' } } catch { }
    try { if ((Get-Culture).TwoLetterISOLanguageName -eq 'nl') { return 'nl' } } catch { }
    return 'en'
}

# Whatever Windows apps are set to.
function Get-RvDefaultTheme {
    try {
        $light = Get-ItemPropertyValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme' -ErrorAction Stop
        if ($light -eq 1) { return 'light' }
    } catch { }
    return 'dark'
}

# A window needs a desktop, WPF, and the STA thread WPF runs on --
# powershell.exe 5.1 has one. A scripted or remote run never gets one.
function Test-RvWindowPossible {
    if (-not [Environment]::UserInteractive) { return $false }
    if ($env:SSH_CONNECTION -or $env:SSH_CLIENT) { return $false }
    try { if ([Console]::IsInputRedirected) { return $false } } catch { }
    if (@([Environment]::GetCommandLineArgs() | Where-Object { $_ -match '^-noni' }).Count) { return $false }
    if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') { return $false }
    try {
        Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

<#
    The "Get the app" code, for
    https://github.com/Shamilimanuel/PCRemote/releases/latest/download/reveille.apk

    One row per line, 1 for a dark module. Made by tools/app-qr.js, which also
    checks it in CI: that link never changes, and on a first install there is
    no agent yet to draw it.
#>
$script:RvAppQr = @(
    '1111111001001001101110110000101111111'
    '1000001000011101101001100101101000001'
    '1011101010111111001111010010101011101'
    '1011101010110111000110111110001011101'
    '1011101011100110101011010000101011101'
    '1000001010010010001010000011001000001'
    '1111111010101010101010101010101111111'
    '0000000011001111100111001000100000000'
    '1011111000110110010100111110001111100'
    '0101100001111101100100011100000100110'
    '1010011101101110011011001111011111011'
    '0011100111101010100011100011110110001'
    '1010101100010110000000101111011011111'
    '0101010001110010000101010100000100000'
    '1010101101100001101001100111010111011'
    '0010000110100101101011100010001110011'
    '0100101100110111110100111111111010111'
    '1011000111101011001110110110100000010'
    '0111111111111001111001100011100110011'
    '1101100111011001001011101010011000001'
    '0110101010111001010100101101011011100'
    '1011110100101010111111010000110001000'
    '0010101100100011011010100111101111011'
    '0001110111101011100011001011111110000'
    '0000101110011001001000101111111110101'
    '1011110101101101101111010100110101000'
    '1001111100101010000001000111111100011'
    '1000100111000100100011110011101100010'
    '1000101000010010110100111011111110110'
    '0000000010001010111111010110100011010'
    '1111111000110111110011101110101010111'
    '1000001011100110111011101000100011010'
    '1011101011000110100000111111111110110'
    '1011101010001001011110010001011011001'
    '1011101011110101100010101101100000111'
    '1000001000001111000001000011111010001'
    '1111111011100001010110111110001011111'
)

# --------------------------------------------------------------- the worker --

# The functions the worker needs, copied into it from this session. That works
# however this script arrived -- a file, or irm | iex with no file at all.
$script:RvWorkerFunctions = @(
    'Write-Step', 'Write-Ok', 'Write-Warn2', 'Write-Dim',
    'Resolve-Node', 'Get-AgentFiles', 'Register-Agent', 'Install-FirmwareTask', 'Test-Uefi',
    'Install-PresenceTask', 'Install-Reveille', 'Remove-AdminTask', 'Stop-WhateverHoldsThePort',
    'Read-AgentPort', 'Test-Agent', 'Invoke-TokenReset', 'Remove-Reveille',
    'Install-ReveilleCommand', 'Remove-ReveilleCommand', 'Get-RvStatus', 'Get-RvChecks'
)

function Get-RvWorkerSource {
    ($script:RvWorkerFunctions | ForEach-Object {
        "function $_ {`n" + (Get-Item "function:$_").Definition + "`n}"
    }) -join "`n"
}

# Runs in the worker. 'load' sets it up once; every other kind is one job, and
# hands back a hashtable as its last output.
$script:RvWorkerScript = {
    param($Kind, $Source, $Vars, $Arg)
    if ($Kind -eq 'load') {
        foreach ($name in $Vars.Keys) { Set-Variable -Name $name -Value $Vars[$name] -Scope Global }
        . ([scriptblock]::Create($Source))
        return
    }
    $ErrorActionPreference = 'Stop'
    switch ($Kind) {
        'status' { Get-RvStatus -Destination $InstallDir }
        'check'  { Get-RvChecks }
        'install' {
            $null = Resolve-Node
            $health = Install-Reveille -Destination $InstallDir
            $null = Install-ReveilleCommand
            @{ Health = $health }
        }
        'update' {
            $null = Resolve-Node
            $health = Install-Reveille -Destination $InstallDir
            $null = Install-ReveilleCommand
            @{ Health = $health }
        }
        'repair' {
            $null = Resolve-Node
            $health = Install-Reveille -Destination $InstallDir -Repairing
            $null = Install-ReveilleCommand
            @{ Health = $health }
        }
        'rotate' { @{ Ok = [bool](Invoke-TokenReset -Destination $InstallDir) } }
        'remove' {
            # The two extras were made as administrator; removing them asks
            # Windows once each. Saying no leaves them, and says so.
            $null = Remove-AdminTask -Name $FirmwareTask
            $null = Remove-AdminTask -Name $PresenceTask -Firewall
            Remove-Reveille
            @{ Ok = -not (Test-Path (Join-Path $InstallDir 'package.json')) }
        }
        'perm' {
            $task = if ($Arg.Which -eq 'bios') { $FirmwareTask } else { $PresenceTask }
            if ($Arg.On) {
                try {
                    if ($Arg.Which -eq 'bios') { Install-FirmwareTask -Destination $InstallDir }
                    else { Install-PresenceTask -Destination $InstallDir }
                } catch {
                    # Saying no to the Windows prompt lands here.
                }
            } else {
                $null = Remove-AdminTask -Name $task -Firewall:($Arg.Which -eq 'lock')
            }
            @{ Which = $Arg.Which; Wanted = [bool]$Arg.On; On = [bool](Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) }
        }
        'extras' {
            if ($Arg.Bios) { try { Install-FirmwareTask -Destination $InstallDir } catch { Write-Warn2 'Reboot to BIOS was not set up. Everything else still works.' } }
            if ($Arg.Lock) { try { Install-PresenceTask -Destination $InstallDir } catch { Write-Warn2 'Not set up. The PC will show as awake once you log in, as before.' } }
            @{ Ok = $true }
        }
    }
}.ToString()

# Queues a job: @{ Kind; Arg; Done = 'function name'; Live = show its log }.
function Add-RvJob {
    param([hashtable]$Job)
    $w = $script:RvWin
    if (-not $w.Runspace) { return }
    # One look at the status at a time is plenty.
    if ($Job.Kind -eq 'status' -and (@($w.Queue | Where-Object { $_.Kind -eq 'status' }).Count)) { return }
    [void]$w.Queue.Add($Job)
}

function Start-RvJob {
    param([hashtable]$Job)
    $w = $script:RvWin
    $ps = [powershell]::Create()
    $ps.Runspace = $w.Runspace
    [void]$ps.AddScript($script:RvWorkerScript)
    foreach ($pair in @{ Kind = $Job.Kind; Source = $Job.Source; Vars = $Job.Vars; Arg = $Job.Arg }.GetEnumerator()) {
        [void]$ps.AddParameter($pair.Key, $pair.Value)
    }
    $Job.PS = $ps
    $Job.Seen = 0
    $Job.Async = $ps.BeginInvoke()
    $w.Job = $Job
}

# The jobs that change something. Closing the window waits for these, and
# their buttons are greyed out while one runs.
$script:RvHeavyJobs = @('install', 'update', 'repair', 'rotate', 'remove', 'perm', 'extras')

function Test-RvBusy {
    $w = $script:RvWin
    if ($w.Job -and $w.Job.Kind -in $script:RvHeavyJobs) { return $true }
    return [bool](@($w.Queue | Where-Object { $_.Kind -in $script:RvHeavyJobs }).Count)
}

# Moves whatever the worker has printed since last time into the log.
function Read-RvLive {
    param([hashtable]$Job)
    $w = $script:RvWin
    $info = $Job.PS.Streams.Information
    $added = $false
    while ($Job.Seen -lt $info.Count) {
        $data = $info[$Job.Seen].MessageData
        $Job.Seen++
        $text = "$data".Trim()
        # Blank lines, and anything drawn with box characters, are the
        # terminal's layout rather than news.
        if (-not $text -or $text -match '[\u2500-\u259f]' -or $text -match '^-+$') { continue }
        $colour = ''
        try { $colour = [string]$data.ForegroundColor } catch { }
        $kind = switch ($colour) { 'Cyan' { 'step' } 'Green' { 'ok' } 'Yellow' { 'warn' } default { 'dim' } }
        if ($script:RvProgress.ContainsKey($text)) { $w.Progress = [Math]::Max($w.Progress, $script:RvProgress[$text]) }
        [void]$w.Log.Add(@{ Text = $text; Kind = $kind })
        $added = $true
    }
    return $added
}

# The window's timer: shows a running job's progress, hands a finished one
# to its Done function, and starts the next.
function Invoke-RvTick {
    $w = $script:RvWin
    try {
        if ($w.Job) {
            $job = $w.Job
            if ($job.Live -and (Read-RvLive $job)) { Update-RvContent }
            if ($job.Async.IsCompleted) {
                $w.Job = $null
                $out = @()
                $err = $null
                try {
                    $out = @($job.PS.EndInvoke($job.Async))
                } catch {
                    $e = $_.Exception
                    while ($e.InnerException) { $e = $e.InnerException }
                    $err = $e.Message
                }
                if ($job.Live) { [void](Read-RvLive $job) }
                $job.PS.Dispose()
                $result = @($out | Where-Object { $_ -is [hashtable] }) | Select-Object -Last 1
                if ($job.Done) { & $job.Done $job $result $err }
            }
        }
        if (-not $w.Job -and $w.Queue.Count) {
            $next = $w.Queue[0]
            $w.Queue.RemoveAt(0)
            Start-RvJob $next
        }
        if ($w.ToastUntil -and (Get-Date) -ge $w.ToastUntil) {
            $w.ToastUntil = $null
            $w.Window.FindName('Toast').Visibility = 'Collapsed'
        }
    } catch {
        $w.Notice = @{ Kind = 'bad'; Text = (RvT 'failed' $_.Exception.Message) }
        try { Update-RvContent } catch { }
    }
}

function Request-RvStatus {
    Add-RvJob @{ Kind = 'status'; Done = 'Complete-RvStatus' }
}

# ------------------------------------------------------------ window layout --

function New-RvWindowXaml {
    @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Reveille" Width="1100" Height="760" MinWidth="880" MinHeight="560"
        WindowStartupLocation="CenterScreen" FontFamily="Segoe UI" FontSize="13.5"
        Background="{DynamicResource Bg}" Foreground="{DynamicResource Ink}"
        UseLayoutRounding="True" SnapsToDevicePixels="True">
  <Window.Resources>
    <SolidColorBrush x:Key="Bg" Color="#0E111A"/>
    <SolidColorBrush x:Key="Side" Color="#121620"/>
    <SolidColorBrush x:Key="Panel" Color="#161B27"/>
    <SolidColorBrush x:Key="Raised" Color="#1D2331"/>
    <SolidColorBrush x:Key="Line" Color="#283044"/>
    <SolidColorBrush x:Key="Ink" Color="#E8ECF7"/>
    <SolidColorBrush x:Key="Ink2" Color="#98A2BA"/>
    <SolidColorBrush x:Key="Ink3" Color="#646E88"/>
    <SolidColorBrush x:Key="Dusk" Color="#5D8BFF"/>
    <SolidColorBrush x:Key="DuskDeep" Color="#3D66E0"/>
    <SolidColorBrush x:Key="OnFill" Color="#FFFFFF"/>
    <SolidColorBrush x:Key="Danger" Color="#FF6B84"/>

    <ControlTemplate x:Key="RvRounded" TargetType="{x:Type ButtonBase}">
      <Border x:Name="Box" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}"
              BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8" Padding="{TemplateBinding Padding}">
        <ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}" VerticalAlignment="Center" RecognizesAccessKey="False"/>
      </Border>
      <ControlTemplate.Triggers>
        <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger>
      </ControlTemplate.Triggers>
    </ControlTemplate>
    <ControlTemplate x:Key="RvSquare" TargetType="{x:Type ButtonBase}">
      <Border Background="{TemplateBinding Background}" Padding="{TemplateBinding Padding}">
        <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" RecognizesAccessKey="False"/>
      </Border>
    </ControlTemplate>

    <Style x:Key="RvBtn" TargetType="{x:Type Button}">
      <Setter Property="Template" Value="{StaticResource RvRounded}"/>
      <Setter Property="Background" Value="{DynamicResource Raised}"/>
      <Setter Property="BorderBrush" Value="{DynamicResource Line}"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink}"/>
      <Setter Property="FontWeight" Value="SemiBold"/>
      <Setter Property="Padding" Value="16,8"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
      <Setter Property="HorizontalContentAlignment" Value="Center"/>
      <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True"><Setter Property="BorderBrush" Value="{DynamicResource Ink3}"/></Trigger>
        <Trigger Property="IsKeyboardFocused" Value="True"><Setter Property="BorderBrush" Value="{DynamicResource Dusk}"/></Trigger>
      </Style.Triggers>
    </Style>
    <Style x:Key="RvPrimary" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Background" Value="{DynamicResource Dusk}"/>
      <Setter Property="BorderBrush" Value="{DynamicResource Dusk}"/>
      <Setter Property="Foreground" Value="{DynamicResource OnFill}"/>
      <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True">
          <Setter Property="Background" Value="{DynamicResource DuskDeep}"/>
          <Setter Property="BorderBrush" Value="{DynamicResource DuskDeep}"/>
        </Trigger>
      </Style.Triggers>
    </Style>
    <Style x:Key="RvDanger" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Foreground" Value="{DynamicResource Danger}"/>
    </Style>
    <Style x:Key="RvDangerSolid" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Background" Value="{DynamicResource Danger}"/>
      <Setter Property="BorderBrush" Value="{DynamicResource Danger}"/>
      <Setter Property="Foreground" Value="#FFFFFF"/>
    </Style>
    <Style x:Key="RvSmall" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Padding" Value="9,3"/>
      <Setter Property="FontSize" Value="11.5"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink2}"/>
      <Setter Property="Margin" Value="4,0,0,0"/>
    </Style>
    <Style x:Key="RvNav" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="BorderBrush" Value="Transparent"/>
      <Setter Property="BorderThickness" Value="3,0,0,0"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink2}"/>
      <Setter Property="Padding" Value="8,9,10,9"/>
      <Setter Property="Margin" Value="0,0,0,2"/>
      <Setter Property="HorizontalContentAlignment" Value="Stretch"/>
      <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True">
          <Setter Property="Background" Value="{DynamicResource Raised}"/>
          <Setter Property="Foreground" Value="{DynamicResource Ink}"/>
          <Setter Property="BorderBrush" Value="Transparent"/>
        </Trigger>
      </Style.Triggers>
    </Style>
    <Style x:Key="RvNavOn" TargetType="{x:Type Button}" BasedOn="{StaticResource RvNav}">
      <Setter Property="Background" Value="{DynamicResource Raised}"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink}"/>
      <Setter Property="BorderBrush" Value="{DynamicResource Dusk}"/>
      <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True"><Setter Property="BorderBrush" Value="{DynamicResource Dusk}"/></Trigger>
      </Style.Triggers>
    </Style>
    <Style x:Key="RvSeg" TargetType="{x:Type Button}">
      <Setter Property="Template" Value="{StaticResource RvSquare}"/>
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink3}"/>
      <Setter Property="FontSize" Value="11.5"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="Padding" Value="10,4"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
    </Style>
    <Style x:Key="RvSegOn" TargetType="{x:Type Button}" BasedOn="{StaticResource RvSeg}">
      <Setter Property="Background" Value="{DynamicResource Raised}"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink}"/>
    </Style>
    <Style x:Key="RvIconBtn" TargetType="{x:Type Button}" BasedOn="{StaticResource RvBtn}">
      <Setter Property="Background" Value="Transparent"/>
      <Setter Property="Foreground" Value="{DynamicResource Ink2}"/>
      <Setter Property="Padding" Value="7,4"/>
    </Style>
    <Style x:Key="RvSwitch" TargetType="{x:Type ToggleButton}">
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="{x:Type ToggleButton}">
            <Border x:Name="Track" Width="40" Height="22" CornerRadius="11" Background="{DynamicResource Line}">
              <Ellipse x:Name="Thumb" Width="16" Height="16" Fill="#FFFFFF" HorizontalAlignment="Left" Margin="3,0,0,0"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsChecked" Value="True">
                <Setter TargetName="Track" Property="Background" Value="{DynamicResource Dusk}"/>
                <Setter TargetName="Thumb" Property="HorizontalAlignment" Value="Right"/>
                <Setter TargetName="Thumb" Property="Margin" Value="0,0,3,0"/>
              </Trigger>
              <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style TargetType="{x:Type ScrollBar}">
      <Setter Property="Width" Value="12"/>
      <Setter Property="MinWidth" Value="12"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="{x:Type ScrollBar}">
            <Track x:Name="PART_Track" IsDirectionReversed="True" Margin="3,4">
              <Track.Thumb>
                <Thumb>
                  <Thumb.Template>
                    <ControlTemplate TargetType="{x:Type Thumb}">
                      <Border CornerRadius="3" Background="{DynamicResource Line}"/>
                    </ControlTemplate>
                  </Thumb.Template>
                </Thumb>
              </Track.Thumb>
            </Track>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Grid Background="{DynamicResource Bg}">
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="228"/>
      <ColumnDefinition Width="*"/>
    </Grid.ColumnDefinitions>

    <Border Background="{DynamicResource Side}" BorderBrush="{DynamicResource Line}" BorderThickness="0,0,1,0">
      <DockPanel Margin="12,16,12,12">
        <StackPanel DockPanel.Dock="Top" Orientation="Horizontal" Margin="6,2,6,18">
          <ContentControl x:Name="Logo" Width="34" Height="34" VerticalAlignment="Center"/>
          <StackPanel Margin="10,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="Reveille" FontSize="15" FontWeight="Bold"/>
            <TextBlock x:Name="BrandSub" FontSize="11.5" Foreground="{DynamicResource Ink3}"/>
          </StackPanel>
        </StackPanel>
        <Border DockPanel.Dock="Bottom" BorderBrush="{DynamicResource Line}" BorderThickness="0,1,0,0" Padding="0,14,0,0">
          <StackPanel>
            <DockPanel Margin="6,0,6,12">
              <Ellipse x:Name="AgentDot" Width="8" Height="8" VerticalAlignment="Center" Margin="0,0,8,0"/>
              <TextBlock x:Name="AgentText" FontSize="12" Foreground="{DynamicResource Ink2}" TextWrapping="Wrap"/>
            </DockPanel>
            <StackPanel Orientation="Horizontal" Margin="2,0,0,0">
              <Border BorderBrush="{DynamicResource Line}" BorderThickness="1" CornerRadius="7" ClipToBounds="True">
                <StackPanel Orientation="Horizontal">
                  <Button x:Name="LangEn" Content="EN" Style="{StaticResource RvSeg}"/>
                  <Button x:Name="LangNl" Content="NL" Style="{StaticResource RvSeg}"/>
                </StackPanel>
              </Border>
              <Button x:Name="ThemeBtn" Margin="8,0,0,0" Style="{StaticResource RvIconBtn}"/>
            </StackPanel>
          </StackPanel>
        </Border>
        <ScrollViewer VerticalScrollBarVisibility="Auto"><StackPanel x:Name="SideMain"/></ScrollViewer>
      </DockPanel>
    </Border>

    <Grid Grid.Column="1">
      <ScrollViewer x:Name="ContentScroll" VerticalScrollBarVisibility="Auto">
        <StackPanel x:Name="Content" Margin="30,26,30,30" MaxWidth="960"/>
      </ScrollViewer>
      <Border x:Name="Toast" Visibility="Collapsed" VerticalAlignment="Bottom" HorizontalAlignment="Center"
              Margin="0,0,0,26" CornerRadius="16" Padding="16,8" Background="{DynamicResource Ink}">
        <TextBlock x:Name="ToastText" FontWeight="SemiBold" Foreground="{DynamicResource Bg}"/>
      </Border>
    </Grid>
  </Grid>
</Window>
"@
}

# --------------------------------------------------------- building blocks --

function New-RvTh {
    param([double[]]$v)
    switch ($v.Count) {
        1 { return New-Object Windows.Thickness($v[0]) }
        2 { return New-Object Windows.Thickness($v[0], $v[1], $v[0], $v[1]) }
        default { return New-Object Windows.Thickness($v[0], $v[1], $v[2], $v[3]) }
    }
}

# A brush from the theme by name, or a fixed colour written #RRGGBB.
function Set-RvBrush {
    param($Element, $Property, [string]$Value)
    if (-not $Value) { return }
    if ($Value.StartsWith('#')) {
        $Element.SetValue($Property, (New-Object Windows.Media.BrushConverter).ConvertFromString($Value))
    } else {
        $Element.SetResourceReference($Property, $Value)
    }
}

# Wrapping text, with two marks of its own: **bold** and `code`.
function New-RvText {
    param([string]$Text, [double]$Size = 13.5, [string]$Brush = 'Ink', [string]$Weight = '',
          [double[]]$Margin = @(0), [switch]$Mono, [switch]$NoWrap, [double]$MaxWidth = 0)
    $t = New-Object Windows.Controls.TextBlock
    $t.FontSize = $Size
    $t.Margin = New-RvTh $Margin
    if (-not $NoWrap) { $t.TextWrapping = 'Wrap' }
    if ($Weight) { $t.FontWeight = [Windows.FontWeights]::$Weight }
    if ($Mono) { $t.FontFamily = $script:RvMono }
    if ($MaxWidth) { $t.MaxWidth = $MaxWidth; $t.HorizontalAlignment = 'Left' }
    Set-RvBrush $t ([Windows.Controls.TextBlock]::ForegroundProperty) $Brush
    foreach ($part in [regex]::Split([string]$Text, '(\*\*[^*]+\*\*|`[^`]+`)')) {
        if (-not $part) { continue }
        $run = New-Object Windows.Documents.Run
        if ($part -match '^\*\*(.+)\*\*$') {
            $run.Text = $Matches[1]
            $run.FontWeight = [Windows.FontWeights]::SemiBold
            $run.SetResourceReference([Windows.Documents.TextElement]::ForegroundProperty, 'Ink')
        } elseif ($part -match '^`(.+)`$') {
            $run.Text = ' ' + $Matches[1] + ' '
            $run.FontFamily = $script:RvMono
            $run.FontSize = $Size - 1
            $run.SetResourceReference([Windows.Documents.TextElement]::BackgroundProperty, 'Raised')
        } else {
            $run.Text = $part
        }
        [void]$t.Inlines.Add($run)
    }
    return $t
}

# Every button goes through Invoke-RvClick; its Tag says what it is for.
function New-RvButton {
    param([object]$Content, [hashtable]$Tag, [string]$Style = 'RvBtn', [double[]]$Margin = @(0), [switch]$Disabled)
    $b = New-Object Windows.Controls.Button
    $b.Style = $script:RvWin.Window.FindResource($Style)
    $b.Content = $Content
    $b.Tag = $Tag
    $b.Margin = New-RvTh $Margin
    if ($Disabled) { $b.IsEnabled = $false }
    $b.Add_Click({ Invoke-RvClick $this })
    return $b
}

function New-RvSwitch {
    param([bool]$On, [hashtable]$Tag, [switch]$Disabled)
    $s = New-Object Windows.Controls.Primitives.ToggleButton
    $s.Style = $script:RvWin.Window.FindResource('RvSwitch')
    $s.IsChecked = $On
    $s.Tag = $Tag
    $s.VerticalAlignment = 'Center'
    if ($Disabled) { $s.IsEnabled = $false }
    $s.Add_Click({ Invoke-RvClick $this })
    return $s
}

# A line icon. -Brush '' takes the colour of the button it sits in.
function New-RvIcon {
    param([string]$Name, [double]$Size = 18, [string]$Brush = '', [double]$Stroke = 1.8)
    $p = New-Object Windows.Shapes.Path
    $p.Data = [Windows.Media.Geometry]::Parse($script:RvIcons[$Name])
    $p.StrokeThickness = $Stroke
    $p.StrokeStartLineCap = 'Round'
    $p.StrokeEndLineCap = 'Round'
    $p.StrokeLineJoin = 'Round'
    if ($Brush) {
        Set-RvBrush $p ([Windows.Shapes.Shape]::StrokeProperty) $Brush
    } else {
        $bind = New-Object Windows.Data.Binding('Foreground')
        $bind.RelativeSource = New-Object Windows.Data.RelativeSource([Windows.Data.RelativeSourceMode]::FindAncestor, [Windows.Controls.Control], 1)
        [void]$p.SetBinding([Windows.Shapes.Shape]::StrokeProperty, $bind)
    }
    $c = New-Object Windows.Controls.Canvas
    $c.Width = 24
    $c.Height = 24
    [void]$c.Children.Add($p)
    $v = New-Object Windows.Controls.Viewbox
    $v.Width = $Size
    $v.Height = $Size
    $v.Child = $c
    return $v
}

function New-RvBox {
    param($Child, [string]$Bg = 'Panel', [string]$Line = 'Line', [double[]]$Thick = @(1), [double]$Radius = 12,
          [double[]]$Padding = @(16, 14), [double[]]$Margin = @(0))
    $b = New-Object Windows.Controls.Border
    Set-RvBrush $b ([Windows.Controls.Border]::BackgroundProperty) $Bg
    Set-RvBrush $b ([Windows.Controls.Border]::BorderBrushProperty) $Line
    $b.BorderThickness = New-RvTh $Thick
    $b.CornerRadius = New-Object Windows.CornerRadius($Radius)
    $b.Padding = New-RvTh $Padding
    $b.Margin = New-RvTh $Margin
    $b.Child = $Child
    return $b
}

function New-RvStack {
    param([string]$Orientation = 'Vertical', [double[]]$Margin = @(0))
    $s = New-Object Windows.Controls.StackPanel
    $s.Orientation = $Orientation
    $s.Margin = New-RvTh $Margin
    return $s
}

# A grid with the given columns: numbers are pixels, '*' or '2*' share the
# rest, 'auto' fits its content.
function New-RvGrid {
    param([string[]]$Columns, [double[]]$Margin = @(0))
    $g = New-Object Windows.Controls.Grid
    $g.Margin = New-RvTh $Margin
    foreach ($col in $Columns) {
        $def = New-Object Windows.Controls.ColumnDefinition
        if ($col -eq 'auto') { $def.Width = [Windows.GridLength]::Auto }
        elseif ($col -match '^([\d.]*)\*$') {
            $n = if ($Matches[1]) { [double]$Matches[1] } else { 1 }
            $def.Width = New-Object Windows.GridLength($n, [Windows.GridUnitType]::Star)
        } else { $def.Width = New-Object Windows.GridLength([double]$col) }
        $g.ColumnDefinitions.Add($def)
    }
    return $g
}

function Add-RvCell {
    param($Grid, $Child, [int]$Column, [int]$Row = 0, [int]$Span = 1)
    [Windows.Controls.Grid]::SetColumn($Child, $Column)
    [Windows.Controls.Grid]::SetRow($Child, $Row)
    if ($Span -gt 1) { [Windows.Controls.Grid]::SetColumnSpan($Child, $Span) }
    [void]$Grid.Children.Add($Child)
}

# A round number badge, or a step in the sidebar.
function New-RvDisc {
    param([string]$Text, [string]$Bg, [string]$Fg, [string]$Line = '', [double]$Size = 22)
    $t = New-RvText $Text -Size 11.5 -Brush $Fg -Weight 'Bold' -NoWrap
    $t.HorizontalAlignment = 'Center'
    $t.VerticalAlignment = 'Center'
    $b = New-RvBox $t -Bg $Bg -Line $Line -Thick $(if ($Line) { @(1.5) } else { @(0) }) -Radius ($Size / 2) -Padding @(0)
    $b.Width = $Size
    $b.Height = $Size
    return $b
}

function New-RvPill {
    param([string]$Text, [string]$Kind = 'on')
    switch ($Kind) {
        'on'   { $bg = 'MossSoft'; $fg = 'Moss'; $line = '' }
        'new'  { $bg = 'DuskPill'; $fg = 'Dusk'; $line = '' }
        'warn' { $bg = 'AmberSoft'; $fg = 'Amber'; $line = '' }
        default { $bg = 'Raised'; $fg = 'Ink3'; $line = 'Line' }
    }
    $t = New-RvText $Text -Size 11.5 -Brush $fg -Weight 'Bold' -NoWrap
    $b = New-RvBox $t -Bg $bg -Line $line -Thick $(if ($line) { @(1) } else { @(0) }) -Radius 10 -Padding @(9, 2)
    $b.VerticalAlignment = 'Center'
    $b.HorizontalAlignment = 'Left'
    return $b
}

<#
    A QR code from its rows of 0 and 1. Each run of dark modules in a row is
    one rectangle, drawn without anti-aliasing so the edges stay sharp, and
    the size is rounded down to a whole number of pixels per module -- a code
    a camera reads first time rather than eventually.
#>
function New-RvQr {
    param([string[]]$Rows, [string]$Field, [string]$Ink, [double]$Size = 180)
    $n = $Rows.Count
    $total = $n + 8
    $Size = [Math]::Max(3, [Math]::Floor($Size / $total)) * $total
    $sb = New-Object Text.StringBuilder
    for ($y = 0; $y -lt $n; $y++) {
        $row = $Rows[$y]
        $x = 0
        while ($x -lt $n) {
            if ($row[$x] -eq [char]'1') {
                $start = $x
                while ($x -lt $n -and $row[$x] -eq [char]'1') { $x++ }
                [void]$sb.AppendFormat('M{0},{1}h{2}v1h-{2}z', ($start + 4), ($y + 4), ($x - $start))
            } else {
                $x++
            }
        }
    }
    $path = New-Object Windows.Shapes.Path
    $path.Data = [Windows.Media.Geometry]::Parse($sb.ToString())
    Set-RvBrush $path ([Windows.Shapes.Shape]::FillProperty) $Ink
    [Windows.Media.RenderOptions]::SetEdgeMode($path, [Windows.Media.EdgeMode]::Aliased)
    $canvas = New-Object Windows.Controls.Canvas
    $canvas.Width = $total
    $canvas.Height = $total
    [void]$canvas.Children.Add($path)
    $view = New-Object Windows.Controls.Viewbox
    $view.Child = $canvas
    $box = New-RvBox $view -Bg $Field -Line '' -Thick @(0) -Radius 10 -Padding @(0)
    $box.Width = $Size
    $box.Height = $Size
    $box.VerticalAlignment = 'Top'
    return $box
}

# The logo: the R on navy, with the orange sun coming up behind it.
function New-RvLogo {
    param([double]$Size = 34, [double]$Radius = 9)
    $canvas = New-Object Windows.Controls.Canvas
    $canvas.Width = 64
    $canvas.Height = 64
    $clip = New-Object Windows.Media.RectangleGeometry((New-Object Windows.Rect(0, 0, 64, 64)), ($Radius * 64 / $Size), ($Radius * 64 / $Size))
    $canvas.Clip = $clip
    $converter = New-Object Windows.Media.BrushConverter
    $back = New-Object Windows.Shapes.Rectangle
    $back.Width = 64
    $back.Height = 64
    $back.Fill = $converter.ConvertFromString('#121A33')
    [void]$canvas.Children.Add($back)
    $sun = New-Object Windows.Shapes.Ellipse
    $sun.Width = 44
    $sun.Height = 44
    $sun.Fill = $converter.ConvertFromString('#FFA061')
    [Windows.Controls.Canvas]::SetLeft($sun, 10)
    [Windows.Controls.Canvas]::SetTop($sun, 44)
    [void]$canvas.Children.Add($sun)
    $r = New-Object Windows.Shapes.Path
    $r.Data = [Windows.Media.Geometry]::Parse('M22,14 V48 M22,14 H33 A10,10 0 0 1 33,34 H22 M31,34 L43,48')
    $r.Stroke = $converter.ConvertFromString('#F2F5FC')
    $r.StrokeThickness = 6.5
    $r.StrokeStartLineCap = 'Round'
    $r.StrokeEndLineCap = 'Round'
    $r.StrokeLineJoin = 'Round'
    [void]$canvas.Children.Add($r)
    $v = New-Object Windows.Controls.Viewbox
    $v.Width = $Size
    $v.Height = $Size
    $v.Child = $canvas
    return $v
}

function New-RvLogoImage {
    $logo = New-RvLogo -Size 64 -Radius 14
    $logo.Measure((New-Object Windows.Size(64, 64)))
    $logo.Arrange((New-Object Windows.Rect(0, 0, 64, 64)))
    $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap(64, 64, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($logo)
    $bitmap.Freeze()
    return $bitmap
}

function Show-RvToast {
    param([string]$Text)
    $w = $script:RvWin
    $w.Window.FindName('ToastText').Text = $Text
    $w.Window.FindName('Toast').Visibility = 'Visible'
    $w.ToastUntil = (Get-Date).AddMilliseconds(1600)
}

# ------------------------------------------------------------------ painting --

function Set-RvTheme {
    param([string]$Name)
    $w = $script:RvWin
    $w.Theme = $Name
    $converter = New-Object Windows.Media.BrushConverter
    foreach ($key in $script:RvThemes[$Name].Keys) {
        $w.Window.Resources[$key] = $converter.ConvertFromString($script:RvThemes[$Name][$key])
    }
    $from = [Windows.Media.ColorConverter]::ConvertFromString($script:RvThemes[$Name].Dusk)
    $to = [Windows.Media.ColorConverter]::ConvertFromString($script:RvThemes[$Name].DuskPale)
    # ::new, not New-Object: a resource must be the brush itself, and
    # New-Object hands back PowerShell's wrapper around it.
    $w.Window.Resources['Progress'] = [Windows.Media.LinearGradientBrush]::new([Windows.Media.Color]$from, [Windows.Media.Color]$to, 0.0)
    Set-RvTitleBar
}

# Windows draws the title bar itself; this asks it for the dark one to match.
function Set-RvTitleBar {
    $w = $script:RvWin
    if (-not $w.Hwnd) { return }
    try {
        if (-not ('Reveille.Dwm' -as [type])) {
            Add-Type -Namespace Reveille -Name Dwm -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("dwmapi.dll")]
public static extern int DwmSetWindowAttribute(System.IntPtr hwnd, int attribute, ref int value, int size);
'@
        }
        $dark = [int]($w.Theme -eq 'dark')
        [void][Reveille.Dwm]::DwmSetWindowAttribute($w.Hwnd, 20, [ref]$dark, 4)
    } catch { }
}

function Update-RvAll {
    Update-RvSide
    Update-RvContent
}

function Update-RvSide {
    $w = $script:RvWin
    $win = $w.Window
    $win.FindName('BrandSub').Text = if ($w.Mode -eq 'first') { RvT 'brandFirst' } else { RvT 'brandSetup' }

    $panel = $win.FindName('SideMain')
    $panel.Children.Clear()
    if ($w.Mode -eq 'installed') {
        foreach ($view in @('pair', 'pc', 'perms', 'maint')) {
            $row = New-Object Windows.Controls.DockPanel
            $icon = New-RvIcon $view -Size 18
            $icon.Margin = New-RvTh @(0, 0, 11, 0)
            [Windows.Controls.DockPanel]::SetDock($icon, 'Left')
            [void]$row.Children.Add($icon)
            if ($view -eq 'maint' -and $w.Status -and $w.Status.Ahead -gt 0) {
                $badge = New-RvBox (New-RvText "$($w.Status.Ahead)" -Size 10.5 -Brush 'OnFill' -Weight 'Bold' -NoWrap) -Bg 'Dusk' -Line '' -Thick @(0) -Radius 9 -Padding @(7, 0)
                $badge.VerticalAlignment = 'Center'
                [Windows.Controls.DockPanel]::SetDock($badge, 'Right')
                [void]$row.Children.Add($badge)
            }
            $label = New-RvText (RvT "nav.$view") -Size 13.5 -Brush '' -Weight 'SemiBold' -NoWrap
            $label.VerticalAlignment = 'Center'
            [void]$row.Children.Add($label)
            $style = if ($w.View -eq $view) { 'RvNavOn' } else { 'RvNav' }
            [void]$panel.Children.Add((New-RvButton $row @{ Do = 'view'; View = $view } $style))
        }
    } else {
        for ($i = 1; $i -le 5; $i++) {
            $row = New-RvGrid @('22', '*') -Margin @(0, 0, 0, 4)
            $now = $i -eq $w.Step
            $done = $i -lt $w.Step
            $disc = if ($done) { New-RvDisc "$i" -Bg 'Moss' -Fg 'DoneInk' }
                    elseif ($now) { New-RvDisc "$i" -Bg '' -Fg 'Dusk' -Line 'Dusk' }
                    else { New-RvDisc "$i" -Bg '' -Fg 'Ink3' -Line 'Line' }
            Add-RvCell $row $disc 0
            $brush = if ($now) { 'Ink' } elseif ($done) { 'Ink2' } else { 'Ink3' }
            $label = New-RvText (RvT "s$i") -Size 13.5 -Brush $brush -Weight 'SemiBold' -Margin @(10, 0, 0, 0)
            $label.VerticalAlignment = 'Center'
            Add-RvCell $row $label 1
            $box = New-RvBox $row -Bg $(if ($now) { 'Raised' } else { '' }) -Line '' -Thick @(0) -Radius 8 -Padding @(8, 8)
            [void]$panel.Children.Add($box)
        }
    }

    # The agent, the language and the theme, at the bottom.
    $dot = $win.FindName('AgentDot')
    $text = $win.FindName('AgentText')
    if ($w.Mode -eq 'first') {
        Set-RvBrush $dot ([Windows.Shapes.Shape]::FillProperty) 'Ink3'
        $text.Text = RvT 'agentNone'
    } elseif (-not $w.Status) {
        Set-RvBrush $dot ([Windows.Shapes.Shape]::FillProperty) 'Ink3'
        $text.Text = RvT 'agentLooking'
    } elseif ($w.Status.Running) {
        Set-RvBrush $dot ([Windows.Shapes.Shape]::FillProperty) 'Moss'
        $text.Text = RvT 'agentOn' $w.Status.Port
    } else {
        Set-RvBrush $dot ([Windows.Shapes.Shape]::FillProperty) 'Amber'
        $text.Text = RvT 'agentOff'
    }
    $win.FindName('LangEn').Style = $win.FindResource($(if ($w.Lang -eq 'en') { 'RvSegOn' } else { 'RvSeg' }))
    $win.FindName('LangNl').Style = $win.FindResource($(if ($w.Lang -eq 'nl') { 'RvSegOn' } else { 'RvSeg' }))
    $theme = $win.FindName('ThemeBtn')
    $theme.Content = New-RvIcon $(if ($w.Theme -eq 'dark') { 'sun' } else { 'moon' }) -Size 15
    $theme.ToolTip = RvT 'themeTip'
}

function Update-RvContent {
    $w = $script:RvWin
    $panel = $w.Window.FindName('Content')
    $panel.Children.Clear()
    if ($w.Mode -eq 'first') {
        Add-RvStepView $panel
    } else {
        switch ($w.View) {
            'pair'  { Add-RvPairView $panel }
            'pc'    { Add-RvPcView $panel }
            'perms' { Add-RvPermsView $panel }
            'maint' { Add-RvMaintView $panel }
        }
    }
}

function Add-RvHeader {
    param($Panel, [string]$Title, [string]$Sub, $Right = $null)
    $head = New-RvGrid @('*', 'auto')
    # Not $title: PowerShell names ignore case, so that is the [string] $Title.
    $heading = New-RvText $Title -Size 22 -Weight 'Bold' -Margin @(0, 0, 0, 4)
    Add-RvCell $head $heading 0
    if ($Right) { $Right.VerticalAlignment = 'Top'; Add-RvCell $head $Right 1 }
    [void]$Panel.Children.Add($head)
    [void]$Panel.Children.Add((New-RvText $Sub -Size 13.5 -Brush 'Ink2' -Margin @(0, 0, 0, 20) -MaxWidth 620))
    $w = $script:RvWin
    if ($w.Notice) { [void]$Panel.Children.Add((New-RvNote $w.Notice.Text $w.Notice.Kind)) }
}

function New-RvNote {
    param([string]$Text, [string]$Kind = 'info', [double[]]$Margin = @(0, 0, 0, 16))
    switch ($Kind) {
        'ok'   { $bg = 'MossSoft'; $fg = 'Moss' }
        'warn' { $bg = 'AmberSoft'; $fg = 'Amber' }
        'bad'  { $bg = 'DangerSoft'; $fg = 'Danger' }
        default { $bg = 'DuskSoft'; $fg = 'Ink2' }
    }
    return (New-RvBox (New-RvText $Text -Size 12.5 -Brush $fg) -Bg $bg -Line '' -Thick @(0) -Radius 10 -Padding @(14, 11) -Margin $Margin)
}

function New-RvRow {
    param([object[]]$Children, [double[]]$Margin = @(0, 16, 0, 0))
    $row = New-RvStack 'Horizontal' -Margin $Margin
    foreach ($c in $Children) { if ($c) { $c.Margin = New-RvTh @(0, 0, 8, 0); [void]$row.Children.Add($c) } }
    return $row
}

# ----------------------------------------------------------------- the pages --

# One code with what it is for: the QR on the left, the words on the right.
function New-RvCodeCard {
    param([string[]]$Rows, [string]$Field, [string]$Ink, [string]$Num, [string]$Title, [string]$How, [string]$Aside, [double]$Size = 180)
    $grid = New-RvGrid @('auto', '*')
    Add-RvCell $grid (New-RvQr $Rows $Field $Ink $Size) 0
    $text = New-RvStack -Margin @(16, 2, 0, 0)
    $text.VerticalAlignment = 'Center'
    if ($Num) {
        $disc = New-RvDisc $Num -Bg $Field -Fg $Ink
        $disc.HorizontalAlignment = 'Left'
        $disc.Margin = New-RvTh @(0, 0, 0, 8)
        [void]$text.Children.Add($disc)
    }
    [void]$text.Children.Add((New-RvText $Title -Size 15 -Weight 'SemiBold' -Margin @(0, 0, 0, 4)))
    [void]$text.Children.Add((New-RvText $How -Size 12.5 -Brush 'Ink2' -Margin @(0, 0, 0, 6)))
    if ($Aside) { [void]$text.Children.Add((New-RvText $Aside -Size 12.5 -Brush 'Ink3')) }
    Add-RvCell $grid $text 1
    return (New-RvBox $grid -Radius 14 -Padding @(16, 16))
}

# The pairing code and the values in it. -PairingOnly leaves out the app code,
# for the walkthrough, where getting the app was the first step.
function Add-RvPairBlock {
    param($Panel, [switch]$PairingOnly)
    $w = $script:RvWin
    $s = $w.Status
    $pair = if ($s) { $s.Pair } else { $null }

    $codes = New-Object Windows.Controls.Primitives.UniformGrid
    $codes.Columns = if ($PairingOnly) { 1 } else { 2 }
    $codes.Rows = 1
    if ($PairingOnly) { $codes.MaxWidth = 640; $codes.HorizontalAlignment = 'Left' }
    if (-not $PairingOnly) {
        $app = New-RvCodeCard $script:RvAppQr '#FFD2AE' '#2A1206' '1' (RvT 'appTitle') (RvT 'appHow') (RvT 'appAside')
        $app.Margin = New-RvTh @(0, 0, 7, 0)
        [void]$codes.Children.Add($app)
    }
    if ($pair -and $pair.qr) {
        $link = New-RvCodeCard ([string[]]$pair.qr) '#B9CCFF' '#121A33' $(if ($PairingOnly) { '' } else { '2' }) (RvT 'linkTitle') (RvT 'scanHow') ''
    } else {
        $why = if (-not $s) { RvT 'pairLoading' } elseif ($s.PairError -eq 'old') { RvT 'pairOld' } elseif ($pair -and -not $pair.ip) { RvT 'pairNoNet' } else { RvT 'pairMissing' }
        $wait = New-RvStack
        [void]$wait.Children.Add((New-RvText (RvT 'linkTitle') -Size 15 -Weight 'SemiBold' -Margin @(0, 0, 0, 6)))
        [void]$wait.Children.Add((New-RvText $why -Size 12.5 -Brush 'Ink2'))
        $link = New-RvBox $wait -Radius 14 -Padding @(18, 18)
    }
    if (-not $PairingOnly) { $link.Margin = New-RvTh @(7, 0, 0, 0) }
    [void]$codes.Children.Add($link)
    [void]$Panel.Children.Add($codes)

    if (-not $PairingOnly) {
        [void]$Panel.Children.Add((New-RvText (RvT 'colourNote') -Size 12 -Brush 'Ink3' -Margin @(0, 12, 0, 0)))
    }
    if (-not $pair) { return }

    # The same values, to type in by hand.
    $list = New-RvStack
    $head = New-RvBox (New-RvText (RvT 'typeHead') -Size 11.5 -Brush 'Ink3' -Weight 'Bold') -Bg '' -Line 'Line' -Thick @(0, 0, 0, 1) -Radius 0 -Padding @(16, 11)
    [void]$list.Children.Add($head)
    $hidden = [string]([char]0x2022) * 24
    $fields = @(
        @{ Key = 'name'; Value = $pair.name },
        @{ Key = 'address'; Value = $pair.ip },
        @{ Key = 'port'; Value = "$($pair.port)" },
        @{ Key = 'token'; Value = $pair.token; Secret = $true },
        @{ Key = 'mac'; Value = $pair.mac }
    )
    for ($i = 0; $i -lt $fields.Count; $i++) {
        $f = $fields[$i]
        $row = New-RvGrid @('110', '*', 'auto')
        $k = New-RvText (RvT $f.Key) -Size 13.5 -Brush 'Ink3'
        $k.VerticalAlignment = 'Center'
        Add-RvCell $row $k 0
        $shown = if ($f.Secret -and -not $w.ShowToken) { $hidden } else { [string]$f.Value }
        $v = New-RvText $shown -Size 13 -Mono
        $v.VerticalAlignment = 'Center'
        Add-RvCell $row $v 1
        $acts = New-RvStack 'Horizontal'
        if ($f.Secret) {
            [void]$acts.Children.Add((New-RvButton (RvT $(if ($w.ShowToken) { 'hide' } else { 'show' })) @{ Do = 'token' } 'RvSmall'))
        }
        [void]$acts.Children.Add((New-RvButton (RvT 'copy') @{ Do = 'copy'; Value = [string]$f.Value } 'RvSmall'))
        Add-RvCell $row $acts 2
        $last = $i -eq $fields.Count - 1
        [void]$list.Children.Add((New-RvBox $row -Bg '' -Line 'Line' -Thick $(if ($last) { @(0) } else { @(0, 0, 0, 1) }) -Radius 0 -Padding @(16, 9)))
    }
    $card = New-RvBox $list -Radius 12 -Padding @(0) -Margin @(0, 18, 0, 0)
    [void]$Panel.Children.Add($card)
    [void]$Panel.Children.Add((New-RvNote (RvT 'tokenWarn') 'warn' -Margin @(0, 14, 0, 0)))
}

function Add-RvPairView {
    param($Panel)
    $w = $script:RvWin
    $refresh = New-RvButton (RvT 'refresh') @{ Do = 'refresh' } 'RvSmall'
    Add-RvHeader $Panel (RvT 'pairTitle') (RvT 'pairSub') $refresh
    Add-RvPairBlock $Panel
    $pair = if ($w.Status) { $w.Status.Pair } else { $null }
    if ($pair -and $pair.ip) {
        $busy = Test-RvBusy
        [void]$Panel.Children.Add((New-RvRow @(
            (New-RvButton (RvT 'newCode') @{ Do = 'newcode' } 'RvBtn' -Disabled:$busy),
            (New-RvButton (RvT 'browser') @{ Do = 'browser'; Url = "http://$($pair.ip):$($pair.port)" })
        )))
    }
}

function New-RvTile {
    param([string]$Label, $Value, [string]$Meta, [double[]]$Margin)
    $s = New-RvStack
    [void]$s.Children.Add((New-RvText $Label -Size 12 -Brush 'Ink3' -Margin @(0, 0, 0, 6)))
    [void]$s.Children.Add($Value)
    if ($Meta) { [void]$s.Children.Add((New-RvText $Meta -Size 12 -Brush 'Ink2' -Margin @(0, 5, 0, 0))) }
    return (New-RvBox $s -Radius 12 -Padding @(16, 14) -Margin $Margin)
}

function New-RvTileValue {
    param([string]$Text, [string]$Pill = '', [string]$Kind = 'on')
    $row = New-RvStack 'Horizontal'
    $t = New-RvText $Text -Size 15 -Weight 'SemiBold' -NoWrap
    $t.VerticalAlignment = 'Center'
    [void]$row.Children.Add($t)
    if ($Pill) {
        $p = New-RvPill $Pill $Kind
        $p.Margin = New-RvTh @(8, 0, 0, 0)
        [void]$row.Children.Add($p)
    }
    return $row
}

function Add-RvPcView {
    param($Panel)
    $w = $script:RvWin
    $s = $w.Status
    Add-RvHeader $Panel (RvT 'pcTitle') (RvT 'pcSub') (New-RvButton (RvT 'refresh') @{ Do = 'refresh' } 'RvSmall')
    if (-not $s) {
        [void]$Panel.Children.Add((New-RvText (RvT 'checking') -Brush 'Ink2'))
        return
    }

    $tiles = New-Object Windows.Controls.Primitives.UniformGrid
    $tiles.Columns = 2
    $left = @(0, 0, 6, 12)
    $right = @(6, 0, 0, 12)

    if ($s.Running) {
        $since = if ($s.Since) {
            if ($s.Since.Date -eq (Get-Date).Date) { $s.Since.ToString('HH:mm') } else { $s.Since.ToString('d MMM HH:mm') }
        }
        $meta = if ($since) { RvT 'agentMeta' @($s.Port, $since) } else { RvT 'agentMetaPort' $s.Port }
        [void]$tiles.Children.Add((New-RvTile (RvT 'agent') (New-RvTileValue (RvT 'running') (RvT 'on') 'on') $meta $left))
    } else {
        [void]$tiles.Children.Add((New-RvTile (RvT 'agent') (New-RvTileValue (RvT 'stopped') (RvT 'off') 'warn') (RvT 'agentMetaOff') $left))
    }

    if ($s.Presence) {
        [void]$tiles.Children.Add((New-RvTile (RvT 'lockResp') (New-RvTileValue (RvT 'setUp') (RvT 'on') 'on') (RvT 'lockMetaOn' ($s.Port + 1)) $right))
    } else {
        [void]$tiles.Children.Add((New-RvTile (RvT 'lockResp') (New-RvTileValue (RvT 'notSet') (RvT 'off') 'off') (RvT 'lockMetaOff') $right))
    }

    if (-not $s.Uefi) {
        [void]$tiles.Children.Add((New-RvTile (RvT 'bios') (New-RvTileValue (RvT 'biosLegacy')) (RvT 'biosLegacyMeta') $left))
    } elseif ($s.Firmware) {
        [void]$tiles.Children.Add((New-RvTile (RvT 'bios') (New-RvTileValue (RvT 'allowed') (RvT 'on') 'on') (RvT 'biosMeta') $left))
    } else {
        [void]$tiles.Children.Add((New-RvTile (RvT 'bios') (New-RvTileValue (RvT 'notSet') (RvT 'off') 'off') (RvT 'lockMetaOff') $left))
    }

    $short = if ($s.Sha) { $s.Sha.Substring(0, 7) } else { '' }
    if (-not $s.Sha) {
        $version = New-RvTile (RvT 'version') (New-RvTileValue (RvT 'verUnknown')) (RvT 'verMetaNone') $right
    } elseif (-not $s.Compared) {
        $version = New-RvTile (RvT 'version') (New-RvTileValue $short) (RvT 'verOffline' $short) $right
    } elseif ($s.Ahead -gt 0) {
        $label = if ($s.Ahead -eq 1) { RvT 'updOne' } else { RvT 'updAvail' $s.Ahead }
        $version = New-RvTile (RvT 'version') (New-RvTileValue $short $label 'new') (RvT 'verMeta' $short) $right
    } else {
        $version = New-RvTile (RvT 'version') (New-RvTileValue $short (RvT 'upToDate') 'on') (RvT 'verMeta' $short) $right
    }
    [void]$tiles.Children.Add($version)
    [void]$Panel.Children.Add($tiles)

    # The network adapters the agent sees, the one used for waking first.
    $adapters = if ($s.Pair) { @($s.Pair.adapters) } else { @() }
    if ($adapters.Count) {
        $table = New-RvStack
        $cols = @('1.1*', '1*', '1.3*', '150')
        $head = New-RvGrid $cols
        $i = 0
        foreach ($h in @('adapter', 'ip', 'macH')) {
            Add-RvCell $head (New-RvText (RvT $h).ToUpper() -Size 11.5 -Brush 'Ink3' -Weight 'Bold') $i
            $i++
        }
        [void]$table.Children.Add((New-RvBox $head -Bg '' -Line 'Line' -Thick @(0, 0, 0, 1) -Radius 0 -Padding @(16, 10)))
        for ($n = 0; $n -lt $adapters.Count; $n++) {
            $a = $adapters[$n]
            $row = New-RvGrid $cols
            Add-RvCell $row (New-RvText $a.interface -Size 13) 0
            Add-RvCell $row (New-RvText $a.ip -Size 13 -Mono) 1
            Add-RvCell $row (New-RvText $a.mac -Size 13 -Mono) 2
            $role = if ($n -eq 0) { New-RvPill (RvT 'primary') 'new' } else { New-RvPill (RvT 'other') 'off' }
            $role.HorizontalAlignment = 'Right'
            Add-RvCell $row $role 3
            $last = $n -eq $adapters.Count - 1
            [void]$table.Children.Add((New-RvBox $row -Bg '' -Line 'Line' -Thick $(if ($last) { @(0) } else { @(0, 0, 0, 1) }) -Radius 0 -Padding @(16, 10)))
        }
        [void]$Panel.Children.Add((New-RvText (RvT 'network') -Size 11.5 -Brush 'Ink3' -Weight 'Bold' -Margin @(0, 8, 0, 8)))
        [void]$Panel.Children.Add((New-RvBox $table -Radius 12 -Padding @(0)))
    }
    [void]$Panel.Children.Add((New-RvNote (RvT 'wolNote') 'info' -Margin @(0, 14, 0, 0)))
}

# One of the two optional extras, with its switch and what it grants.
function New-RvPermCard {
    param([string]$Title, [string]$Desc, [string]$Grants, [string]$Not, [bool]$On, [hashtable]$Tag, [switch]$Disabled, [string]$Note)
    $s = New-RvStack
    $top = New-RvGrid @('*', 'auto')
    $h = New-RvText $Title -Size 15 -Weight 'SemiBold'
    $h.VerticalAlignment = 'Center'
    Add-RvCell $top $h 0
    Add-RvCell $top (New-RvSwitch $On $Tag -Disabled:$Disabled) 1
    [void]$s.Children.Add($top)
    [void]$s.Children.Add((New-RvText $Desc -Size 13 -Brush 'Ink2' -Margin @(0, 8, 0, 0) -MaxWidth 640))
    $dl = New-RvGrid @('130', '*') -Margin @(0, 12, 0, 0)
    $r = 0
    foreach ($pair in @(@((RvT 'grants'), $Grants), @((RvT 'notGrant'), $Not), @((RvT 'needs'), (RvT 'admin')))) {
        $dl.RowDefinitions.Add((New-Object Windows.Controls.RowDefinition))
        Add-RvCell $dl (New-RvText $pair[0] -Size 12.5 -Brush 'Ink3' -Margin @(0, 0, 12, 6)) 0 $r
        Add-RvCell $dl (New-RvText $pair[1] -Size 12.5 -Margin @(0, 0, 0, 6)) 1 $r
        $r++
    }
    [void]$s.Children.Add($dl)
    if ($Note) { [void]$s.Children.Add((New-RvNote $Note 'info' -Margin @(0, 8, 0, 0))) }
    return (New-RvBox $s -Radius 12 -Padding @(18, 16) -Margin @(0, 0, 0, 12))
}

function Add-RvPermsView {
    param($Panel)
    $w = $script:RvWin
    $s = $w.Status
    Add-RvHeader $Panel (RvT 'permsTitle') (RvT 'permsSub')
    if (-not $s) {
        [void]$Panel.Children.Add((New-RvText (RvT 'checking') -Brush 'Ink2'))
        return
    }
    $busy = Test-RvBusy
    $noUefi = -not $s.Uefi
    [void]$Panel.Children.Add((New-RvPermCard (RvT 'bios') (RvT 'biosDesc') (RvT 'biosGrants') (RvT 'biosNot') `
        ([bool]$s.Firmware) @{ Do = 'perm'; Which = 'bios' } -Disabled:($busy -or $noUefi) -Note $(if ($noUefi) { RvT 'biosNoUefi' } else { '' })))
    [void]$Panel.Children.Add((New-RvPermCard (RvT 'lockTitle') (RvT 'lockDesc') (RvT 'lockGrants' ($s.Port + 1)) (RvT 'lockNot') `
        ([bool]$s.Presence) @{ Do = 'perm'; Which = 'lock' } -Disabled:$busy))
    if ($w.Job -and $w.Job.Kind -eq 'perm') { Add-RvLog $Panel -NoBar }
}

# A line of the log, in the window's language.
function Get-RvLogText {
    param([string]$Text)
    if ($script:RvWin.Lang -eq 'nl' -and $script:RvLogNl.ContainsKey($Text)) { return $script:RvLogNl[$Text] }
    return ($Text -replace '\.\.\.$', [string][char]0x2026)
}

# The worker's progress: a bar, and each step as it happens.
function Add-RvLog {
    param($Panel, [switch]$NoBar)
    $w = $script:RvWin
    if (-not $NoBar) {
        $track = New-RvGrid @("$([Math]::Max(0.001, $w.Progress))*", "$([Math]::Max(0.001, 1 - $w.Progress))*")
        $fill = New-Object Windows.Controls.Border
        $fill.CornerRadius = New-Object Windows.CornerRadius(4)
        $fill.SetResourceReference([Windows.Controls.Border]::BackgroundProperty, 'Progress')
        Add-RvCell $track $fill 0
        $bar = New-RvBox $track -Bg 'Raised' -Line 'Line' -Radius 5 -Padding @(0) -Margin @(0, 4, 0, 14)
        $bar.Height = 10
        [void]$Panel.Children.Add($bar)
    }
    $lines = New-RvStack
    $running = [bool]$w.Job
    $lastStep = -1
    for ($i = 0; $i -lt $w.Log.Count; $i++) { if ($w.Log[$i].Kind -eq 'step') { $lastStep = $i } }
    for ($i = 0; $i -lt $w.Log.Count; $i++) {
        $entry = $w.Log[$i]
        $row = New-RvGrid @('20', '*')
        switch ($entry.Kind) {
            'step' {
                if ($running -and $i -eq $lastStep) { $mark = [string][char]0x2192; $mb = 'Dusk'; $tb = 'Ink' }
                else { $mark = [string][char]0x2713; $mb = 'Moss'; $tb = 'Ink' }
            }
            'ok'   { $mark = [string][char]0x2713; $mb = 'Moss'; $tb = 'Moss' }
            'warn' { $mark = '!'; $mb = 'Amber'; $tb = 'Amber' }
            default { $mark = ''; $mb = 'Ink3'; $tb = 'Ink3' }
        }
        Add-RvCell $row (New-RvText $mark -Size 12.5 -Brush $mb -Weight 'Bold') 0
        Add-RvCell $row (New-RvText (Get-RvLogText $entry.Text) -Size 12.5 -Brush $tb -Mono) 1
        $row.Margin = New-RvTh @(0, 2, 0, 2)
        [void]$lines.Children.Add($row)
    }
    $box = New-RvBox $lines -Radius 12 -Padding @(16, 12) -Margin @(0, 0, 0, 14)
    $box.MinHeight = 120
    [void]$Panel.Children.Add($box)
}

function New-RvMaintRow {
    param([string]$Icon, [string]$Title, [string]$Desc, $Button, [string]$Confirm, [hashtable]$Go, [string]$GoText)
    $grid = New-RvGrid @('36', '*', 'auto')
    $grid.RowDefinitions.Add((New-Object Windows.Controls.RowDefinition))
    $grid.RowDefinitions.Add((New-Object Windows.Controls.RowDefinition))
    $ic = New-RvBox (New-RvIcon $Icon -Size 18 -Brush 'Ink2') -Bg 'Raised' -Line '' -Thick @(0) -Radius 9 -Padding @(9)
    $ic.VerticalAlignment = 'Center'
    Add-RvCell $grid $ic 0
    $text = New-RvStack -Margin @(14, 0, 14, 0)
    [void]$text.Children.Add((New-RvText $Title -Size 14.5 -Weight 'SemiBold' -Margin @(0, 0, 0, 2)))
    [void]$text.Children.Add((New-RvText $Desc -Size 12.5 -Brush 'Ink2'))
    Add-RvCell $grid $text 1
    $Button.VerticalAlignment = 'Center'
    Add-RvCell $grid $Button 2
    if ($Confirm) {
        $ask = New-RvGrid @('*', 'auto', 'auto')
        $q = New-RvText $Confirm -Size 12.5 -Brush 'Ink2'
        $q.VerticalAlignment = 'Center'
        Add-RvCell $ask $q 0
        Add-RvCell $ask (New-RvButton (RvT 'cancel') @{ Do = 'cancel' } 'RvBtn' -Margin @(10, 0, 0, 0)) 1
        Add-RvCell $ask (New-RvButton $GoText $Go 'RvDangerSolid' -Margin @(8, 0, 0, 0)) 2
        $line = New-RvBox $ask -Bg '' -Line 'Line' -Thick @(0, 1, 0, 0) -Radius 0 -Padding @(0, 12, 0, 0) -Margin @(0, 12, 0, 0)
        Add-RvCell $grid $line 0 1 3
    }
    return (New-RvBox $grid -Radius 12 -Padding @(16, 14) -Margin @(0, 0, 0, 10))
}

function Add-RvMaintView {
    param($Panel)
    $w = $script:RvWin
    $s = $w.Status
    Add-RvHeader $Panel (RvT 'maintTitle') (RvT 'maintSub')

    if ($w.Working) {
        [void]$Panel.Children.Add((New-RvText (RvT $w.Working) -Size 15 -Weight 'SemiBold' -Margin @(0, 0, 0, 6)))
        Add-RvLog $Panel
    }

    $busy = Test-RvBusy
    $ahead = if ($s -and $s.Compared) { $s.Ahead } else { $null }
    $updDesc = if ($ahead -gt 1) { RvT 'updateDesc' $ahead } elseif ($ahead -eq 1) { RvT 'updateDescOne' } else { RvT 'updateDescNone' }
    $updStyle = if ($ahead -gt 0) { 'RvPrimary' } else { 'RvBtn' }
    [void]$Panel.Children.Add((New-RvMaintRow 'update' (RvT 'update') $updDesc (New-RvButton (RvT 'update') @{ Do = 'maint'; Kind = 'update' } $updStyle -Disabled:$busy)))
    [void]$Panel.Children.Add((New-RvMaintRow 'maint' (RvT 'repair') (RvT 'repairDesc') (New-RvButton (RvT 'repair') @{ Do = 'maint'; Kind = 'repair' } 'RvBtn' -Disabled:$busy)))
    $ask = if ($w.Confirm -eq 'rotate') { RvT 'sureRotate' } else { '' }
    [void]$Panel.Children.Add((New-RvMaintRow 'key' (RvT 'rotate') (RvT 'rotateDesc') `
        (New-RvButton (RvT 'rotateBtn') @{ Do = 'confirm'; What = 'rotate' } 'RvBtn' -Disabled:($busy -or $w.Confirm -eq 'rotate')) `
        $ask @{ Do = 'maint'; Kind = 'rotate' } (RvT 'confirmRotate')))
    $ask = if ($w.Confirm -eq 'remove') { RvT 'sureRemove' } else { '' }
    [void]$Panel.Children.Add((New-RvMaintRow 'trash' (RvT 'remove') (RvT 'removeDesc') `
        (New-RvButton (RvT 'removeBtn') @{ Do = 'confirm'; What = 'remove' } 'RvDanger' -Disabled:($busy -or $w.Confirm -eq 'remove')) `
        $ask @{ Do = 'maint'; Kind = 'remove' } (RvT 'confirmRemove')))
    [void]$Panel.Children.Add((New-RvNote (RvT 'cmdHint') 'info' -Margin @(0, 6, 0, 0)))
}

# The first-install walkthrough, one step at a time.
function Add-RvStepView {
    param($Panel)
    $w = $script:RvWin

    switch ($w.Step) {
        1 {
            # The app first: the walkthrough ends with the phone scanning this
            # PC, and the app can download while the next steps run.
            Add-RvHeader $Panel (RvT 'appStepTitle') (RvT 'appStepSub')
            $card = New-RvCodeCard $script:RvAppQr '#FFD2AE' '#2A1206' '' (RvT 'appTitle') (RvT 'appHow') (RvT 'appStepAside') -Size 225
            $card.MaxWidth = 640
            $card.HorizontalAlignment = 'Left'
            [void]$Panel.Children.Add($card)
            [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'haveIt') @{ Do = 'step'; Step = 2 } 'RvPrimary'))))
        }
        2 {
            Add-RvHeader $Panel (RvT 'checkTitle') (RvT 'checkSub')
            $c = $w.Checks
            if (-not $c) {
                [void]$Panel.Children.Add((New-RvText (RvT 'checking') -Brush 'Ink2'))
                [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'back') @{ Do = 'step'; Step = 1 }))))
                return
            }
            $rows = @()
            $rows += , @('ok', $c.Windows, '')
            if ($c.NodeOk) { $rows += , @('ok', (RvT 'nodeName' $c.NodeVersion), (RvT 'nodeOk')) }
            elseif ($c.Winget -and $c.NodeVersion) { $rows += , @('info', (RvT 'nodeName' $c.NodeVersion), (RvT 'nodeOld')) }
            elseif ($c.Winget) { $rows += , @('info', (RvT 'nodeNone'), (RvT 'nodeWinget')) }
            else { $rows += , @('bad', (RvT 'nodeNone'), (RvT 'nodeBlocked')) }
            if ($c.Ip) { $rows += , @('ok', (RvT 'networkName'), "$($c.Adapter) $([char]0x00B7) $($c.Ip)") }
            else { $rows += , @('bad', (RvT 'networkName'), (RvT 'noNetwork')) }
            if (-not $c.PortOwner) { $rows += , @('ok', (RvT 'portName' $c.Port), (RvT 'portFree')) }
            elseif ($c.PortOurs) { $rows += , @('info', (RvT 'portName' $c.Port), (RvT 'portOwn')) }
            else { $rows += , @('warn', (RvT 'portName' $c.Port), (RvT 'portHeld' $c.PortOwner)) }

            $list = New-RvStack
            $blocked = $false
            for ($i = 0; $i -lt $rows.Count; $i++) {
                $r = $rows[$i]
                $grid = New-RvGrid @('24', 'auto', '*')
                switch ($r[0]) {
                    'ok'   { $icon = New-RvIcon 'check' -Size 16 -Brush 'Moss' -Stroke 2.2 }
                    'bad'  { $icon = New-RvIcon 'cross' -Size 16 -Brush 'Danger' -Stroke 2.2; $blocked = $true }
                    'warn' { $icon = New-RvIcon 'check' -Size 16 -Brush 'Amber' -Stroke 2.2 }
                    default { $icon = New-RvIcon 'check' -Size 16 -Brush 'Dusk' -Stroke 2.2 }
                }
                $icon.VerticalAlignment = 'Top'
                $icon.Margin = New-RvTh @(0, 1, 0, 0)
                Add-RvCell $grid $icon 0
                Add-RvCell $grid (New-RvText $r[1] -Size 13.5 -Margin @(10, 0, 14, 0) -NoWrap) 1
                $detail = New-RvText $r[2] -Size 12.5 -Brush $(if ($r[0] -eq 'bad') { 'Danger' } else { 'Ink3' })
                $detail.HorizontalAlignment = 'Right'
                $detail.TextAlignment = 'Right'
                Add-RvCell $grid $detail 2
                $last = $i -eq $rows.Count - 1
                [void]$list.Children.Add((New-RvBox $grid -Bg '' -Line 'Line' -Thick $(if ($last) { @(0) } else { @(0, 0, 0, 1) }) -Radius 0 -Padding @(16, 12)))
            }
            [void]$Panel.Children.Add((New-RvBox $list -Radius 12 -Padding @(0)))
            $buttons = @((New-RvButton (RvT 'back') @{ Do = 'step'; Step = 1 }))
            if ($blocked) { $buttons += New-RvButton (RvT 'checkAgain') @{ Do = 'check' } 'RvPrimary' }
            else { $buttons += New-RvButton (RvT 'installBtn') @{ Do = 'install' } 'RvPrimary' }
            [void]$Panel.Children.Add((New-RvRow $buttons))
        }
        3 {
            Add-RvHeader $Panel (RvT 'installTitle') (RvT 'installSub')
            Add-RvLog $Panel
            $state = $w.Install.State
            if ($state -eq 'done') {
                [void]$Panel.Children.Add((New-RvNote (RvT 'installDone' $(if ($w.Status) { $w.Status.Port } else { 5533 })) 'ok' -Margin @(0)))
                [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'next') @{ Do = 'step'; Step = 4 } 'RvPrimary'))))
            } elseif ($state -eq 'failed') {
                [void]$Panel.Children.Add((New-RvNote $w.Install.Error 'bad' -Margin @(0)))
                [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'back') @{ Do = 'step'; Step = 2 }),
                                                       (New-RvButton (RvT 'tryAgain') @{ Do = 'install' } 'RvPrimary'))))
            }
        }
        4 {
            Add-RvHeader $Panel (RvT 'extrasTitle') (RvT 'extrasSub')
            $busy = Test-RvBusy
            $uefi = -not $w.Status -or $w.Status.Uefi
            if ($uefi) {
                [void]$Panel.Children.Add((New-RvPermCard (RvT 'bios') (RvT 'biosDesc') (RvT 'biosGrants') (RvT 'biosNot') `
                    $w.ExtraBios @{ Do = 'extra'; Which = 'Bios' } -Disabled:$busy))
            }
            $port = if ($w.Status) { $w.Status.Port } else { 5533 }
            [void]$Panel.Children.Add((New-RvPermCard (RvT 'lockTitle') (RvT 'lockDesc') (RvT 'lockGrants' ($port + 1)) (RvT 'lockNot') `
                $w.ExtraLock @{ Do = 'extra'; Which = 'Lock' } -Disabled:$busy))
            if ($busy) {
                [void]$Panel.Children.Add((New-RvNote (RvT 'extrasApplying') 'info' -Margin @(0, 4, 0, 12)))
                Add-RvLog $Panel -NoBar
            }
            [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'back') @{ Do = 'step'; Step = 3 } -Disabled:$busy),
                                                   (New-RvButton (RvT 'next') @{ Do = 'extras' } 'RvPrimary' -Disabled:$busy))))
        }
        5 {
            Add-RvHeader $Panel (RvT 'pairNow') (RvT 'pairNowSub')
            Add-RvPairBlock $Panel -PairingOnly
            [void]$Panel.Children.Add((New-RvNote (RvT 'cmdHint') 'info' -Margin @(0, 14, 0, 0)))
            [void]$Panel.Children.Add((New-RvRow @((New-RvButton (RvT 'back') @{ Do = 'step'; Step = 4 }),
                                                   (New-RvButton (RvT 'finish') @{ Do = 'finish' } 'RvPrimary'))))
        }
    }
}

# ------------------------------------------------------------------ clicking --

function Invoke-RvClick {
    param($Source)
    $w = $script:RvWin
    $t = $Source.Tag
    try {
        switch ($t.Do) {
            'view'    { $w.View = $t.View; $w.Confirm = $null; $w.Notice = $null; Update-RvAll; $w.Window.FindName('ContentScroll').ScrollToTop() }
            'lang'    { $w.Lang = $t.Lang; Update-RvAll }
            'theme'   { Set-RvTheme $(if ($w.Theme -eq 'dark') { 'light' } else { 'dark' }); Update-RvSide }
            'copy'    { [Windows.Clipboard]::SetText([string]$t.Value); Show-RvToast (RvT 'copied') }
            'token'   { $w.ShowToken = -not $w.ShowToken; Update-RvContent }
            'browser' { Start-Process $t.Url }
            'refresh' { $w.Notice = $null; Request-RvStatus; Update-RvContent }
            'newcode' { $w.View = 'maint'; $w.Confirm = 'rotate'; $w.Notice = $null; Update-RvAll }
            'confirm' { $w.Confirm = $t.What; Update-RvContent }
            'cancel'  { $w.Confirm = $null; Update-RvContent }
            'maint'   { Start-RvMaint $t.Kind }
            'perm'    { Start-RvPerm $t.Which ([bool]$Source.IsChecked) }
            'extra'   { $w["Extra$($t.Which)"] = [bool]$Source.IsChecked }
            'step'    { $w.Step = $t.Step; $w.Notice = $null; Update-RvAll }
            'check'   { $w.Checks = $null; Add-RvJob @{ Kind = 'check'; Done = 'Complete-RvChecks' }; Update-RvContent }
            'install' { Start-RvInstall }
            'extras'  { Start-RvExtras }
            'finish'  { $w.Mode = 'installed'; $w.View = 'pc'; $w.Notice = $null; Update-RvAll; Request-RvStatus }
        }
    } catch {
        $w.Notice = @{ Kind = 'bad'; Text = (RvT 'failed' $_.Exception.Message) }
        Update-RvContent
    }
}

function Clear-RvLog {
    $w = $script:RvWin
    $w.Log.Clear()
    $w.Progress = 0
}

function Start-RvInstall {
    $w = $script:RvWin
    Clear-RvLog
    $w.Step = 3
    $w.Install = @{ State = 'running'; Error = $null }
    Add-RvJob @{ Kind = 'install'; Live = $true; Done = 'Complete-RvInstall' }
    Update-RvAll
}

function Start-RvExtras {
    $w = $script:RvWin
    if (-not $w.ExtraBios -and -not $w.ExtraLock) {
        $w.Step = 5
        Update-RvAll
        return
    }
    Clear-RvLog
    Add-RvJob @{ Kind = 'extras'; Live = $true; Arg = @{ Bios = $w.ExtraBios; Lock = $w.ExtraLock }; Done = 'Complete-RvExtras' }
    Update-RvContent
}

function Start-RvMaint {
    param([string]$Kind)
    $w = $script:RvWin
    $w.Confirm = $null
    $w.Notice = $null
    Clear-RvLog
    $w.Working = @{ update = 'wUpdate'; repair = 'wRepair'; rotate = 'wRotate'; remove = 'wRemove' }[$Kind]
    Add-RvJob @{ Kind = $Kind; Live = $true; Done = 'Complete-RvMaint' }
    Update-RvContent
}

function Start-RvPerm {
    param([string]$Which, [bool]$On)
    $w = $script:RvWin
    Clear-RvLog
    $w.Notice = @{ Kind = 'info'; Text = (RvT 'permAsk') }
    Add-RvJob @{ Kind = 'perm'; Live = $true; Arg = @{ Which = $Which; On = $On }; Done = 'Complete-RvPerm' }
    Update-RvContent
}

# ------------------------------------------------------- when a job finishes --

function Complete-RvLoad {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    if ($ErrorText) {
        $script:RvWin.Notice = @{ Kind = 'bad'; Text = (RvT 'failed' $ErrorText) }
        Update-RvContent
    }
}

function Complete-RvStatus {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    if ($Result) { $w.Status = $Result }
    Update-RvAll
}

function Complete-RvChecks {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    $w.Checks = if ($Result) { $Result } else { @{ Windows = 'Windows'; Port = 5533 } }
    if ($w.Mode -eq 'first' -and $w.Step -eq 2) { Update-RvContent }
}

function Complete-RvInstall {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    if ($ErrorText) {
        $w.Install = @{ State = 'failed'; Error = (RvT 'installFailed' $ErrorText) }
    } elseif (-not $Result -or -not $Result.Health) {
        $w.Install = @{ State = 'failed'; Error = (RvT 'noAnswer' $InstallDir) }
    } else {
        $w.Progress = 1
        $w.Install = @{ State = 'done'; Error = $null }
        # The pairing code exists now; the last step needs it.
        Request-RvStatus
    }
    Update-RvAll
}

function Complete-RvExtras {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    $w.Step = 5
    if ($ErrorText) { $w.Notice = @{ Kind = 'warn'; Text = (RvT 'failed' $ErrorText) } }
    Request-RvStatus
    Update-RvAll
}

function Complete-RvPerm {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    $name = if ($Job.Arg.Which -eq 'bios') { RvT 'bios' } else { RvT 'lockTitle' }
    if ($ErrorText) {
        $w.Notice = @{ Kind = 'bad'; Text = (RvT 'failed' $ErrorText) }
    } elseif ($Result -and $Result.On -eq $Result.Wanted) {
        $w.Notice = @{ Kind = 'ok'; Text = (RvT $(if ($Result.On) { 'permOn' } else { 'permOff' }) $name) }
    } else {
        $w.Notice = @{ Kind = 'warn'; Text = (RvT 'permDenied') }
    }
    if ($w.Status -and $Result) {
        if ($Job.Arg.Which -eq 'bios') { $w.Status.Firmware = $Result.On } else { $w.Status.Presence = $Result.On }
    }
    Request-RvStatus
    Update-RvAll
}

function Complete-RvMaint {
    param([hashtable]$Job, $Result, [string]$ErrorText)
    $w = $script:RvWin
    $w.Working = $null
    if ($ErrorText) {
        $w.Notice = @{ Kind = 'bad'; Text = (RvT 'failed' $ErrorText) }
        Request-RvStatus
        Update-RvAll
        return
    }
    switch ($Job.Kind) {
        'remove' {
            $w.Mode = 'first'
            $w.Step = 1
            $w.Status = $null
            $w.Checks = $null
            $w.Install = @{ State = 'idle'; Error = $null }
            $w.Notice = @{ Kind = 'ok'; Text = (RvT 'doneRemove') }
            Add-RvJob @{ Kind = 'check'; Done = 'Complete-RvChecks' }
        }
        'rotate' {
            $w.ShowToken = $false
            $w.View = 'pair'
            $w.Notice = @{ Kind = 'ok'; Text = (RvT 'doneRotate') }
            Request-RvStatus
        }
        default {
            if ($Result -and $Result.Health) {
                $w.Notice = @{ Kind = 'ok'; Text = (RvT $(if ($Job.Kind -eq 'repair') { 'doneRepair' } else { 'doneUpdate' })) }
            } else {
                $w.Notice = @{ Kind = 'warn'; Text = (RvT 'noAnswer' $InstallDir) }
            }
            Request-RvStatus
        }
    }
    Update-RvAll
}

# ---------------------------------------------------------- opening it all --

<#
    Builds the window and its state without showing it. Show-RvWindow shows
    it; the tests in tools\ draw it to a picture instead. -NoWorker is for
    those: no background work at all, and the state is theirs to set.
#>
function New-RvWindow {
    param([switch]$NoWorker)
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
    Initialize-RvStrings
    $script:RvMono = New-Object Windows.Media.FontFamily('Cascadia Mono, Consolas')
    $window = [Windows.Markup.XamlReader]::Parse((New-RvWindowXaml))

    $installed = (Test-Path (Join-Path $InstallDir 'package.json')) -and (Test-Path (Join-Path $InstallDir 'node_modules'))
    $script:RvWin = @{
        Window = $window; Lang = (Get-RvDefaultLanguage); Theme = 'dark'; Hwnd = $null
        Mode = $(if ($installed) { 'installed' } else { 'first' }); View = 'pair'; Step = 1
        ShowToken = $false; Confirm = $null; Notice = $null; Working = $null
        Status = $null; Checks = $null; Install = @{ State = 'idle'; Error = $null }
        ExtraBios = $false; ExtraLock = $false
        Log = (New-Object System.Collections.ArrayList); Progress = 0
        Queue = (New-Object System.Collections.ArrayList); Job = $null; Runspace = $null; ToastUntil = $null
    }
    $w = $script:RvWin

    # It must fit an old 1366x768 laptop as well as a big screen.
    $area = [Windows.SystemParameters]::WorkArea
    $window.Width = [Math]::Min(1120, $area.Width * 0.95)
    $window.Height = [Math]::Min(800, $area.Height * 0.92)
    try { $window.Icon = New-RvLogoImage } catch { }
    $window.FindName('Logo').Content = New-RvLogo

    $window.FindName('LangEn').Tag = @{ Do = 'lang'; Lang = 'en' }
    $window.FindName('LangNl').Tag = @{ Do = 'lang'; Lang = 'nl' }
    $window.FindName('ThemeBtn').Tag = @{ Do = 'theme' }
    foreach ($name in @('LangEn', 'LangNl', 'ThemeBtn')) {
        $window.FindName($name).Add_Click({ Invoke-RvClick $this })
    }

    Set-RvTheme (Get-RvDefaultTheme)

    if (-not $NoWorker) {
        $rs = [runspacefactory]::CreateRunspace()
        $rs.ApartmentState = 'STA'
        $rs.ThreadOptions = 'ReuseThread'
        $rs.Open()
        $w.Runspace = $rs
        $vars = @{
            Repo = $Repo; Branch = $Branch; TaskName = $TaskName; LegacyTask = $LegacyTask
            FirmwareTask = $FirmwareTask; PresenceTask = $PresenceTask; InstallDir = $InstallDir
            RvCommandNames = $script:RvCommandNames
        }
        Add-RvJob @{ Kind = 'load'; Source = (Get-RvWorkerSource); Vars = $vars; Done = 'Complete-RvLoad' }
        if ($installed) { Request-RvStatus } else { Add-RvJob @{ Kind = 'check'; Done = 'Complete-RvChecks' } }
    }

    Update-RvAll
    return $w
}

function Show-RvWindow {
    try {
        $w = New-RvWindow
    } catch {
        Write-Warn2 "The window could not open ($($_.Exception.Message)). Here is the text version instead."
        return 'failed'
    }
    $window = $w.Window

    $timer = New-Object Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(120)
    $timer.Add_Tick({ Invoke-RvTick })

    $window.Add_SourceInitialized({
        $script:RvWin.Hwnd = (New-Object Windows.Interop.WindowInteropHelper($this)).Handle
        Set-RvTitleBar
    })
    # Something halfway through changing this PC has to finish first.
    $window.Add_Closing({
        try {
            if (Test-RvBusy) {
                $_.Cancel = $true
                $script:RvWin.Notice = @{ Kind = 'warn'; Text = (RvT 'busyClose') }
                Update-RvContent
            }
        } catch { }
    })
    # Opened from a terminal, a window can land behind it. Bring it forward once.
    $window.Add_ContentRendered({ $this.Topmost = $true; $this.Activate(); $this.Topmost = $false })

    $timer.Start()
    try {
        [void]$window.ShowDialog()
    } finally {
        $timer.Stop()
        if ($w.Job) { try { [void]$w.Job.PS.BeginStop($null, $null) } catch { } }
        if ($w.Runspace) { try { $w.Runspace.CloseAsync() } catch { } }
    }
    return 'done'
}

# ---------------------------------------------------------------------- main --

if ($Uninstall) { Invoke-Uninstall; return }

# On a desktop, the window -- unless the text version was asked for, or one of
# the scripted options says nobody is there to click. If it cannot open after
# all, the text version below carries on as before.
$scripted = $Firmware -or $NoPair -or $NoAutoStart -or $NoFirmware -or $LockScreen -or $NoLockScreen
if (-not $Console -and -not $scripted -and (Test-RvWindowPossible)) {
    if ((Show-RvWindow) -ne 'failed') { return }
}

Write-Banner

try {
    $nodePath = Resolve-Node
} catch {
    # Resolve-Node has already said why, in the terminal's own words.
    exit 1
}

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
$health = Install-Reveille -Destination $InstallDir -Repairing:$repairing -NoAutoStart:$NoAutoStart
if (-not $health) {
    Write-Host ''
    Write-Warn2 'The agent did not answer. Something is wrong.'
    Write-Warn2 "Run this to see why:  cd `"$InstallDir`"; node src\index.js"
    Write-Host ''
    exit 1
}
$hasCommand = Install-ReveilleCommand

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

if ($hasCommand) {
    Write-Host '  To open Reveille again later, type this in a new PowerShell window:' -ForegroundColor White
    Write-Dim '  reveille'
} else {
    Write-Host '  To show the pairing code again later:' -ForegroundColor White
    Write-Dim "  cd `"$InstallDir`"; node pair.js"
}
Write-Host ''

if (-not $NoPair) {
    Write-Step 'Opening the pairing code...'
    Push-Location $InstallDir
    try { & $nodePath 'pair.js' } finally { Pop-Location }
}
