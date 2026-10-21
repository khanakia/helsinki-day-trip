// Offline support for the Helsinki day-trip page.
// Page: network first (so updates show), cache when offline.
// Scripts, styles and map tiles: cache first, saved on first use.
const CORE_CACHE = "hel-core-v1";
const TILE_CACHE = "hel-tiles-v1";
const CORE = [
  "./",
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/layers-2x.png",
];
const NAV_TIMEOUT_MS = 4000;

const corsReq = (url) => new Request(url, { mode: "cors", credentials: "omit" });

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CORE_CACHE).then((c) =>
    Promise.all(CORE.map((u) => fetch(u.startsWith("http") ? corsReq(u) : u)
      .then((r) => r.ok && c.put(new URL(u, self.registration.scope).href, r)).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => ![CORE_CACHE, TILE_CACHE].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const home = new URL("./", self.registration.scope).href;
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("slow")), NAV_TIMEOUT_MS))]);
        if (r.ok) (await caches.open(CORE_CACHE)).put(home, r.clone());
        return r;
      } catch (err) {
        return (await caches.match(home)) || Response.error();
      }
    })());
    return;
  }
  const url = req.url;
  const isTile = url.includes("/MapServer/tile/");
  e.respondWith((async () => {
    const hit = await caches.match(url);
    if (hit) return hit;
    const cross = new URL(url).origin !== self.location.origin;
    const r = await fetch(cross ? corsReq(url) : req);
    if (r.ok) (await caches.open(isTile ? TILE_CACHE : CORE_CACHE)).put(url, r.clone());
    return r;
  })());
});
