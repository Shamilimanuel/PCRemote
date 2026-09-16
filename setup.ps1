<#
    Reveille -- one-line setup for the PC agent.

        irm https://raw.githubusercontent.com/Shamilimanuel/PCRemote/main/setup.ps1 | iex

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
    [switch]$NoFirmware
)

$ErrorActionPreference = 'Stop'

$Repo       = 'Shamilimanuel/PCRemote'
$Branch     = 'main'
$TaskName   = 'ReveilleAgent'
$LegacyTask = 'PCRemoteAgent'
$FirmwareTask = 'ReveilleFirmwareReboot'
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

# ---------------------------------------------------------------------- main --

if ($Uninstall) { Invoke-Uninstall; return }

Write-Banner

$nodePath = Resolve-Node
Get-AgentFiles -Destination $InstallDir

Write-Step 'Installing what it needs...'
Push-Location $InstallDir
try {
    & npm install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Check your internet connection and try again.' }
} finally {
    Pop-Location
}

if ($NoAutoStart) {
    Write-Dim 'skipping the start-at-login step, as asked'
} else {
    Write-Step 'Setting it to start with Windows...'
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
Write-Host '  To show the pairing code again later:' -ForegroundColor White
Write-Dim "  cd `"$InstallDir`"; npm run pair"
Write-Host ''

if (-not $NoPair) {
    Write-Step 'Opening the pairing code...'
    Push-Location $InstallDir
    try { & $nodePath 'pair.js' } finally { Pop-Location }
}
