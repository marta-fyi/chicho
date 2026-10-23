// The device run: `PLAYWRIGHT=<path to the playwright package> node tools/devices.mjs [--quick] [--perf]`
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
               ".webp":"image/webp", ".jpg":"image/jpeg", ".woff2":"font/woff2", ".json":"application/json"};
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
const SEED = `state.profile = Object.assign(freshProfile(), {name: "Lula", onboarded: true, birthDate: birthDateFromMonths(18), firstDay: "2026-10-01", mealTimesConfirmed: true});
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
          // Home: offered, then how it went, then the quiet line
          await page.evaluate("document.querySelector('.offer-pill').click()"); await page.waitForTimeout(400); await shot("home-offered-undo");
          await page.evaluate("Object.keys(undoUntil).forEach(k => { undoUntil[k] = 0; showOutcome(k, 20000); }); layoutSig = ''; renderHome()"); await page.waitForTimeout(400); await shot("home-outcomes");
          await page.evaluate("Object.keys(outcomeUntil).forEach(k => delete outcomeUntil[k]); layoutSig = ''; renderHome()"); await page.waitForTimeout(200); await shot("home-addhow");
          await page.evaluate("const r = homeRef().ref; offerMeal(r.m, r.date, false); picked = null; save(); changed()"); await page.waitForTimeout(300);
          // a mid-swipe: halfway to the Kitchen (the backdrop at 0.3x)
          await page.evaluate("applyCamera(0, .5)"); await page.waitForTimeout(150); await shot("swipe-half"); await page.evaluate("applyCamera(0, 0)");
          // Shuffle: the meal's stock said per food, then one-at-a-time Change
          await go("shuffle", "const m = shuffleRef().m; setStock(foodIdOf(m.items[0]), baseName(m.items[0]), 'plenty'); setStock(foodIdOf(m.items[1]), baseName(m.items[1]), 'low'); save(); changed()"); await shot("shuffle-stock");
          await page.evaluate("document.querySelector('#scr-shuffle [data-f^=\"change:\"]').click()"); await page.waitForTimeout(200); await shot("shuffle-change");
          await page.evaluate("shuffleUI.changing = null; state.pantry = []; save(); changed()");
          // Kitchen: stock in its states, a group open, In the store, the freezer
          await go("kitchen", "const n = toBuyList(); setStock(n[0].foodId, n[0].name, 'plenty'); setStock(n[1].foodId, n[1].name, 'low'); setStock('rice', 'Rice', 'out'); state.freezer = [{foodId: 'lentils', name: 'Lentils', portions: 2, madeOn: '2026-10-20'}]; kitchenUI.open.grain = true; kitchenUI.open.vegetable = true; save(); changed()");
          await shot("kitchen-stock");
          await page.evaluate("document.querySelector('#scr-kitchen .scr-body').scrollTop = 9999"); await page.waitForTimeout(150); await shot("kitchen-freezer");
          await page.evaluate("kitchenUI.store = true; refresh('kitchen'); document.querySelector('#scr-kitchen .scr-body').scrollTop = 0"); await page.waitForTimeout(200); await shot("kitchen-instore");
          await page.evaluate("kitchenUI.store = false; state.pantry = []; state.freezer = []; kitchenUI.open = {}; save(); changed()");
          // New week: More open, then the preview
          await go("week", "nwUI.more = true; refresh('week'); document.querySelector('#scr-week .scr-body').scrollTop = 9999"); await page.waitForTimeout(150); await shot("week-more");
          await page.evaluate("nwUI.more = false; setTable()"); await page.waitForTimeout(250); await shot("week-preview");
          await page.evaluate("nwUI.draft = null; refresh('week')");
          // Profile, with a week of offers behind it
          await page.evaluate(`(() => { const d0 = now(); for (let k = 1; k <= 6; k++) { const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k); mealsOn(d).forEach((x, j) => { offerMeal(x.m, d, true); setOutcome(x.m, d, ["loved", "some", "not_today"][(k + j) % 3]); }); } save(); changed(); })()`);
          await go("profile"); await shot("profile-going");
          for (const sec of ["warming", "offplate", "firsts", "settings", "people"]) { await page.evaluate(`document.querySelector('#scr-profile [data-sec=${sec}]').scrollIntoView()`); await page.waitForTimeout(150); await shot("profile-" + sec); }
          await go("home");
          if (theme === "light") for (const g of ["grain", "vegetable", "fruit", "protein", "fat"]) {
            await page.evaluate(`glowKey = null; setGlow('${g}')`); await page.waitForTimeout(100); await shot("glow-" + g);
          }
          await page.evaluate("glowKey = null; changed()");
        }
        const steps = full ? ["welcome", "name", "birthday", "keepout", "priorities", "athome", "mealtimes", "reveal", "done"] : ["birthday"];
        for (const step of steps) {
          await page.evaluate(step === "welcome" ? "openOnboarding('welcome', {replay: true})" : step === "done" ? "openOnboarding('reveal', {single: true}); onb.revealed = true; renderOnb()" : `openOnboarding('${step}', {single: true})`);
          await page.waitForTimeout(500); await page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
          await shot("onb-" + step); await page.evaluate("closeOnboarding()");
        }
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

await browsers.chromium.close(); await browsers.webkit.close(); server.close();
const fails = results.filter(l => l.startsWith("FAIL"));
console.log(results.filter(l => l.startsWith("FAIL")).join("\n") || "", `\n${results.length - fails.length} passed, ${fails.length} failed` + (args.has("--quick") || args.has("--perf-only") ? "" : `; screenshots in docs/screenshots/ (${readdirSync(SHOTS).filter(f => f.endsWith(".jpg")).length})`));
process.exit(fails.length ? 1 : 0);
