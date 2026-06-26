const CACHE_NAME = 'rk-cache-v3926-youtube-scraper';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;
  const noStore = url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.includes('/icons/');
  if (noStore) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
