const CACHE = 'nk-coach-v2';
const STATIC_PATHS = new Set(['/nk-logo.jpg', '/favicon.svg']);

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || STATIC_PATHS.has(url.pathname);
}

function canCache(request, response) {
  return response.ok && request.method === 'GET' && !request.headers.has('range');
}

async function saveToCache(request, response) {
  if (!canCache(request, response)) return;

  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch (_) {
    // A failed cache write (quota, private mode, aborted request) must never
    // turn a successful network response into a failed page load.
  }
}

async function cachedResponse(request) {
  try {
    return (await caches.match(request)) || null;
  } catch (_) {
    return null;
  }
}

function offlineResponse(request, url) {
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'Нет соединения с сервером. Повторите попытку после восстановления сети.',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.mode === 'navigate') {
    return new Response(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07101a">
  <title>Нет соединения · NK Coach</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07101a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;text-align:center}.card{max-width:420px}.icon{font-size:48px;margin-bottom:18px}h1{font-size:22px;margin:0 0 10px}p{color:#94a3b8;font-size:15px;line-height:1.5;margin:0 0 24px}button{border:1px solid rgba(74,222,128,.35);border-radius:14px;background:rgba(74,222,128,.14);color:#4ade80;font-size:15px;font-weight:700;padding:12px 20px}
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">📡</div>
    <h1>Нет соединения с сервером</h1>
    <p>Проверь интернет и попробуй открыть тренировку ещё раз.</p>
    <button type="button" onclick="location.reload()">Повторить</button>
  </main>
</body>
</html>`, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  // respondWith() must always receive a Response. Response.error() preserves
  // the normal failed-resource semantics without triggering Safari's
  // "Returned response is null" service-worker error.
  return Response.error();
}

async function cacheFirst(request, url) {
  const cached = await cachedResponse(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    await saveToCache(request, response);
    return response;
  } catch (_) {
    return offlineResponse(request, url);
  }
}

async function networkFirst(request, url) {
  try {
    const response = await fetch(request);
    await saveToCache(request, response);
    return response;
  } catch (_) {
    const cached = await cachedResponse(request);
    return cached || offlineResponse(request, url);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    isStaticAsset(url) ? cacheFirst(request, url) : networkFirst(request, url)
  );
});
