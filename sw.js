// nutriCNT service worker.
//
// Strategy: NETWORK-FIRST for everything on this site (app files and foods.json), with the
// cache as the offline fallback. Requests bypass the browser's HTTP cache (GitHub Pages sends
// max-age=600) so a Git push reaches the phone as soon as it is deployed.
//
// Update detection: when the page asks (CHECK_UPDATE), every cached file is re-fetched and compared
// with the cached copy; if any text file changed, the page is told so it can show
// "Update available — reload". No version number has to be bumped by hand.
//
// PRECACHE only matters for the very first offline start; anything else the app requests is
// cached automatically the first time it is fetched. Add new files here when you add them.

const CACHE = 'nutricnt-shell';
const NETWORK_TIMEOUT_MS = 4000; // on a very slow connection, fall back to the cached copy

const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'foods.json',
  'js/main.js',
  'js/util.js',
  'js/nutrients.js',
  'js/foods.js',
  'js/store.js',
  'js/router.js',
  'js/ui.js',
  'js/updates.js',
  'js/views/day.js',
  'js/views/add.js',
  'js/views/history.js',
  'js/views/settings.js',
  'js/views/foodform.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 'reload' skips the HTTP cache so we never precache a stale copy
      await Promise.all(
        PRECACHE.map(async (path) => {
          try {
            const res = await fetch(new Request(path, { cache: 'reload' }));
            if (res.ok) await cache.put(new Request(path), res);
          } catch {
            /* a missing file must not break installation */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event, request).then(alwaysRevalidate));
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GitHub Pages sends "Cache-Control: max-age=600". Browsers then keep scripts and styles "fresh" in
// memory for 10 minutes and stop asking this service worker, so a reload could keep running old code.
// Marking what we hand back as "no-cache" makes the browser ask us on every load; we then revalidate
// with the server (a cheap 304 when nothing changed).
function alwaysRevalidate(response) {
  if (!response.ok || response.type !== 'basic') return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  headers.delete('Expires');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function networkFirst(event, request) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(new Request(request, { cache: 'no-cache' })).then((res) => {
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  fresh.catch(() => {}); // avoid an unhandled rejection if we answer from the cache first
  event.waitUntil(fresh.catch(() => {}));

  try {
    return await Promise.race([fresh, delay(NETWORK_TIMEOUT_MS).then(() => Promise.reject(new Error('slow network')))]);
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (cached) return cached;
    return fresh; // nothing cached: wait for the network (rejects if offline)
  }
}

// ---------- update check ----------

const TEXT_FILE = /\.(html|js|css|json|webmanifest)$|\/$/;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_UPDATE') {
    event.waitUntil(
      (async () => {
        let changed = false;
        try {
          changed = await refreshCache();
        } catch {
          /* offline: nothing to report */
        }
        event.source?.postMessage({ type: 'UPDATE_CHECK_RESULT', changed });
      })(),
    );
  }
});

/** Re-fetches every cached text file; returns true if any differs from the cached copy. */
async function refreshCache() {
  const cache = await caches.open(CACHE);
  const requests = (await cache.keys()).filter((req) => TEXT_FILE.test(new URL(req.url).pathname));
  let changed = false;
  await Promise.all(
    requests.map(async (req) => {
      try {
        const res = await fetch(new Request(req.url, { cache: 'no-cache' }));
        if (!res.ok) return;
        const old = await cache.match(req);
        if (old && (await old.clone().text()) !== (await res.clone().text())) changed = true;
        await cache.put(req, res);
      } catch {
        /* ignore individual failures */
      }
    }),
  );
  return changed;
}
