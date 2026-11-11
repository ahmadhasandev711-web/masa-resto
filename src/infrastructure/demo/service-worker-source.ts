import { serviceWorkerCacheName } from './demo-policy';

/**
 * Service worker source. The cache name is generated from the package version
 * so a new release drops the previous precache without embedding a customer brand.
 */
export function renderServiceWorker(version: string): string {
  const cacheName = serviceWorkerCacheName(version);
  return `// Restaurant platform service worker. Cache: ${cacheName}
const CACHE_NAME = '${cacheName}';
const PRECACHE_URLS = [
  '/',
  '/admin',
  '/pos',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Soft fail if any url is behind auth on initial precache
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests; never interfere with POST Server Actions or API routes
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Skip API routes, HMR, Turbopack, and Next.js internal data
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('_next/data') ||
    url.pathname.includes('_next/webpack-hmr') ||
    url.pathname.includes('turbopack')
  ) {
    return;
  }

  // Network-first strategy with guaranteed valid Response fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful static asset responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response('Network connection offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
`;
}
