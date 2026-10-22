# Originals -> ink-only transparent drawings, re-centred on one shared square canvas at one shared scale.
# Usage: /usr/bin/python3 tools/process-art.py "$HOME/Downloads/illustrations 2" img/food /tmp/art-report.json
# A new drawing needs a line in IDS (file name -> id) and an entry in foods.js with files:true.
import sys, os, json
from PIL import Image, ImageChops
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
IDS = {"Avocado":"avocado","Banana":"banana","Blueberries, halved":"blueberries","Carrots, soft-cooked":"carrot",
 "Cauliflower, soft":"cauliflower","Cottage cheese":"cottage-cheese","Couscous":"couscous","Greek yogurt":"greek-yogurt",
 "Green beans, soft":"green-beans","Hummus":"hummus","Mango":"mango","Melon":"melon","Oatmeal":"oatmeal","Peach, ripe":"peach",
 "Pear, ripe":"pear","Peas":"peas","Plum, ripe":"plum","Potato":"potato","Pumpkin":"pumpkin","Quinoa":"quinoa",
 "Raspberries":"raspberries","Rice, soft-cooked":"rice","Salmon":"salmon","Smooth peanut butter":"peanut-butter",
 "Spinach, cooked":"spinach","Strawberries, sliced":"strawberries","Sweet potato":"sweet-potato","Tofu, soft":"tofu",
 "Turkey":"turkey","White fish":"white-fish","Whole wheat pasta":"pasta","Whole wheat toast":"toast","Zucchini":"zucchini",
 # second batch (22 Oct 2026)
 "Apple":"apple","Baby rice cereal":"baby-rice","Beef meatballs":"meatballs","Beef":"beef","Beetroot":"beetroot",
 "Butternut squash":"butternut-squash","Chia seeds":"chia","Chicken":"chicken","Chickpeas":"chickpeas","Cucumber":"cucumber",
 "Egg":"egg","Grated cheese":"cheese","Kiwi":"kiwi","Lentils":"lentils","Olive oil":"olive-oil","Quartered grapes":"grapes",
 "Ricotta":"ricotta","Tomato":"tomato"}
CANVAS = 960            # biggest drawing (pasta, 932px) fits with a hair to spare
INK = (10,10,10)        # --ink #0A0A0A
report = {}
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"): continue
    base = f[:-4]; fid = IDS[base]
    L = Image.open(os.path.join(src,f)).convert("L")
    # alpha from darkness: paper (255) -> 0, the drawn line (~19) -> 255, anti-aliased edges in between
    a = L.point(lambda v: max(0, min(255, round((255-v)*255/(255-24)))))
    bb = a.point(lambda v:255 if v>30 else 0).getbbox()
    cx, cy = (bb[0]+bb[2])/2, (bb[1]+bb[3])/2
    rgba = Image.new("RGBA", L.size, INK+(0,)); rgba.putalpha(a)
    canvas = Image.new("RGBA", (CANVAS,CANVAS), INK+(0,))
    canvas.paste(rgba, (round(CANVAS/2-cx), round(CANVAS/2-cy)), rgba)
    sizes = {}
    for s in (64,192,384):
        im = canvas.resize((s,s), Image.LANCZOS)
        p = os.path.join(out, f"{fid}-{s}.webp"); im.save(p, "WEBP", quality=90, method=6, exact=False)
        sizes[f"webp{s}"] = os.path.getsize(p)
    im = canvas.resize((384,384), Image.LANCZOS)
    p = os.path.join(out, f"{fid}-384.png"); im.save(p, "PNG", optimize=True); sizes["png384"] = os.path.getsize(p)
    w, h = bb[2]-bb[0], bb[3]-bb[1]
    report[fid] = dict(label=base, cover=round(max(w,h)/CANVAS,2), **sizes)
json.dump(report, open(os.path.join(sys.argv[3]), "w"), indent=1)
tot = sum(v for r in report.values() for k,v in r.items() if k.startswith(("webp","png")))
print(len(report), "drawings,", round(tot/1024), "KB total")
for k,r in report.items(): print(f"{k:15s} cover={r['cover']} 64={r['webp64']}B 192={r['webp192']}B 384={r['webp384']}B png={r['png384']}B")
