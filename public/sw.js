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

const CACHE_VERSION = 'carfolio-v5';

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

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match('./index.html');
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put('./index.html', response.clone());
            return response;
          })
          .catch(() => null);
        return cached ?? (await network) ?? Response.error();
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
