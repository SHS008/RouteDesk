/*
 * RouteDesk service worker
 *
 * Update model: network-first for the app shell (HTML/JS/CSS), cache-first for
 * icons. The previous version was cache-first for everything and only re-read
 * files when CACHE_NAME changed, so a redeploy never reached anyone who had
 * already visited the app. Bump CACHE_VERSION on every release anyway — it
 * makes the activate step clear stale precache entries deterministically.
 */
const CACHE_VERSION = 'v10';
const CACHE_NAME = `routedesk-free-${CACHE_VERSION}`;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
// How long to wait for the network before falling back to cache on a slow link.
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('routedesk-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
  return response;
}

// Serve fresh when possible, fall back to cache when offline or slow.
function networkFirst(request, fallbackUrl) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, NETWORK_TIMEOUT);
    fetch(request).then(response => {
      clearTimeout(timer);
      cachePut(request, response);
      if (!settled) { settled = true; resolve(response); }
    }).catch(() => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve(null); }
    });
  }).then(response => {
    if (response) return response;
    return caches.match(request).then(hit => {
      if (hit) return hit;
      if (fallbackUrl) {
        return caches.match(fallbackUrl).then(fallback => fallback || Response.error());
      }
      return Response.error();
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(hit => {
    if (hit) return hit;
    return fetch(request).then(response => {
      cachePut(request, response);
      return response;
    }).catch(() => Response.error());
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: always try the network so a new deploy shows up on reload.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // App shell code: same, so updated JS/CSS is picked up rather than pinned.
  if (/\.(?:html|js|css|webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Icons and other static art rarely change: cache-first keeps startup fast.
  event.respondWith(cacheFirst(request));
});
