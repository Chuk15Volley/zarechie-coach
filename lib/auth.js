import crypto from 'node:crypto';

export const SESSION_COOKIE = 'kps_session';
const SESSION_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sessionSecret() {
  const explicit = String(process.env.SESSION_SECRET || '').trim();
  if (explicit.length >= 32) return explicit;

  // Derive a purpose-specific signing key so the raw trainer credential is
  // never used directly as an HMAC key.
  const trainerKey = String(process.env.TRAINER_API_KEY || '').trim();
  if (!trainerKey) return '';
  return crypto.createHash('sha256').update(`kps-session-v1\0${trainerKey}`).digest('hex');
}

function configuredTtlSeconds() {
  const value = Number(process.env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.min(7 * 24 * 60 * 60, Math.max(15 * 60, Math.floor(value)));
}

function trainerCredentialVersion() {
  const trainerKey = String(process.env.TRAINER_API_KEY || '').trim();
  if (!trainerKey) return '';
  return crypto.createHash('sha256').update(`kps-key-version-v1\0${trainerKey}`).digest('base64url').slice(0, 22);
}

function sign(encodedPayload) {
  const secret = sessionSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSessionToken({ now = Date.now(), ttlSeconds = configuredTtlSeconds() } = {}) {
  if (!sessionSecret()) throw new Error('Authentication is not configured');
  const payload = Buffer.from(JSON.stringify({
    v: SESSION_VERSION,
    role: 'coach',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
    auth: trainerCredentialVersion(),
    nonce: crypto.randomBytes(16).toString('base64url'),
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token, { now = Date.now() } = {}) {
  try {
    const [payload, signature, extra] = String(token || '').split('.');
    if (!payload || !signature || extra || !constantTimeEqual(signature, sign(payload))) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    if (
      parsed?.v !== SESSION_VERSION
      || parsed?.role !== 'coach'
      || !constantTimeEqual(parsed?.auth, trainerCredentialVersion())
      || !Number.isSafeInteger(parsed?.iat)
      || !Number.isSafeInteger(parsed?.exp)
      || parsed.exp <= nowSeconds
      || parsed.iat > nowSeconds + 60
      || parsed.exp - parsed.iat > 7 * 24 * 60 * 60
    ) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const raw = firstHeader(req?.headers?.cookie) || '';
  const result = {};
  for (const pair of raw.split(';')) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch (_) { result[key] = value; }
  }
  return result;
}

function isSafeMethod(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

function hasTrustedOrigin(req) {
  if (isSafeMethod(req?.method)) return true;
  const origin = firstHeader(req?.headers?.origin);
  const fetchSite = firstHeader(req?.headers?.['sec-fetch-site']);
  if (!origin) return fetchSite === 'same-origin';

  try {
    const host = firstHeader(req?.headers?.['x-forwarded-host']) || firstHeader(req?.headers?.host);
    const proto = firstHeader(req?.headers?.['x-forwarded-proto']) || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    return Boolean(host) && new URL(origin).origin === `${proto}://${host}`;
  } catch (_) {
    return false;
  }
}

function bearerToken(req) {
  const authorization = String(firstHeader(req?.headers?.authorization) || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function isAuthorized(req) {
  const expected = String(process.env.TRAINER_API_KEY || '').trim();
  if (!expected) return false;

  // Explicit credentials remain available for smoke tests and trusted
  // server-to-server calls. The public "coach-ui" bypass is intentionally gone.
  const provided = String(firstHeader(req?.headers?.['x-api-key']) || bearerToken(req) || '').trim();
  if (provided && constantTimeEqual(provided, expected)) return true;

  const session = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
  return Boolean(session && hasTrustedOrigin(req));
}

export function trainerKeyMatches(value) {
  const expected = String(process.env.TRAINER_API_KEY || '').trim();
  return Boolean(expected && constantTimeEqual(String(value || '').trim(), expected));
}

export function setSessionCookie(res) {
  const ttl = configuredTtlSeconds();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken({ ttlSeconds: ttl }))}; Path=/; HttpOnly${secure}; SameSite=Strict; Priority=High; Max-Age=${ttl}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Strict; Priority=High; Max-Age=0`);
}
