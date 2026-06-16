// lib/redis.js
// Upstash Redis via REST API — same instance as zarechie dashboard.
// Requires KV_REST_API_URL and KV_REST_API_TOKEN (set in Vercel, copied from zarechie project).

export async function redis(method, ...args) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');
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
