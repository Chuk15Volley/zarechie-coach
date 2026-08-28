import { redis } from './redis.js';
import { getReadySixRoster } from './readySixClient.js';
import { pfx } from './workspacePrefix.js';

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const inflight = new Map();

function cacheKey(workspace, date) {
  return `${pfx(workspace)}:platform:cache:readysix-roster:${date}`;
}

function parseRecord(raw, workspace, date, now) {
  if (!raw) return null;
  try {
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const ageMs = now - new Date(record.cachedAt).getTime();
    if (record.workspace !== workspace || record.date !== date || !record.payload || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > STALE_MS) return null;
    return { ...record, ageMs };
  } catch (_) {
    return null;
  }
}

export async function getCachedReadySixRoster(workspace, date, options = {}) {
  const normalizedWorkspace = workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const now = Number(options.now ?? Date.now());
  const redisGet = options.redisGet || ((key) => redis('get', key));
  const redisSet = options.redisSet || ((key, value, ttl) => redis('set', key, value, 'EX', ttl));
  const getRoster = options.getRoster || getReadySixRoster;
  const key = cacheKey(normalizedWorkspace, date);
  const cached = parseRecord(await redisGet(key).catch(() => null), normalizedWorkspace, date, now);
  if (cached?.ageMs <= FRESH_MS) return { payload: cached.payload, cache: 'hit', ageMs: cached.ageMs };

  let request = inflight.get(key);
  if (!request) {
    request = (async () => {
      const payload = await getRoster(normalizedWorkspace, date);
      const record = { workspace: normalizedWorkspace, date, cachedAt: new Date(now).toISOString(), payload };
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

export const READY_SIX_ROSTER_CACHE_FRESH_MS = FRESH_MS;
export const READY_SIX_ROSTER_CACHE_STALE_MS = STALE_MS;
