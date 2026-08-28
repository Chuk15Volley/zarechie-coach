import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getCachedTeamReadiness,
  TEAM_READINESS_CACHE_FRESH_MS,
  TEAM_READINESS_CACHE_SCHEMA,
  TEAM_READINESS_CACHE_STALE_MS,
} from '../lib/teamReadinessCache.js';
import {
  READINESS_LATENCY_HISTOGRAM_BOUNDS_MS,
  READINESS_LATENCY_MIN_HEALTH_SAMPLES,
  READINESS_WARM_TARGET_MS,
  READINESS_COLD_TARGET_MS,
  readinessLatencyKey,
  readinessLatencyRollupKey,
  readinessLatencyRollupKeys,
  recordReadinessLatency,
  summarizeReadinessLatency,
  summarizeReadinessRollups,
  summarizeReadinessTelemetry,
} from '../lib/readinessTelemetry.js';

const now = Date.parse('2026-08-28T12:00:00.000Z');
const payload = { players: [{ id: '42', status: 'green' }] };

function record(ageMs, overrides = {}) {
  return JSON.stringify({
    workspace: 'zarechie',
    date: '2026-08-28',
    schema: TEAM_READINESS_CACHE_SCHEMA,
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

test('readiness cache miss stores a schema-isolated record across releases for ten minutes', async () => {
  let stored;
  const result = await getCachedTeamReadiness('zarechie', '2026-08-28', async () => payload, {
    now,
    release: 'release-a',
    redisGet: async () => null,
    redisSet: async (...args) => { stored = args; },
  });
  assert.equal(result.cache, 'miss');
  assert.equal(stored[2], 600);
  assert.match(stored[0], /team-readiness:v2:2026-08-28$/);
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

test('a compatible cache record is reused across deployments', async () => {
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
  assert.equal(result.cache, 'hit');
  assert.equal(computeCalls, 0);
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

  const degraded = summarizeReadinessLatency(rows.map(row => JSON.stringify({ ...JSON.parse(row), durationMs: 1800, cache: 'hit' })), { now });
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
  assert.match(readinessLatencyRollupKey('zarechie', { environment: 'production', now }), /readiness-rollup:production:2026-08-28$/);
  assert.equal(readinessLatencyRollupKeys('zarechie', { environment: 'production', now }).length, 2);
});

test('readiness recording atomically updates a bounded minute histogram', async () => {
  let commands;
  const sample = await recordReadinessLatency({
    workspace: 'zarechie', durationMs: 1750, cache: 'hit', now,
    environment: 'production', redisPipelineImpl: async value => { commands = value; return value.map(() => 'OK'); },
  });
  const minute = Math.floor(now / 60000);
  assert.equal(sample.durationMs, 1750);
  assert.deepEqual(commands.slice(0, 2).map(command => command[0]), ['LPUSH', 'LTRIM']);
  const rollup = commands.find(command => command[0] === 'EVAL');
  assert.match(rollup[1], /hincrby/);
  assert.equal(rollup[4], String(minute));
  assert.deepEqual(rollup.slice(5), ['1', '1', '1750', '12', String(3 * 24 * 60 * 60), 'w', '1']);
});

test('rolling histogram keeps a true high-volume 24-hour SLO without raw sample growth', () => {
  const minute = Math.floor(now / 60000);
  const healthy = summarizeReadinessRollups([{
    [`${minute}:n`]: '10000',
    [`${minute}:c`]: '9500',
    [`${minute}:o`]: '500',
    [`${minute}:s`]: '10500000',
    [`${minute}:b9`]: '9500',
    [`${minute}:b12`]: '500',
    [`${minute}:wn`]: '9500',
    [`${minute}:wo`]: '0',
    [`${minute}:ws`]: '4750000',
    [`${minute}:wb7`]: '9500',
    [`${minute}:xn`]: '500',
    [`${minute}:xo`]: '0',
    [`${minute}:xs`]: '2500000',
    [`${minute}:xb14`]: '500',
  }], { now });
  assert.equal(healthy.sampleCount, 10000);
  assert.equal(healthy.p95Ms, 1000);
  assert.equal(healthy.averageMs, 1050);
  assert.equal(healthy.cacheHitRate, 95);
  assert.equal(healthy.targetViolationRate, 5);
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.warm.p95Ms, 500);
  assert.equal(healthy.cold.p95Ms, 5000);
  assert.equal(healthy.warm.targetMs, READINESS_WARM_TARGET_MS);
  assert.equal(healthy.cold.targetMs, READINESS_COLD_TARGET_MS);
  assert.equal(healthy.telemetrySource, 'rolling_histogram');

  const degraded = summarizeReadinessRollups([{
    [`${minute}:n`]: '10000',
    [`${minute}:c`]: '9400',
    [`${minute}:o`]: '600',
    [`${minute}:s`]: '11200000',
    [`${minute}:b9`]: '9400',
    [`${minute}:b12`]: '600',
    [`${minute}:wn`]: '9400',
    [`${minute}:wo`]: '600',
    [`${minute}:ws`]: '11200000',
    [`${minute}:wb12`]: '9400',
    [`${minute}:xn`]: '600',
    [`${minute}:xo`]: '0',
    [`${minute}:xs`]: '600000',
    [`${minute}:xb9`]: '600',
  }], { now });
  assert.equal(degraded.p95Ms, 2000);
  assert.equal(degraded.targetViolationRate, 6);
  assert.equal(degraded.healthy, false);
  assert.equal(degraded.warm.healthy, false);
});

test('rolling histogram excludes expired minutes and warms up from recent raw samples', () => {
  const minute = Math.floor(now / 60000);
  const expiredMinute = Math.floor((now - 25 * 60 * 60 * 1000) / 60000);
  const rolling = summarizeReadinessRollups([{
    [`${expiredMinute}:n`]: '999',
    [`${expiredMinute}:b18`]: '999',
    [`${minute}:n`]: '19',
    [`${minute}:c`]: '19',
    [`${minute}:s`]: '1900',
    [`${minute}:b1`]: '19',
  }], { now });
  assert.equal(rolling.sampleCount, 19);
  const recentRows = Array.from({ length: 20 }, (_, index) => JSON.stringify({
    at: new Date(now - index * 1000).toISOString(), durationMs: 120, cache: 'hit',
  }));
  const selected = summarizeReadinessTelemetry(recentRows, [{
    [`${minute}:n`]: '19', [`${minute}:c`]: '19', [`${minute}:s`]: '1900', [`${minute}:b1`]: '19',
  }], { now });
  assert.equal(selected.sampleCount, 20);
  assert.equal(selected.telemetrySource, 'recent_samples');
  assert.equal(READINESS_LATENCY_HISTOGRAM_BOUNDS_MS.at(-1), 60000);
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
  assert.match(dashboard, /тёплый \/ холодный/);
  const warmCron = readFileSync(new URL('../pages/api/cron/readiness-warm.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.match(warmCron, /prewarmTeamReadiness/);
  assert.ok(vercel.crons.some(job => job.path === '/api/cron/readiness-warm' && job.schedule === '* * * * *'));
});
