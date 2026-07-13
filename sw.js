// Service worker for The Garage — offline caching + web push notifications.

const CACHE = 'garage-v3';
const IMG_CACHE = 'garage-img-v1';
const CORE = [
  'index.html', 'style.css', 'app.js', 'auth.js', 'bg.js', 'push.js',
  'icon.svg', 'manifest.json', 'car.html', 'add.html', 'profile.html',
  'callouts.html', 'leaderboard.html', 'compare.html', 'activity.html',
  'wrapped.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase Storage photos: cache-first (they never change once uploaded)
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Other cross-origin (Supabase API, fonts CDN…): leave alone
  if (url.origin !== location.origin) return;

  // Same-origin: network-first with cache fallback, so deploys land instantly
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const isPage = url.pathname.endsWith('.html') || !url.pathname.includes('.');
      const hit = await cache.match(req, { ignoreSearch: isPage });
      if (hit) return hit;
      if (isPage) {
        const home = await cache.match('index.html');
        if (home) return home;
      }
      throw err;
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'The Garage';
  const options = {
    body: data.body || '',
    icon: 'icon.svg',
    badge: 'icon.svg',
    data: { url: data.url || 'callouts.html' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'callouts.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
