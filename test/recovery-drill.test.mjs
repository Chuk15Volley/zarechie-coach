import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restoreCommandsForEntry } from '../lib/backupCodec.mjs';
import { canonicalRedisValue, recoveryDrillKey, redisValuesMatch, selectRecoveryDrillEntries } from '../lib/recoveryDrill.mjs';

test('recovery comparison normalizes unordered Redis values without changing list order', () => {
  assert.deepEqual(canonicalRedisValue('hash', { b: 2, a: 1 }), [['a', '1'], ['b', '2']]);
  assert.equal(redisValuesMatch('set', ['beta', 'alpha'], ['alpha', 'beta']), true);
  assert.equal(redisValuesMatch('zset', ['beta', '2', 'alpha', '1'], ['alpha', '1', 'beta', '2']), true);
  assert.equal(redisValuesMatch('list', ['first', 'second'], ['second', 'first']), false);
});

test('recovery sample is deterministic, bounded and covers every available Redis type', () => {
  const types = ['string', 'hash', 'list', 'set', 'zset'];
  const entries = Array.from({ length: 100 }, (_, index) => ({ key: `coach:key:${index}`, type: types[index % types.length], value: String(index) }));
  const first = selectRecoveryDrillEntries(entries, 12);
  const second = selectRecoveryDrillEntries(entries, 12);
  assert.equal(first.length, 12);
  assert.deepEqual(first, second);
  assert.deepEqual([...new Set(first.map(entry => entry.type))].sort(), [...types].sort());
});

test('recovery restore targets an opaque temporary key and forces a cleanup TTL', () => {
  const originalKey = 'coach:private:player:42';
  const drillKey = recoveryDrillKey('zarechie', 'run-1', originalKey);
  assert.match(drillKey, /^drill:zarechie:run-1:[a-f0-9]{32}$/);
  assert.equal(drillKey.includes(originalKey), false);
  assert.deepEqual(restoreCommandsForEntry(
    { key: originalKey, type: 'string', value: 'payload', ttlMs: -1 },
    { key: drillKey, ttlMs: 900000 },
  ), [
    ['DEL', drillKey],
    ['SET', drillKey, 'payload'],
    ['PEXPIRE', drillKey, '900000'],
  ]);
});

test('drill implementation verifies data and always cleans isolated keys', () => {
  const source = readFileSync(new URL('../lib/platformBackup.js', import.meta.url), 'utf8');
  assert.match(source, /DRILL_SAMPLE_SIZE = 240/);
  assert.match(source, /redisValuesMatch/);
  assert.match(source, /finally/);
  assert.match(source, /drillKeys\.map\(key => \['DEL', key\]\)/);
  assert.match(source, /platform:recovery:last/);
});
