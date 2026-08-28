import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeBackup, encodeBackup, restoreCommandsForEntry, shouldIncludeBackupKey } from '../lib/backupCodec.mjs';

const secret = 'test-backup-secret-that-is-at-least-32-bytes-long';
const snapshot = {
  schemaVersion: 2,
  id: '2026-08-28-test',
  workspace: 'zarechie',
  createdAt: '2026-08-28T12:00:00.000Z',
  release: 'abc123',
  entries: [
    { key: 'coach:session:1:2026-08-28', type: 'string', ttlMs: -1, value: '{"ok":true}' },
    { key: 'coach:exhist:1:squat', type: 'hash', ttlMs: -1, value: { '2026-08-28': '80' } },
  ],
};

test('encrypted backup round-trips without exposing plaintext', () => {
  const encrypted = encodeBackup(snapshot, secret);
  assert.equal(encrypted.includes(Buffer.from('coach:session:1')), false);
  assert.deepEqual(decodeBackup(encrypted, secret), snapshot);
});

test('encrypted backup rejects tampering and the wrong key', () => {
  const encrypted = encodeBackup(snapshot, secret);
  const envelope = JSON.parse(encrypted.toString('utf8'));
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[0] ^= 1;
  envelope.ciphertext = bytes.toString('base64');
  assert.throws(() => decodeBackup(Buffer.from(JSON.stringify(envelope)), secret), /authentication failed/);
  assert.throws(() => decodeBackup(encrypted, `${secret}-wrong`), /authentication failed/);
});

test('backup scope includes durable workspace data and excludes operational keys', () => {
  assert.equal(shouldIncludeBackupKey('zarechie', 'coach:session:1:2026-08-28'), true);
  assert.equal(shouldIncludeBackupKey('zarechie', 'coach:templates'), true);
  assert.equal(shouldIncludeBackupKey('zarechie', 'ex:index'), true);
  assert.equal(shouldIncludeBackupKey('zarechie', 'coach:batch:abc'), false);
  assert.equal(shouldIncludeBackupKey('zarechie', 'coach:platform:events'), false);
  assert.equal(shouldIncludeBackupKey('nkperf', 'coach:session:1:2026-08-28'), false);
  assert.equal(shouldIncludeBackupKey('nkperf', 'nkperf:session:1:2026-08-28'), true);
});

test('restore commands preserve Redis types and TTL', () => {
  assert.deepEqual(restoreCommandsForEntry({ key: 'coach:value', type: 'string', value: 'x', ttlMs: 5000 }), [
    ['DEL', 'coach:value'],
    ['SET', 'coach:value', 'x'],
    ['PEXPIRE', 'coach:value', '5000'],
  ]);
  assert.deepEqual(restoreCommandsForEntry({ key: 'coach:hash', type: 'hash', value: { a: '1', b: '2' }, ttlMs: -1 }), [
    ['DEL', 'coach:hash'],
    ['HSET', 'coach:hash', 'a', '1', 'b', '2'],
  ]);
  assert.deepEqual(restoreCommandsForEntry({ key: 'coach:zset', type: 'zset', value: ['member', '42'], ttlMs: -1 }), [
    ['DEL', 'coach:zset'],
    ['ZADD', 'coach:zset', '42', 'member'],
  ]);
});

test('deployment config schedules a daily authenticated backup', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/cron/backup', schedule: '30 2 * * *' }]);
  const cronApi = readFileSync(new URL('../pages/api/cron/backup.js', import.meta.url), 'utf8');
  assert.match(cronApi, /process\.env\.CRON_SECRET/);
  assert.match(cronApi, /timingSafeEqual/);
  assert.match(cronApi, /Promise\.allSettled/);
});
