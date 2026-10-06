/**
 * SERVICE WORKER — the thing that makes this app work with no signal.
 *
 * Strategy is cache-first for everything the app is built from, because those
 * files are content-hashed: a given URL's contents never change, so serving the
 * cached copy is always correct and always instant. New builds bring new
 * filenames, which is what CACHE_VERSION rolls.
 *
 * The navigation request is the exception. It is answered from the cached
 * index so the app opens offline, and refreshed from the network in the
 * background so a redeploy is picked up on the next launch rather than never.
 */

const CACHE_VERSION = 'carfolio-v9';

// Everything needed to open with no network at all. The rest of the bundle is
// added to the cache as it is requested.
const CORE = ['./', './index.html', './manifest.json', './sql-wasm.wasm', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The page itself: network first. A cached page names the hashed bundle and
  // fonts of an older build, and once that build is gone from the server the
  // app opens with boxes instead of icons. The cache is only the offline answer.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          const response = await Promise.race([
            fetch(request, { cache: 'no-store' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
          ]);
          if (response.ok) {
            cache.put('./index.html', response.clone());
            return response;
          }
          // A deep link (/garage) is a 404 on a static host: the app shell answers it.
          return (await cache.match('./index.html')) ?? response;
        } catch {
          return (await cache.match('./index.html')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
