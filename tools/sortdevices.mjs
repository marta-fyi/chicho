// Sort the food on phones: `PLAYWRIGHT=<path to the playwright package> node tools/sortdevices.mjs [--quick]`
// WebKit and Chromium, touch (hasTouch, isMobile), at 375×667, 390×844 and 430×932, light and dark. Taps are real
// touchscreen taps; drags are touch pointer events dispatched as a finger would (pointerdown, moves, pointerup on the
// shape), because Playwright has no touch-move. Asserts: a tap under 10px selects, a drag past 10px never does, a tap
// on a moving shape is ignored; a drag to each place, with the swell, the dim and the 48px snap; a release outside a
// place leaves the shape; select several, then a place; Select all, then a place; Undo for each; the place sheet's
// Move and Back to the pile; Keep out's derived foods; the custom sheet, matched and unmatched, with the keyboard's
// field focused in the tap itself; the page never scrolls. Then, unless --quick, the screenshots in
// docs/screenshots/ (sort-*): the composed pile, a held shape near a place, after several sorts, the place sheet, the
// custom sheet, the summary moment, the second pile and an empty pile, both themes, three sizes (WebKit); and the
// golden shots of each size's top three curated seeds (docs/screenshots/seeds/), for the owner to pick from.
// It also measures the field at each size into docs/sortfields.json (tools/seeds.mjs scores seeds against it).
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const require = createRequire(process.env.PLAYWRIGHT ? join(process.env.PLAYWRIGHT, "..", "x.js") : join(root, "x.js"));
const pw = require(process.env.PLAYWRIGHT || "playwright");
const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"};
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"content-type": TYPES[extname(p)] || "application/octet-stream"}); res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise(r => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}/index.html?test&now=2026-10-22T09:15`;
const SHOTS = join(root, "docs", "screenshots"), GOLD = join(SHOTS, "seeds");
if (!args.has("--quick")) { mkdirSync(GOLD, {recursive: true}); readdirSync(SHOTS).filter(f => /^sort-.*\.jpg$/.test(f)).forEach(f => rmSync(join(SHOTS, f))); readdirSync(GOLD).forEach(f => rmSync(join(GOLD, f))); }
const SIZES = [[375, 667], [390, 844], [430, 932]];
const results = [];
const ok = (name, cond, got) => results.push((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  → got " + String(JSON.stringify(got)).slice(0, 300)));
const wait = ms => new Promise(r => setTimeout(r, ms));

// in the page: a finger dragging a shape to (x, y) in steps, optionally holding at the end
const DRAG = `window.__drag = async (id, tx, ty, hold) => {
  const el = document.querySelector('.sf-shape[data-id="' + id + '"]'), r = el.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
  const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {bubbles: true, cancelable: true, pointerId: 11, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, buttons: type === "pointerup" ? 0 : 1}));
  ev("pointerdown", x0, y0);
  for (let k = 1; k <= 14; k++) { ev("pointermove", x0 + (tx - x0) * k / 14, y0 + (ty - y0) * k / 14); await new Promise(r => setTimeout(r, 16)); }
  if (hold) { await new Promise(r => setTimeout(r, hold)); window.__release = () => ev("pointerup", tx, ty); return; }
  ev("pointerup", tx, ty);
}; 1`;
const open = async (page, months = 18, name = "Lula", extra = "") => {
  await page.goto(base); await page.evaluate("localStorage.clear(); sessionStorage.clear()"); await page.goto(base);
  await page.evaluate(`state.profile = Object.assign(freshProfile(), {name: ${JSON.stringify(name)}, birthDate: birthDateFromMonths(${months}), onboardingStep: "keepout"}); state.plans = []; ${extra} save(); openOnboarding("keepout")`);
  await page.waitForFunction("typeof sortUI !== \"undefined\" && !!sortUI && sortUI.shapes.size > 0", null, {timeout: 8000});
  await page.evaluate("sortUI.cancelWiggle()");
  await page.evaluate(DRAG);
};
const E = (page, x) => page.evaluate(x);
const centre = (page, sel) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const status = page => E(page, "document.querySelector('.sf-status').textContent.replace(/\\s+/g, ' ').trim()");
const placed = (page, id) => E(page, `state.profile.foodSort.placement[${JSON.stringify(id)}] || null`);
const settle = page => page.waitForFunction("!sortUI.running()", null, {timeout: 6000}).catch(() => {});

const fields = {};
for (const engineName of ["webkit", "chromium"]) {
  const browser = await pw[engineName].launch();
  for (const [W, H] of SIZES) for (const theme of ["light", "dark"]) {
    const tag = `${engineName} ${W}×${H} ${theme}`;
    const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 3, hasTouch: true, isMobile: engineName === "chromium", colorScheme: theme});
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    try {
      await open(page);
      await page.waitForTimeout(300);
      const L = await E(page, `(() => { const c = document.getElementById("onbCard"), f = document.querySelector(".sf-field").getBoundingClientRect();
        return {scroll: document.scrollingElement.scrollHeight - innerHeight, card: c.scrollHeight - c.clientHeight, wide: document.scrollingElement.scrollWidth - innerWidth, w: Math.floor(f.width), h: Math.floor(f.height), pack: sortUI.pack.ok,
                cells: [...document.querySelectorAll(".sf-place")].every(x => x.getBoundingClientRect().width >= 140), pill: document.querySelector("#onbFoot .btn-ink").getBoundingClientRect().bottom <= innerHeight}; })()`);
      ok(`${tag}: the page never scrolls, no overflow, cells ≥ 140px, the pill on screen, the pile packs`, L.scroll <= 0 && L.card <= 1 && L.wide <= 0 && L.cells && L.pill && L.pack, L);
      if (engineName === "webkit" && theme === "light") fields[`${W}x${H}`] = {w: L.w, h: L.h};

      // taps: a real touch tap selects; a second deselects
      await page.tap('.sf-shape[data-id="egg"]'); await page.waitForTimeout(60);
      ok(`${tag}: a tap selects (the ring)`, await E(page, "document.querySelector('.sf-shape[data-id=egg]').classList.contains('is-sel')"));
      await page.tap('.sf-shape[data-id="egg"]'); await page.waitForTimeout(60);
      ok(`${tag}: a second tap deselects`, await E(page, "sortUI.selected.size === 0"));
      // a drag past 10px never selects, and a release away from the places leaves it
      const [mx, my] = await centre(page, '.sf-shape[data-id="milk"]');
      await E(page, `__drag("milk", ${mx + 30}, ${my + 12})`); await page.waitForTimeout(80);
      ok(`${tag}: a drag never selects; let go outside a place, it stays in the pile`, await E(page, "sortUI.selected.size === 0 && !state.profile.foodSort.placement.milk && !!document.querySelector('.sf-shape[data-id=milk]')"));
      await settle(page);
      // a moving shape ignores a tap
      // (a touchscreen tap at its coordinates: page.tap would wait for the shape to stop first)
      const [qx, qy] = await centre(page, '.sf-shape[data-id="peanut"]');
      await E(page, "sortUI.world.bodies.find(b => b.id === 'peanut').vx = 300; sortUI.world.bodies.find(b => b.id === 'peanut').vy = 0; sortUI.wake()");
      await page.touchscreen.tap(qx + 2, qy); await page.waitForTimeout(40);
      ok(`${tag}: a tap on a moving shape is ignored`, await E(page, "sortUI.selected.size === 0"), await E(page, "[...sortUI.selected]"));
      await E(page, "sortUI.selected.clear(); sortUI.paintSelection()");
      await settle(page);
      // a drag to each place, with the swell and the dim; the snap within 48px
      for (const [id, pl] of [["wheat", "keepOut"], ["soy", "notFan"], ["fish", "tried"], ["sesame", "untouched"]]) {
        const [cx, cy] = await centre(page, `.sf-place[data-place="${pl}"]`);
        await E(page, `__drag("${id}", ${cx}, ${cy}, 220)`);
        const aim = await E(page, `(() => { const c = document.querySelector('.sf-place[data-place="${pl}"]'); return {swell: /1\\.03/.test(getComputedStyle(c).transform), dim: [...document.querySelectorAll(".sf-place")].filter(x => x !== c).every(x => getComputedStyle(x).opacity === "0.5")}; })()`);
        await E(page, "__release()"); await page.waitForTimeout(80);
        ok(`${tag}: ${id} dragged to ${pl}: the swell and the dim, then sorted there`, aim.swell && aim.dim && (await placed(page, id)) === pl, [aim, await placed(page, id)]);
        await E(page, "sortUI.undoNow()"); await page.waitForTimeout(60);
        ok(`${tag}: …and Undo puts it back`, (await placed(page, id)) === null && await E(page, `!!document.querySelector('.sf-shape[data-id="${id}"]')`));
        await settle(page);
      }
      const snap = await E(page, `(() => { const r = document.querySelector('.sf-place[data-place="tried"]').getBoundingClientRect(); return [sortUI.placeAt(r.left + 20, r.bottom + 40), sortUI.placeAt(r.left + 20, r.bottom + 60)]; })()`);
      ok(`${tag}: the snap reaches 48px, not 60`, snap[0] === "tried" && snap[1] === null, snap);
      // select several, then a place; Undo
      await page.tap('.sf-shape[data-id="egg"]'); await page.tap('.sf-shape[data-id="milk"]'); await page.waitForTimeout(40);
      await page.tap('.sf-place[data-place="tried"]'); await page.waitForTimeout(450);
      ok(`${tag}: select two, tap a place: both sorted, '2 foods → Tried already · Undo'`, (await placed(page, "egg")) === "tried" && (await placed(page, "milk")) === "tried" && (await status(page)) === "2 foods → Tried already · Undo", await status(page));
      await page.tap(".sf-status .sf-undo"); await page.waitForTimeout(400);
      ok(`${tag}: …Undo brings both back`, (await placed(page, "egg")) === null && (await placed(page, "milk")) === null);
      // the place sheet: Move, Back to the pile; Keep out's derived foods
      await E(page, `sortUI.place(["milk"], "keepOut", {noUndo: true})`); await page.waitForTimeout(400);
      await page.tap('.sf-place[data-place="keepOut"]'); await page.waitForTimeout(500);
      ok(`${tag}: Keep out's sheet lists what milk takes with it`, await E(page, "!!document.querySelector('.sf-list') && /cottage cheese/i.test(document.querySelector('.sf-also-list').textContent)"));
      await page.tap('.sf-list .sf-row[data-id="milk"] .sf-move'); await page.waitForTimeout(60);
      await page.tap('.sf-list .sf-row[data-id="milk"] .sf-move-to >> text=Back to the pile'); await page.waitForTimeout(400);
      ok(`${tag}: Move → Back to the pile: Milk unsorted, its shape back`, (await placed(page, "milk")) === null && await E(page, "!!document.querySelector('.sf-field .sf-shape[data-id=milk]')"));
      await page.tap(".sf-list .sh-close"); await page.waitForTimeout(400);
      // Select all, then a place: the first pile done, the second arrives
      await page.tap(".sf-selall"); await page.tap('.sf-place[data-place="untouched"]'); await page.waitForTimeout(1600);
      ok(`${tag}: Select all, then a place: all nine sorted, the everyday foods arrive`, await E(page, "SORT_CONFIG.bigFoods.every(id => state.profile.foodSort.placement[id]) && !!document.querySelector('.sf-tabs') && !!document.querySelector('.sf-shape.else')"));
      // the custom sheet, from a real tap: the field is focused in the tap itself
      await page.tap(".sf-shape.else"); await page.waitForTimeout(30);
      ok(`${tag}: a tap on Something else opens its sheet with the field already focused`, await E(page, "document.activeElement && document.activeElement.id === 'sfElse'"));
      await page.fill("#sfElse", "Blueberry"); await page.tap(".sf-add"); await page.waitForTimeout(60);
      ok(`${tag}: matched: 'Also skips blueberries.'`, (await E(page, "document.querySelector('.sf-result').textContent")) === "Also skips blueberries.");
      await page.waitForTimeout(2500);
      await page.tap(".sf-shape.else"); await page.waitForTimeout(30);
      await page.fill("#sfElse", "Mustard"); await page.keyboard.press("Enter"); await page.waitForTimeout(60);
      ok(`${tag}: unmatched: it says so, and remembers it`, /Couldn't match/.test(await E(page, "document.querySelector('.sf-result').textContent")) && await E(page, "state.profile.foodSort.custom.some(c => c.label === 'Mustard')"));
      await page.waitForTimeout(2500);
      ok(`${tag}: no page errors`, errors.length === 0, errors);

      // screenshots: WebKit, both themes, every size
      if (!args.has("--quick") && engineName === "webkit") {
        const shot = async name => page.screenshot({path: join(SHOTS, `sort-${name}-${W}x${H}-${theme}.jpg`), type: "jpeg", quality: 82});
        await open(page); await page.waitForTimeout(400); await shot("pile");
        const [cx, cy] = await centre(page, '.sf-place[data-place="keepOut"]');
        await E(page, `__drag("peanut", ${cx + 10}, ${cy + 30}, 260)`); await shot("held"); await E(page, "__release()"); await page.waitForTimeout(500);
        await E(page, `sortUI.place(["egg", "milk"], "tried"); sortUI.place(["soy"], "notFan")`); await page.waitForTimeout(500); await shot("sorted");
        await page.tap('.sf-place[data-place="keepOut"]'); await page.waitForTimeout(500); await shot("sheet"); await page.tap(".sf-list .sh-close"); await page.waitForTimeout(400);
        await E(page, `sortUI.place(sortUI.pileIds(), "untouched")`); await page.waitForTimeout(350); await shot("summary");
        await page.waitForTimeout(1500); await shot("second");
        await page.tap(".sf-shape.else"); await page.waitForTimeout(450); await page.fill("#sfElse", "yoghurt"); await shot("custom"); await page.tap(".sf-add"); await page.waitForTimeout(150); await shot("custom-result"); await page.waitForTimeout(2600);
        await E(page, `sortUI.place(sortUI.pileIds(), "tried", {noUndo: true})`); await page.waitForTimeout(600); await shot("empty");
      }
    } catch (e) { ok(`${tag}: ran to the end`, false, String(e && e.message || e)); }
    await ctx.close();
  }
  await browser.close();
}

// golden shots: each size's top three curated seeds, for the owner to compare
if (!args.has("--quick")) {
  const cur = JSON.parse(readFileSync(join(root, "curatedSeeds.json"), "utf8"));
  const browser = await pw.webkit.launch();
  for (const [W, H] of SIZES) {
    const ctx = await browser.newContext({viewport: {width: W, height: H}, deviceScaleFactor: 3, hasTouch: true});
    const page = await ctx.newPage();
    for (const seed of cur.sizes[`${W}x${H}`].seeds.slice(0, 3)) {
      await page.goto(base + "&theme=light&sortseed=" + seed); await page.evaluate("localStorage.clear()"); await page.goto(base + "&theme=light&sortseed=" + seed);
      await page.evaluate(`state.profile = Object.assign(freshProfile(), {name: "Lula", birthDate: birthDateFromMonths(18)}); state.plans = []; save(); openOnboarding("keepout")`);
      await page.waitForTimeout(900);
      await page.screenshot({path: join(GOLD, `seed-${W}x${H}-${seed}.jpg`), type: "jpeg", quality: 82});
    }
    await ctx.close();
  }
  await browser.close();
  if (Object.keys(fields).length === SIZES.length) writeFileSync(join(root, "docs", "sortfields.json"), JSON.stringify(fields, null, 1) + "\n");
}
server.close();
const fails = results.filter(l => l.startsWith("FAIL"));
console.log(fails.join("\n"), `\n${results.length - fails.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
