import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getCachedTeamReadiness,
  TEAM_READINESS_CACHE_FRESH_MS,
  TEAM_READINESS_CACHE_STALE_MS,
} from '../lib/teamReadinessCache.js';
import {
  READINESS_LATENCY_MIN_HEALTH_SAMPLES,
  readinessLatencyKey,
  summarizeReadinessLatency,
} from '../lib/readinessTelemetry.js';

const now = Date.parse('2026-08-28T12:00:00.000Z');
const payload = { players: [{ id: '42', status: 'green' }] };

function record(ageMs, overrides = {}) {
  return JSON.stringify({
    workspace: 'zarechie',
    date: '2026-08-28',
    release: 'release-a',
    cachedAt: new Date(now - ageMs).toISOString(),
    payload,
    ...overrides,
  });
}

test('fresh readiness cache avoids expensive player aggregation', async () => {
  let computeCalls = 0;
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => {
    computeCalls += 1;
    return { players: [] };
  }, {
    now,
    release: 'release-a',
    redisGet: async () => record(TEAM_READINESS_CACHE_FRESH_MS - 1),
    redisSet: async () => null,
  });
  assert.equal(result.cache, 'hit');
  assert.equal(computeCalls, 0);
  assert.deepEqual(result.payload, payload);
});

test('readiness cache miss stores a release-isolated record for five minutes', async () => {
  let stored;
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => payload, {
    now,
    release: 'release-a',
    redisGet: async () => null,
    redisSet: async (...args) => { stored = args; },
  });
  assert.equal(result.cache, 'miss');
  assert.equal(stored[2], 300);
  assert.match(stored[0], /team-readiness:v1:release-a:2026-08-28$/);
  assert.deepEqual(JSON.parse(stored[1]).payload, payload);
});

test('stale readiness keeps the dashboard available during an upstream outage', async () => {
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => {
    throw new Error('ReadySix unavailable');
  }, {
    now,
    release: 'release-a',
    redisGet: async () => record(TEAM_READINESS_CACHE_FRESH_MS + 1),
    redisSet: async () => null,
  });
  assert.equal(result.cache, 'stale');
  assert.deepEqual(result.payload, payload);
});

test('soft-expired readiness returns immediately and refreshes through the request lifecycle', async () => {
  let finishRefresh;
  let scheduled;
  let stored;
  const compute = async () => {
    await new Promise(resolve => { finishRefresh = resolve; });
    return { players: [{ id: 'fresh' }] };
  };
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', compute, {
    now,
    release: 'release-swr',
    redisGet: async () => record(TEAM_READINESS_CACHE_FRESH_MS + 1, { release: 'release-swr' }),
    redisSet: async (...args) => { stored = args; },
    schedule: promise => { scheduled = promise; },
  });
  assert.equal(result.cache, 'stale-while-revalidate');
  assert.equal(result.revalidating, true);
  assert.deepEqual(result.payload, payload);
  finishRefresh();
  await scheduled;
  assert.deepEqual(JSON.parse(stored[1]).payload, { players: [{ id: 'fresh' }] });
});

test('background refresh failure marks stale data and stays within the hard age boundary', async () => {
  let scheduled;
  let stored;
  let reported;
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => {
    throw new Error('ReadySix unavailable');
  }, {
    now,
    release: 'release-error',
    redisGet: async () => record(TEAM_READINESS_CACHE_FRESH_MS + 1, { release: 'release-error' }),
    redisSet: async (...args) => { stored = args; },
    schedule: promise => { scheduled = promise; },
    onBackgroundError: async error => { reported = error.message; },
  });
  assert.equal(result.cache, 'stale-while-revalidate');
  await scheduled;
  const failed = JSON.parse(stored[1]);
  assert.match(failed.refreshErrorAt, /^2026|^20/);
  assert.ok(stored[2] < Math.ceil(TEAM_READINESS_CACHE_STALE_MS / 1000));
  assert.equal(reported, 'ReadySix unavailable');
});

test('expired readiness never masks a prolonged outage', async () => {
  await assert.rejects(() => getCachedTeamReadiness('zarechie', '2026-08-28', async () => {
    throw new Error('ReadySix unavailable');
  }, {
    now,
    release: 'release-a',
    redisGet: async () => record(TEAM_READINESS_CACHE_STALE_MS + 1),
    redisSet: async () => null,
  }), /ReadySix unavailable/);
});

test('a cache record from another deployment is never reused', async () => {
  let computeCalls = 0;
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => {
    computeCalls += 1;
    return payload;
  }, {
    now,
    release: 'release-b',
    redisGet: async () => record(1),
    redisSet: async () => null,
  });
  assert.equal(result.cache, 'miss');
  assert.equal(computeCalls, 1);
});

test('concurrent readiness misses coalesce into one aggregation', async () => {
  let computeCalls = 0;
  let releaseCompute;
  const compute = async () => {
    computeCalls += 1;
    await new Promise(resolve => { releaseCompute = resolve; });
    return payload;
  };
  const options = {
    now,
    release: 'release-concurrent',
    redisGet: async () => null,
    redisSet: async () => null,
  };
  const first = getCachedTeamReadiness('zarechie', '2026-08-28', compute, options);
  const second = getCachedTeamReadiness('zarechie', '2026-08-28', compute, options);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(computeCalls, 1);
  releaseCompute();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(item => item.payload), [payload, payload]);
});

test('readiness latency summary reports nearest-rank p95 and waits for a useful sample', () => {
  const rows = Array.from({ length: READINESS_LATENCY_MIN_HEALTH_SAMPLES }, (_, index) => JSON.stringify({
    at: new Date(now - index * 1000).toISOString(),
    durationMs: (index + 1) * 50,
    cache: index < READINESS_LATENCY_MIN_HEALTH_SAMPLES * 0.8 ? 'hit' : 'miss',
  }));
  const summary = summarizeReadinessLatency(rows, { now });
  assert.equal(summary.sampleCount, READINESS_LATENCY_MIN_HEALTH_SAMPLES);
  assert.equal(summary.p50Ms, 500);
  assert.equal(summary.p95Ms, 950);
  assert.equal(summary.cacheHitRate, 80);
  assert.equal(summary.healthy, true);

  const degraded = summarizeReadinessLatency(rows.map(row => JSON.stringify({ ...JSON.parse(row), durationMs: 1800 })), { now });
  assert.equal(degraded.healthy, false);
});

test('readiness telemetry cannot mix Preview, local and Production samples', () => {
  const production = readinessLatencyKey('zarechie', { environment: 'production', release: 'ignored' });
  const previewA = readinessLatencyKey('zarechie', { environment: 'preview', release: 'release-a' });
  const previewB = readinessLatencyKey('zarechie', { environment: 'preview', release: 'release-b' });
  const local = readinessLatencyKey('zarechie', { environment: 'development', release: 'local' });
  assert.match(production, /:production$/);
  assert.notEqual(previewA, previewB);
  assert.notEqual(previewA, production);
  assert.notEqual(local, production);
});

test('readiness API validates date, normalizes workspace and exposes cache state', () => {
  const source = readFileSync(new URL('../pages/api/team/readiness.js', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(source, /getCachedTeamReadiness/);
  assert.match(source, /isCalendarDate/);
  assert.match(source, /workspace === 'nkperf'/);
  assert.match(source, /X-Readiness-Cache/);
  assert.match(source, /forceRefresh/);
  assert.match(source, /waitUntil/);
  assert.match(source, /recordReadinessLatency/);
  assert.match(source, /Server-Timing/);
  assert.match(dashboard, /workspace=\$\{workspace\}&refresh=1/);
  assert.match(dashboard, /readinessData\?\.cache === 'stale'/);
  assert.match(dashboard, /Readiness p95/);
});
