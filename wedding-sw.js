// Service Worker for Ishita & Dixit Wedding Countdown PWA
// Scoped to /src/ — only controls the wedding countdown page, not the main site
const CACHE_NAME = 'wedding-countdown-v1';

// Wedding page assets to cache for offline use
const ASSETS_TO_CACHE = [
  '/src/wedding-coutdown.html',
  '/images/id_photos/IMG_4760_1.jpg',
  '/images/id_photos/IMG_1731.jpg',
  '/images/id_photos/IMG_1666~2.JPG',
  '/wedding-pwa/manifest.json',
  '/wedding-pwa/icons/icon-192x192.png',
  '/wedding-pwa/icons/icon-512x512.png',
];

// External CDN assets to cache
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Montserrat:wght@200;300;400;500&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js',
  'https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js',
];

// Install event — pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Wedding SW] Pre-caching core assets');
      // Cache local assets first
      const localCaching = cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[Wedding SW] Some local assets failed to cache:', err);
      });
      // Attempt to cache CDN assets (non-blocking)
      const cdnCaching = Promise.allSettled(
        CDN_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(() => {
              console.warn('[Wedding SW] Could not cache CDN asset:', url);
            })
        )
      );
      return Promise.all([localCaching, cdnCaching]);
    })
  );
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[Wedding SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// Helper: check if this request is wedding-related
function isWeddingRelated(url) {
  const path = url.pathname;
  return (
    path.includes('wedding') ||
    path.startsWith('/src/') ||
    path.startsWith('/images/id_photos/') ||
    path.startsWith('/wedding-pwa/')
  );
}

// Fetch event — only intercept wedding-related requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls (RSVP, Groq, Google APIs, IP lookups)
  if (
    url.hostname === 'api.groq.com' ||
    url.hostname === 'www.googleapis.com' ||
    url.hostname === 'api.ipify.org' ||
    url.hostname === 'ipapi.co' ||
    url.pathname.includes('cdn-cgi/trace')
  ) {
    return;
  }

  // For same-origin requests, only handle wedding-related ones
  if (url.origin === self.location.origin && !isWeddingRelated(url)) {
    return; // Let the main site's requests pass through untouched
  }

  // For the wedding HTML page — network first, fallback to cache
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For everything else — cache first, fallback to network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then((response) => {
          // Cache successful responses for future use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Return an offline fallback for images
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#1a1a1a" width="200" height="200"/><text fill="#D4AF37" font-family="serif" font-size="14" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
    })
  );
});
