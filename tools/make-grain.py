"""The paper's grain: one static 256px tile of monochrome noise, generated once and committed (img/grain.png).

Run: /usr/bin/python3 tools/make-grain.py   (needs PIL; deterministic: the same seed draws the same tile)

Each pixel is black or white at a small, random alpha, so the same tile speckles the plain
paper and the glow alike. It is drawn at 128 CSS px (one noise pixel per device pixel on a
2x screen), which reads as the fine speckle in the reference poster. A 16-entry palette with
transparency keeps the file small. Tune STRENGTH (the largest alpha) by eye against the
reference; DENSITY is the share of pixels that carry any speckle at all."""
import random
from PIL import Image

SIZE, SEED = 256, 7
STRENGTH = 34        # out of 255: the strongest speck
DENSITY = .72
LEVELS = 8           # alpha steps per ink (8 dark + 8 light = 16 palette entries)

random.seed(SEED)
img = Image.new("P", (SIZE, SIZE))
pal, alphas = [], []
for ink in (0, 255):
    for k in range(LEVELS):
        pal += [ink, ink, ink]
        alphas.append(round((k / (LEVELS - 1)) * STRENGTH))
img.putpalette(pal + [0, 0, 0] * (256 - len(pal) // 3))
px = img.load()
for y in range(SIZE):
    for x in range(SIZE):
        if random.random() > DENSITY:
            px[x, y] = 0                      # entry 0 has alpha 0: no speck
            continue
        light = random.random() < .45         # slightly more dark specks than light ones
        level = min(LEVELS - 1, int(abs(random.gauss(0, .45)) * LEVELS))
        px[x, y] = (LEVELS if light else 0) + level
img.info["transparency"] = bytes(alphas)
img.save("img/grain.png", optimize=True, transparency=bytes(alphas))
print("img/grain.png", SIZE, "px")
