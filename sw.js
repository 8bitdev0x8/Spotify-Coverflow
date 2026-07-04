const CACHE_NAME = 'coverflow-v0.6';
const IMG_CACHE = 'coverflow-img-v1';
const IMG_CACHE_MAX_ENTRIES = 400;

// Album art / playlist cover CDNs — cached cache-first so revisits and offline
// launches don't re-download artwork.
const IMG_HOSTS = new Set([
  'i.scdn.co',
  'mosaic.scdn.co',
  'image-cdn-ak.spotifycdn.com',
  'image-cdn-fa.spotifycdn.com',
  'placehold.co',
]);

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './images/icons/icon-192.png',
  './images/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== IMG_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMG_CACHE_MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - IMG_CACHE_MAX_ENTRIES).map((key) => cache.delete(key)));
}

async function imageCacheFirst(request) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(request.url);
  if (cached) return cached;

  const response = await fetch(request);
  // Only cache readable (CORS) responses. An opaque response served later to a
  // CORS request (the ambient color sampler) would be rejected by the browser.
  if (response.ok && response.type !== 'opaque') {
    cache.put(request.url, response.clone())
      .then(() => trimImageCache(cache))
      .catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (IMG_HOSTS.has(url.hostname)) {
    event.respondWith(imageCacheFirst(event.request));
    return;
  }

  if (url.origin !== self.location.origin) return; // let cross-origin (Spotify API, SDK, lyrics) hit the network directly

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
