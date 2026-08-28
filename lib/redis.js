// lib/redis.js
// Upstash Redis via REST API — same instance as zarechie dashboard.
// Requires KV_REST_API_URL and KV_REST_API_TOKEN (set in Vercel, copied from zarechie project).

export async function redis(method, ...args) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');

  // SET: route through /pipeline (POST body) — URL-encoded path fails for large values
  if (method.toLowerCase() === 'set') {
    const results = await redisPipeline([[method.toUpperCase(), ...args]]);
    return results[0];
  }

  const res = await fetch(
    url + '/' + method + '/' + args.map(a => encodeURIComponent(a)).join('/'),
    {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(redisTimeoutMs()),
    }
  );
  if (!res.ok) {
    throw new Error('Redis request failed with status ' + res.status + ': ' + await safeErrorBody(res));
  }
  const data = await res.json();
  return data.result;
}

// Runs multiple commands in a single round-trip via Upstash's /pipeline endpoint.
// `commands` is an array of [method, ...args] tuples; returns an array of results
// in the same order. A command-level Redis error rejects the whole operation so
// callers cannot accidentally report a partially persisted write as successful.
export async function redisPipeline(commands) {
  if (!commands.length) return [];
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');
  const res = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(redisTimeoutMs()),
  });
  if (!res.ok) {
    throw new Error('Redis pipeline failed with status ' + res.status + ': ' + await safeErrorBody(res));
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length !== commands.length) {
    throw new Error('Redis pipeline returned an invalid response');
  }
  const failed = data.findIndex(entry => !entry || entry.error);
  if (failed !== -1) {
    const message = String(data[failed]?.error || 'unknown Redis error').slice(0, 300);
    throw new Error(`Redis pipeline command ${failed} failed: ${message}`);
  }
  return data.map(entry => entry.result);
}

function redisTimeoutMs() {
  const configured = Number(process.env.REDIS_TIMEOUT_MS || 5000);
  if (!Number.isFinite(configured)) return 5000;
  return Math.min(15000, Math.max(1000, Math.floor(configured)));
}

async function safeErrorBody(response) {
  try {
    return (await response.text()).replace(/[\r\n]+/g, ' ').slice(0, 500);
  } catch (_) {
    return 'unreadable response';
  }
}
