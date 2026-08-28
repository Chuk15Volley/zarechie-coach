import { redis } from './redis.js';
import { pfx } from './workspacePrefix.js';

const FRESH_MS = 60 * 1000;
const STALE_MS = 5 * 60 * 1000;
const inflight = new Map();

function normalizedRelease(value) {
  const release = String(value || process.env.VERCEL_GIT_COMMIT_SHA || 'local')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 16);
  return release || 'local';
}

function cacheKey(workspace, date, release) {
  return `${pfx(workspace)}:platform:cache:team-readiness:v1:${release}:${date}`;
}

function parseRecord(raw, expected, now) {
  if (!raw) return null;
  try {
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const ageMs = now - new Date(record.cachedAt).getTime();
    if (
      record.workspace !== expected.workspace ||
      record.date !== expected.date ||
      record.release !== expected.release ||
      !Array.isArray(record.payload?.players) ||
      !Number.isFinite(ageMs) || ageMs < 0 || ageMs > STALE_MS
    ) return null;
    return { ...record, ageMs };
  } catch (_) {
    return null;
  }
}

export async function getCachedTeamReadiness(workspace, date, compute, options = {}) {
  const normalizedWorkspace = workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const release = normalizedRelease(options.release);
  const now = Number(options.now ?? Date.now());
  const redisGet = options.redisGet || ((key) => redis('get', key));
  const redisSet = options.redisSet || ((key, value, ttl) => redis('set', key, value, 'EX', ttl));
  const key = cacheKey(normalizedWorkspace, date, release);
  const expected = { workspace: normalizedWorkspace, date, release };
  const cached = parseRecord(await redisGet(key).catch(() => null), expected, now);

  if (!options.forceRefresh && cached?.ageMs <= FRESH_MS) {
    return { payload: cached.payload, cache: 'hit', ageMs: cached.ageMs };
  }

  let request = inflight.get(key);
  if (!request) {
    request = (async () => {
      const payload = await compute();
      if (!Array.isArray(payload?.players)) throw new Error('Invalid team readiness payload');
      const record = { ...expected, cachedAt: new Date(now).toISOString(), payload };
      await redisSet(key, JSON.stringify(record), Math.ceil(STALE_MS / 1000)).catch(() => {});
      return payload;
    })();
    inflight.set(key, request);
    request.finally(() => inflight.delete(key)).catch(() => {});
  }

  try {
    return { payload: await request, cache: cached ? 'refresh' : 'miss', ageMs: 0 };
  } catch (error) {
    if (cached) return { payload: cached.payload, cache: 'stale', ageMs: cached.ageMs };
    throw error;
  }
}

export const TEAM_READINESS_CACHE_FRESH_MS = FRESH_MS;
export const TEAM_READINESS_CACHE_STALE_MS = STALE_MS;
