# Store listing metadata

This is the listing that app repositories read. It is laid out in the Fastlane
Supply structure, which is what F-Droid and IzzyOnDroid both expect, so writing
it once covers both — and the release workflow reads the changelogs too, so a
release note and a store listing cannot drift apart.

```
fastlane/metadata/android/
  en-US/
    title.txt                 the name, nothing else
    short_description.txt     one line, 80 characters maximum
    full_description.txt      the listing body, 4000 maximum, limited HTML
    images/icon.png           512x512 or larger
    images/phoneScreenshots/  1.png, 2.png, ... (see below)
    changelogs/<code>.txt     named by versionCode, e.g. 10017.txt
  nl-NL/
    ...the same, in Dutch
```

## Adding a changelog for a release

Create `changelogs/<versionCode>.txt` before pushing the version bump. The
version code is the one in `front-end/app.json` — 1.0.17 is `10017`.

Write it for someone who uses the app, not someone who wrote it: what is
different now, not which file changed. The release workflow puts this text at
the top of the GitHub release automatically, and skips it without complaint if
the file is not there.

## Still needed: screenshots

`images/phoneScreenshots/` is empty, and IzzyOnDroid asks for two to eight.
They have to be taken on a real phone, so they are the one part of this that
cannot be produced from the repository.

Worth capturing, in rough order of usefulness:

1. The device list with a PC showing as awake
2. The control screen with the action buttons and the vitals panel
3. The wake progress ring partway through a wake
4. The settings screen showing the themes

Save them as `1.png`, `2.png` and so on, in the order they should appear. PNG
or JPEG, portrait, whatever resolution the phone produces. Nothing personal
should be visible in them — real hostnames, IP addresses and the pairing token
all count.

## Submitting to IzzyOnDroid

Once the screenshots are in, open a request at
<https://gitlab.com/IzzyOnDroid/repo/-/issues> pointing at this repository.
Reveille already meets the requirements: MIT licensed, no adverts, no
analytics, no proprietary or tracking libraries, APKs published to GitHub
releases under a stable filename, and signed with a consistent key.
