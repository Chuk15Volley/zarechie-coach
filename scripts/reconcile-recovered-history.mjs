// Incident-specific three-way reconciliation. Defaults to a read-only plan.
import { get, put } from '@vercel/blob';
import crypto from 'node:crypto';
import { decodeBackup, encodeBackup } from '../lib/backupCodec.mjs';
import { canonicalRedisValue, redisValuesMatch } from '../lib/recoveryDrill.mjs';
import { reconcileHistoryValue, RECONCILE_HISTORY_LUA } from '../lib/historyReconciliation.mjs';
import { redisPipeline } from '../lib/redis.js';
const token = process.env.BACKUP_READ_WRITE_TOKEN, secret = process.env.BACKUP_ENCRYPTION_KEY;
async function archive(path) {
  const r = await get(path, { access: 'private', useCache: false, token });
  if (r?.statusCode !== 200) throw Error('Archive unavailable');
  const chunks = []; for await (const c of r.stream) chunks.push(Buffer.from(c));
  return decodeBackup(Buffer.concat(chunks), secret);
}
const earlier = await archive('operations/backups/zarechie/2026-09-04T02-30-25-825Z-a952e635.backup');
const newer = await archive('operations/incidents/history-2026-09-09/zarechie/premigration-2026-09-04T17-15-28.backup');
if (earlier.workspace !== 'zarechie' || newer.workspace !== 'zarechie' || Date.parse(newer.createdAt) <= Date.parse(earlier.createdAt)) throw Error('Invalid archive order or workspace');
const old = new Map(earlier.entries.map(e => [e.key, e]));
const entries = newer.entries.filter(e => /^coach:(ex_memory:|exhist:|exweight:|gym_tonnage:|session:actual:)/.test(e.key));
const read = e => e.type === 'hash' ? ['HGETALL', e.key] : ['GET', e.key];
async function pipe(cmds) { const out = []; for (let i = 0; i < cmds.length; i += 30) out.push(...await redisPipeline(cmds.slice(i, i + 30))); return out; }
const values = await pipe(entries.map(read));
const plan = entries.flatMap((e, i) => {
  if (values[i] == null || (Array.isArray(values[i]) && values[i].length === 0)) return [];
  const live = { ...e, value: values[i] };
  const target = reconcileHistoryValue(e, old.get(e.key), live);
  return target == null ? [] : [{ live, target: { ...e, value: target } }];
});
console.log(JSON.stringify({ phase: 'plan', workspace: 'zarechie', updates: plan.length, byFamily: plan.reduce((out, e) => { const family = e.live.key.split(':')[1]; out[family] = (out[family] || 0) + 1; return out; }, {}) }));
if (process.argv.includes('--apply') && plan.length) {
  const snapshot = { schemaVersion: 2, workspace: 'zarechie', id: crypto.randomUUID(), createdAt: new Date().toISOString(), entries: plan.map(e => e.live) };
  const bytes = encodeBackup(snapshot, secret);
  const path = `operations/incidents/history-2026-09-09/zarechie/reconcile-${snapshot.id}-before.backup`;
  await put(path, bytes, { token, access: 'private', addRandomSuffix: false, allowOverwrite: false });
  const verified = await archive(path);
  if (verified.id !== snapshot.id || verified.entries.length !== plan.length) throw Error('Rollback archive mismatch');
  const arg = e => e.type === 'hash' ? JSON.stringify(canonicalRedisValue('hash', e.value).flat()) : String(e.value);
  const results = await pipe(plan.map(e => ['EVAL', RECONCILE_HISTORY_LUA, 1, e.live.key, e.live.type, arg(e.live), arg(e.target)]));
  const after = await pipe(plan.map(e => read(e.live)));
  const failures = plan.filter((e, i) => results[i] === 1 && !redisValuesMatch(e.target.type, e.target.value, after[i]));
  if (failures.length) throw Error('Post-reconciliation verification failed');
  const final = { ...snapshot, id: crypto.randomUUID(), entries: plan.map((e, i) => ({ ...e.live, value: after[i] })) };
  await put(`operations/incidents/history-2026-09-09/zarechie/reconcile-${snapshot.id}-after.backup`, encodeBackup(final, secret), { token, access: 'private', addRandomSuffix: false, allowOverwrite: false });
  console.log(JSON.stringify({ phase: 'verified', updated: results.filter(x => x === 1).length, concurrentChangesSkipped: results.filter(x => x === 0).length, rollbackArchive: path }));
}
