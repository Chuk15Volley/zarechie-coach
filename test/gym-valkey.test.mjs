import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createGymValkeyTransport } from '../lib/gymValkeyTransport.mjs';
import { redis } from '../lib/redis.js';

const base = {
  GYM_STORAGE_PROVIDER: 'valkey', GYM_DEPLOYMENT_ENV: 'ru-self-hosted', GYM_DEPLOYMENT_REGION: 'ru',
  GYM_STORAGE_BOUNDARY: 'readysix-gym-ru-production', GYM_VALKEY_ENDPOINT: 'redis://127.0.0.1:6379/0',
  GYM_VALKEY_USERNAME: 'gym', GYM_VALKEY_PASSWORD: 'synthetic-gym-test-password-32-bytes',
};

test('Russian gym boundary rejects old storage, other regions and ReadySix endpoints before connecting', () => {
  for (const change of [
    { GYM_DEPLOYMENT_REGION: 'eu' }, { GYM_STORAGE_BOUNDARY: 'readysix-ru-production' },
    { GYM_VALKEY_ENDPOINT: 'redis://valkey-primary:6379/0' },
    { GYM_VALKEY_ENDPOINT: 'redis://example.com:6379/0' },
    { GYM_VALKEY_ENDPOINT: 'redis://127.0.0.1:6379/1' },
    { GYM_VALKEY_PASSWORD: 'short' }, { GYM_VALKEY_USERNAME: 'default' },
    { KV_REST_API_URL: 'https://old.example' }, { UPSTASH_REDIS_REST_TOKEN: 'old' },
    { DEBUG: 'ioredis:*' },
  ]) assert.throws(() => createGymValkeyTransport({ ...base, ...change }), /GYM_STORAGE_/);
});

test('self-hosted runtime cannot silently fall back to REST when provider is absent', async () => {
  const old = process.env.GYM_DEPLOYMENT_ENV;
  process.env.GYM_DEPLOYMENT_ENV = 'ru-self-hosted';
  try { await assert.rejects(redis('get', 'synthetic'), /GYM_STORAGE_BOUNDARY_REQUIRED/); }
  finally { if (old === undefined) delete process.env.GYM_DEPLOYMENT_ENV; else process.env.GYM_DEPLOYMENT_ENV = old; }
});

// Opt in with the path to an owned local Redis/Valkey binary. Never connects to production.
test('isolated real server preserves all five types, Lua locks, TTL, pipeline order and private errors', {
  skip: !process.env.GYM_TEST_REDIS_SERVER,
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gym-valkey-test-'));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const acl = path.join(directory, 'users.acl');
  await fs.writeFile(acl, `user default off\nuser gym on >${base.GYM_VALKEY_PASSWORD} ~* +@all\n`, { mode: 0o600 });
  const child = spawn(process.env.GYM_TEST_REDIS_SERVER, ['--bind', '127.0.0.1', '--port', String(port),
    '--save', '', '--appendonly', 'no', '--aclfile', acl, '--dir', directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  const transport = createGymValkeyTransport({ ...base, GYM_VALKEY_ENDPOINT: `redis://127.0.0.1:${port}/0` });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SYNTHETIC_SERVER_NOT_READY')), 5000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('SYNTHETIC_SERVER_START_FAILED')); });
      child.stdout.on('data', data => { if (data.toString().includes('Ready to accept connections')) { clearTimeout(timer); resolve(); } });
    });
    assert.deepEqual(await transport.pipeline([
      ['SET', 's', 'данные/α'], ['HSET', 'h', 'field', 'value'], ['SADD', 'set', 'a', 'b'],
      ['RPUSH', 'list', 'first', 'last'], ['ZADD', 'z', 2, 'b', 1, 'a'],
    ]), ['OK', 1, 2, 2, 2]);
    assert.deepEqual(await transport.pipeline([
      ['GET', 'missing'], ['GET', 's'], ['HGETALL', 'h'], ['SMEMBERS', 'set'], ['LRANGE', 'list', 0, -1],
      ['ZRANGE', 'z', 0, -1, 'WITHSCORES'],
    ]), [null, 'данные/α', ['field', 'value'], ['a', 'b'], ['first', 'last'], ['a', '1', 'b', '2']]);
    await transport.command('set', 'lock', 'owner', 'PX', 10000, 'NX');
    assert.equal(await transport.command('set', 'lock', 'other', 'NX'), null);
    assert.ok(await transport.command('pttl', 'lock') > 9000);
    assert.equal(await transport.command('eval', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, 'lock', 'other'), 0);
    assert.equal(await transport.command('get', 'lock'), 'owner');
    assert.equal(await transport.command('eval', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", 1, 'lock', 'owner'), 1);
    await assert.rejects(transport.pipeline([['GET', 's'], ['HGETALL', 's']]), error => error.message === 'GYM_STORAGE_UNAVAILABLE');
    assert.equal(await transport.command('get', 's'), 'данные/α');
    assert.throws(() => transport.command('FLUSHALL'), /GYM_STORAGE_COMMAND_INVALID/);
    assert.throws(() => transport.command('SET', 'object', { private: true }), /GYM_STORAGE_ARGUMENT_INVALID/);
    child.kill('SIGTERM'); await exited;
    await assert.rejects(transport.command('get', 's'), error => error.message === 'GYM_STORAGE_UNAVAILABLE');
  } finally {
    transport.close();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
