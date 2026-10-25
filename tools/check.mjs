// The build: `node tools/check.mjs`. Nothing ships unless this passes.
// 1. lint: no hover anywhere (no :hover, no @media (hover…), no hover-based listeners)
// 2. voice: none of the banned words in the app's source (lines marked "legacy:" convert old saves and may name old fields),
//    no "Show the week", no emoji or icons in the copy, the meal-times component and the sort, and no exclamation marks in the copy
//    and colour: no colour outside the token block (light and dark share every component)
// 3. every tests/*.html page (or those named on the command line), in headless Chrome over the DevTools protocol, must end with "ALL PASS"
// No dependencies: Node's http server and fetch, and the Chrome already on this Mac.
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = ["index.html", "theme.js", "onboarding.js", "mealtimes.js", "kitchen.js", "home.js", "foods.js", "content.js", "sw.js", "sortconfig.js", "sortcore.js", "sortfood.js", "tools/sorttune.js"];
const fails = [];

// 1. hover
const HOVER = [/:hover\b/, /@media[^{]*\bhover\b/, /addEventListener\(\s*["'](mouseenter|mouseover|mouseleave|mouseout|pointerenter|pointerover|pointerleave|pointerout)["']/, /\bonmouse(over|enter|leave|out)\b/];
// 2. banned words (the UI never says these, and the source doesn't either)
const BANNED = /\b(eaten|Not logged|missed|cleared|streak)\b/i;
for (const f of SOURCES) {
  readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
    HOVER.forEach(re => { if (re.test(line)) fails.push(`lint  ${f}:${i + 1}  hover: ${line.trim().slice(0, 90)}`); });
    if (BANNED.test(line) && !/legacy:/.test(line)) fails.push(`voice ${f}:${i + 1}  "${line.match(BANNED)[0]}": ${line.trim().slice(0, 90)}`);
  });
}

// 2b'. the old generic cook-ahead lines are gone for good, and the storage numbers come only from KITCHEN (kitchen.js)
for (const f of SOURCES) readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
  if (/\b(Make|Cook) double\b/i.test(line)) fails.push(`voice ${f}:${i + 1}  the old "Make double"/"Cook double" line: ${line.trim().slice(0, 90)}`);
  if (/Fridge \d|freezer \d+ (day|month)/i.test(line)) fails.push(`voice ${f}:${i + 1}  a storage number written into the copy (use KITCHEN): ${line.trim().slice(0, 90)}`);
});

// 2b''. Allergens' pill is "Next": the old label is gone from every source, comments included
for (const f of SOURCES) readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
  if (/Show the week/i.test(line)) fails.push(`voice ${f}:${i + 1}  the old "Show the week" label: ${line.trim().slice(0, 90)}`);
});

// 2d. text only: no emoji or pictographs in the copy, the meal-times component or the sort, and no icon markup in them
//     (its one SVG is the family's drawn name, from inkSVG). The food data's emoji fields are stored, never shown.
for (const f of ["content.js", "mealtimes.js", "sortfood.js", "sortcore.js", "sortconfig.js"]) readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
  if (/\p{Extended_Pictographic}/u.test(line)) fails.push(`lint  ${f}:${i + 1}  an emoji or pictograph: ${line.trim().slice(0, 90)}`);
  if (f !== "content.js" && /<svg|<img|<canvas|\bicon\b/i.test(line) && !/inkSVG/.test(line)) fails.push(`lint  ${f}:${i + 1}  an icon: ${line.trim().slice(0, 90)}`);
});

// 2a. the voice is dry and warm: no exclamation marks in any of the copy (every string literal in content.js)
readFileSync(join(root, "content.js"), "utf8").split("\n").forEach((line, i) => {
  for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (m[1].includes("!")) fails.push(`voice content.js:${i + 1}  an exclamation mark: "${m[1].slice(0, 80)}"`);
});

// 2b. colour: every colour is a token. After the token block in index.html's <style>, no hex, rgb() or hsl().
{
  const html = readFileSync(join(root, "index.html"), "utf8").split("\n");
  let inStyle = false, afterTokens = false;
  html.forEach((line, i) => {
    if (/<style>/.test(line)) inStyle = true;
    if (/<\/style>/.test(line)) inStyle = false;
    if (/===== END TOKENS/.test(line)) { afterTokens = true; return; }
    if (inStyle && afterTokens && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(line)) fails.push(`lint  index.html:${i + 1}  colour outside the tokens: ${line.trim().slice(0, 90)}`);
  });
}

// 2c. motion: only transform and opacity move (and translate/scale/rotate, their longhands); the glow's breath is
//     the only infinite animation. Checks CSS transitions, @keyframes and the keyframes passed to element.animate().
{
  const MOVES = new Set(["transform", "opacity", "translate", "scale", "rotate", "all-none"]);
  const html = readFileSync(join(root, "index.html"), "utf8");
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const lineOf = idx => html.slice(0, html.indexOf("<style>") + idx).split("\n").length;
  for (const m of css.matchAll(/transition(-property)?\s*:\s*([^;}]+)/g)) {
    if (m[2].trim() === "none") continue;
    m[2].split(",").map(p => p.trim().split(/\s+/)[0]).forEach(p => {
      if (!MOVES.has(p) && !/^var\(/.test(p) && !/^[\d.]+m?s$/.test(p)) fails.push(`lint  index.html:${lineOf(m.index)}  transition on "${p}" (only transform and opacity move)`);
    });
  }
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
    for (const d of m[2].matchAll(/([a-z-]+)\s*:/g)) if (!MOVES.has(d[1])) fails.push(`lint  index.html:${lineOf(m.index)}  @keyframes ${m[1]} animates "${d[1]}"`);
  }
  html.split("\n").forEach((line, i) => { if (/\binfinite\b/.test(line) && !/animation:breathe/.test(line) && !/^\s*(\/\*|\*)/.test(line)) fails.push(`lint  index.html:${i + 1}  an infinite animation that isn't the glow's breath`); });
  for (const f of ["index.html", "onboarding.js", "mealtimes.js", "kitchen.js", "home.js", "sortfood.js"]) {
    readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/\.animate\(\s*\[([^\]]*)\]/g)) for (const k of m[1].matchAll(/([a-zA-Z]+)\s*:/g))
        if (!["opacity", "transform", "offset", "easing", "translate", "scale"].includes(k[1])) fails.push(`lint  ${f}:${i + 1}  .animate() moves "${k[1]}"`);
      if (/iterations\s*:\s*Infinity/.test(line)) fails.push(`lint  ${f}:${i + 1}  an infinite animation that isn't the glow's breath`);
    });
  }
}

// 3. the test pages
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript", ".json":"application/json", ".webmanifest":"application/manifest+json",
               ".png":"image/png", ".webp":"image/webp", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".css":"text/css"};
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {"content-type": TYPES[extname(p)] || "application/octet-stream"}); res.end(readFileSync(p));
}).listen(0, "127.0.0.1");
await new Promise(r => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
// `node tools/check.mjs foodsort home` runs only the pages whose names contain one of the words (lint always runs)
const only = process.argv.slice(2);
const pages = readdirSync(join(root, "tests")).filter(f => f.endsWith(".html") && (!only.length || only.some(w => f.includes(w)))).sort();

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, ["--headless", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/chicho-check-${port}-${Date.now()}`, "--no-first-run", "about:blank"], {stdio:"ignore"});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let k = 0; k < 60; k++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch (e) { await sleep(200); } }
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({id:i, method, params})); });
await send("Page.enable");
for (const page of pages) {
  await send("Page.navigate", {url:`${base}/tests/${page}`});
  const t0 = Date.now(); let title = "";
  while (Date.now() - t0 < 90000) {
    await sleep(400);
    const r = await send("Runtime.evaluate", {expression:"document.title", returnByValue:true});
    title = r && r.result ? r.result.value : "";
    if (/ALL PASS|FAILED/.test(title)) break;
  }
  const out = await send("Runtime.evaluate", {expression:"(document.getElementById('o')||document.body).textContent", returnByValue:true});
  const text = out.result ? out.result.value : "";
  const failed = text.split("\n").filter(l => l.startsWith("FAIL"));
  const passed = text.split("\n").filter(l => l.startsWith("PASS")).length;
  console.log(`${/ALL PASS/.test(title) ? "pass" : "FAIL"}  ${page.padEnd(18)} ${passed} checks${failed.length ? ", " + failed.length + " failed" : ""}${/ALL PASS|FAILED/.test(title) ? "" : " (timed out)"}`);
  failed.forEach(l => fails.push(`test  ${page}  ${l.slice(5, 200)}`));
  if (!/ALL PASS|FAILED/.test(title)) fails.push(`test  ${page}  timed out`);
}
chrome.kill(); server.close();
if (fails.length) { console.log("\n" + fails.join("\n") + `\n\n${fails.length} problem(s). Not shipping.`); process.exit(1); }
console.log("\nAll clear: lint, voice and every test page.");
process.exit(0);
