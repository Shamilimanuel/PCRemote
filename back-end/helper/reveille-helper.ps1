<#
    The agent's Windows helper: the few things Node cannot do by itself.

    Volume, the media keys, a picture of the screen, and how busy the graphics
    card and the network are. Each needs a Windows API, and Node has no way to
    call one without a compiled add-on -- which would be a program of our own,
    unsigned, and blocked by Smart App Control. PowerShell can compile a little
    C# on the spot, and Windows allows that.

    It is started once by src/winhelper.js and stays running, because starting
    PowerShell and compiling costs a couple of seconds and a volume slider
    cannot wait that long. It reads one JSON request per line on stdin and
    writes one JSON reply per line on stdout:

        {"id":1,"cmd":"volume"}            -> {"id":1,"ok":true,"result":{...}}

    It is started from a script block, not with -File, so PowerShell's
    execution policy -- which this machine's owner chose -- is never in play.
#>

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Text;
using System.Runtime.InteropServices;

namespace Reveille
{
    // ---- volume: Windows Core Audio, the speaker the PC is using now ----

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out int count);
        int SetMasterVolumeLevel(float levelDb, Guid context);
        int SetMasterVolumeLevelScalar(float level, Guid context);
        int GetMasterVolumeLevel(out float levelDb);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float levelDb, Guid context);
        int SetChannelVolumeLevelScalar(uint channel, float level, Guid context);
        int GetChannelVolumeLevel(uint channel, out float levelDb);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid context);
        int GetMute(out bool mute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume endpoint);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int NotUsed();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator { }

    public static class Audio
    {
        // Asked for fresh each time: plugging in headphones changes which
        // speaker is the default, and a cached one would be the old one.
        static IAudioEndpointVolume Endpoint()
        {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
            IMMDevice device;
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out device));
            IAudioEndpointVolume endpoint;
            Guid iid = typeof(IAudioEndpointVolume).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23 /* CLSCTX_ALL */, 0, out endpoint));
            return endpoint;
        }

        public static int GetLevel()
        {
            float level;
            Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out level));
            return (int)Math.Round(level * 100);
        }

        public static void SetLevel(int percent)
        {
            float level = Math.Max(0, Math.Min(100, percent)) / 100f;
            Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(level, Guid.Empty));
        }

        public static bool GetMuted()
        {
            bool muted;
            Marshal.ThrowExceptionForHR(Endpoint().GetMute(out muted));
            return muted;
        }

        public static void SetMuted(bool muted)
        {
            Marshal.ThrowExceptionForHR(Endpoint().SetMute(muted, Guid.Empty));
        }
    }

    // ---- the media keys, exactly as a keyboard's own play and skip keys ----

    public static class Keys
    {
        [DllImport("user32.dll")]
        static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

        const uint Extended = 0x1, KeyUp = 0x2;

        public static void Press(byte key)
        {
            keybd_event(key, 0, Extended, UIntPtr.Zero);
            keybd_event(key, 0, Extended | KeyUp, UIntPtr.Zero);
        }
    }

    // ---- a picture of the main screen ----

    public static class Screen
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
        [DllImport("user32.dll", SetLastError = true)] static extern bool GetUserObjectInformation(IntPtr obj, int index, StringBuilder info, int length, out int needed);
        [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);

        /// Whether the PC is locked -- or at any screen other than the user's
        /// own desktop. Windows normally refuses to let a program copy the lock
        /// screen, but not reliably: on some PCs the copy succeeds and shows
        /// it. So this is asked first, and a locked PC is never photographed.
        public static bool Locked()
        {
            if (Process.GetProcessesByName("LogonUI").Length > 0) return true;
            IntPtr desktop = OpenInputDesktop(0, false, 0x0001 /* DESKTOP_READOBJECTS */);
            if (desktop == IntPtr.Zero) return true;
            try
            {
                var name = new StringBuilder(256);
                int needed;
                if (!GetUserObjectInformation(desktop, 2 /* UOI_NAME */, name, name.Capacity, out needed)) return true;
                return !string.Equals(name.ToString(), "Default", StringComparison.OrdinalIgnoreCase);
            }
            finally
            {
                CloseDesktop(desktop);
            }
        }

        public static int Width { get { return GetSystemMetrics(0); } }
        public static int Height { get { return GetSystemMetrics(1); } }

        /// The primary screen as a JPEG, scaled down to maxWidth if it is wider.
        public static string Capture(int maxWidth, long quality)
        {
            int w = Width, h = Height;
            using (var full = new Bitmap(w, h, PixelFormat.Format24bppRgb))
            {
                using (var g = Graphics.FromImage(full))
                {
                    // Fails with "The handle is invalid" while the PC is locked:
                    // the lock screen is a desktop no program may copy from.
                    g.CopyFromScreen(0, 0, 0, 0, new Size(w, h));
                }

                Bitmap output = full;
                if (maxWidth > 0 && w > maxWidth)
                {
                    int nh = (int)Math.Round(h * (maxWidth / (double)w));
                    output = new Bitmap(maxWidth, nh, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(output))
                    {
                        g.InterpolationMode = InterpolationMode.HighQualityBilinear;
                        g.DrawImage(full, 0, 0, maxWidth, nh);
                    }
                }

                try
                {
                    var codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
                    var options = new EncoderParameters(1);
                    options.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                    using (var stream = new MemoryStream())
                    {
                        output.Save(stream, codec, options);
                        byte[] jpeg = stream.ToArray();
                        // A fingerprint of the picture, so an unchanged screen
                        // need not be sent again: the same pixels always encode
                        // to the same JPEG.
                        string hash;
                        using (var md5 = System.Security.Cryptography.MD5.Create())
                        {
                            hash = BitConverter.ToString(md5.ComputeHash(jpeg)).Replace("-", "").ToLowerInvariant();
                        }
                        return output.Width + "x" + output.Height + ":" + hash + ":" + Convert.ToBase64String(jpeg);
                    }
                }
                finally
                {
                    if (!object.ReferenceEquals(output, full)) output.Dispose();
                }
            }
        }
    }

    // ---- how busy things are, from Windows' own performance counters ----

    /// Sums one counter across every instance whose name matches, keeping each
    /// counter alive between calls: a counter's first reading is always zero,
    /// and the next is the average since the one before.
    public class CounterSum
    {
        readonly string category, counter;
        readonly Func<string, bool> include;
        readonly Dictionary<string, PerformanceCounter> live = new Dictionary<string, PerformanceCounter>();

        public CounterSum(string category, string counter, Func<string, bool> include)
        {
            this.category = category;
            this.counter = counter;
            this.include = include;
        }

        public double Read()
        {
            // Instances come and go -- GPU engines are per process -- so the
            // list is refreshed on every read.
            string[] names = new PerformanceCounterCategory(category).GetInstanceNames();
            var seen = new HashSet<string>();
            double total = 0;
            foreach (string name in names)
            {
                if (!include(name)) continue;
                seen.Add(name);
                PerformanceCounter pc;
                if (!live.TryGetValue(name, out pc))
                {
                    pc = new PerformanceCounter(category, counter, name, true);
                    live[name] = pc;
                    pc.NextValue();
                    continue;
                }
                try { total += pc.NextValue(); } catch (InvalidOperationException) { }
            }
            foreach (string gone in live.Keys.Where(k => !seen.Contains(k)).ToList())
            {
                live[gone].Dispose();
                live.Remove(gone);
            }
            return total;
        }
    }

    public static class Busy
    {
        // What Task Manager calls "3D", which is where games and most rendering
        // show up.
        static readonly CounterSum gpu3d = new CounterSum("GPU Engine", "Utilization Percentage",
            n => n.IndexOf("engtype_3D", StringComparison.OrdinalIgnoreCase) >= 0);
        static readonly CounterSum gpuMemory = new CounterSum("GPU Adapter Memory", "Dedicated Usage", n => true);
        static readonly CounterSum received = new CounterSum("Network Interface", "Bytes Received/sec",
            n => n.IndexOf("loopback", StringComparison.OrdinalIgnoreCase) < 0 &&
                 n.IndexOf("isatap", StringComparison.OrdinalIgnoreCase) < 0);

        public static double GpuPercent() { return Math.Min(100, gpu3d.Read()); }
        public static double GpuMemoryBytes() { return gpuMemory.Read(); }
        public static double NetworkBytesPerSecond() { return received.Read(); }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing, System.Core
# Real pixels rather than the scaled-down picture Windows hands to programs
# that do not say they understand high-DPI screens.
[void][Reveille.Screen]::SetProcessDPIAware()

# The card with the most memory of its own -- the dedicated one, on a PC that
# also has graphics built into the processor. The registry has the true size;
# WMI's AdapterRAM stops at 4 GB.
function Get-GpuInfo {
    $best = $null
    $class = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    foreach ($key in @(Get-ChildItem $class -ErrorAction SilentlyContinue)) {
        $p = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
        if (-not $p -or -not $p.DriverDesc) { continue }
        $memory = $p.'HardwareInformation.qwMemorySize'
        if ($memory -is [byte[]]) { $memory = [BitConverter]::ToUInt64($memory, 0) }
        if (-not $memory) { continue }
        if (-not $best -or [uint64]$memory -gt $best.totalBytes) {
            $best = @{ name = [string]$p.DriverDesc; totalBytes = [uint64]$memory }
        }
    }
    return $best
}
$script:gpuInfo = Get-GpuInfo
$script:nvidiaSmi = (Get-Command nvidia-smi -ErrorAction SilentlyContinue).Source

function Get-GpuTemperature {
    # Only NVIDIA ships a tool that reports it without extra drivers.
    if (-not $script:nvidiaSmi) { return $null }
    try {
        $t = (& $script:nvidiaSmi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
        if ("$t".Trim() -match '^\d+$') { return [int]"$t".Trim() }
    } catch { }
    return $null
}

$keys = @{ playpause = 0xB3; next = 0xB0; previous = 0xB1; stop = 0xB2 }

<#
    What is playing, and its controls, from Windows' own media controls -- the
    panel that appears beside the volume flyout.

    Better than pressing a media key, which goes to whichever player Windows
    happens to consider current: with Spotify playing and a YouTube tab paused,
    "next" went to the tab, which has nothing to skip to, and nothing happened.
    Here every player is listed with what it can do, and the phone picks one.
    A PC without these (Windows 10 before 1809) falls back to the key press.
#>
$script:media = $null
$script:asTask = $null

function Wait-WinRt($operation, [Type]$type) {
    $task = $script:asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    [void]$task.Wait(4000)
    return $task.Result
}

function Get-MediaManager {
    if ($script:media) { return $script:media }
    try {
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
        [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
        $script:media = Wait-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
            ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    } catch {
        $script:media = $null
    }
    return $script:media
}

# "Spotify.exe" -> Spotify, "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" -> Media Player.
function Get-MediaAppName([string]$id) {
    $name = if ($id -match '!(.+)$') { $Matches[1] } else { $id }
    $name = $name -replace '(?i)\.exe$', ''
    $known = @{ 'Microsoft.ZuneMusic' = 'Media Player'; 'MSEdge' = 'Edge'; 'Chrome' = 'Chrome'; 'Microsoft.ZuneVideo' = 'Films & TV' }
    if ($known.ContainsKey($name)) { return $known[$name] }
    if ($name -match '\.([^.]+)$') { $name = $Matches[1] }
    return $name
}

function Get-MediaSessions {
    $manager = Get-MediaManager
    if (-not $manager) { return @() }
    $current = $manager.GetCurrentSession()
    $currentId = if ($current) { $current.SourceAppUserModelId } else { $null }
    $seen = @{}
    foreach ($session in @($manager.GetSessions())) {
        $id = [string]$session.SourceAppUserModelId
        if ($seen.ContainsKey($id)) { continue }
        $seen[$id] = $true
        $properties = $null
        try {
            $properties = Wait-WinRt ($session.TryGetMediaPropertiesAsync()) `
                ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        } catch { }
        $info = $session.GetPlaybackInfo()
        $controls = $info.Controls
        [pscustomobject]@{
            id = $id
            app = Get-MediaAppName $id
            title = if ($properties) { [string]$properties.Title } else { '' }
            artist = if ($properties) { [string]$properties.Artist } else { '' }
            playing = ([string]$info.PlaybackStatus -eq 'Playing')
            canPlayPause = [bool]($controls.IsPlayPauseToggleEnabled -or $controls.IsPlayEnabled -or $controls.IsPauseEnabled)
            canNext = [bool]$controls.IsNextEnabled
            canPrevious = [bool]$controls.IsPreviousEnabled
            current = ($id -eq $currentId)
            session = $session
        }
    }
}

function ConvertTo-MediaList($sessions) {
    @($sessions | ForEach-Object {
        @{ id = $_.id; app = $_.app; title = $_.title; artist = $_.artist; playing = $_.playing
           canPlayPause = $_.canPlayPause; canNext = $_.canNext; canPrevious = $_.canPrevious; current = $_.current }
    })
}

function Invoke-Media([string]$action, [string]$sessionId) {
    $sessions = @(Get-MediaSessions)
    if (-not $sessions.Count) {
        # Nothing registered with Windows: the old way, a media key.
        $vk = $keys[$action]
        if (-not $vk) { throw "Unknown media key: $action" }
        [Reveille.Keys]::Press([byte]$vk)
        return @{ pressed = $action; via = 'key' }
    }
    # The player the phone chose; otherwise whichever is playing; otherwise
    # the one Windows calls current.
    $target = $null
    if ($sessionId) { $target = $sessions | Where-Object { $_.id -eq $sessionId } | Select-Object -First 1 }
    if (-not $target) { $target = $sessions | Where-Object { $_.playing } | Select-Object -First 1 }
    if (-not $target) { $target = $sessions | Where-Object { $_.current } | Select-Object -First 1 }
    if (-not $target) { $target = $sessions[0] }

    $s = $target.session
    switch ($action) {
        'playpause' { $op = $s.TryTogglePlayPauseAsync() }
        'next' {
            if (-not $target.canNext) { throw "$($target.app) has nothing to skip to." }
            $op = $s.TrySkipNextAsync()
        }
        'previous' {
            if (-not $target.canPrevious) { throw "$($target.app) can't go back." }
            $op = $s.TrySkipPreviousAsync()
        }
        'stop' { $op = $s.TryStopAsync() }
        default { throw "Unknown media key: $action" }
    }
    $ok = Wait-WinRt $op ([bool])
    if (-not $ok) { throw "$($target.app) didn't respond." }
    return @{ pressed = $action; via = 'media'; app = $target.app }
}

[Console]::InputEncoding = New-Object Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

while ($null -ne ($line = [Console]::In.ReadLine())) {
    if (-not $line.Trim()) { continue }
    $id = $null
    try {
        $request = $line | ConvertFrom-Json
        $id = $request.id
        $a = $request.args
        $result = switch ($request.cmd) {
            'ping' { @{ pong = $true } }
            'volume' {
                if ($a -and $null -ne $a.level) { [Reveille.Audio]::SetLevel([int]$a.level) }
                if ($a -and $null -ne $a.muted) { [Reveille.Audio]::SetMuted([bool]$a.muted) }
                @{ level = [Reveille.Audio]::GetLevel(); muted = [Reveille.Audio]::GetMuted() }
            }
            'key' { Invoke-Media ([string]$a.key) ([string]$a.session) }
            'nowplaying' { @{ sessions = @(ConvertTo-MediaList (Get-MediaSessions)) } }
            'screen' {
                if ([Reveille.Screen]::Locked()) { throw 'locked' }
                $max = if ($a -and $a.maxWidth) { [int]$a.maxWidth } else { 1280 }
                $quality = if ($a -and $a.quality) { [long]$a.quality } else { 60 }
                $shot = [Reveille.Screen]::Capture($max, $quality)
                $size, $hash, $data = $shot -split ':', 3
                $w, $h = $size -split 'x'
                if ($a -and $a.since -and $a.since -eq $hash) {
                    @{ width = [int]$w; height = [int]$h; hash = $hash; same = $true }
                } else {
                    @{ width = [int]$w; height = [int]$h; hash = $hash; jpeg = $data }
                }
            }
            'gpu' {
                if (-not $script:gpuInfo) { $null } else {
                    @{
                        name = $script:gpuInfo.name
                        percent = [Math]::Round([Reveille.Busy]::GpuPercent())
                        memoryUsedBytes = [uint64][Reveille.Busy]::GpuMemoryBytes()
                        memoryTotalBytes = $script:gpuInfo.totalBytes
                        temperatureC = Get-GpuTemperature
                    }
                }
            }
            'network' { @{ bytesPerSecond = [uint64][Reveille.Busy]::NetworkBytesPerSecond() } }
            default { throw "Unknown command: $($request.cmd)" }
        }
        $reply = @{ id = $id; ok = $true; result = $result }
    } catch {
        $reply = @{ id = $id; ok = $false; error = $_.Exception.Message }
    }
    [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
}
