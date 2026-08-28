import crypto from 'node:crypto';
import { redisPipeline } from './redis.js';

const fallbackBuckets = new Map();
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

function requestAddress(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req?.socket?.remoteAddress || 'unknown';
}

function opaqueKey(scope, req) {
  const fingerprint = crypto.createHash('sha256').update(requestAddress(req)).digest('hex').slice(0, 24);
  return `rate:${scope}:${fingerprint}`;
}

function fallbackIncrement(key, windowSeconds) {
  const now = Date.now();
  const current = fallbackBuckets.get(key);
  if (!current || current.expiresAt <= now) {
    fallbackBuckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }
  current.count += 1;
  if (fallbackBuckets.size > 2000) {
    for (const [entryKey, bucket] of fallbackBuckets) {
      if (bucket.expiresAt <= now) fallbackBuckets.delete(entryKey);
    }
  }
  return current.count;
}

export async function enforceRateLimit(req, res, {
  scope = 'api',
  limit,
  windowSeconds,
  failClosed = false,
} = {}) {
  const key = opaqueKey(scope, req);
  let count;
  try {
    [count] = await redisPipeline([['EVAL', RATE_LIMIT_SCRIPT, '1', key, String(windowSeconds)]]);
    count = Number(count);
    if (!Number.isFinite(count)) throw new Error('Invalid rate-limit response');
  } catch (_) {
    if (failClosed) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'Защита запросов временно недоступна. Повторите попытку.' });
      return false;
    }
    count = fallbackIncrement(key, windowSeconds);
  }

  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
  res.setHeader('RateLimit-Reset', String(windowSeconds));
  if (count <= limit) return true;

  res.setHeader('Retry-After', String(windowSeconds));
  res.status(429).json({ error: 'Слишком много запросов. Повторите попытку позже.' });
  return false;
}
