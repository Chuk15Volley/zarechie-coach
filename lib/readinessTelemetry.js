import { redisPipeline } from './redis.js';
import { pfx } from './workspacePrefix.js';

const SAMPLE_LIMIT = 200;
const TARGET_MS = 1500;
const MIN_HEALTH_SAMPLES = 20;
const ROLLUP_TTL_SECONDS = 3 * 24 * 60 * 60;
const HISTOGRAM_BOUNDS_MS = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 3000, 5000, 10000, 15000, 30000, 60000];
const RECORD_ROLLUP_SCRIPT = "local p=ARGV[1]..':' redis.call('hincrby',KEYS[1],p..'n',1) redis.call('hincrby',KEYS[1],p..'c',ARGV[2]) redis.call('hincrby',KEYS[1],p..'o',ARGV[3]) redis.call('hincrby',KEYS[1],p..'s',ARGV[4]) redis.call('hincrby',KEYS[1],p..'b'..ARGV[5],1) redis.call('expire',KEYS[1],ARGV[6]) return 1";

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

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function epochMinute(timestamp) {
  return Math.floor(timestamp / 60000);
}

export function readinessLatencyRollupKey(workspace, options = {}) {
  const now = Number(options.now ?? Date.now());
  return `${pfx(workspace)}:platform:latency:readiness-rollup:${readinessTelemetryScope(options)}:${utcDay(now)}`;
}

export function readinessLatencyRollupKeys(workspace, options = {}) {
  const now = Number(options.now ?? Date.now());
  const windowMs = Number(options.windowMs ?? 24 * 60 * 60 * 1000);
  return [...new Set([
    readinessLatencyRollupKey(workspace, { ...options, now }),
    readinessLatencyRollupKey(workspace, { ...options, now: now - windowMs }),
  ])];
}

function histogramBucket(durationMs) {
  const index = HISTOGRAM_BOUNDS_MS.findIndex(bound => durationMs <= bound);
  return index === -1 ? HISTOGRAM_BOUNDS_MS.length - 1 : index;
}

export async function recordReadinessLatency({ workspace = 'zarechie', durationMs, cache, playerCount, date, environment, release, now = Date.now(), redisPipelineImpl = redisPipeline }) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < 0) return null;
  const recordedAt = Number(now);
  if (!Number.isFinite(recordedAt)) return null;
  const sample = {
    at: new Date(recordedAt).toISOString(),
    durationMs: Math.round(duration),
    cache: String(cache || 'unknown').slice(0, 40),
    playerCount: Number.isFinite(Number(playerCount)) ? Math.max(0, Math.round(Number(playerCount))) : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : null,
  };
  const key = readinessLatencyKey(workspace, { environment, release });
  const rollupKey = readinessLatencyRollupKey(workspace, { environment, release, now: recordedAt });
  const minute = epochMinute(recordedAt);
  await redisPipelineImpl([
    ['LPUSH', key, JSON.stringify(sample)],
    ['LTRIM', key, '0', String(SAMPLE_LIMIT - 1)],
    ['EVAL', RECORD_ROLLUP_SCRIPT, '1', rollupKey, String(minute), ['hit', 'stale', 'stale-while-revalidate'].includes(sample.cache) ? '1' : '0', sample.durationMs > TARGET_MS ? '1' : '0', String(sample.durationMs), String(histogramBucket(sample.durationMs)), String(ROLLUP_TTL_SECONDS)],
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
    telemetrySource: 'recent_samples',
  };
}

function hashEntries(raw) {
  if (Array.isArray(raw)) {
    const entries = [];
    for (let index = 0; index + 1 < raw.length; index += 2) entries.push([raw[index], raw[index + 1]]);
    return entries;
  }
  return raw && typeof raw === 'object' ? Object.entries(raw) : [];
}

function histogramPercentile(histogram, sampleCount, ratio) {
  if (!sampleCount) return null;
  const target = Math.ceil(sampleCount * ratio);
  let cumulative = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    cumulative += histogram[index];
    if (cumulative >= target) return HISTOGRAM_BOUNDS_MS[index];
  }
  return HISTOGRAM_BOUNDS_MS.at(-1);
}

export function summarizeReadinessRollups(hashes, options = {}) {
  const now = Number(options.now ?? Date.now());
  const windowMs = Number(options.windowMs ?? 24 * 60 * 60 * 1000);
  const firstMinute = Math.ceil((now - windowMs) / 60000);
  const lastMinute = epochMinute(now);
  const histogram = Array(HISTOGRAM_BOUNDS_MS.length).fill(0);
  const activeMinutes = new Set();
  let sampleCount = 0;
  let cachedCount = 0;
  let targetViolationCount = 0;
  let durationTotalMs = 0;

  for (const hash of Array.isArray(hashes) ? hashes : []) {
    for (const [rawField, rawValue] of hashEntries(hash)) {
      const match = String(rawField).match(/^(\d+):(n|c|o|s|b(\d+))$/);
      const value = Number(rawValue);
      if (!match || !Number.isFinite(value) || value < 0) continue;
      const minute = Number(match[1]);
      if (!Number.isSafeInteger(minute) || minute < firstMinute || minute > lastMinute) continue;
      const metric = match[2];
      if (metric === 'n') { sampleCount += value; if (value > 0) activeMinutes.add(minute); }
      else if (metric === 'c') cachedCount += value;
      else if (metric === 'o') targetViolationCount += value;
      else if (metric === 's') durationTotalMs += value;
      else {
        const bucket = Number(match[3]);
        if (Number.isInteger(bucket) && bucket >= 0 && bucket < histogram.length) histogram[bucket] += value;
      }
    }
  }

  const enoughSamples = sampleCount >= MIN_HEALTH_SAMPLES;
  const p95Ms = histogramPercentile(histogram, sampleCount, 0.95);
  return {
    sampleCount,
    windowHours: Math.round(windowMs / 3600000),
    targetMs: TARGET_MS,
    p50Ms: histogramPercentile(histogram, sampleCount, 0.5),
    p95Ms,
    p99Ms: histogramPercentile(histogram, sampleCount, 0.99),
    maxMs: histogramPercentile(histogram, sampleCount, 1),
    averageMs: sampleCount ? Math.round(durationTotalMs / sampleCount) : null,
    cacheHitRate: sampleCount ? Math.round(cachedCount / sampleCount * 1000) / 10 : null,
    targetViolationCount,
    targetViolationRate: sampleCount ? Math.round(targetViolationCount / sampleCount * 1000) / 10 : null,
    activeMinutes: activeMinutes.size,
    enoughSamples,
    healthy: !enoughSamples || targetViolationCount <= Math.floor(sampleCount * 0.05),
    telemetrySource: 'rolling_histogram',
  };
}

export function summarizeReadinessTelemetry(rows, rollups, options = {}) {
  const rolling = summarizeReadinessRollups(rollups, options);
  if (rolling.enoughSamples) return rolling;
  const recent = summarizeReadinessLatency(rows, options);
  return recent.sampleCount > rolling.sampleCount ? recent : rolling;
}

export const READINESS_LATENCY_TARGET_MS = TARGET_MS;
export const READINESS_LATENCY_MIN_HEALTH_SAMPLES = MIN_HEALTH_SAMPLES;
export const READINESS_LATENCY_HISTOGRAM_BOUNDS_MS = HISTOGRAM_BOUNDS_MS;
