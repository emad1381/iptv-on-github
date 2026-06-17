/**
 * sw.js — Service Worker for offline support
 * Caches the app shell and serves it when offline.
 */

const CACHE_NAME = 'neonstream-v3';
const SHELL_URLS = [
  './',
  './index.html',
  './css/themes.css',
  './css/main.css',
  './css/player.css',
  './css/modal.css',
  './css/mobile.css',
  './js/app.js',
  './js/storage.js',
  './js/ui.js',
  './js/player.js',
  './js/channels.js',
  './js/categories.js',
  './js/search.js',
  './js/import-export.js',
  './js/settings.js',
  './js/shortcuts.js',
  './js/diagnostics.js',
  './assets/favicon.svg',
  './assets/logo.svg',
  './manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for CDN/API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Same-origin: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          // Cache new same-origin responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Cross-origin (CDN scripts, IPTV-org API): network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
