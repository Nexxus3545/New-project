// Only the public connection screen is stored. Never cache API responses,
// authenticated pages, records, uploads, credentials, or consultation media.
const CACHE = 'mwos-public-connection-v1'
const FALLBACK = '/offline.html'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(FALLBACK, { cache: 'reload' }))))
  // Let existing tabs finish naturally; do not reload an active consultation.
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('mwos-public-connection-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.mode !== 'navigate' || url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(request).catch(async () => (await caches.match(FALLBACK)) || new Response('Connect to the internet to open MWOS.', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
})
