/* Chicho's service worker: the app shell works offline.
   The page itself is fetched network-first (a new version shows as soon as
   it's online) and falls back to the cached copy; the scripts, the
   background and the icons are cache-first, and every food drawing is
   cached the first time it's shown (the page also warms the week's
   drawings after its first paint). Everything the family enters lives in
   localStorage, so it's already offline. Bump VERSION with every release
   so old caches go. */
const VERSION = "chicho-v13";
const SHELL = ["./", "index.html", "theme.js", "foods.js", "content.js", "sortconfig.js", "sortcore.js", "curatedSeeds.json", "onboarding.js", "sortfood.js", "mealtimes.js", "kitchen.js", "home.js", "img/grain.png", "fonts/jbm-400.woff2", "fonts/jbm-500.woff2", "bg.jpg", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
const isShell = url=>SHELL.some(p=>p!=="./" && url.pathname.endsWith("/" + p));
const isArt = url=>url.pathname.includes("/img/food/");
self.addEventListener("fetch", e=>{
  const req = e.request, url = new URL(req.url);
  if(req.method!=="GET" || url.origin!==location.origin) return;
  if(req.mode==="navigate"){
    e.respondWith(fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(VERSION).then(c=>c.put("index.html", copy));
      return res;
    }).catch(()=>caches.match("index.html").then(r=>r || caches.match("./"))));
    return;
  }
  if(!isShell(url) && !isArt(url)) return;
  e.respondWith(caches.match(req, {ignoreSearch:true}).then(hit=>hit || fetch(req).then(res=>{
    if(res.ok){ const copy = res.clone(); caches.open(VERSION).then(c=>c.put(req, copy)); }
    return res;
  })));
});
