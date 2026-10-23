// The device run: `PLAYWRIGHT=<path to the playwright package> node tools/devices.mjs [--quick] [--perf]`
// (Playwright isn't a dependency of this repo; point at any install, e.g. ~/dev/client/node_modules/playwright,
// with its WebKit and Chromium browsers downloaded.)
//
// WebKit and Chromium, as iPhone SE (375×667), iPhone 14 (390×844), iPhone 14 Pro Max (430×932) and iPhone 14
// landscape, in light and dark. Each run asserts: no horizontal overflow, the corner header inside the screen,
// every tap target at least 44×44, the sticky pill clear of what it must not cover, and (at 390×844 and 375×667)
// the fold budget. Screenshots land in docs/screenshots/: the full set (home, an expanded meal, each sheet, the
// week, every onboarding step, each glow colour) for WebKit iPhone 14 in both themes, and home, week, shop and
// the birthday step for every other device, engine and theme. --quick skips the screenshots.
// --perf adds the throttled run (Chromium, 4× CPU, Slow 4G): first paint and the cost of the grain and the breath.
// Safe-area insets can't be emulated here; the real-iPhone list in docs/decisions.md covers them.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { createRequire } from "node:module";
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
  res.writeHead(200, {"content-type": TYPES[extname(p)] || "application/octet-stream"}); res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise(r => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}/index.html?test&now=2026-10-22T12:10`;

const SHOTS = join(root, "docs", "screenshots");
if (!args.has("--quick")) { if (existsSync(SHOTS)) readdirSync(SHOTS).filter(f => /\.(png|jpg)$/.test(f)).forEach(f => rmSync(join(SHOTS, f))); mkdirSync(SHOTS, {recursive: true}); }
const SEED = `state.profile = Object.assign(freshProfile(), {name: "Lula", onboarded: true, birthDate: birthDateFromMonths(18), firstDay: "2026-10-01", mealTimesConfirmed: true});
  ALLERGENS.forEach(a => state.profile.allergens[a.id] = "ok");
  state.plan = generateWeek(18, state.profile); state.weekStarted = "2026-10-20"; state.profile.lastStage = stageNow().id; save(); closeOnboarding();`;
const DEVICES = [["se", "iPhone SE"], ["14", "iPhone 14"], ["14max", "iPhone 14 Pro Max"], ["14land", "iPhone 14 landscape"]];
const results = [];
const ok = (name, cond, got) => { results.push((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  → got " + JSON.stringify(got))); };

/* in the page: the checks every device makes */
const CHECKS = () => {
  const R = el => el.getBoundingClientRect(), H = innerHeight, W = document.documentElement.clientWidth, $ = s => document.querySelector(s);
  const pill = $("#openMeal .mx-acts"), p = pill ? R(pill) : null;
  const clear = el => el && R(el).height > 0 && R(el).top >= 0 && R(el).bottom <= H && (!p || R(el).bottom <= p.top + 1 || R(el).top >= p.bottom - 1);
  const targets = [...document.querySelectorAll("#home button, #home a[href]")].filter(b => b.offsetParent && !b.classList.contains("inline") && !b.closest("[hidden]"));
  const rows = [...document.querySelectorAll("#openMeal .fr")];
  return {
    overflow: document.documentElement.scrollWidth - W,
    header: [R($("#profileBtn")).top >= 0 && R($("#profileBtn")).left >= 0, R($("#clock")).right <= W],
    small: targets.filter(b => R(b).width < 44 || R(b).height < 44).map(b => b.className + " " + Math.round(R(b).width) + "×" + Math.round(R(b).height)),
    pillCovers: p ? ["#headline", "#openMeal .mx-title", "#nextLabel"].filter(s => { const e = $(s); return e && R(e).bottom > p.top + 1 && R(e).top < p.bottom - 1; }).concat(rows.slice(0, 2).filter(r => R(r).bottom > p.top + 1 && R(r).top < p.bottom - 1).map(() => ".fr")) : [],
    fold390: ["#profileBtn", "#clock", "#headline", "#moment", "#openMeal .mx-title"].every(s => clear($(s))) && rows.slice(0, 2).every(clear),
    fold375: ["#headline", "#openMeal .mx-title"].every(s => clear($(s))) && clear(rows[0]),
    nextPeeks: $("#nextLabel") && R($("#nextLabel")).bottom <= H
  };
};

const browsers = {chromium: await pw.chromium.launch(), webkit: await pw.webkit.launch()};
for (const engine of ["webkit", "chromium"]) {
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
      ok(`${tag}: no horizontal overflow`, c.overflow <= 0, c.overflow);
      ok(`${tag}: the corner header is inside the screen`, c.header.every(Boolean), c.header);
      ok(`${tag}: every tap target is at least 44×44`, c.small.length === 0, c.small);
      ok(`${tag}: the sticky pill covers nothing it shouldn't`, c.pillCovers.length === 0, c.pillCovers);
      if (slug === "14") { ok(`${tag}: fold budget at 390×844`, c.fold390, c); ok(`${tag}: Up next peeks`, c.nextPeeks); }
      if (slug === "se") ok(`${tag}: fold budget at 375×667`, c.fold375, c);
      if (!args.has("--quick")) {
        const full = engine === "webkit" && slug === "14";
        const shot = async what => page.screenshot({path: join(SHOTS, `${slug}-${engine}-${theme}-${what}.jpg`), type: "jpeg", quality: 80, animations: "disabled", scale: "css"});
        const reset = async () => { await page.evaluate("closeSheet(true); picked = null; openFood.clear(); homeChanged(); scrollTo(0, 0)"); await page.waitForTimeout(150); };
        await shot("home");
        await page.evaluate("document.getElementById('weekSec').classList.add('in'); document.querySelectorAll('.below').forEach(s => s.classList.add('in')); document.getElementById('weekSec').scrollIntoView()");
        await page.waitForTimeout(200); await shot("week"); await reset();
        await page.evaluate("openSheet('shop')"); await page.waitForTimeout(350); await shot("sheet-shop"); await reset();
        if (full) {
          await page.evaluate("document.querySelector('#openMeal .fr').click()"); await page.waitForTimeout(250); await shot("meal-expanded"); await reset();
          for (const [kind, arg] of [["day", "{pos: 2}"], ["send", "{}"], ["profile", "{}"], ["people", "{}"]]) {
            await page.evaluate(`openSheet('${kind}', ${arg})`); await page.waitForTimeout(350); await shot("sheet-" + kind); await reset();
          }
          await page.evaluate("openSheet('shop')"); await page.waitForTimeout(300);
          await page.evaluate("setDetent('large')"); await page.waitForTimeout(350); await shot("sheet-shop-large"); await reset();
          if (theme === "light") for (const g of ["grain", "vegetable", "fruit", "protein", "fat"]) {
            await page.evaluate(`glowKey = null; setGlow('${g}')`); await page.waitForTimeout(100); await shot("glow-" + g);
          }
          await page.evaluate("glowKey = null; homeChanged()");
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

if (args.has("--perf")) {
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
    r({fcp: fcp && Math.round(fcp.startTime), lcp: lcp && Math.round(lcp.startTime), cls: +cls.toFixed(4), bytes: performance.getEntriesByType("resource").reduce((n, e) => n + (e.transferSize || 0), 0) + (performance.getEntriesByType("navigation")[0].transferSize || 0)});
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
  ok("throttled first contentful paint under 1.5 s", paint.fcp && paint.fcp < 1500, paint.fcp);
  ok("no layout shift on load", paint.cls < .01, paint.cls);
  writeFileSync(join(root, "docs", "perf.json"), JSON.stringify(perf, null, 2) + "\n");
  await ctx.close();
}

await browsers.chromium.close(); await browsers.webkit.close(); server.close();
const fails = results.filter(l => l.startsWith("FAIL"));
console.log(results.filter(l => l.startsWith("FAIL")).join("\n") || "", `\n${results.length - fails.length} passed, ${fails.length} failed` + (args.has("--quick") ? "" : `; screenshots in docs/screenshots/ (${readdirSync(SHOTS).filter(f => f.endsWith(".jpg")).length})`));
process.exit(fails.length ? 1 : 0);
