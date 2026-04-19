const CACHE_NAME = 'lingua-v2';
const PRECACHE = [
  '/lingua.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Install — precache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first for HTML/API, cache-first for assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin auth/API calls
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('supabase')) return;

  // Navigation requests to same origin — always serve the app shell
  if (e.request.mode === 'navigate' && url.hostname === location.hostname) {
    e.respondWith(
      fetch('/lingua.html').then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/lingua.html', clone));
        }
        return resp;
      }).catch(() => caches.match('/lingua.html'))
    );
    return;
  }

  // CDN assets (fonts, scripts) — cache-first
  if (url.hostname !== location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        });
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell — network-first with cache fallback
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
