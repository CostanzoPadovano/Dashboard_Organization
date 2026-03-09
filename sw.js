// ============================================================
// BioTracker — Service Worker
// Cache-First strategy per funzionamento offline
// ============================================================

const CACHE_NAME = 'biotracker-v4';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/firebase-init.js',
    './js/storage.js',
    './js/board.js',
    './js/card.js',
    './js/archive.js',
    './js/search.js',
    './js/app.js',
    './manifest.json'
];

// Install: pre-cache all assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: Cache First, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // IMPORTANT: Bypass Service Worker for Firebase/Firestore API requests
    // altrimenti la cache rompe la sincronizzazione real-time e dà errore silenzioso
    if (event.request.url.includes('firebase') ||
        event.request.url.includes('firestore') ||
        event.request.url.includes('googleapis')) {
        return;
    }

    // Skip Google Fonts (they have their own caching)
    if (event.request.url.includes('fonts.googleapis.com') ||
        event.request.url.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                }).catch(() => cached);
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        }).catch(() => {
            // Offline fallback for HTML pages
            if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match('./index.html');
            }
        })
    );
});
