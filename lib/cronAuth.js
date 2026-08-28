import crypto from 'node:crypto';

function secretMatches(value, expected) {
  if (!value || !expected) return false;
  const actualDigest = crypto.createHash('sha256').update(String(value)).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

export function cronAuthorizationStatus(req) {
  if (!process.env.CRON_SECRET) return { ok: false, status: 503, error: 'Cron authorization is not configured' };
  const authorization = String(req?.headers?.authorization || '');
  if (!secretMatches(authorization, `Bearer ${process.env.CRON_SECRET}`)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}
