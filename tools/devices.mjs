// The device run: `PLAYWRIGHT=<path to the playwright package> node tools/devices.mjs [--quick] [--perf]`
// The Kitchen (kitchenRun) runs on the portrait devices: row heights, one line, no plan grams, the header (five rows
// on first paint at 390×844, solid and blurred when scrolled, no sliver at rest), the map dimming, the bottom fade,
// the glow's nucleus clear of every control, tick/undo/Got it, Have it, Not this week, In the store and its wake
// lock, Send's units, At home, swipes between views with rubber bands, per-view scroll, the freezer, Prep's clamp,
// the pager's header drag and mid-list scroll, and the empty states.
// Meal times (mealtimesRun) runs on the portrait devices too: a timed first run through Meal times (scripted taps, no
// thinking time; the median goes to docs/firstrun.json, no target asserted), the axis never scrolling and an hour at
// least MT.minHourPx tall, and (WebKit, both themes) the handoff from Allergens, the idle axis, mid-drag, typing, and
// Done with five and three meals, plus the Kitchen pile settled, a pop caught mid-burst and its Undo line (Sort the food has its own run: tools/sortdevices.mjs).
// (Playwright isn't a dependency of this repo; point at any install, e.g. ~/dev/client/node_modules/playwright,
// with its WebKit and Chromium browsers downloaded.)
//
// WebKit and Chromium, as iPhone SE (375×667), iPhone 14 (390×844), iPhone 14 Pro Max (430×932) and iPhone 14
// landscape, in light and dark. Each run asserts: no horizontal overflow, Home never scrolls (and nothing on it is
// cropped: an overfull meal block scrolls inside itself), the corner header inside the screen, every tap target on
// Home at least 44×44 (the map's dots are the logged exception), the pill, footer and map clear of each other, and
// in portrait the headline, moment line, meal title, first food and the pill on screen. Screenshots land in
// docs/screenshots/: every screen for every device, engine and theme, plus (WebKit iPhone 14, both themes) the
// offered states, Change, In the store, the New week preview, Profile's sections, a mid-swipe, each glow colour and
// every onboarding step. --quick skips the screenshots.
// --perf adds the throttled run (--perf-only runs just that) (Chromium, 4× CPU, Slow 4G): first paint and the cost of the grain and the breath.
// Safe-area insets can't be emulated here; the real-iPhone list in docs/decisions.md covers them.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const require = createRequire(process.env.PLAYWRIGHT ? join(process.env.PLAYWRIGHT, "..", "x.js") : join(root, "x.js"));
const pw = require(process.env.PLAYWRIGHT || "playwright");

const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".webmanifest":"application/manifest+json", ".png":"image/png",
               ".webp":"image/webp", ".jpg":"image/jpeg", ".woff2":"font/woff2", ".json":"application/json", ".css":"text/css"};
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  // text is gzipped, as GitHub Pages serves it (the throttled run measures what a phone really downloads)
  const body = readFileSync(p), text = /\.(html|js|json|webmanifest)$/.test(p) && /gzip/.test(req.headers["accept-encoding"] || "");
  res.writeHead(200, Object.assign({"content-type": TYPES[extname(p)] || "application/octet-stream"}, text ? {"content-encoding": "gzip"} : {}));
  res.end(text ? gzipSync(body) : body);
}).listen(0, "127.0.0.1");
await new Promise(r => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}/index.html?test&now=2026-10-22T12:10`;

const SHOTS = join(root, "docs", "screenshots");
if (!args.has("--quick") && !args.has("--perf-only")) { if (existsSync(SHOTS)) readdirSync(SHOTS).filter(f => /\.(png|jpg)$/.test(f)).forEach(f => rmSync(join(SHOTS, f))); mkdirSync(SHOTS, {recursive: true}); }
const SEED = `state.profile = Object.assign(freshProfile(), {name: "Lula", onboarded: true, birthDate: birthDateFromMonths(18), firstDay: "2026-10-01", mealTimesSource: "default"});
  ALLERGENS.forEach(a => state.profile.allergens[a.id] = "ok");
  state.plan = generateWeek(18, state.profile); state.weekStarted = "2026-10-20"; state.profile.lastStage = stageNow().id; save(); closeOnboarding();`;
const DEVICES = [["se", "iPhone SE"], ["14", "iPhone 14"], ["14max", "iPhone 14 Pro Max"], ["14land", "iPhone 14 landscape"]];
const results = [];
const ok = (name, cond, got) => { results.push((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  → got " + JSON.stringify(got))); };

/* in the page: the checks every device makes (on Home) */
const CHECKS = () => {
  const R = el => el.getBoundingClientRect(), H = innerHeight, W = document.documentElement.clientWidth, $ = s => document.querySelector(s);
  const on = el => el && R(el).height > 0 && R(el).top >= 0 && R(el).bottom <= H + 0.5 && R(el).left >= 0 && R(el).right <= W + 0.5;
  const meet = (a, b) => a && b && R(a).height && R(b).height && R(a).bottom > R(b).top + 0.5 && R(a).top < R(b).bottom - 0.5 && R(a).right > R(b).left + 0.5 && R(a).left < R(b).right - 0.5;
  const box = $("#nowMeal"), foot = $("#footLine"), map = $("#map"), bar = $(".offer-bar");
  // the footer's words, not its box (the box runs under the map by design: it pads 56px on the right)
  const words = (() => { const r = document.createRange(); r.selectNodeContents(foot); return {getBoundingClientRect: () => r.getBoundingClientRect()}; })();
  const targets = [...document.querySelectorAll("#scr-home button, #scr-home a[href]")].filter(b => b.offsetParent && !b.classList.contains("inline") && !b.closest("[hidden]"));
  return {
    overflow: document.documentElement.scrollWidth - W,
    homeScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - H,
    cropped: box.scrollHeight > box.clientHeight + 1 && !box.classList.contains("scrolls"),
    header: [R($("#profileBtn")).top >= 0 && R($("#profileBtn")).left >= 0, R($("#clock")).right <= W],
    small: targets.filter(b => R(b).width < 44 || R(b).height < 44).map(b => b.className + " " + Math.round(R(b).width) + "×" + Math.round(R(b).height)),
    clash: [meet(bar, map) && "pill/map", !foot.hidden && meet(words, map) && "footer/map", !foot.hidden && meet(foot, bar) && "footer/pill"].filter(Boolean),
    first: ["#headline", "#moment", "#nowMeal .meal-foods li", ".offer-bar"].filter(s => !on($(s))),
    wrapped: [...document.querySelectorAll("#nowMeal .meal-foods li")].filter(li => li.getBoundingClientRect().height > parseFloat(getComputedStyle(li).lineHeight) + 1).length
  };
};

/* ---------- the Kitchen on every portrait device, engine and theme (the redesign's UI, layout and pager checks) ---------- */
const KSEED = `state.pantry = []; state.freezer = []; state.shop = {manual: [], notThisWeek: [], got: []}; state.cookAhead = {done: []}; state.hints = {shuffle: "x", kitchen: "x", profile: "x"};
  kitchenUI.view = "buy"; kitchenUI.store = false; kitchenUI.expanded = null; kitchenUI.showGot = false; kitchenUI.open = {}; kitchenUI.morePrep = false; kitchenUI.scroll = {buy: 0, home: 0, prep: 0};
  try { sessionStorage.clear(); } catch (e) {} save(); go("kitchen", {quiet: true}); refresh("kitchen");`;
const KLAYOUT = () => {
  const $ = s => document.querySelector("#scr-kitchen " + s), $$ = s => [...document.querySelectorAll("#scr-kitchen " + s)], R = el => el.getBoundingClientRect(), H = innerHeight;
  const head = R($(".k-head")), rows = $$('[data-sec="buy"] .k-row');
  const shown = rows.filter(r => R(r).top >= head.bottom - .5 && R(r).bottom <= H + .5);
  // nothing peeks out from under the header at rest: no row starts above its bottom edge
  const sliver = [...$(".k-view").querySelectorAll("*")].filter(el => el.offsetParent && R(el).height && R(el).top < head.bottom - .5 && R(el).bottom > head.top).length;
  // the glow's nucleus (9% of the radius) against every control's box
  const g = R($(".k-glow")), cx = g.left + g.width / 2, cy = g.top + g.height / 2, nr = g.width / 2 * KITCHEN_GLOW.core;
  const hit = [...document.querySelectorAll("#scr-kitchen button, #scr-kitchen a[href]")].filter(b => b.offsetParent && !b.closest("[hidden]")).filter(b => {
    const r = R(b), dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom); return Math.hypot(dx, dy) < nr; }).map(b => b.textContent.trim().slice(0, 16));
  return {fiveRows: shown.length >= 5, shown: shown.length, sliver, nucleus: hit, dark: document.documentElement.dataset.theme === "dark",
          heights: [...new Set(rows.map(r => Math.round(R(r).height * 10) / 10))], wrapped: rows.filter(r => R(r.querySelector(".k-name")).height > 26).length,
          grams: rows.map(r => r.querySelector(".k-meta").textContent).filter(t => { const m = t.match(/(\d+) ?g\b/); return m && (+m[1] % 100 || +m[1] < 200); })};
};
async function kitchenRun(page, tag, slug, shotK) {
  const E = js => page.evaluate(js), wait = ms => page.waitForTimeout(ms);
  const fakeLock = `window.__lockLog = []; Object.defineProperty(navigator, "wakeLock", {configurable: true, value: {request: t => { __lockLog.push("request"); const s = new EventTarget(); s.release = () => { __lockLog.push("release"); s.dispatchEvent(new Event("release")); return Promise.resolve(); }; return Promise.resolve(s); }}});`;
  await E(fakeLock + KSEED); await wait(500);
  // layout on first paint
  const L = await E(KLAYOUT);
  if (slug === "14") ok(`${tag}: Kitchen at 390×844: the header and at least five Buy rows on first paint`, L.fiveRows, L.shown);
  ok(`${tag}: Kitchen: Buy rows are exactly ROW_H and one line (names never wrap)`, L.heights.length === 1 && L.heights[0] === 56 && L.wrapped === 0, [L.heights, L.wrapped]);
  ok(`${tag}: Kitchen: no plan grams in Buy (any gram value is a whole 100 g, 200 g or more)`, L.grams.length === 0, L.grams);
  ok(`${tag}: Kitchen: no clipped sliver under the header at rest`, L.sliver === 0, L.sliver);
  if (!L.dark) ok(`${tag}: Kitchen: the glow's nucleus never sits under a control's hit area`, L.nucleus.length === 0, L.nucleus);
  ok(`${tag}: Kitchen: the bottom fade is there, and the scroll area clears the pill (120px)`, await E(`(cs => /linear-gradient/.test(cs.webkitMaskImage || cs.maskImage) && cs.paddingBottom === "120px")(getComputedStyle(document.querySelector("#scr-kitchen .k-body")))`));
  if (shotK) { await shotK("kitchen-buy"); }
  // scrolled: the header's blurred, solid surface; the map dims
  await E(`document.querySelector("#scr-kitchen .k-body").scrollTop = 260`); await wait(260);
  const S = await E(`(() => { const s = document.querySelector("#scr-kitchen .k-surface"), cs = getComputedStyle(s); return {op: cs.opacity, blur: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor, dim: getComputedStyle(document.getElementById("map")).opacity}; })()`);
  ok(`${tag}: Kitchen scrolled: the header is solid (--bg at 88%) and blurred (14px)`, S.op === "1" && /blur\(14px\)/.test(S.blur) && /0\.88\)$/.test(S.bg), S);
  ok(`${tag}: Kitchen scrolled: the position map dims`, +S.dim < 1, S.dim);
  if (shotK) await shotK("kitchen-buy-scrolled");
  await wait(600);
  ok(`${tag}: Kitchen: the map comes back after scrolling stops`, await E(`getComputedStyle(document.getElementById("map")).opacity === "1"`));
  await E(`document.querySelector("#scr-kitchen .k-body").scrollTop = 0`); await wait(80);
  // the tick, undo and Got it round trip
  const id = await E(`toBuyList()[0].foodId`);
  await page.click(`#scr-kitchen [data-f="buy:${id}"]`); await wait(520);
  ok(`${tag}: Kitchen: a tick folds the row into Got it, with the undo line`, await E(`!toBuyList().some(n => n.foodId === "${id}") && state.shop.got.length === 1 && /· got it · Undo$/.test(document.querySelector("#scr-kitchen .k-undo").textContent)`));
  await page.click("#scr-kitchen .k-undo button"); await wait(120);
  ok(`${tag}: Kitchen: Undo puts it back`, await E(`toBuyList().some(n => n.foodId === "${id}") && !state.shop.got.length`));
  // a row expanded, Have it and Not this week
  await page.click(`#scr-kitchen [data-f="row:${id}"]`); await wait(120);
  if (shotK) await shotK("kitchen-buy-expanded");
  await page.click(`#scr-kitchen [data-f="have:${id}"]`); await wait(350);
  const id2 = await E(`toBuyList()[0].foodId`);
  await page.click(`#scr-kitchen [data-f="row:${id2}"]`); await wait(120); await page.click(`#scr-kitchen [data-f="skip:${id2}"]`); await wait(350);
  ok(`${tag}: Kitchen: Have it and Not this week take rows off`, await E(`stockState("${id}") === "plenty" && state.shop.notThisWeek.some(x => x.foodId === "${id2}") && !toBuyList().some(n => n.foodId === "${id}" || n.foodId === "${id2}")`));
  // In the store: regroups, holds the wake lock, lets it go
  await page.click(`#scr-kitchen [data-f="instore"]`); await wait(200);
  ok(`${tag}: Kitchen: In the store regroups by food group and takes the wake lock`, await E(`document.querySelectorAll('#scr-kitchen [data-sec="buy"] .k-label').length >= 2 && __lockLog.join() === "request"`), await E("__lockLog"));
  if (shotK) await shotK("kitchen-instore");
  await page.click(`#scr-kitchen [data-f="instore"]`); await wait(120);
  ok(`${tag}: Kitchen: …and lets it go`, await E(`__lockLog.join() === "request,release"`));
  // Send uses pack units
  ok(`${tag}: Kitchen: Send the list uses pack units`, await E(`groceriesText().split("\\n").slice(2).filter(Boolean).every(l => /^☐ .+ · (\\d+ [a-z]+|\\d+ g)( · by [A-Z][a-z]+day)?$/.test(l))`));
  // the view switch: a sideways swipe (pointer), rubber band at the ends, scroll kept per view
  const b = await page.$eval("#scr-kitchen .k-body", el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height * .6, w: r.width}; });
  const swipe = async dx => { await page.mouse.move(b.x, b.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) await page.mouse.move(b.x + dx * k / 10, b.y); await page.mouse.up(); await wait(320); };
  await swipe(-b.w * .5);
  ok(`${tag}: Kitchen: a sideways swipe switches to At home (not the pager)`, await E(`kitchenUI.view === "home" && pg.cur === "kitchen"`));
  await E(`["pumpkin","rice","banana","lentils","chicken","avocado","oatmeal","peas"].forEach((n, i) => setStock(n, n[0].toUpperCase() + n.slice(1), ["plenty","low","out","plenty","low","plenty","plenty","out"][i])); kitchenUI.open = {grain: true, vegetable: true, protein: true}; save(); changed()`); await wait(120);
  ok(`${tag}: Kitchen At home: group counts and Low with Add to list`, await E(`document.querySelector('#scr-kitchen [data-f="grouprow:protein"] .k-meta').textContent === "2 · 1 low" && !!document.querySelector('#scr-kitchen [data-f="list:rice"]')`));
  await page.click(`#scr-kitchen [data-f="stock:pumpkin"]`); await wait(80);
  ok(`${tag}: Kitchen At home: a tap cycles Plenty → Low`, await E(`stockState("pumpkin") === "low"`));
  if (shotK) await shotK("kitchen-athome");
  await swipe(-b.w * .5);
  ok(`${tag}: Kitchen: …another swipe, Prep`, await E(`kitchenUI.view === "prep"`));
  if (shotK) await shotK("kitchen-prep");
  await swipe(-b.w * .5);
  ok(`${tag}: Kitchen: past Prep it rubber-bands and stays`, await E(`kitchenUI.view === "prep" && pg.cur === "kitchen" && !document.querySelector("#scr-kitchen .k-view").style.transform`));
  // freezer: add, used one, the last one's undo
  await page.click(`#scr-kitchen [data-f="frozen:add"]`);
  ok(`${tag}: Kitchen Prep: Add a frozen portion focuses its field in the tap`, await E(`document.activeElement === document.querySelector('#scr-kitchen [data-f="frozen:food"]')`));
  await page.keyboard.type("lent"); await wait(60); await page.keyboard.press("Enter"); await wait(120);
  ok(`${tag}: Kitchen Prep: a frozen portion added (2 to start)`, await E(`(f => f && f.portions === 2)(state.freezer.find(f => f.foodId === "lentils"))`));
  await page.click(`#scr-kitchen [data-f="useone:lentils"]`); await wait(80); await page.click(`#scr-kitchen [data-f="useone:lentils"]`); await wait(80);
  ok(`${tag}: Kitchen Prep: Used one, and the last one offers Undo`, await E(`!state.freezer.length && /^Used the last lentils · Undo$/.test(document.querySelector("#scr-kitchen .k-undo").textContent)`));
  await page.click("#scr-kitchen .k-undo button"); await wait(80);
  // Prep rows clamp to three lines, with a long list
  await E(`(() => { const days = state.plan.days, put = (day, slot, names) => { const m = days.find(d => d.name === day).meals.find(x => x.slot === slot); if (m) m.items = names.map(n => it(n, "30 g", (FOOD_POOL.find(p => p.name === n) || {cats: ["vegetable"]}).cats.slice())); };
    put("Thursday", "dinner", ["Pumpkin", "Sweet potato", "Butternut squash", "Beetroot, cooked", "Carrots, soft-cooked", "Lentils"]); put("Friday", "lunch", ["Pumpkin", "Sweet potato", "Butternut squash", "Beetroot, cooked", "Carrots, soft-cooked", "Lentils"]);
    put("Friday", "dinner", ["Peas", "Spinach, cooked", "Rice, soft-cooked"]); put("Saturday", "lunch", ["Peas", "Spinach, cooked", "Rice, soft-cooked"]); put("Saturday", "dinner", ["Chicken", "White fish"]); put("Sunday", "lunch", ["Chicken", "White fish"]);
    kitchenUI.morePrep = true; save(); changed(); })()`); await wait(150);
  ok(`${tag}: Kitchen Prep: rows clamp to three lines (title one, detail two)`, await E(`[...document.querySelectorAll("#scr-kitchen .k-prep")].every(r => { const t = r.querySelector(".k-prep-title"), d = r.querySelector(".k-prep-detail"); return t.getBoundingClientRect().height <= parseFloat(getComputedStyle(t).lineHeight) + 1 && d.getBoundingClientRect().height <= parseFloat(getComputedStyle(d).lineHeight) * 2 + 1; })`));
  if (shotK) await shotK("kitchen-prep-long");
  // scroll kept per view
  await E(`document.querySelector("#scr-kitchen .k-body").scrollTop = 150`); await wait(60);
  await page.click(`#scr-kitchen [data-f="view:buy"]`); await wait(260); await page.click(`#scr-kitchen [data-f="view:prep"]`); await wait(260);
  ok(`${tag}: Kitchen: each view keeps its scroll position`, await E(`Math.abs(document.querySelector("#scr-kitchen .k-body").scrollTop - 150) < 2`), await E(`document.querySelector("#scr-kitchen .k-body").scrollTop`));
  // the pager: a vertical drag on the header navigates; a scroll mid-list doesn't
  await E(`document.querySelector("#scr-kitchen .k-body").scrollTop = 0`);
  const sw = await page.$eval("#scr-kitchen .k-switch", el => { const r = el.getBoundingClientRect(); return {x: r.left + r.width - 40, y: r.top + r.height / 2}; });
  await page.mouse.move(sw.x, sw.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) await page.mouse.move(sw.x, sw.y + 40 * k); await page.mouse.up(); await wait(450);
  ok(`${tag}: Kitchen: a vertical drag on the header (the switch row) goes Home`, await E(`pg.cur === "home"`));
  await E(`go("kitchen", {quiet: true})`); await wait(450);
  await page.mouse.move(b.x, b.y); await page.mouse.down(); for (let k = 1; k <= 10; k++) await page.mouse.move(b.x, b.y - 30 * k); await page.mouse.up(); await wait(450);
  ok(`${tag}: Kitchen: dragging the list mid-way never navigates`, await E(`pg.cur === "kitchen"`));
  // the empty states
  await E(`state.cookAhead = {done: []}; state.freezer = []; state.plan.days.forEach(d => d.meals.forEach(m => { m.items = m.items.filter(i => kitchenMeta(foodIdOf(i)).method === "raw"); })); toBuyList().forEach(n => setStock(n.foodId, n.name, "plenty")); save(); changed()`); await wait(120);
  if (shotK) await shotK("kitchen-prep-empty");
  await page.click(`#scr-kitchen [data-f="view:buy"]`); await wait(260);
  ok(`${tag}: Kitchen: the empty Buy says so, with no pill`, await E(`document.querySelector("#scr-kitchen .k-empty").textContent === "Nothing to pick up for the next 3 days." && !document.querySelector("#scr-kitchen .k-pin")`));
  if (shotK) await shotK("kitchen-buy-empty");
}

/* Meal times (step 5 of the onboarding), on a portrait device: a first run from Draw to Home with scripted taps and no
   thinking time (the Reveal plays in full), timed (the median goes to docs/firstrun.json, for the owner to set a
   target); the axis's layout; then the screenshots: the handoff from Allergens, the idle axis, mid-drag, typing, and
   Done with five and three meals. */
const firstRuns = [];
async function mealtimesRun(page, tag, shot) {
  // on a timeout, say where the onboarding was (the step, the pile, the sheet) before giving up
  const ready = async fn => page.waitForFunction(fn, null, {timeout: 15000, polling: 20}).catch(async e => {
    const at = await page.evaluate(`JSON.stringify({step: onb.step, hidden: document.getElementById("onboarding").hidden, pile: !!pile && {running: pile.running, exitAt: pile.exitAt, t: Math.round(pile.t), free: pile.world.bodies.filter(b => b.free).length, n: pile.world.bodies.length}, sheet: !!document.querySelector(".onb-sheet:not(.pad-sheet)"), calm: calm()})`).catch(() => "?");
    throw new Error(`${tag}: waiting for ${fn} — ${at}`);
  });
  const t9 = base.replace("T12:10", "T09:15");
  await page.goto(t9); await page.evaluate("localStorage.clear()"); await page.goto(t9);
  await ready("!document.getElementById('onboarding').hidden && onb.step === 'draw'");
  const t0 = Date.now();
  await ready("!!document.querySelector('.type-instead') && !document.querySelector('.pad-sheet').hidden");
  await page.click(".type-instead");
  await ready("onb.sub === 'typed' && !!document.querySelector('#onbCard .blank-input')");
  await page.fill("#onbCard .blank-input", "Lula"); await page.click("#onbFoot .btn-ink");
  await ready("onb.step === 'birthday' && document.querySelectorAll('.bd-col').length === 3");
  for (const [k, keys] of [["day", ["ArrowDown"]], ["month", ["ArrowDown"]], ["year", ["ArrowUp", "ArrowDown"]]]) { await page.focus(`.bd-col[data-key="${k}"]`); for (const key of keys) await page.keyboard.press(key); }
  await ready("document.querySelector('#onbFoot .btn-ink').getAttribute('aria-disabled') === 'false'");
  await page.click("#onbFoot .btn-ink");
  await ready("onb.step === 'keepout' && !!document.querySelector('.sf-field .sf-shape')");
  // Sort the food: two taps sort the big ones (Select all, then a place)
  await page.click(".sf-selall"); await page.click('.sf-place[data-place="untouched"]');
  await ready("document.querySelector('#onbFoot .btn-ink').getAttribute('aria-disabled') === 'false'");
  await page.click("#onbFoot .btn-ink");
  await ready("onb.step === 'mealtimes' && !!document.querySelector('.mt-axis')");
  await page.click("#onbFoot .btn-ink");
  await ready("onb.step === 'athome' && !!document.querySelector('.pile .sf-shape')");
  await page.click("#onbFoot .btn-ink");
  await ready("onb.step === 'reveal' && onb.revealed && !document.getElementById('onbFoot').inert");
  await page.click(".wk-love");
  await ready("document.getElementById('onboarding').hidden");
  const ms = Date.now() - t0;
  firstRuns.push({tag, ms});
  ok(`${tag}: a scripted first run reaches Home through Meal times and the Kitchen (${(ms / 1000).toFixed(1)} s)`, await page.evaluate("state.profile.onboarded && state.profile.mealTimesSource === 'default' && state.plan.days.every(d => d.meals.length === 5)"));
  // the axis, from Allergens
  await page.evaluate(`state.profile = Object.assign(freshProfile(), {name: "Lula", birthDate: birthDateFromMonths(18)}); state.plans = []; save(); openOnboarding("keepout")`);
  await page.waitForTimeout(1600);
  await ready("!!document.querySelector('.sf-field .sf-shape')");
  await page.evaluate(`sortUI.place(SORT_CONFIG.bigFoods, "untouched", {noUndo: true})`); await page.waitForTimeout(1500);
  await page.click("#onbFoot .btn-ink");
  if (shot) { await page.waitForTimeout(220); await shot("mt-from-allergens", true); }
  await ready("onb.step === 'mealtimes'");
  if (shot) { await page.waitForTimeout(450); await shot("mt-entrance", true); }
  await page.waitForTimeout(1200);
  const L = await page.evaluate(`(() => { const c = document.getElementById("onbCard"), a = document.querySelector(".mt-axis"), H = innerHeight;
    return {scroll: c.scrollHeight - c.clientHeight, hourPx: (a.clientHeight - 2 * MT.pad) / 15, min: MT.minHourPx, inside: [...document.querySelectorAll(".mt-m")].every(m => m.getBoundingClientRect().bottom <= a.getBoundingClientRect().bottom + 1),
            pill: document.querySelector("#onbFoot .btn-ink").getBoundingClientRect().bottom <= H}; })()`);
  ok(`${tag}: meal times never scrolls, the whole day fits`, L.scroll <= 1 && L.inside && L.pill, L);
  ok(`${tag}: an hour on the axis is at least ${L.min}px`, L.hourPx >= L.min, L.hourPx.toFixed(1));
  if (!shot) return;
  await shot("mt-idle");
  const r = await page.evaluate(`(() => { const r = document.querySelector('.mt-m[data-slot="lunch"]').getBoundingClientRect(); return [r.left + 120, r.top + r.height / 2]; })()`);
  await page.mouse.move(r[0], r[1]); await page.mouse.down();
  for (let k = 1; k <= 10; k++) { await page.mouse.move(r[0], r[1] + k * 9); await page.waitForTimeout(16); }
  await shot("mt-drag", true);
  await page.mouse.up(); await page.waitForTimeout(350);
  await page.click(".mt-type"); await page.keyboard.type("1:15");
  await shot("mt-typing");
  await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  await page.click(".mt-usual"); await page.waitForTimeout(200);
  await page.click("#onbFoot .btn-ink"); await ready("onb.step === 'athome' && !!document.querySelector('.pile .sf-shape')");
  // the kitchen: the pile settled, then a pop caught mid-burst, then its Undo line
  await page.waitForTimeout(2600); await shot("kitchen-pile");
  await page.evaluate("document.querySelectorAll('.pile .sf-shape')[4].click()"); await page.waitForTimeout(110); await shot("kitchen-pop", true);
  await page.waitForTimeout(300); await shot("kitchen-undo");
  await page.click("#onbFoot .btn-ink"); await ready("onb.step === 'reveal' && !!document.querySelector('.wk-skip')");
  await page.click(".wk-skip"); await page.waitForTimeout(300);
  await shot("done-5meals");
  await page.click("#onbBack"); await ready("onb.step === 'athome'"); await page.waitForTimeout(300);
  await page.click("#onbBack"); await ready("onb.step === 'mealtimes'"); await page.waitForTimeout(400);
  for (const s of ["snack1", "snack2"]) await page.evaluate(`state.profile.mealTimesSel = "${s}"; save(); renderOnb(); document.querySelector(".mt-remove").click()`);
  await page.click("#onbFoot .btn-ink"); await ready("onb.step === 'athome'"); await page.waitForTimeout(400);
  await page.click("#onbFoot .btn-ink"); await ready("onb.step === 'reveal' && onb.revealed"); await page.waitForTimeout(300);
  await shot("done-3meals");
  await page.evaluate("closeOnboarding()");
}

const browsers = {chromium: await pw.chromium.launch(), webkit: await pw.webkit.launch()};
for (const engine of args.has("--perf-only") ? [] : ["webkit", "chromium"]) {
  for (const [slug, name] of DEVICES) {
    for (const theme of ["light", "dark"]) {
      const dev = Object.assign({}, pw.devices[name]);
      if (engine === "chromium") delete dev.defaultBrowserType;
      // the brief's sizes, i.e. the whole screen as an installed app has it (in Safari the toolbars take ~180px)
      dev.viewport = {se: {width: 375, height: 667}, "14": {width: 390, height: 844}, "14max": {width: 430, height: 932}, "14land": {width: 844, height: 390}}[slug];
      const ctx = await browsers[engine].newContext(Object.assign(dev, {colorScheme: theme, reducedMotion: "no-preference"}));
      const page = await ctx.newPage();
      const tag = `${engine} ${name} ${theme}`;
      await page.goto(base);
      await page.evaluate(SEED); await page.waitForTimeout(500);
      const c = await page.evaluate(CHECKS);
      const portrait = slug !== "14land";
      ok(`${tag}: no horizontal overflow`, c.overflow <= 0, c.overflow);
      ok(`${tag}: Home never scrolls the page`, c.homeScroll <= 0, c.homeScroll);
      ok(`${tag}: nothing on Home is cropped`, !c.cropped);
      ok(`${tag}: the corner header is inside the screen`, c.header.every(Boolean), c.header);
      ok(`${tag}: every tap target on Home is at least 44×44`, c.small.length === 0, c.small);
      ok(`${tag}: the pill, footer and map keep clear of each other`, c.clash.length === 0, c.clash);
      ok(`${tag}: each part of the dish is one line`, c.wrapped === 0, c.wrapped);
      if (portrait) ok(`${tag}: headline (the meal's title), moment line, first food and the pill on screen`, c.first.length === 0, c.first);
      if (!args.has("--quick")) {
        const full = engine === "webkit" && slug === "14";
        const shot = async what => page.screenshot({path: join(SHOTS, `${slug}-${engine}-${theme}-${what}.jpg`), type: "jpeg", quality: 80, animations: "disabled", scale: "css"});
        const go = async (name, extra) => { await page.evaluate(`go('${name}', {quiet: true})${extra ? "; " + extra : ""}`); await page.waitForTimeout(500); };
        await shot("home");
        for (const name of ["shuffle", "kitchen", "week", "profile"]) { await go(name); await shot(name); }
        await go("home");
        if (full) {
          // Home: the pill becomes the three answers ("Offered. Undo" in the footer); one is chosen; Home moves on
          await page.evaluate("document.querySelector('.offer-pill').click()"); await page.waitForTimeout(500); await shot("home-answers");
          await page.evaluate("document.querySelector('.outcome').click()"); await page.waitForTimeout(250); await shot("home-answered");
          await page.waitForTimeout(1300); await shot("home-next");
          await page.evaluate("state.offers = []; offersChanged(); picked = null; save(); changed()"); await page.waitForTimeout(300);
          // a mid-swipe: halfway to the Kitchen (the backdrop at 0.3x)
          await page.evaluate("applyCamera(0, .5)"); await page.waitForTimeout(150); await shot("swipe-half"); await page.evaluate("applyCamera(0, 0)");
          // Shuffle: the meal's stock said per food, then one-at-a-time Change
          await go("shuffle", "const m = shuffleRef().m; setStock(foodIdOf(m.items[0]), baseName(m.items[0]), 'plenty'); setStock(foodIdOf(m.items[1]), baseName(m.items[1]), 'low'); save(); changed()"); await shot("shuffle-stock");
          await page.evaluate("document.querySelector('#scr-shuffle [data-f^=\"change:\"]').click()"); await page.waitForTimeout(200); await shot("shuffle-change");
          await page.evaluate("shuffleUI.changing = null; state.pantry = []; save(); changed()");
          // New week: More open, then the preview
          await go("week", "nwUI.more = true; refresh('week'); document.querySelector('#scr-week .scr-body').scrollTop = 9999"); await page.waitForTimeout(150); await shot("week-more");
          await page.evaluate("nwUI.more = false; setTable()"); await page.waitForTimeout(250); await shot("week-preview");
          await page.evaluate("nwUI.draft = null; refresh('week')");
          // Profile, with a week of offers behind it
          await page.evaluate(`(() => { const d0 = now(); for (let k = 1; k <= 6; k++) { const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k); mealsOn(d).forEach((x, j) => { offerMeal(x.m, d, true); setOutcome(x.m, d, ["loved", "some", "not_today"][(k + j) % 3]); }); } save(); changed(); })()`);
          await go("profile"); await shot("profile-going");
          await page.evaluate("pfUI.open = {going: true, offplate: true}; refresh('profile')"); await page.waitForTimeout(150);
          for (const sec of ["warming", "offplate", "firsts", "settings", "people"]) { await page.evaluate(`document.querySelector('#scr-profile [data-sec=${sec}]').scrollIntoView()`); await page.waitForTimeout(150); await shot("profile-" + sec); }
          await page.evaluate("pfUI.open = {}");
          await go("home");
          if (theme === "light") for (const g of ["grain", "vegetable", "fruit", "protein", "fat"]) {
            await page.evaluate(`glowKey = null; setGlow('${g}')`); await page.waitForTimeout(100); await shot("glow-" + g);
          }
          await page.evaluate("glowKey = null; changed()");
        }
        const steps = full ? ["draw", "birthday", "keepout", "mealtimes", "reveal", "done", "priorities", "athome"] : ["birthday"];
        for (const step of steps) {
          await page.evaluate(step === "draw" ? "openOnboarding('draw', {replay: true})" : step === "done" ? "openOnboarding('reveal', {single: true}); onb.revealed = true; renderOnb()" : `openOnboarding('${step}', {single: true})`);
          await page.waitForTimeout(500); await page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
          await shot("onb-" + step); await page.evaluate("closeOnboarding()");
        }
      }
      // the Kitchen redesign: every portrait device, both engines, both themes (screenshots of each view, the store,
      // an expanded row, a long Prep list and the empty states)
      if (portrait) {
        await page.evaluate("closeOnboarding(); go('kitchen', {quiet: true})"); await page.waitForTimeout(400);
        const shotK = args.has("--quick") ? null : async what => page.screenshot({path: join(SHOTS, `${slug}-${engine}-${theme}-${what}.jpg`), type: "jpeg", quality: 80, animations: "disabled", scale: "css"});
        await kitchenRun(page, tag, slug, shotK);
        // meal times: a timed first run on every portrait device; the screenshots on WebKit, both themes
        const shotM = args.has("--quick") || engine !== "webkit" ? null : async (what, live) => page.screenshot({path: join(SHOTS, `${slug}-${engine}-${theme}-${what}.jpg`), type: "jpeg", quality: 80, animations: live ? "allow" : "disabled", scale: "css"});
        await mealtimesRun(page, tag, shotM);
      }
      await ctx.close();
    }
  }
}

if (args.has("--perf") || args.has("--perf-only")) {
  // throttled: a mid-range phone (4× CPU) on Slow 4G (150ms RTT, 1.6 Mb/s down)
  const pdev = Object.assign({}, pw.devices["iPhone 14"], {colorScheme: "light"}); delete pdev.defaultBrowserType;
  const ctx = await browsers.chromium.newContext(pdev);
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8});
  await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});
  await page.goto("about:blank"); await page.evaluate(`localStorage.setItem("toddlerMealPlanner.v1", "null")`).catch(() => {});
  await page.goto(base); await page.evaluate(SEED);
  await page.goto(base, {waitUntil: "load"});   // a returning family: onboarded, a plan, home on load
  const paint = await page.evaluate(() => new Promise(r => setTimeout(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1);
    let cls = 0; performance.getEntriesByType("layout-shift").forEach(e => { if (!e.hadRecentInput) cls += e.value; });
    const home = performance.getEntriesByName("chicho:home")[0];   // the headline and the meal are on screen
    r({firstHome: home && Math.round(home.startTime), fcp: fcp && Math.round(fcp.startTime), lcp: lcp && Math.round(lcp.startTime), cls: +cls.toFixed(4), bytes: performance.getEntriesByType("resource").reduce((n, e) => n + (e.transferSize || 0), 0) + (performance.getEntriesByType("navigation")[0].transferSize || 0)});
  }, 3000)));
  // the breath: main-thread time over 6 s of a still page, with it on and then off (nothing else may tick: a rAF
  // frame counter would itself force main-thread frames), then the frame rate with it on (grain: static either way)
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const busy = async () => { const a = await metrics(); await page.waitForTimeout(6000); const b = await metrics();
    return {mainThreadMsPerSec: Math.round((b.TaskDuration - a.TaskDuration) / 6 * 1000), styleMsPerSec: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) / 6 * 1000)}; };
  const frames = async () => page.evaluate(() => new Promise(r => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
    const f = now => { n++; worst = Math.max(worst, now - last); last = now; if (now - t0 < 6000) requestAnimationFrame(f); else r({fps: +(n / ((now - t0) / 1000)).toFixed(1), worstFrameMs: Math.round(worst)}); }; requestAnimationFrame(f); }));
  const breathOn = Object.assign(await busy(), await frames());
  await page.addStyleTag({content: ".glow{animation:none !important}"});
  const breathOff = await busy();
  const perf = {profile: "Chromium, iPhone 14, 4× CPU, Slow 4G (150ms, 1.6 Mb/s)", ...paint, breathOn, breathOff};
  console.log("\nperf " + JSON.stringify(perf, null, 1));
  ok("throttled first meaningful paint (the headline and the meal) under 1.5 s", paint.firstHome && paint.firstHome < 1500, paint);
  ok("no layout shift on load", paint.cls < .01, paint.cls);
  writeFileSync(join(root, "docs", "perf.json"), JSON.stringify(perf, null, 2) + "\n");
  await ctx.close();
}

// Desktop, in a phone: a desktop window gets the app inside an iPhone 16 Pro frame (phone.html), never the app stretched
if (!args.has("--perf-only")) for (const engine of ["webkit", "chromium"]) for (const [W, H, theme] of [[1440, 900, "light"], [1280, 720, "dark"]]) {
  const tag = `${engine} desktop ${W}×${H} ${theme}`;
  const ctx = await browsers[engine].newContext({viewport: {width: W, height: H}, colorScheme: theme}), page = await ctx.newPage();
  await page.goto(base.replace("?test&", "?"));
  await page.waitForFunction("!!document.querySelector('.fr-screen iframe') && !!document.querySelector('.fr-screen iframe').contentDocument.getElementById('onbTop')", null, {timeout: 15000});
  await page.waitForTimeout(900);
  const L = await page.evaluate(() => { const f = document.querySelector(".fr-screen iframe"), a = f.contentWindow, box = document.querySelector(".fr-box").getBoundingClientRect(), line = document.querySelector(".fr-line").getBoundingClientRect();
    return {outerApp: typeof window.state !== "undefined" || !!document.getElementById("onboarding"), path: location.pathname, iw: a.innerWidth, ih: a.innerHeight, sat: a.getComputedStyle(a.document.documentElement).getPropertyValue("--sa-t").trim(),
            fits: box.top >= 0 && line.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth, theme: document.body.dataset.theme}; });
  ok(`${tag}: the frame, not the app stretched (none of the app runs in the page; the address stays the app's)`, !L.outerApp && !/phone\.html/.test(L.path), L);
  ok(`${tag}: the app inside has an iPhone 16 Pro's viewport (402×874) and safe area (62px)`, L.iw === 402 && L.ih === 874 && L.sat === "62px", L);
  ok(`${tag}: the phone and its line fit the window`, L.fits, L);
  ok(`${tag}: the page and status bar take the app's theme`, L.theme === theme, L.theme);
  await page.waitForFunction("(() => { const s = document.querySelector('.fr-screen iframe').contentDocument.querySelector('.pad-sheet'); return s && !s.hidden && !s.getAnimations().length; })()", null, {timeout: 15000});
  await page.waitForTimeout(300);
  const pad = await page.frameLocator(".fr-screen iframe").locator("canvas.pad").boundingBox();
  await page.mouse.move(pad.x + pad.width * .2, pad.y + pad.height * .7); await page.mouse.down();
  for (const [x, y] of [[.3, .2], [.4, .7], [.5, .2], [.6, .7]]) await page.mouse.move(pad.x + pad.width * x, pad.y + pad.height * y, {steps: 6});
  await page.mouse.up(); await page.waitForTimeout(200);
  if (!args.has("--quick")) await page.screenshot({path: join(SHOTS, `desktop-${engine}-${theme}-${W}.jpg`), type: "jpeg", quality: 80});
  await page.frameLocator(".fr-screen iframe").locator(".pad-done").click(); await page.waitForTimeout(600);
  ok(`${tag}: a mouse draws on the pad and Done moves on, through the scaled phone`, await page.evaluate(() => document.querySelector(".fr-screen iframe").contentWindow.eval("onb.step")) === "spell");
  await ctx.close();
}

if (firstRuns.length) {
  // the first run's time: scripted taps, no thinking time; recorded for the owner to set a target (none is asserted)
  const sorted = firstRuns.map(r => r.ms).sort((a, b) => a - b), median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const fr = {what: "Draw (Type instead) to Home through Birthday, Allergens, Meal times (untouched), Reveal (played in full) and Done; scripted taps, no thinking time", medianMs: median, minMs: sorted[0], maxMs: sorted.at(-1), runs: firstRuns};
  console.log(`\nfirst run: median ${(median / 1000).toFixed(1)} s over ${sorted.length} runs (${(sorted[0] / 1000).toFixed(1)}–${(sorted.at(-1) / 1000).toFixed(1)} s)`);
  writeFileSync(join(root, "docs", "firstrun.json"), JSON.stringify(fr, null, 2) + "\n");
}
await browsers.chromium.close(); await browsers.webkit.close(); server.close();
const fails = results.filter(l => l.startsWith("FAIL"));
console.log(results.filter(l => l.startsWith("FAIL")).join("\n") || "", `\n${results.length - fails.length} passed, ${fails.length} failed` + (args.has("--quick") || args.has("--perf-only") ? "" : `; screenshots in docs/screenshots/ (${readdirSync(SHOTS).filter(f => f.endsWith(".jpg")).length})`));
process.exit(fails.length ? 1 : 0);
