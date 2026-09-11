import test from 'node:test';
import assert from 'node:assert/strict';
import { isHistoryRecoveryKey, missingHistoryCommand } from '../lib/missingHistoryRecovery.mjs';
const capturedAt = '2026-09-04T00:00:00Z';
const now = Date.parse('2026-09-09T00:00:00Z');
const entry = { key: 'coach:session:1:2026-09-01', type: 'string', value: '{"session":{}}', ttlMs: -1 };
test('recovery rejects other applications, teams and operational state', () => {
  for (const key of ['nkperf:session:1:2026-09-01', 'org:zarechie:session:1', 'coach:roster', 'coach:platform:backup:last', 'coach:log:1:2026-09-01:merge-lock']) {
    assert.equal(isHistoryRecoveryKey('zarechie', key), false);
    assert.throws(() => missingHistoryCommand({ ...entry, key }, 'zarechie', capturedAt, now));
  }
});
test('existing sessions and current weight records must never be overwritten or merged', () => {
  const cmd = missingHistoryCommand(entry, 'zarechie', capturedAt, now);
  assert.equal(cmd[6], 'absent');
  assert.deepEqual(JSON.parse(cmd[5]), [['SET', '{"session":{}}']]);
  const weight = missingHistoryCommand({ ...entry, key: 'coach:exweight:1:squat', type: 'hash', value: { kg: '50', date: '2026-09-01' } }, 'zarechie', capturedAt, now);
  assert.equal(weight[6], 'absent');
});
test('history merge preserves current dates, scores and weights', () => {
  const index = missingHistoryCommand({ ...entry, key: 'coach:sessions:1', type: 'zset', value: ['2026-09-01', '20260901'] }, 'zarechie', capturedAt, now);
  assert.equal(index[6], 'merge');
  assert.deepEqual(JSON.parse(index[5]), [['ZADD', 'NX', '20260901', '2026-09-01']]);
  const history = missingHistoryCommand({ ...entry, key: 'coach:exhist:1:squat', type: 'hash', value: { '2026-09-01': '50' } }, 'zarechie', capturedAt, now);
  assert.deepEqual(JSON.parse(history[5]), [['HSETNX', '2026-09-01', '50']]);
});
test('expired data is skipped and live TTL is reduced by archive age', () => {
  assert.equal(missingHistoryCommand({ ...entry, ttlMs: 1000 }, 'zarechie', capturedAt, now), null);
  const cmd = missingHistoryCommand({ ...entry, ttlMs: 6 * 86400000 }, 'zarechie', capturedAt, now);
  assert.equal(cmd[7], String(86400000));
  assert.throws(() => missingHistoryCommand(entry, 'zarechie', 'invalid', now));
});
