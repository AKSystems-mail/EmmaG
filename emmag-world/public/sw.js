const C = 'emmaworld-v212';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// network first: a deploy is visible on the next launch, cache is only the offline fallback
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith(location.origin)) return;
  e.respondWith(fetch(r).then((res) => {
    // only good responses go in the cache; a 404 must not become the offline copy
    if (res.ok) { const copy = res.clone(); caches.open(C).then((c) => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then((hit) => hit
    // index.html only stands in for a page load -- handing HTML to a .glb or a module
    // request is a MIME error dressed up as a cache hit
    || (r.mode === 'navigate' ? caches.match('/index.html') : Response.error()))));
});
