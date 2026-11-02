"""The favicon: the glowing sun, the app's grain glow (theme.js: GLOW.grain #FFE56B around the grey nucleus
GLOW_CORE #83838A) as a 64px disc on transparency, generated once and committed (favicon.png).

Run: /usr/bin/python3 tools/make-favicon.py   (needs PIL)

It follows glowAt in theme.js, with one change: the colour holds to 55% of the radius (the app's glow starts
fading at 40%) and fades a little faster after, so it still reads as a sun at 16px. Drawn 8x larger, then
scaled down, for a smooth edge."""
import math
from PIL import Image

SIZE, SUPER = 64, 8
CORE, GLOW = (0x83, 0x83, 0x8A), (0xFF, 0xE5, 0x6B)
P = dict(core=.05, blend=.32, fade_from=.55, fade_to=1, ease=1.4)

def smooth(a, b, t):
    x = min(1, max(0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)

def glow_at(t):
    k = 1 - smooth(P["core"], P["blend"], t)                      # share of the grey
    a = pow(1 - smooth(P["fade_from"], P["fade_to"], t), P["ease"])  # opacity
    return tuple(round(CORE[i] * k + GLOW[i] * (1 - k)) for i in range(3)) + (round(a * 255),)

big = SIZE * SUPER
im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
px, r = im.load(), big / 2
for y in range(big):
    for x in range(big):
        t = math.hypot(x + .5 - r, y + .5 - r) / r
        if t <= 1: px[x, y] = glow_at(t)
im.resize((SIZE, SIZE), Image.LANCZOS).save("favicon.png", optimize=True)
print("favicon.png")
