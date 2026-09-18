# Reveille — status and checklist

Working notes, kept so a new chat can pick up without re-deriving anything.
Last updated: **18 September 2026**, at **v1.0.20**.

**How we work this list:** items are worked top to bottom. Pick one, say the
name, and it gets built. When it is done it moves to *Recently done* and we go
to the next. New ideas go in *Ideas, parked* until they earn a place in *Next
up* — and anything marked **← recommended** is what I would do next if it were
my call.

### Picking this up again

Three of the five open items are waiting on hardware rather than on code — a
phone, a machine that stays on, a Mac. **The Go rewrite is the one that can be
started cold**, and `docs/api.md` is the specification it needs.

The quickest thing worth doing first takes five minutes and needs no computer:
four screenshots from the phone, which unblock the IzzyOnDroid listing. See
`fastlane/README.md` for which ones.

---

## Where things stand

| | |
|---|---|
| Version | **1.0.20** (versionCode 10020) |
| Repo | `github.com/Shamilimanuel/PCRemote` (public, MIT) |
| Install (Windows) | `irm github.com/Shamilimanuel/PCRemote/raw/main/setup.ps1 \| iex` |
| Install (macOS/Linux) | `curl -fsSL github.com/Shamilimanuel/PCRemote/raw/main/setup.sh \| bash` |
| Phone app | APK on GitHub Releases, Android arm64-v8a, ~38 MB |
| iPhone | web version served by the agent at its own address (no Wake) |
| Branches | `main`; `short-install-url` is local-only and parked |

**Things not to change by accident:** `android.package` and
`ios.bundleIdentifier` must stay `com.shami.pcremote` — changing either makes
every installed app unable to update. `expo.version` in `front-end/app.json` is
the hand-set source of truth; CI derives `versionCode` from it. The keystore in
`secrets/` is gitignored and must never be committed.

### Releasing

Work lands on `main` in batches. The version in `front-end/app.json` is bumped
**once**, when a group of changes is worth releasing together — not per change.

A push whose version already has a release is normal and expected: CI builds it,
proves it compiles, and publishes nothing. Cutting a release is exactly one act:
bump `expo.version`, add `fastlane/metadata/android/*/changelogs/<versionCode>.txt`,
push.

*Before 18 September this shipped one release per change, and CI replaced the
APK on the existing release when the version had not moved. That is now refused
— it meant the download behind a version number could quietly change, so two
people installing "the same" version got different apps.*

### Running the checks

```bash
cd front-end && npx tsx src/lib/signing.test.ts     # phone vs agent signing   47
cd front-end && npx tsx src/lib/releaseNotes.test.ts # release body parsing     26
cd integrations/home-assistant && pytest -q          # the HA integration      14
                                                     # (Linux/macOS only)
cd front-end && npx tsx src/lib/wakeRules.test.ts   # wake state machine       26
node tools/check-websign.js                         # browser crypto vs node   58
cd front-end && npx tsc --noEmit                    # types + i18n completeness
```

No test runner is wired up on purpose — these need no install and no config.

---

## Done

**The product**
- [x] Wake-on-LAN, shutdown, restart, sleep, lock over the LAN
- [x] One-line installer, no account, no admin rights, ends at a QR code
- [x] QR pairing, and a typeable fallback
- [x] Timed shutdown and restart, with cancel
- [x] Hold-to-confirm with the rising red glow, on Shutdown and Restart
- [x] Reboot to BIOS, via one pre-registered elevated task the agent can
      trigger but not modify — asked for during install, never assumed
- [x] PC vitals: CPU, memory, disk
- [x] Wake progress with a counting ring
- [x] Green tick / red cross result feedback
- [x] Claymorphism UI, per-button sounds, haptics, three themes
- [x] Settings screen; device-language support (English + Dutch)
- [x] Network information panel
- [x] Home screen widget
- [x] Help sheet with the setup command
- [x] Back button on Add PC
- [x] Device kinds — desktop, laptop, server, mini PC (label and icon only)
- [x] Lock-screen presence responder — **installed and confirmed working**
- [x] PC-side update notification (Windows toast) when the agent is behind
- [x] Installer menu: update, repair, show code, new code, remove
- [x] Browser version for iPhone, served by the agent
- [x] MIT licence
- [x] App icon, drawn rather than prompted (`tools/make-icon.py`)
- [x] macOS and Linux agents — **written, never run on real hardware**

**Security (v1.0.17)**
- [x] Token never crosses the wire — HMAC-SHA256 request signing
- [x] Replay refused: ±30s timestamp window, each nonce once
- [x] Agent signs its replies, bound to the request's nonce
- [x] Browser version signs too (hand-written SHA-256; `crypto.subtle` does
      not exist over plain HTTP)
- [x] Lock-screen responder moved to the same scheme
- [x] Off-network requests refused (Tailscale's `100.64.0.0/10` allowed)
- [x] Token in the Android Keystore, migrating old devices without re-pairing
- [x] Revoke and re-issue a pairing code from the installer

**Fixed along the way**
- [x] Wake-on-LAN never worked — `react-native-udp` needs a `Uint8Array`
- [x] 96 MB APK stalling at 100% — one ABI instead of four, now 38 MB
- [x] App always reported 1.0.0 — CI set `versionCode` but not `version`
- [x] `SafeAreaView` from react-native is a no-op on Android
- [x] Installer failed on a fresh Windows — `npm` resolves to `npm.ps1`, which
      the default execution policy blocks; uses `npm.cmd`
- [x] A failed install offered a menu instead of finishing
- [x] Wake reported failure on a PC that had started fine, and kept showing
      the cross after it finished booting
- [x] `.gitattributes` pins `*.sh` to LF so `setup.sh` cannot ship with CRLF

---

## Next up

Open items only, in the order I would do them. Anything finished has moved to
**Recently done** below.

- [ ] **Distribution, part two: submit to IzzyOnDroid** ← recommended
  **Blocked on you, not on code:** it needs two to eight screenshots taken on a
  real phone, and I have no device. `fastlane/README.md` lists which four shots
  are worth having and warns about keeping real hostnames, addresses and the
  pairing token out of them. Once they are in
  `fastlane/metadata/android/en-US/images/phoneScreenshots/`, the submission is
  one issue at <https://gitlab.com/IzzyOnDroid/repo/-/issues>.
  IzzyOnDroid takes the prebuilt APK, appears inside any F-Droid client, costs
  nothing and has no age requirement — it is the realistic version of "get on
  F-Droid". **The point of it is discovery, not updates** — updates are already
  solved in the app. Nobody can install something they have never heard of, and
  a listing is the only part of this a stranger could stumble across. Main F-Droid builds from source on their own infrastructure, which
  for an Expo app is a much larger undertaking; worth attempting only after
  IzzyOnDroid is live.
  *Google Play is $25 one-time but needs an 18+ Google Payments account and a
  14-day closed test with 12+ testers first. Worth doing eventually, not first.*


- [ ] **Install the Home Assistant integration for real**
  Much lower risk than it was: fourteen tests now load it into real Home
  Assistant and check the entities, so what is left is the end-to-end path —
  a button in Home Assistant actually locking a machine, with the agent no
  longer mocked. Needs Home Assistant on something that stays on, *not* the PC
  being woken. This is also what unlocks "Hey Google, lock the office PC"; the
  integration's README explains that chain.


- [ ] **Rewrite the agent in Go**
  The whole agent is ~1,700 lines. Go gives one ~8–12 MB binary with no
  runtime: no Node install, no npm, no execution-policy failure mode, and 97
  dependencies become about 2. `setup.ps1` would lose more than half its length
  and most of its ways to fail. CI cross-compiles all five targets from one
  job. `web/` embeds unchanged via `go:embed`.
  *Cost: it is a rewrite of something that works, and everything Windows-side
  needs re-testing. Do it after the protocol has settled, not before.*


- [ ] **Test the macOS and Linux agents on real hardware**
  They are written, they parse, the commands are built from documented
  behaviour — and nobody has ever run them. Until someone does, treat them as
  unproven rather than shipped.


- [ ] **Remove the Bearer token fallback**
  Kept for one release so updating the app or the agent first does not lock
  anyone out. `REVEILLE_REQUIRE_SIGNING=1` already turns it off. Flip the
  default once signing has been out long enough that nobody is on an older app
  — realistically a few releases.

---

## Recently done

Kept in date order, newest first, so it is obvious what changed lately without
reading the whole of **Done**.

- [x] **Distribution, part one: the store listing** *(18 Sep)*
  **Correction to an earlier note in this file:** in-app updates already work
  and have for a while — the app checks the releases page when opened, shows a
  banner and a Get it button, and installs the new APK. Obtainium was written
  up as if it fixed that. It does not; it is a minor convenience (it can notice
  a release without Reveille being opened) and the README now says so honestly.
  It does work out of the box, since `reveille.apk` is the filename on every
  release.
  Store metadata written in the Fastlane layout that F-Droid and IzzyOnDroid
  both read (`fastlane/metadata/`), in English and Dutch, and the release
  workflow now puts the changelog at the top of the GitHub release so a release
  note and a store listing cannot drift apart.
  Confirmed along the way: **no trackers, no analytics, no Google Play Services
  anywhere in the dependency tree.** That is what makes the rest possible.


- [x] **Show the changelog in the update banner** *(18 Sep, v1.0.18)*
  The banner offered a version number and a button, which asks someone to
  install something because a number went up. It now shows what changed, with
  longer notes collapsed behind More. The text was in the same reply the whole
  time and was being discarded.
  Parsing it lives in `lib/releaseNotes.ts`, importing nothing so it can be
  tested — 26 checks, including that releases from before changelogs existed
  produce nothing rather than a checksum where the explanation should be, and
  that the changelog files' hard wrapping is undone (they wrap near 78 columns,
  which reads ragged on a phone, but bullet lists keep their breaks).


- [x] **Document the agent's REST API, and write the Home Assistant integration** *(18 Sep)*
  `docs/api.md` covers every endpoint, both authentication schemes, the
  lock-screen responder, and every error the agent can return — each response
  in it captured from a running agent rather than described from memory, and
  the worked Python client extracted from the page and run verbatim.
  **The open question is settled: Home Assistant signs.** Anything that can run
  ten lines of Python has no excuse for sending the token, so bearer stays only
  for callers that genuinely cannot compute an HMAC — a curl line, a Tasker
  task — and is documented as the weaker choice rather than an equal one. That
  keeps the door open to removing it.
  The integration is in `integrations/home-assistant/`: buttons, an awake
  sensor that knows the sign-in screen from being off, and CPU/memory/disk
  readings. Its client is verified against the agent; **the Home Assistant
  layer above it has never been loaded into Home Assistant** — see its README.


- [x] **Release in batches, not one per change** *(18 Sep)*
  CI used to replace the APK on an existing release whenever the version had
  not moved, which was fine when every push was a release and wrong once work
  started landing in batches — the download behind a version number would have
  quietly changed under people who had already installed it. A push whose
  version already has a release now builds, proves the app compiles, and
  publishes nothing.

- [x] **Button sounds** *(18 Sep, v1.0.19 and v1.0.20)*
  Two separate faults. They were suppressed entirely whenever the phone was on
  vibrate — `playsInSilentMode: false` means something different on Android to
  what it means on iOS, and the app's own Sound switch sat there promising
  otherwise. And the press sound and the result sound overlapped, because on a
  home network an action comes back in about 150ms. Only one plays at a time
  now.

## Ideas, parked

- [ ] **Encrypt the reply bodies**
  Hostname, uptime, CPU, memory and disk cross the network readable. They are
  signed, so nothing can forge or alter them, but they are not private. Low
  stakes; worth doing only after the items above.

- [ ] **`back-end/package.json` says `"license": "UNLICENSED"`**
  Contradicts the MIT `LICENSE`, and that field is what npm and most tooling
  read. One word. Left alone because it is a licensing statement, not a bug —
  your call.

- [ ] **A memorable install URL** (`irm reveille.sh | iex`)
  Work sits on the `short-install-url` branch, blocked on registering a domain.
  62 characters is as short as this gets for free.
  **Do not use a public URL shortener for this** — whoever controls that link
  controls what runs on the machine, and `iex` runs it without showing you.

- [ ] **Wire up a proper test runner** (`npm test`)
  Four test files run by hand today. Only worth it when there are enough to
  make running them individually annoying.

### Considered and deliberately not doing

- **iOS.** Not the framework — Flutter or React Native makes no difference.
  It needs a Mac to build, $99/yr to install, and Apple's multicast
  entitlement for Wake-on-LAN specifically. The web version covers it.
- **Nintendo Switch, iPad, smart TVs.** The Switch has no Wake-on-LAN and no
  remote power interface at all, official or otherwise; Apple exposes nothing
  for iPads. A device picker where most options lead to "not supported" reads
  as a broken app, not a bigger one. Mac and Linux were the honest version of
  this idea, and they are done.
- **Cloud relay / working away from home without Tailscale.** LAN-only is a
  design decision, not a gap. A powered-off PC cannot run anything, so nothing
  but a magic packet from the same network can wake it.

---

## Known caveats

- **The phone app has never been run by me** — no device in the session. The
  app half is verified by types and by tests that drive the same code, not by
  use. Anything UI-level is worth a look on the handset.
- **macOS and Linux agents are unproven on real hardware** (see above).
- **Timed shutdown behaves differently per OS.** Windows schedules it itself
  (`shutdown /t`), so it survives the agent being killed. macOS and Linux have
  no root-free equivalent, so the agent holds the countdown — which means it is
  cancelled if the agent stops. The app cannot tell the difference.
- **Reboot to BIOS is Windows-only** and reported through `capabilities`, so
  the button hides itself elsewhere rather than failing when pressed.
- **Bus factor is one.** Worth knowing if anyone else ever depends on this.

## Where the important pieces live

| | |
|---|---|
| Signing protocol + spec | `back-end/src/signing.js` (the doc comment is the spec) |
| Phone's half | `front-end/src/lib/signing.ts` |
| Browser's half | `back-end/web/sign.js` |
| Off-network guard | `back-end/src/netguard.js` |
| Per-OS commands | `back-end/src/platform.js` |
| Wake state machine | `front-end/src/lib/wakeRules.ts` |
| Token storage + migration | `front-end/src/lib/storage.ts` |
| App icon generator | `tools/make-icon.py` |
| Security write-up | `README.md`, "Security notes" |
| Store listing + changelogs | `fastlane/` (its README explains the layout) |
| The agent's HTTP API | `docs/api.md` |
| Home Assistant integration | `integrations/home-assistant/` |
