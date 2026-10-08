"""
The app icon, for places that cannot just point at front-end/assets/icon.png.

    python tools/window-icon.py            put the icon into setup.ps1 and back-end/web/
    python tools/window-icon.py --check    fail if either has drifted from icon.png

setup.ps1 is the whole of the one-line installer -- there is no folder of
images beside it -- so the setup window's icon travels inside it, as a small
PNG written out in base64. The web version gets ordinary PNG files.

Needs Pillow. icon.png itself is made by tools/make-icon.py.
"""

import base64
import io
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, "front-end", "assets", "icon.png")
SETUP = os.path.join(ROOT, "setup.ps1")
WEB = os.path.join(ROOT, "back-end", "web")

# Big enough for the sidebar's 34 px at 300% scaling, small enough that the
# installer stays a quick download.
WINDOW_SIZE = 128
BLOCK = re.compile(r"\$script:RvLogoPng = @\(\r?\n(.*?)\r?\n\) -join ''", re.S)


def png(size):
    image = Image.open(ICON).convert("RGB").resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, "PNG", optimize=True)
    return out.getvalue()


def same_picture(a, b, tolerance=3):
    """Whether two PNGs show the same picture, give or take resampling noise."""
    x = Image.open(io.BytesIO(a)).convert("RGB")
    y = Image.open(io.BytesIO(b)).convert("RGB")
    if x.size != y.size:
        return False
    return all(abs(p - q) <= tolerance for p, q in zip(x.tobytes(), y.tobytes()))


def block():
    data = base64.b64encode(png(WINDOW_SIZE)).decode("ascii")
    lines = ["    '%s'" % data[i:i + 100] for i in range(0, len(data), 100)]
    return "$script:RvLogoPng = @(\r\n" + "\r\n".join(lines) + "\r\n) -join ''"


def main():
    check = "--check" in sys.argv
    setup = io.open(SETUP, encoding="ascii", newline="").read()
    match = BLOCK.search(setup)
    if not match:
        sys.exit("setup.ps1 has no $script:RvLogoPng block.")
    want = block()

    web = {name: png(size) for name, size in (("icon-192.png", 192), ("icon-512.png", 512))}

    if check:
        # Pictures, not bytes: two machines can compress the same picture into
        # different PNG files, and that is not drift.
        problems = []
        have = "".join(re.findall(r"'([A-Za-z0-9+/=]+)'", match.group(1)))
        if not same_picture(base64.b64decode(have), png(WINDOW_SIZE)):
            problems.append("setup.ps1's window icon")
        for name, data in web.items():
            path = os.path.join(WEB, name)
            if not os.path.exists(path) or not same_picture(open(path, "rb").read(), data):
                problems.append("back-end/web/" + name)
        if problems:
            sys.exit("Not the current icon: %s. Run: python tools/window-icon.py" % ", ".join(problems))
        print("ok: the window and the web version use front-end/assets/icon.png")
        return

    setup = setup[:match.start()] + want + setup[match.end():]
    io.open(SETUP, "w", encoding="ascii", newline="").write(setup)
    for name, data in web.items():
        open(os.path.join(WEB, name), "wb").write(data)
    print("  setup.ps1 and back-end/web/ now carry the current icon (%d bytes in setup.ps1)" % len(want))


if __name__ == "__main__":
    main()
