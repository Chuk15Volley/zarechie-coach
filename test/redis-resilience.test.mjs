import assert from 'node:assert/strict';
import test from 'node:test';
import { redis, redisPipeline } from '../lib/redis.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.KV_REST_API_URL;
const originalToken = process.env.KV_REST_API_TOKEN;

test.beforeEach(() => {
  process.env.KV_REST_API_URL = 'https://redis.example';
  process.env.KV_REST_API_TOKEN = 'test-token';
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = originalUrl;
  if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = originalToken;
});

test('pipeline preserves legitimate null results and includes a deadline', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => [{ result: 'value' }, { result: null }] };
  };
  assert.deepEqual(await redisPipeline([['GET', 'one'], ['GET', 'missing']]), ['value', null]);
});

test('pipeline rejects command-level and malformed partial responses', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: 'ok' }, { error: 'write failed' }] });
  await assert.rejects(redisPipeline([['SET', 'one', '1'], ['SET', 'two', '2']]), /command 1 failed/);

  globalThis.fetch = async () => ({ ok: true, json: async () => [{ result: 'only one' }] });
  await assert.rejects(redisPipeline([['GET', 'one'], ['GET', 'two']]), /invalid response/);
});

test('single Redis requests sanitize and bound upstream error output', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => `failure\n${'x'.repeat(1000)}` });
  await assert.rejects(redis('get', 'key'), error => {
    assert.match(error.message, /Redis request failed with status 500: failure /);
    assert.ok(error.message.length < 600);
    return true;
  });
});
