# Reveille

Named for the bugle call that wakes a barracks at dawn — a remote control for your
PC. A mobile app that can **start, shut down, restart, sleep, and lock** your Windows
PC over your home Wi-Fi.

## How it works

- **`back-end/`** — a small Node.js server (the "agent") you run on the PC. It listens
  on your LAN and accepts authenticated requests to shut down / restart / sleep / lock
  the machine.
- **`front-end/`** — a React Native (Expo) app you run on your phone. It talks to the
  agent over HTTP for shutdown/restart/sleep/lock, and sends a **Wake-on-LAN** magic
  packet directly over UDP to power the PC on from a fully-off state.

This is **LAN-only by design**: your phone and PC need to be on the same Wi-Fi network.
Power-on (Wake-on-LAN) fundamentally requires this — a powered-off PC can't run the
agent, so nothing but a magic packet from the same network segment can wake it, unless
your router specifically supports forwarding WOL packets from the internet (not covered
here).

## 1. Set up the PC agent

Paste this into PowerShell on the PC you want to control:

```powershell
irm https://raw.githubusercontent.com/Shamilimanuel/PCRemote/main/setup.ps1 | iex
```

That installs Node.js if it's missing, puts the agent in `%LOCALAPPDATA%\Reveille`,
sets it to start when you log in, checks it answers, and opens the pairing code for the
phone to scan. No administrator rights needed.

Run it again any time to upgrade — it keeps your token, so the phone stays paired.

Partway through it asks whether you want a **Reboot to BIOS** button, explains
exactly what saying yes grants, and carries on either way. That is the only part
that needs administrator, and it is a question rather than an assumption — see
[Rebooting into BIOS](#rebooting-into-bios).

Options need the longer form, because `iex` can't take arguments:

```powershell
$s = 'https://raw.githubusercontent.com/Shamilimanuel/PCRemote/main/setup.ps1'

& ([scriptblock]::Create((irm $s))) -Uninstall     # remove it all
& ([scriptblock]::Create((irm $s))) -Firmware      # say yes without being asked
& ([scriptblock]::Create((irm $s))) -NoFirmware    # skip the question
& ([scriptblock]::Create((irm $s))) -NoAutoStart   # don't start at login
```

### Doing it by hand instead

The installer is only convenience — nothing depends on it.

```bash
cd back-end
npm install
npm start
```

On first run it generates a random token and prints the details the app needs. To make it
start automatically afterwards:

```powershell
powershell -ExecutionPolicy Bypass -File install-agent-task.ps1
```

That registers a Scheduled Task at your normal privilege level and launches the agent
without a console window. `uninstall-agent-task.ps1` removes it.

### Showing the pairing code

```bash
cd back-end
npm run pair
```

Opens a page in your browser with a large QR code and the same values in text. The agent
runs hidden once it starts automatically, so anything it prints to its own window goes
nowhere — this script is how you see the code.

### Enable Wake-on-LAN (required for "Start")

Power-on only works if Wake-on-LAN is enabled for your network adapter:

1. **BIOS/UEFI**: enable "Wake on LAN" / "Power On by PCI-E" in power settings.
2. **Windows**: Device Manager -> your network adapter -> Properties -> Power Management ->
   check "Allow this device to wake the computer". Also check the Advanced tab for a
   "Wake on Magic Packet" setting and set it to Enabled.
3. Wired Ethernet adapters support this far more reliably than Wi-Fi adapters -- if your
   Wi-Fi card doesn't support WOL (many don't), connect via Ethernet or use Start only
   when the PC is already on standby via one of the other actions.
4. Turn **Fast Startup** off. Windows otherwise performs a partial hibernate instead of a
   real shutdown, and many adapters lose their wake arming in that state.

### Rebooting into BIOS

Optional. The installer asks; `install-firmware-task.ps1` does the same thing on its own.

`shutdown /r /fw` restarts straight into the firmware settings screen, but it needs
administrator rights -- which the agent deliberately does not have, since it listens on
the network.

Rather than elevating the agent, `install-firmware-task.ps1` registers one elevated
Scheduled Task that runs exactly that command and takes no arguments. The agent can ask
Task Scheduler to start it but cannot change what it does, so the extra authority this
grants -- even if the token leaked -- is "reboot to firmware" and nothing else.

Requires UEFI; the installer checks and skips the question on legacy BIOS machines.

The app hides the button unless the agent reports the task is installed, and the Network
panel says which it is -- an absent button is otherwise indistinguishable from a broken
one.

## 2. Build the phone app

The app uses three native modules — `react-native-udp` (Wake-on-LAN needs a real UDP
socket), `react-native-svg`, and AsyncStorage — so it **cannot run in Expo Go**. You have
to build an actual app package. Two routes:

### Route A — GitHub Actions (no local Android tooling)

Every push that touches `front-end/` builds the app on GitHub's machines and
publishes a signed APK to the repo's Releases page. Open that page on the phone
and install it — Android will ask you to allow installs from your browser.

To trigger a build by hand without changing anything:

```bash
gh workflow run android.yml
```

The workflow lives in `.github/workflows/android.yml`. It runs `expo prebuild`,
builds a release APK with Gradle, then re-signs it with `apksigner` using the
keystore held in repo secrets — Gradle would otherwise sign release builds with
Expo's throwaway debug key, and the phone would reject the result as a different
app.

Version codes come from the workflow run number, so each build installs over the
last without hand-editing `app.json`.

**Signing secrets** (Settings → Secrets and variables → Actions):

| Secret | What it holds |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the `.jks` keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

The keystore itself lives outside the repo in `secrets/` (gitignored). Losing
every copy means never being able to update the installed app again — see
`secrets/READ-ME-FIRST.txt`.

### Route B — build locally

Needs [Android Studio](https://developer.android.com/studio) (SDK + platform tools) and a
JDK 17 installed, with `ANDROID_HOME` set. Then, with a phone connected over USB in
developer mode:

```bash
cd front-end
npm install
npx expo run:android          # debug build, installs straight to the device
```

macOS with Xcode can do the same with `npx expo run:ios`.

### What the build config handles

Two things that would otherwise break a release build, both set in `app.json`:

- **`usesCleartextTraffic`** — the agent speaks plain `http://` on your LAN, and Android
  has blocked cleartext HTTP by default since Android 9. Without this flag the app
  installs fine and then every request fails.
- **`NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription`** — the iOS equivalents.
  iOS 14+ also shows a one-time "allow local network access" prompt; deny it and nothing
  works.

`npx expo-doctor` flags `react-native-udp` as unmaintained. It's the only usable UDP
socket library for React Native, and Wake-on-LAN needs one. If Start ever stops sending
packets after an SDK bump, that dependency is the first place to look.

### Pairing a PC

1. Open the app, tap **+ Add PC**. The **?** in the top corner explains the whole setup
   if this is the first time — including the command to run on the PC.
2. Tap **Scan code** and point the camera at the page `npm run pair` opened on the PC.
   Every field fills itself in.
3. Tap **Test connection**, then **Save**.

The same page prints all five values in text underneath the code, so typing them in by
hand is always available as a fallback. A scanned payload is validated field by field
before it goes anywhere near storage — pointing the camera at some unrelated QR gives a
clear "that isn't a Reveille code" rather than a half-filled form.

### Using it

From the PC's control screen:

- **Start** — sends a Wake-on-LAN magic packet (works even if the PC is fully off,
  as long as WOL is enabled and the phone is on the same Wi-Fi).
- **Shutdown** / **Restart** — asks for confirmation, then tells the agent to run
  `shutdown /s` or `shutdown /r` (with a 5-second grace period).
- **Sleep** — puts the PC into standby.
- **Lock** — locks the current session.
- **Cancel pending** — runs `shutdown /a` to abort a shutdown/restart that's in its
  grace period, in case you tapped the wrong button.

Each PC shows a live **Online / Offline** dot, refreshed every 10 seconds by polling the
agent's `/health` endpoint (tap the dot on the control screen to re-check immediately).
"Offline" just means the agent didn't answer — the PC is off, asleep, or not running it —
so the actions that need the agent are dimmed and only **Start** is expected to work.

## Home screen widget

Long-press the home screen, pick **Widgets**, and drag **Reveille** out. It shows the
first saved PC with its status and three buttons — Wake, Sleep, Lock — so the common
actions don't need the app opened at all. Tapping the name opens the app for everything
else.

The widget runs through `react-native-android-widget`: `src/widget/ReveilleWidget.tsx`
is the layout (Android renders it via RemoteViews, so only the widget primitives work
there — no StyleSheet, no SVG), and `src/widget/taskHandler.tsx` handles adds,
refreshes and taps in a headless JS context. There is no state between calls, so every
render rebuilds from storage plus a fresh `/health` poll.

Android refreshes widgets at most every 30 minutes on its own; taps refresh immediately,
which is when it matters.

## Using it away from home

Everything except **Start** is plain HTTP, so it works anywhere the phone can reach the
agent. [Tailscale](https://tailscale.com) is the least painful way to arrange that:
install it on both the PC and the phone, sign in with the same account, and the PC gets a
stable address that works from anywhere.

Put that address in the app's **Remote address** field when adding or editing the PC. The
LAN address is always tried first — at home nothing leaves the house — and the remote one
is only used when the local address doesn't answer. The Network panel shows which one
replied.

Wake-on-LAN is the exception and always will be: a powered-off PC isn't running anything
that could receive a forwarded packet, so **Start** only works on the same network.

## Update notifications

The app checks this repo's latest release on launch and shows a banner when there's a
newer build. It needs no sign-in because the repo is public.

### Versioning

`expo.version` in `front-end/app.json` is the single source of truth, and it is set by
hand. Bump it, push, and the build tags the release to match.

The workflow derives Android's `versionCode` from it — `major * 10000 + minor * 100 +
patch`, so `1.0.9` becomes `10009`. That number is what Android compares to decide
whether an APK counts as an update; it must never go backwards. The app compares version
names to spot a newer release, which is why both come from the same place.

Versions used to be derived from the CI run number instead. That meant a cancelled build
burned a version, and releases were named by however many times CI happened to run
rather than by intent.

Installing a new build **over** the old one keeps every saved PC. Only uninstalling
loses them.

## Security notes

- The agent's token is a random secret generated per-install (`back-end/config.json`,
  gitignored). Anyone with the token and LAN access can control the PC, so don't share
  it and don't expose the agent's port outside your home network / router.
- All the agent does is run four fixed OS commands (`shutdown`, `rundll32` for sleep/
  lock) gated by that token — it doesn't accept arbitrary commands.

## Project layout

```
Reveille/
├── back-end/     Node.js LAN agent that runs on the PC
│   ├── src/
│   │   ├── index.js      entry point, prints pairing info
│   │   ├── server.js     Express routes + auth
│   │   ├── commands.js   shutdown/restart/sleep/lock command mapping
│   │   └── config.js     token + network info
│   ├── pair.js           opens the pairing code in a browser
│   ├── install-agent-task.ps1
│   ├── install-firmware-task.ps1
│   └── uninstall-agent-task.ps1
├── .github/workflows/
│   └── android.yml   builds + signs the APK, publishes it to Releases
└── front-end/    Expo React Native app
    ├── app.json          native permissions, cleartext HTTP, bundle IDs
    ├── App.tsx           screen switching + device state
    └── src/
        ├── screens/      DeviceList, DeviceForm, Control, Scan
        ├── components/   StatusPill, NetworkInfo, UpdateBanner, HelpSheet, icons
        ├── hooks/        useDeviceStatus (polls /health, measures latency)
        ├── widget/       home screen widget + its headless task handler
        ├── lib/          api.ts (HTTP calls), wol.ts (magic packet), storage.ts
        └── types/
```

## Licence

MIT — see [LICENSE](LICENSE). Use it, change it, ship it; just keep the
copyright line.

## Using this on your own PC

Everything here works for anyone, not just the machine it was built on:

```powershell
irm https://raw.githubusercontent.com/Shamilimanuel/PCRemote/main/setup.ps1 | iex
```

The agent generates its own token on first run, so each install is independent.
The app is on the [releases page](https://github.com/Shamilimanuel/PCRemote/releases/latest).

Two honest limits before you start: the PC side is **Windows only** (it calls
`shutdown` and `rundll32` directly), and the app is **Android only** — an iOS
build needs a paid Apple developer account to install on a real device.
