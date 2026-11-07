const PREPROD = self.location.pathname.includes("/dev/");
const CACHE = PREPROD ? "vakitler-dev-v27" : "vakitler-v27";
const CACHE_PREFIX = PREPROD ? "vakitler-dev-" : "vakitler-v";

const FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/app.js",
  "./js/mezhep.js",
  "./js/places.js",
  "./js/vesvese.js",
  "./icons/vesvese/1.jpg",
  "./icons/vesvese/2.jpg",
  "./icons/vesvese/3.jpg",
  "./icons/vesvese/4.jpg",
  "./icons/vesvese/5.jpg",
  "./icons/vesvese/6.jpg",
  "./icons/vesvese/7.jpg",
  "./icons/vesvese/8.jpg",
  "./icons/vesvese/9.jpg",
  "./icons/vesvese/10.jpg",
  "./icons/vesvese/touch-180.png",
  "./icons/vesvese/icon-192.png",
  "./icons/vesvese/icon-512.png",
  "./vendor/adhan.esm.js",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/fraunces-latin-500.woff2",
  "./fonts/fraunces-latinext-500.woff2",
  "./fonts/fraunces-latin-600.woff2",
  "./fonts/fraunces-latinext-600.woff2",
  "./fonts/outfit-latin-400.woff2",
  "./fonts/outfit-latinext-400.woff2",
  "./fonts/outfit-latin-500.woff2",
  "./fonts/outfit-latinext-500.woff2",
  "./fonts/outfit-latin-600.woff2",
  "./fonts/outfit-latinext-600.woff2",
];

const ASSETS = FILES.map((path) => new URL(path, self.location).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("Önbelleğe alınamadı", url, error);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
      );
      const shown = await self.registration.getNotifications();
      for (const note of shown) {
        if (String(note.tag).includes("vesvese")) note.close();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const scope = new URL("./", self.registration.scope).href;
      for (const client of all) {
        if (client.url.startsWith(scope) && "focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow("./");
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!PREPROD && url.pathname.includes("/dev/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put("./index.html", fresh.clone());
    return fresh;
  } catch {
    return (
      (await cache.match("./index.html")) ||
      (await cache.match("./")) ||
      new Response("Çevrimdışı. Sayfayı bir kez internete bağlıyken açın.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return cached || Response.error();
  }
}
