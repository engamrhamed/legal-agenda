const CACHE_NAME = 'legal-agenda-cache-v3'; // Bumped cache version to force refresh
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/icon.png'
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
// This ensures updates are loaded immediately when online, and falls back to cache when offline
self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith('http')) return;
  
  e.respondWith(
    fetch(e.request).then((response) => {
      // If we got a valid response, update the cache
      if (response && response.status === 200 && response.type === 'basic') {
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
