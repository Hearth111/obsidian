const CACHE_NAME = 'obsidian-cache-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/1_logic.js',
  '/js/2_data.js',
  '/js/3_canvas.js',
  '/js/4_app.js',
  '/js/5_ui_layout.js',
  '/js/6_ui_editor.js',
  '/js/7_ui_nav.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => cached))
  );
})
