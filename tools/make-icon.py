"""
Reveille's app icon.

Drawn rather than prompted, because the three things wrong with the old one are
structural rather than matters of taste:

  * the word REVEILLE was baked in, and at launcher size -- about a centimetre
    -- that is illegible texture. The launcher already prints the name below.
  * fine circuit tracery that vanishes below about 128px, leaving mud.
  * a rounded rectangle baked into the bitmap, which Android masks again,
    giving a rounded rect inside a rounded rect.

So: one idea, heavy strokes, no text, full bleed, and room around the mark.

The idea is the name. Reveille is the call at first light, so the sun is coming
up behind the letter. The R is drawn flush -- the bowl springs from the stem
with no lump at the join -- because at 48px a lump is all you would see.
"""

from PIL import Image, ImageDraw, ImageFilter
import os

# Regenerate with:  python tools/make-icon.py      (needs Pillow)

SS = 4                      # supersample, then downsample: cheap antialiasing
SIZE = 1024
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "front-end", "assets")

# Straight out of src/theme/clay.ts, so the icon and the app are one object.
GROUND      = (0x0E, 0x11, 0x1A)
GROUND_LOW  = (0x1C, 0x1E, 0x2E)
DAWN        = (0xFF, 0xA0, 0x61)
DAWN_DEEP   = (0xE0, 0x75, 0x36)
INK         = (0xF2, 0xF5, 0xFC)

# --- the R, in 1024 space -----------------------------------------------
# Kept well inside the frame so there is air on every side and Android's
# circular mask has something to spare.
STROKE   = 80               # thinner than it was, so the counter stays open
HALF     = STROKE / 2
STEM_X   = 324
STEM_TOP = 200
STEM_BOT = 790
BOWL_R   = 175              # radius of the bowl's centreline
BOWL_CX  = STEM_X + STROKE          # the bowl springs from the stem's edge
# The arc is drawn on its centreline and the stroke straddles it, so the bowl's
# OUTER top is BOWL_R + HALF above its centre. Placing the centre by that, not
# by BOWL_R, is what keeps the bowl from overshooting the stem and leaving a
# nub -- the one thing you would actually see at 48px.
BOWL_CY  = STEM_TOP + BOWL_R + HALF
BOWL_BOT = BOWL_CY + BOWL_R         # where the arc's centreline ends
LEG_FROM = (BOWL_CX + 20, BOWL_BOT - 40)
LEG_TO   = (660, STEM_BOT)

# The sun, only just up. A sliver reads as a horizon at 48px, where a whole
# disc reads as an orange blob.
SUN_R    = 340
SUN_CY   = 865 + SUN_R


def s(v):
    if isinstance(v, (tuple, list)):
        return tuple(s(x) for x in v)
    return int(round(v * SS))


def draw_mark(draw, colour):
    """
    Stem, bowl, leg. The bowl's arc ends land exactly on the stem's right edge,
    so the stem covers them and the join is flush -- no cap discs there, which
    is what produced a nub on the first attempt.
    """
    # Round where a stroke ends in mid-air, square where it meets another --
    # the same rule as strokeLinecap="round" on the icons inside the app.
    draw.rounded_rectangle(
        [s(STEM_X), s(STEM_TOP), s(STEM_X + STROKE), s(STEM_BOT)],
        radius=s(HALF),
        corners=(True, False, True, True),   # top-right meets the bowl
        fill=colour)

    box = [s(BOWL_CX - BOWL_R), s(BOWL_CY - BOWL_R),
           s(BOWL_CX + BOWL_R), s(BOWL_CY + BOWL_R)]
    draw.arc(box, start=270, end=90, fill=colour, width=s(STROKE))
    # Cap the bowl's lower end. Centred on the arc's own endpoint, so the half
    # that lands on the arc simply overlaps it.
    draw.ellipse([s(BOWL_CX - HALF), s(BOWL_BOT - HALF),
                  s(BOWL_CX + HALF), s(BOWL_BOT + HALF)], fill=colour)

    draw.line([s(LEG_FROM), s(LEG_TO)], fill=colour, width=s(STROKE))
    draw.ellipse([s(LEG_TO[0] - HALF), s(LEG_TO[1] - HALF),
                  s(LEG_TO[0] + HALF), s(LEG_TO[1] + HALF)], fill=colour)


def background(sun_r=SUN_R, sun_crest=865):
    """
    Night at the top, first light at the bottom, and the sun itself.

    The sun's size and height are arguments because Android's adaptive icon
    shows only the middle 72 of its 108 units -- roughly two thirds -- so a sun
    composed for the square icon falls entirely outside the crop and the
    launcher shows a plain dark tile. The adaptive background gets its own
    composition, scaled so that after cropping it looks the same size.
    """
    canvas = SIZE * SS
    sun_cy = sun_crest + sun_r

    grad = Image.new("RGB", (1, canvas))
    px = grad.load()
    for y in range(canvas):
        t = (y / canvas) ** 1.9
        px[0, y] = tuple(
            int(GROUND[i] + (GROUND_LOW[i] - GROUND[i]) * t) for i in range(3))
    img = grad.resize((canvas, canvas))

    # Bloom first, so the disc sits crisply on top of its own light.
    glow = Image.new("L", (canvas, canvas), 0)
    pad = sun_r * 0.42
    ImageDraw.Draw(glow).ellipse(
        [s(512 - sun_r - pad), s(sun_cy - sun_r - pad),
         s(512 + sun_r + pad), s(sun_cy + sun_r + pad)], fill=92)
    glow = glow.filter(ImageFilter.GaussianBlur(s(sun_r * 0.23)))
    img.paste(Image.new("RGB", (canvas, canvas), DAWN_DEEP), (0, 0), glow)

    disc = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(disc).ellipse(
        [s(512 - sun_r), s(sun_cy - sun_r), s(512 + sun_r), s(sun_cy + sun_r)],
        fill=255)
    disc = disc.filter(ImageFilter.GaussianBlur(s(2)))
    img.paste(Image.new("RGB", (canvas, canvas), DAWN), (0, 0), disc)

    return img


def build_icon():
    canvas = SIZE * SS
    img = background()

    # A shadow under the mark rather than a halo around it: the letter is
    # standing in front of the sun, so it should sit on the light, not glow.
    shade = Image.new("L", (canvas, canvas), 0)
    d = ImageDraw.Draw(shade)
    d.rectangle([0, 0, canvas, canvas], fill=0)
    mark = Image.new("L", (canvas, canvas), 0)
    draw_mark(ImageDraw.Draw(mark), 255)
    shade = mark.filter(ImageFilter.GaussianBlur(s(18))).point(lambda v: int(v * 0.45))
    img.paste(Image.new("RGB", (canvas, canvas), (0, 0, 0)), (s(6), s(10)), shade)

    img.paste(Image.new("RGB", (canvas, canvas), INK), (0, 0), mark)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def build_mark_only(scale=1.0, colour=INK):
    canvas = SIZE * SS
    layer = Image.new("L", (canvas, canvas), 0)
    draw_mark(ImageDraw.Draw(layer), 255)

    if scale != 1.0:
        small = layer.resize((int(canvas * scale), int(canvas * scale)), Image.LANCZOS)
        layer = Image.new("L", (canvas, canvas), 0)
        off = (canvas - small.width) // 2
        layer.paste(small, (off, off))

    out = Image.new("RGBA", (canvas, canvas), colour + (0,))
    out.putalpha(layer)
    return out.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)

    icon = build_icon()
    icon.save(os.path.join(OUT, "icon.png"))

    # Android adaptive: the launcher crops to a circle and parallaxes inside the
    # frame, so the mark must sit within the middle ~66% or it gets clipped.
    # Everything inside the crop appears 1.5x larger, so each element is drawn
    # at two thirds of the size it has in the square icon.
    VISIBLE = 2 / 3
    build_mark_only(scale=VISIBLE).save(
        os.path.join(OUT, "android-icon-foreground.png"))
    background(sun_r=SUN_R * VISIBLE,
               sun_crest=512 - (512 - 865) * VISIBLE).resize(
        (SIZE, SIZE), Image.LANCZOS).save(
        os.path.join(OUT, "android-icon-background.png"))
    build_mark_only(scale=VISIBLE, colour=(255, 255, 255)).save(
        os.path.join(OUT, "android-icon-monochrome.png"))

    build_mark_only(scale=0.62).save(os.path.join(OUT, "splash-icon.png"))
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "favicon.png"))

    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            print("  %-34s %6.1f KB" % (f, os.path.getsize(os.path.join(OUT, f)) / 1024))
