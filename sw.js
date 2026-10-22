/* Chicho's service worker: the app shell works offline.
   The page itself is fetched network-first (a new version shows as soon as
   it's online) and falls back to the cached copy; the image and icons are
   cache-first. Everything the family enters lives in localStorage, so it's
   already offline. Bump VERSION with every release so old caches go. */
const VERSION = "chicho-v2";
const SHELL = ["./", "index.html", "foods.js", "content.js", "bg.jpg", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method!=="GET" || new URL(req.url).origin!==location.origin) return;
  if(req.mode==="navigate"){
    e.respondWith(fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(VERSION).then(c=>c.put("index.html", copy));
      return res;
    }).catch(()=>caches.match("index.html").then(r=>r || caches.match("./"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>hit || fetch(req).then(res=>{
    if(res.ok && (SHELL.some(p=>req.url.endsWith(p.replace("./",""))) || req.url.includes("/img/food/"))){ const copy = res.clone(); caches.open(VERSION).then(c=>c.put(req, copy)); }
    return res;
  })));
});
