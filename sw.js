/* ── Surf Patrol Log – sw.js ──
   Keeps the app's own files on the device so it opens in a dead spot.
   Network-first: when there's signal you always get the latest version;
   the cached copy is only used when the network fails. Weather data is
   not cached here (weather.js keeps its own last-good copy).
*/
const CACHE = 'sr30-shell-v7';
const SHELL = [
  './', 'index.html', 'style.css', 'config.js', 'places.js', 'vocab.js', 'geo.js', 'tide-constants.js', 'tide.js',
  'coast.js', 'geofence.js', 'route.js', 'setup.js', 'script.js', 'weather.js', 'tools.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('index.html')))
  );
});

// Tapping a boundary notification brings the app to the front
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(list =>
      list.length ? list[0].focus() : self.clients.openWindow('./'))
  );
});
