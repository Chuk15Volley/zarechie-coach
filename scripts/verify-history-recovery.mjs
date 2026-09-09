import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { missingHistoryCommand } from '../lib/missingHistoryRecovery.mjs';
import { RECONCILE_HISTORY_LUA } from '../lib/historyReconciliation.mjs';
const key = `drill:zarechie:history-recovery:${crypto.randomUUID()}`;
async function command(cmd) {
  const r = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(15000) });
  const data = await r.json(); if (!r.ok || data.error) throw Error('Redis rehearsal failed'); return data.result;
}
function recovery(type, value, merge = false) {
  const original = merge ? (type === 'hash' ? 'coach:exhist:1:test' : 'coach:sessions:1') : 'coach:session:1:2026-09-01';
  const cmd = missingHistoryCommand({ key: original, type, value, ttlMs: 600000 }, 'zarechie', new Date().toISOString());
  cmd[3] = key;
  return cmd;
}
try {
  await command(recovery('string', 'original'));
  await command(recovery('string', 'must-not-overwrite'));
  assert.equal(await command(['GET', key]), 'original');
  assert.equal(await command(recovery('hash', { a: '1' })), -1);
  await command(['DEL', key]);
  await command(recovery('hash', { old: '10' }, true));
  await command(recovery('hash', { old: '99', added: '20' }, true));
  assert.equal(await command(['HGET', key, 'old']), '10');
  assert.equal(await command(['HGET', key, 'added']), '20');
  await command(['DEL', key]);
  await command(recovery('zset', ['new', '99'], true));
  await command(recovery('zset', ['old', '10', 'new', '1'], true));
  assert.equal(Number(await command(['ZSCORE', key, 'new'])), 99);
  assert.equal(Number(await command(['ZSCORE', key, 'old'])), 10);
  assert.ok(Number(await command(['PTTL', key])) > 0);
  await command(['DEL', key]);
  await command(recovery('hash', { date: '2026-07-17', kg: '20' }));
  const expected = JSON.stringify(['date', '2026-07-17', 'kg', '20']);
  const target = JSON.stringify(['date', '2026-09-04', 'kg', '50']);
  assert.equal(await command(['EVAL', RECONCILE_HISTORY_LUA, 1, key, 'hash', expected, target]), 1);
  assert.equal(await command(['EVAL', RECONCILE_HISTORY_LUA, 1, key, 'hash', expected, JSON.stringify(['kg', '999'])]), 0);
  assert.equal(await command(['HGET', key, 'kg']), '50');
  await command(['DEL', key]);
  await command(recovery('string', 'before'));
  assert.equal(await command(['EVAL', RECONCILE_HISTORY_LUA, 1, key, 'string', 'before', 'after']), 1);
  assert.equal(await command(['EVAL', RECONCILE_HISTORY_LUA, 1, key, 'string', 'before', 'wrong']), 0);
  assert.equal(await command(['GET', key]), 'after');
  console.log('PASS: absent restore, no overwrite, type conflict, additive hash/index merge, TTL');
} finally { await command(['DEL', key]); }
