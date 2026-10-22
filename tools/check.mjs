// The build: `node tools/check.mjs`. Nothing ships unless this passes.
// 1. lint: no hover anywhere (no :hover, no @media (hover…), no hover-based listeners)
// 2. voice: none of the banned words in the app's source (lines marked "legacy:" convert old saves and may name old fields)
// 3. every tests/*.html page, in headless Chrome over the DevTools protocol, must end with "ALL PASS"
// No dependencies: Node's http server and fetch, and the Chrome already on this Mac.
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = ["index.html", "home.js", "foods.js", "content.js", "sw.js"];
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
const pages = readdirSync(join(root, "tests")).filter(f => f.endsWith(".html")).sort();

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
