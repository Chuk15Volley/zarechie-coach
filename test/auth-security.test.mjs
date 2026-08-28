import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthorized,
  trainerKeyMatches,
  verifySessionToken,
} from '../lib/auth.js';
import loginHandler from '../pages/api/auth/login.js';

function request({ method = 'GET', headers = {} } = {}) {
  return { method, headers, socket: { remoteAddress: '127.0.0.1' } };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function responseMock() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('authentication fails closed and rejects the former public bypass', () => {
  const previous = process.env.TRAINER_API_KEY;
  delete process.env.TRAINER_API_KEY;
  assert.equal(isAuthorized(request()), false);
  process.env.TRAINER_API_KEY = 'a-long-production-trainer-key';
  assert.equal(isAuthorized(request()), false);
  assert.equal(isAuthorized(request({ headers: { 'x-api-key': 'coach-ui' } })), false);
  restoreEnv('TRAINER_API_KEY', previous);
});

test('trusted explicit credentials support header and bearer automation', () => {
  const previous = process.env.TRAINER_API_KEY;
  process.env.TRAINER_API_KEY = 'trainer-secret-123';
  assert.equal(trainerKeyMatches('trainer-secret-123'), true);
  assert.equal(trainerKeyMatches('trainer-secret-124'), false);
  assert.equal(isAuthorized(request({ method: 'POST', headers: { 'x-api-key': 'trainer-secret-123' } })), true);
  assert.equal(isAuthorized(request({ headers: { authorization: 'Bearer trainer-secret-123' } })), true);
  restoreEnv('TRAINER_API_KEY', previous);
});

test('signed coach session expires, detects tampering, and enforces same origin on writes', () => {
  const previousKey = process.env.TRAINER_API_KEY;
  const previousSecret = process.env.SESSION_SECRET;
  process.env.TRAINER_API_KEY = 'trainer-key-for-session-tests';
  process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
  const now = Date.now();
  const token = createSessionToken({ now, ttlSeconds: 3600 });
  assert.equal(verifySessionToken(token, { now })?.role, 'coach');
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, { now }), null);
  assert.equal(verifySessionToken(token, { now: now + 3601 * 1000 }), null);
  process.env.TRAINER_API_KEY = 'rotated-trainer-key';
  assert.equal(verifySessionToken(token, { now }), null);
  process.env.TRAINER_API_KEY = 'trainer-key-for-session-tests';

  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  assert.equal(isAuthorized(request({ headers: { cookie } })), true);
  assert.equal(isAuthorized(request({ method: 'POST', headers: { cookie, host: 'localhost:3000', origin: 'http://localhost:3000' } })), true);
  assert.equal(isAuthorized(request({ method: 'POST', headers: { cookie, host: 'localhost:3000', origin: 'https://attacker.example' } })), false);
  assert.equal(isAuthorized(request({ method: 'POST', headers: { cookie, host: 'localhost:3000' } })), false);

  restoreEnv('TRAINER_API_KEY', previousKey);
  restoreEnv('SESSION_SECRET', previousSecret);
});

test('login exchanges the trainer key for a hardened HttpOnly production cookie', async () => {
  const previousKey = process.env.TRAINER_API_KEY;
  const previousSecret = process.env.SESSION_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.KV_REST_API_URL;
  const previousRedisToken = process.env.KV_REST_API_TOKEN;
  process.env.TRAINER_API_KEY = 'trainer-login-secret';
  process.env.SESSION_SECRET = 'abcdef0123456789abcdef0123456789';
  process.env.NODE_ENV = 'production';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  const denied = responseMock();
  await loginHandler(request({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1' } }), denied);
  assert.equal(denied.statusCode, 401);

  const accepted = responseMock();
  const req = request({ method: 'POST', headers: { 'x-forwarded-for': '192.0.2.1' } });
  req.body = { trainerKey: 'trainer-login-secret' };
  await loginHandler(req, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.match(accepted.headers['set-cookie'], /^kps_session=/);
  assert.match(accepted.headers['set-cookie'], /; HttpOnly; Secure; SameSite=Strict;/);
  assert.doesNotMatch(accepted.headers['set-cookie'], /trainer-login-secret/);

  restoreEnv('TRAINER_API_KEY', previousKey);
  restoreEnv('SESSION_SECRET', previousSecret);
  restoreEnv('NODE_ENV', previousNodeEnv);
  restoreEnv('KV_REST_API_URL', previousRedisUrl);
  restoreEnv('KV_REST_API_TOKEN', previousRedisToken);
});
