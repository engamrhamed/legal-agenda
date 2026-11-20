const CACHE_NAME = 'legal-agenda-cache-v29'; // Complete 100% Offline with local fonts, fontawesome & audio
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/icon.png',
  './assets/designer.jpg',
  './assets/lexenginuity-logo.jpg',
  './assets/sounds/chime.wav',
  './assets/fonts/fonts.css',
  './assets/fonts/cairo-arabic-400-normal.woff2',
  './assets/fonts/cairo-arabic-500-normal.woff2',
  './assets/fonts/cairo-arabic-600-normal.woff2',
  './assets/fonts/cairo-arabic-700-normal.woff2',
  './assets/fonts/cairo-arabic-800-normal.woff2',
  './assets/fonts/cairo-latin-400-normal.woff2',
  './assets/fonts/cairo-latin-500-normal.woff2',
  './assets/fonts/cairo-latin-600-normal.woff2',
  './assets/fonts/cairo-latin-700-normal.woff2',
  './assets/fonts/cairo-latin-800-normal.woff2',
  './assets/fonts/outfit-latin-400-normal.woff2',
  './assets/fonts/outfit-latin-500-normal.woff2',
  './assets/fonts/outfit-latin-600-normal.woff2',
  './assets/fonts/outfit-latin-700-normal.woff2',
  './assets/vendor/fontawesome/css/all.min.css',
  './assets/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './assets/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './assets/vendor/fontawesome/webfonts/fa-brands-400.woff2'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First (Network with Cache Fallback) Strategy
self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith('http')) return;
  
  e.respondWith(
    fetch(e.request).then((response) => {
      // If we got a valid response, update the cache (including CORS assets like fonts)
      if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      // If network fails (offline), load from cache
      return caches.match(e.request);
    })
  );
});

// Listen for custom background notification events from app.js
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, data } = event.data.payload;
    self.registration.showNotification(title, {
      body,
      icon: 'assets/icon.png',
      badge: 'assets/icon.png',
      vibrate: [200, 100, 200, 100, 200],
      data: data,
      dir: 'rtl'
    });
  }
});

// Handle Notification Clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const caseId = event.notification.data ? event.notification.data.caseId : null;
  const targetUrl = new URL('./index.html', self.location.origin).href;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find open window and focus it
      for (const client of clientList) {
        if (client.url.startsWith(targetUrl) && 'focus' in client) {
          if (caseId) {
            client.postMessage({
              type: 'NAVIGATE_TO_CASE',
              caseId: caseId
            });
          }
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        const urlToOpen = caseId ? `./index.html?caseId=${caseId}` : './index.html';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
