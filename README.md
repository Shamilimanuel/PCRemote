# PC Remote

A Wolow-style remote control for your PC: a mobile app that can **start, shut down,
restart, sleep, and lock** your Windows PC over your home Wi-Fi.

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

Requires [Node.js](https://nodejs.org).

```bash
cd back-end
npm install
npm start
```

On first run it generates a random auth token and prints everything you need:

```
=========================================
 PC Remote agent is running
=========================================
  Device name : YOUR-PC
  Port        : 5533
  Token       : <long random token>

  Enter these details in the mobile app (pick the interface you use for Wi-Fi):
   - [Wi-Fi] IP: 192.168.1.42   MAC: AA:BB:CC:DD:EE:FF
=========================================
```

Keep this window open — the agent needs to be running for shutdown/restart/sleep/lock
to work. Note the **IP address on the network adapter your PC actually uses (usually
Wi-Fi)**, plus the **Token** and **MAC address**.

### Enable Wake-on-LAN (required for "Start")

Power-on only works if Wake-on-LAN is enabled for your network adapter:

1. **BIOS/UEFI**: enable "Wake on LAN" / "Power On by PCI-E" in power settings.
2. **Windows**: Device Manager → your network adapter → Properties → Power Management →
   check "Allow this device to wake the computer". Also check the Advanced tab for a
   "Wake on Magic Packet" setting and set it to Enabled.
3. Wired Ethernet adapters support this far more reliably than Wi-Fi adapters — if your
   Wi-Fi card doesn't support WOL (many don't), connect via Ethernet or use Start only
   when the PC is already on standby via one of the other actions.

### Run the agent automatically at login (optional)

From an elevated PowerShell prompt in `back-end/`:

```powershell
powershell -ExecutionPolicy Bypass -File install-agent-task.ps1
```

This registers a Scheduled Task that starts the agent whenever you log in (including
after a Wake-on-LAN boot). To remove it later, run `uninstall-agent-task.ps1` the same
way.

## 2. Build the phone app

The app uses three native modules — `react-native-udp` (Wake-on-LAN needs a real UDP
socket), `react-native-svg`, and AsyncStorage — so it **cannot run in Expo Go**. You have
to build an actual app package. Two routes:

### Route A — EAS cloud build (no local Android tooling)

Expo builds it on their servers and hands you an `.apk` to sideload. You need a free
[Expo account](https://expo.dev/signup); the free tier's build queue is slow but works.

```bash
cd front-end
npm install
npx eas-cli login
npx eas-cli build:configure          # links the project to your Expo account, once
npx eas-cli build --profile preview --platform android
```

When it finishes, the CLI prints a download URL (and a QR code). Open it on the phone,
install the APK — Android will ask you to allow installs from that browser — and you have
a standalone app. No Metro server, no cable, nothing else running.

The `preview` profile in `eas.json` is the one that produces a self-contained APK. Use
`--profile development` instead if you want the dev-client build that hot-reloads against
`npx expo start --dev-client`, and `--profile production` for a Play Store `.aab`.

For iOS, `--platform ios` needs a paid Apple Developer account to install on a real
device; without one, only the simulator build (macOS) is possible.

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

1. Open the app, tap **+ Add PC**.
2. Enter a name, the IP address, port (`5533` by default), token, and MAC address shown
   by the agent.
3. Tap **Test connection** to confirm the phone can reach the agent, then **Save**.

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

## Security notes

- The agent's token is a random secret generated per-install (`back-end/config.json`,
  gitignored). Anyone with the token and LAN access can control the PC, so don't share
  it and don't expose the agent's port outside your home network / router.
- All the agent does is run four fixed OS commands (`shutdown`, `rundll32` for sleep/
  lock) gated by that token — it doesn't accept arbitrary commands.

## Project layout

```
PCRemote/
├── back-end/     Node.js LAN agent that runs on the PC
│   ├── src/
│   │   ├── index.js      entry point, prints pairing info
│   │   ├── server.js     Express routes + auth
│   │   ├── commands.js   shutdown/restart/sleep/lock command mapping
│   │   └── config.js     token + network info
│   ├── install-agent-task.ps1
│   └── uninstall-agent-task.ps1
└── front-end/    Expo React Native app
    ├── app.json          native permissions, cleartext HTTP, bundle IDs
    ├── eas.json          build profiles (development / preview / production)
    ├── App.tsx           screen switching + device state
    └── src/
        ├── screens/      DeviceList, DeviceForm, Control
        ├── components/   StatusPill, NetworkInfo, icons
        ├── hooks/        useDeviceStatus (polls /health, measures latency)
        ├── lib/          api.ts (HTTP calls), wol.ts (magic packet), storage.ts
        └── types/
```
