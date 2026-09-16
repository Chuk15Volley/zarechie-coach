import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal hook runtime: exercise the real hooks with controlled storage/network,
// including renders that occur while an earlier request is still in flight.
function harness(file, exportName) {
  const values = [], effects = [], cleanups = [];
  let cursor = 0, dirty = false, output, props;
  const hooks = {
    useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { const next = typeof value === 'function' ? value(values[i]) : value; if (!Object.is(next, values[i])) { values[i] = next; dirty = true; } }]; },
    useEffect(fn, deps) { const i = cursor++; if (!values[i] || deps.some((v, j) => !Object.is(v, values[i][j]))) { values[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/import[^;]+;/g, '').replace('export function', 'function');
  const hook = new Function(...Object.keys(hooks), `${source}; return ${exportName};`)(...Object.values(hooks));
  return {
    render(next = props) { props = next; let guard = 0; do { dirty = false; cursor = 0; output = hook(props); while (effects.length) effects.shift()(); assert.ok(++guard < 30, 'render must settle'); } while (dirty); return output; },
    stop() { cleanups.forEach(fn => fn?.()); },
  };
}

function environment(t) {
  const cleanups = []; t.after(() => cleanups.forEach(fn => fn()));
  const storage = new Map(), events = new Map(), timers = new Map(); let serial = 0;
  t.mock.method(globalThis, 'setTimeout', fn => { timers.set(++serial, fn); return serial; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  t.mock.method(globalThis, 'setInterval', fn => { timers.set(++serial, fn); return serial; });
  t.mock.method(globalThis, 'clearInterval', id => timers.delete(id));
  for (const [name, value] of Object.entries({
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    window: { addEventListener: (n, fn) => events.set(n, fn), removeEventListener: n => events.delete(n) },
  })) { const prior = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { configurable: true, value }); t.after(() => prior ? Object.defineProperty(globalThis, name, prior) : delete globalThis[name]); }
  const previous = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true, writable: true });
  t.after(() => previous ? Object.defineProperty(navigator, 'onLine', previous) : delete navigator.onLine);
  return { storage, events, cleanups, tick: async () => { for (const fn of [...timers.values()]) await fn(); await new Promise(resolve => setImmediate(resolve)); } };
}
const response = { ok: true, json: async () => ({ revision: 2, savedAt: '2026-09-17T10:00:00Z' }) };

test('slow progress acknowledgement cannot drop a newer queued edit', async t => {
  const env = environment(t); let release; const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { requests.push(JSON.parse(options.body)); if (requests.length === 1) await new Promise(resolve => { release = resolve; }); return response; });
  const h = harness('../lib/usePlayerProgressSync.js', 'usePlayerProgressSync'); env.cleanups.push(() => h.stop());
  const args = { token: 'fake', sessionDate: '2026-09-17', ready: true, revision: 1, snapshot: { done: { a: true } }, onSaved() {}, onStatus() {} };
  h.render(args);
  const first = env.tick(); await new Promise(resolve => setImmediate(resolve));
  h.render({ ...args, revision: 2, snapshot: { done: { a: true, b: true } } });
  release(); await first; await env.tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].done.b, true);
  assert.equal(env.storage.has('gym:pending:fake:2026-09-17'), false);
});

test('persisted progress retries on mount without waiting for a new online event', async t => {
  const env = environment(t); const requests = [];
  env.storage.set('gym:pending:fake:2026-09-17', JSON.stringify({ requestId: 'persisted', done: { a: true } }));
  t.mock.method(globalThis, 'fetch', async (_url, options) => { requests.push(JSON.parse(options.body)); return response; });
  const h = harness('../lib/usePlayerProgressSync.js', 'usePlayerProgressSync'); env.cleanups.push(() => h.stop());
  h.render({ token: 'fake', sessionDate: '2026-09-17', ready: true, revision: 0, snapshot: {}, onSaved() {}, onStatus() {} });
  await env.tick(); assert.equal(requests[0].requestId, 'persisted');
});

test('feedback survives failure and retries to confirmed delivery', async t => {
  const env = environment(t); let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => (++attempts === 1 ? { ok: false, status: 503 } : response));
  const h = harness('../lib/usePlayerFeedback.js', 'usePlayerFeedback'); env.cleanups.push(() => h.stop());
  const args = { token: 'fake', date: '2026-09-17', draft: { rpe: 7 }, restore() {}, payload: { done: { a: true }, weights: { a: 10 }, rpe: 7 }, onSubmitted() {} };
  h.render(args).submit(); await new Promise(resolve => setImmediate(resolve));
  let result = h.render(); assert.equal(result.queued, true); assert.equal(result.submitted, false);
  assert.equal(JSON.parse(env.storage.get('gym:feedback:fake:2026-09-17')).pending.rpe, 7);
  await env.tick(); result = h.render(); assert.equal(result.submitted, true); assert.equal(result.queued, false);
  h.render({ ...args, payload: { ...args.payload, weights: { a: 12 } } });
  assert.equal(h.render().submitted, false, 'changed actuals require updated feedback');
});

test('offline feedback draft restores and sends only after connectivity returns', async t => {
  const env = environment(t); navigator.onLine = false; let sent = 0, restored;
  const payload = { done: { a: true }, weights: {}, rpe: 6 };
  env.storage.set('gym:feedback:fake:2026-09-17', JSON.stringify({ draft: { rpe: 6 }, pending: payload }));
  t.mock.method(globalThis, 'fetch', async () => { sent++; return response; });
  const h = harness('../lib/usePlayerFeedback.js', 'usePlayerFeedback'); env.cleanups.push(() => h.stop());
  h.render({ token: 'fake', date: '2026-09-17', draft: {}, restore: value => { restored = value; }, payload });
  assert.equal(restored.rpe, 6); assert.equal(sent, 0);
  navigator.onLine = true; env.events.get('online')(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.render().submitted, true); assert.equal(sent, 1);
});
