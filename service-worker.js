/* service-worker.js — ChoreQuest
   - Navigation (HTML) : network-first → cache → offline.html
   - Assets statiques : cache-first
   - Cross-origin (Google Fonts, unpkg) : non intercepté (laissé au réseau)
*/
const CACHE_VERSION = "v2";
const CACHE_NAME = `chorequest-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url))
      );
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(`[SW] Échec cache : ${STATIC_ASSETS[i]}`, r.reason);
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Ne pas interférer avec les CDN externes (Google Fonts, unpkg)
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  event.respondWith(handleStatic(request));
});

async function handleNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    const response = preload || (await fetch(event.request));
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("./index.html");
    return cached || caches.match("./offline.html");
  }
}

async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request.clone());
    if (response && response.status === 200 && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn("[SW] Ressource indisponible :", request.url);
    throw err;
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});