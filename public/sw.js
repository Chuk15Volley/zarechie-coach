const CACHE = 'nk-team-system-v6';
const STATIC_PATHS = new Set([
  '/nk-logo.jpg',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/nk-team-192.png',
  '/icons/nk-team-512.png',
  '/icons/nk-team-maskable-512.png',
]);

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('nk-team-system-') && key !== CACHE).map(key => caches.delete(key))))
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
    const headers = new Headers(response.headers);
    headers.set('X-Player-Cached-At', new Date().toISOString());
    await cache.put(request, new Response(await response.clone().arrayBuffer(), { status: response.status, statusText: response.statusText, headers }));
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
  <meta name="theme-color" content="#050b12">
  <title>Нет соединения · NK TEAM SYSTEM</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 0,rgba(52,211,153,.16),transparent 38%),linear-gradient(160deg,#050b12,#071820);color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;text-align:center}.card{width:min(100%,420px);border:1px solid rgba(110,231,183,.16);border-radius:28px;padding:34px 24px;background:rgba(12,29,34,.72);box-shadow:0 30px 80px rgba(0,0,0,.45)}.logo{width:58px;height:58px;border:1px solid rgba(110,231,183,.3);border-radius:18px;object-fit:cover;box-shadow:0 12px 32px rgba(0,0,0,.38);margin-bottom:20px}h1{font-size:24px;letter-spacing:-.03em;margin:0 0 10px}p{color:#94a3b8;font-size:15px;line-height:1.55;margin:0 0 24px}button{border:1px solid rgba(74,222,128,.38);border-radius:16px;background:linear-gradient(145deg,#6aefad,#39d58c);color:#06120d;font-size:15px;font-weight:800;padding:13px 22px;box-shadow:0 12px 28px rgba(52,211,153,.18)}
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/nk-logo.jpg" alt="NK">
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

  // Live commands and API data must never be replayed from an old cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => offlineResponse(request, url)));
    return;
  }
  event.respondWith(isStaticAsset(url) ? cacheFirst(request, url) : networkFirst(request, url));
});


function pageMatches(html, expected) {
  try {
    const script = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const props = JSON.parse(script[1]).props.pageProps;
    return props.token === expected.token && props.sessionDate === expected.date && JSON.stringify(props.session) === expected.session;
  } catch (_) { return false; }
}

self.addEventListener('message', event => {
  const data = event.data || {};
  if (!['CHECK_PLAYER_CACHE', 'PREPARE_PLAYER_CACHE'].includes(data.type)) return;
  event.waitUntil((async () => {
    const reply = result => event.ports?.[0]?.postMessage(result);
    try {
      const url = new URL(data.url);
      const source = new URL(event.source.url);
      if (url.origin !== self.location.origin || url.href !== source.href || !url.pathname.startsWith('/player/')) return reply({ ready: false });
      const assets = [...new Set(data.assets || [])].filter(asset => {
        const parsed = new URL(asset); return parsed.origin === url.origin && isStaticAsset(parsed);
      }).slice(0, 100);
      if (!assets.length) return reply({ ready: false });
      if (data.type === 'PREPARE_PLAYER_CACHE') {
        const response = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok || !pageMatches(await response.clone().text(), data.expected)) return reply({ ready: false, changed: true });
        await saveToCache(new Request(url.href), response);
        await Promise.all(assets.map(async asset => {
          if (await cachedResponse(asset)) return;
          const response = await fetch(asset);
          if (response.ok) {
            const cache = await caches.open(CACHE); await cache.put(asset, response);
          }
        }));
      }
      const cached = await cachedResponse(url.href);
      const matching = cached && pageMatches(await cached.clone().text(), data.expected);
      const resourcesReady = (await Promise.all(assets.map(cachedResponse))).every(Boolean);
      reply({ ready: Boolean(matching && resourcesReady), savedAt: matching ? cached.headers.get('X-Player-Cached-At') : null });
    } catch (_) { reply({ ready: false }); }
  })());
});
