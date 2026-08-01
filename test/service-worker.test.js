const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const workerSource = readFileSync(require.resolve('../public/sw.js'), 'utf8');

function createRequest(path, overrides = {}) {
  return {
    method: 'GET',
    url: `https://zarechie-sc.vercel.app${path}`,
    mode: 'same-origin',
    headers: new Headers(),
    ...overrides,
  };
}

function loadWorker({ networkResponse, cachedResponse, cachePut } = {}) {
  const listeners = {};
  const puts = [];
  const caches = {
    keys: async () => [],
    delete: async () => true,
    match: async () => cachedResponse,
    open: async () => ({
      put: async (request, response) => {
        puts.push({ request, response });
        if (cachePut) return cachePut(request, response);
      },
    }),
  };
  const self = {
    location: { origin: 'https://zarechie-sc.vercel.app' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  runInNewContext(workerSource, {
    self,
    caches,
    fetch: async request => {
      if (networkResponse instanceof Error) throw networkResponse;
      if (typeof networkResponse === 'function') return networkResponse(request);
      return networkResponse;
    },
    Headers,
    JSON,
    Promise,
    Response,
    Set,
    URL,
  });

  async function dispatchFetch(request) {
    let responsePromise;
    const backgroundTasks = [];
    listeners.fetch({
      request,
      respondWith(value) { responsePromise = Promise.resolve(value); },
      waitUntil(value) { backgroundTasks.push(Promise.resolve(value)); },
    });
    const response = responsePromise ? await responsePromise : undefined;
    await Promise.all(backgroundTasks);
    return response;
  }

  return { dispatchFetch, puts };
}

test('returns a real offline page when navigation has no network or cache', async () => {
  const worker = loadWorker({ networkResponse: new Error('offline') });
  const response = await worker.dispatchFetch(createRequest('/player/test', { mode: 'navigate' }));

  assert.ok(response instanceof Response);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Нет соединения с сервером/);
});

test('returns cached player page when the network is unavailable', async () => {
  const cached = new Response('<h1>Тренировка</h1>', { status: 200 });
  const worker = loadWorker({ networkResponse: new Error('offline'), cachedResponse: cached });
  const response = await worker.dispatchFetch(createRequest('/player/test', { mode: 'navigate' }));

  assert.equal(await response.text(), '<h1>Тренировка</h1>');
});

test('returns JSON 503 for an uncached API request while offline', async () => {
  const worker = loadWorker({ networkResponse: new Error('offline') });
  const response = await worker.dispatchFetch(createRequest('/api/player/session-detail'));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'offline',
    message: 'Нет соединения с сервером. Повторите попытку после восстановления сети.',
  });
});

test('cache-write failures never replace a successful network response', async () => {
  const network = new Response('fresh', { status: 200 });
  const worker = loadWorker({
    networkResponse: network,
    cachePut: async () => { throw new Error('quota exceeded'); },
  });
  const response = await worker.dispatchFetch(createRequest('/player/test', { mode: 'navigate' }));

  assert.equal(await response.text(), 'fresh');
  assert.equal(worker.puts.length, 1);
});

test('does not intercept non-GET, range, or cross-origin requests', async () => {
  const worker = loadWorker({ networkResponse: new Error('should not fetch') });

  assert.equal(await worker.dispatchFetch(createRequest('/api/player/log', { method: 'POST' })), undefined);
  assert.equal(await worker.dispatchFetch(createRequest('/video.mp4', { headers: new Headers({ range: 'bytes=0-99' }) })), undefined);
  assert.equal(await worker.dispatchFetch({ ...createRequest('/image.jpg'), url: 'https://images.example.com/image.jpg' }), undefined);
});
