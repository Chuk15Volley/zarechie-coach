import { redisPipeline } from './redis.js';
import { pfx } from './workspacePrefix.js';

const SAMPLE_LIMIT = 200;
const TARGET_MS = 1500;
const MIN_HEALTH_SAMPLES = 20;

export function readinessTelemetryScope(options = {}) {
  const environment = String(options.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'local')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || 'local';
  if (environment === 'production') return 'production';
  const release = String(options.release || process.env.VERCEL_GIT_COMMIT_SHA || 'local')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 16) || 'local';
  return `${environment}:${release}`;
}

export function readinessLatencyKey(workspace, options = {}) {
  return `${pfx(workspace)}:platform:latency:readiness:${readinessTelemetryScope(options)}`;
}

export async function recordReadinessLatency({ workspace = 'zarechie', durationMs, cache, playerCount, date, environment, release }) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < 0) return null;
  const sample = {
    at: new Date().toISOString(),
    durationMs: Math.round(duration),
    cache: String(cache || 'unknown').slice(0, 40),
    playerCount: Number.isFinite(Number(playerCount)) ? Math.max(0, Math.round(Number(playerCount))) : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : null,
  };
  const key = readinessLatencyKey(workspace, { environment, release });
  await redisPipeline([
    ['LPUSH', key, JSON.stringify(sample)],
    ['LTRIM', key, '0', String(SAMPLE_LIMIT - 1)],
  ]).catch(() => {});
  return sample;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

export function summarizeReadinessLatency(rows, options = {}) {
  const now = Number(options.now ?? Date.now());
  const since = now - Number(options.windowMs ?? 24 * 60 * 60 * 1000);
  const samples = (Array.isArray(rows) ? rows : []).map(row => {
    try { return typeof row === 'string' ? JSON.parse(row) : row; } catch (_) { return null; }
  }).filter(sample => {
    const at = new Date(sample?.at).getTime();
    const duration = Number(sample?.durationMs);
    return Number.isFinite(at) && at >= since && at <= now && Number.isFinite(duration) && duration >= 0;
  });
  const durations = samples.map(sample => Math.round(Number(sample.durationMs))).sort((a, b) => a - b);
  const cached = samples.filter(sample => ['hit', 'stale', 'stale-while-revalidate'].includes(sample.cache)).length;
  const p95Ms = percentile(durations, 0.95);
  const enoughSamples = samples.length >= MIN_HEALTH_SAMPLES;
  return {
    sampleCount: samples.length,
    windowHours: Math.round(Number(options.windowMs ?? 24 * 60 * 60 * 1000) / 3600000),
    targetMs: TARGET_MS,
    p50Ms: percentile(durations, 0.5),
    p95Ms,
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.at(-1) ?? null,
    cacheHitRate: samples.length ? Math.round(cached / samples.length * 1000) / 10 : null,
    enoughSamples,
    healthy: !enoughSamples || p95Ms <= TARGET_MS,
  };
}

export const READINESS_LATENCY_TARGET_MS = TARGET_MS;
export const READINESS_LATENCY_MIN_HEALTH_SAMPLES = MIN_HEALTH_SAMPLES;
