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
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Redis ' + res.status + ': ' + t);
  }
  const data = await res.json();
  return data.result;
}

// Runs multiple commands in a single round-trip via Upstash's /pipeline endpoint.
// `commands` is an array of [method, ...args] tuples; returns an array of results
// in the same order (null for any command that errored).
export async function redisPipeline(commands) {
  if (!commands.length) return [];
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');
  const res = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Redis pipeline ' + res.status + ': ' + t);
  }
  const data = await res.json();
  return data.map(entry => (entry && !entry.error ? entry.result : null));
}
