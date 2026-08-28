import assert from 'node:assert/strict';

const baseUrl = String(process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const root = await fetch(`${baseUrl}/`, { redirect: 'follow' });
assert.equal(root.status, 200, 'root page must return 200');
const html = await root.text();
assert.match(html, /Korenchuk Performance System|__NEXT_DATA__/, 'root page must be the coach application');

const health = await fetch(`${baseUrl}/api/system/health`);
assert.equal(health.status, 401, 'health endpoint must reject anonymous access');

if (process.env.SMOKE_TRAINER_KEY) {
  const authenticatedHealth = await fetch(`${baseUrl}/api/system/health`, {
    headers: { authorization: `Bearer ${process.env.SMOKE_TRAINER_KEY}` },
  });
  assert.equal(authenticatedHealth.status, 200, 'authenticated health endpoint must return 200');
  const payload = await authenticatedHealth.json();
  assert.equal(payload.status, 'ok', 'production dependencies must be healthy');
  assert.equal(payload.checks?.redisPing, true, 'Redis ping must pass');
  assert.equal(payload.checks?.redisReadWrite, true, 'Redis read/write probe must pass');
}

const player = await fetch(`${baseUrl}/api/player/log?token=invalid&date=2026-08-28`);
assert.equal(player.status, 404, 'player API must reject an invalid token');
assert.match(player.headers.get('cache-control') || '', /no-store/, 'player API must never be cached');

if (process.env.SMOKE_PLAYER_TOKEN) {
  const playerPage = await fetch(`${baseUrl}/player/${encodeURIComponent(process.env.SMOKE_PLAYER_TOKEN)}`);
  assert.equal(playerPage.status, 200, 'known player application must return 200');
  assert.match(await playerPage.text(), /__NEXT_DATA__/, 'known player route must render the application');
}

console.log(`Smoke checks passed: ${baseUrl}`);
