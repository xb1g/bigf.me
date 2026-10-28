/* Anchor service worker — scope /anchor/.
   - App shell (navigations to /anchor or /anchor/ only): served from cache, refreshed in the background.
     Only a 200 text/html response may replace the cached shell (never an icon, a 404 or a redirect).
   - Static files under /anchor/: cache-first.
   - Built assets /_astro/*: stale-while-revalidate (precached from the shell HTML on install).
   - Google Fonts: stale-while-revalidate.
   - /api/ and non-GET requests: never touched, never cached.
   Bump VERSION to drop old caches. */
const VERSION = 'v2'; // v2: v1 could cache a static file as the shell; dropping it on activate
const SHELL_CACHE = `anchor-shell-${VERSION}`;
const ASSET_CACHE = `anchor-assets-${VERSION}`;
const FONT_CACHE = `anchor-fonts-${VERSION}`;
const KEEP = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

const SHELL_URL = '/anchor/';
const STATIC_URLS = [
  '/anchor/manifest.webmanifest',
  '/anchor/icon.svg',
  '/anchor/icon-192.png',
  '/anchor/icon-512.png',
  '/anchor/icon-maskable-512.png',
  '/anchor/apple-touch-icon.png',
];

/** True for the app shell paths. Any other /anchor/... navigation (e.g. /anchor/icon.svg) is a plain file. */
function isShellPath(pathname) {
  return pathname === '/anchor' || pathname === '/anchor/';
}

/** Only a real, direct 200 HTML page may be stored as the app shell. */
function isShellResponse(res) {
  if (!res || res.status !== 200 || res.redirected || res.type === 'opaqueredirect') return false;
  return (res.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function astroAssetsIn(html) {
  const found = new Set();
  const re = /["'(](\/_astro\/[^"'()\s>]+)/g;
  let m;
  while ((m = re.exec(html))) found.add(m[1]);
  return [...found];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const res = await fetch(SHELL_URL, { cache: 'no-cache' });
    if (isShellResponse(res)) {
      await shell.put(SHELL_URL, res.clone());
      const assets = await caches.open(ASSET_CACHE);
      const html = await res.text();
      await Promise.all(astroAssetsIn(html).map((u) => assets.add(u).catch(() => undefined)));
    }
    await shell.addAll(STATIC_URLS).catch(() => undefined);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('anchor-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function storeResponse(cache, cacheKey, res) {
  if (cacheKey === SHELL_URL && !isShellResponse(res)) return;
  await cache.put(cacheKey, res.clone());
  if (cacheKey === SHELL_URL) {
    // Keep the built assets the fresh shell needs, so the next offline launch works.
    const assets = await caches.open(ASSET_CACHE);
    const html = await res.text();
    await Promise.all(astroAssetsIn(html).map(async (u) => {
      if (!(await assets.match(u))) await assets.add(u).catch(() => undefined);
    }));
  }
}

async function staleWhileRevalidate(event, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey);
  const network = fetch(event.request)
    .then((res) => {
      const storable = cacheKey === SHELL_URL ? isShellResponse(res) : res && (res.ok || res.type === 'opaque');
      if (storable) {
        event.waitUntil(storeResponse(cache, cacheKey, res.clone()).catch(() => undefined));
      }
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  if (res) return res;
  // Offline and never cached: fonts fall back to system fonts quietly.
  if (new URL(event.request.url).hostname === 'fonts.googleapis.com') {
    return new Response('', { headers: { 'Content-Type': 'text/css' } });
  }
  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept the API.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' && isShellPath(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, SHELL_CACHE, SHELL_URL));
      return;
    }
    if (url.pathname.startsWith('/_astro/')) {
      event.respondWith(staleWhileRevalidate(event, ASSET_CACHE, req));
      return;
    }
    if (url.pathname.startsWith('/anchor/') && url.pathname !== '/anchor/sw.js') {
      event.respondWith(cacheFirst(req, SHELL_CACHE));
    }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE, req));
  }
});
