// Run with --env-file=<protected file>. Default is a read-only plan.
// Writes require --apply and an explicit per-workspace archive pathname.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';
import { decodeBackup, encodeBackup, shouldIncludeBackupKey } from '../lib/backupCodec.mjs';
import { isHistoryRecoveryKey, missingHistoryCommand } from '../lib/missingHistoryRecovery.mjs';
import { redisValuesMatch } from '../lib/recoveryDrill.mjs';
import { canonicalRedisValue } from '../lib/recoveryDrill.mjs';

const [workspace, pathname] = process.argv.slice(2).filter(arg => arg !== '--apply');
const apply = process.argv.includes('--apply');
if (!['zarechie', 'nkperf'].includes(workspace) || ![`operations/backups/${workspace}/`, `operations/incidents/history-2026-09-09/${workspace}/`].some(prefix => pathname?.startsWith(prefix))) throw Error('Explicit workspace and archive required');
const token = process.env.BACKUP_READ_WRITE_TOKEN;
const secret = process.env.BACKUP_ENCRYPTION_KEY;
async function pipe(commands) {
  const output = [];
  for (let i = 0; i < commands.length; i += 30) {
    const batch = commands.slice(i, i + 30);
    const r = await fetch(process.env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(batch), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw Error(`Redis HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data) || data.length !== batch.length || data.some(x => x.error)) throw Error('Redis command failure');
    output.push(...data.map(x => x.result));
  }
  return output;
}
const read = (key, type) => ({ string: ['GET', key], hash: ['HGETALL', key], list: ['LRANGE', key, 0, -1], set: ['SMEMBERS', key], zset: ['ZRANGE', key, 0, -1, 'WITHSCORES'] })[type];
async function scan(pattern) {
  let cursor = '0'; const keys = new Set();
  do { const [r] = await pipe([['SCAN', cursor, 'MATCH', pattern, 'COUNT', 500]]); cursor = String(r[0]); r[1].forEach(k => keys.add(k)); if (keys.size > 20000) throw Error('Scan limit exceeded'); } while (cursor !== '0');
  return [...keys].sort();
}
async function capture() {
  const prefix = workspace === 'zarechie' ? 'coach' : 'nkperf';
  const keys = (await scan(`${prefix}:*`)).filter(k => shouldIncludeBackupKey(workspace, k));
  const types = await pipe(keys.map(k => ['TYPE', k]));
  const entries = keys.map((key, i) => ({ key, type: types[i] })).filter(e => read(e.key, e.type));
  const values = await pipe(entries.map(e => read(e.key, e.type)));
  const ttls = await pipe(entries.map(e => ['PTTL', e.key]));
  return { schemaVersion: 2, workspace, id: crypto.randomUUID(), createdAt: new Date().toISOString(), entries: entries.map((e, i) => ({ ...e, value: values[i], ttlMs: ttls[i] })) };
}
const result = await get(pathname, { access: 'private', useCache: false, token });
if (result?.statusCode !== 200) throw Error('Archive unavailable');
const chunks = []; let bytes = 0;
for await (const c of result.stream) { bytes += c.length; if (bytes > 80000000) throw Error('Archive too large'); chunks.push(Buffer.from(c)); }
const encrypted = Buffer.concat(chunks);
const source = decodeBackup(encrypted, secret);
if (source.workspace !== workspace) throw Error('Archive workspace mismatch');
const before = await capture();
const current = new Map(before.entries.map(e => [e.key, e]));
const candidates = source.entries.filter(e => isHistoryRecoveryKey(workspace, e.key)).filter(e => missingHistoryCommand(e, workspace, source.createdAt));
const conflicts = candidates.filter(e => current.has(e.key) && (current.get(e.key).type !== e.type || !redisValuesMatch(e.type, e.value, current.get(e.key).value)));
const countPlans = snapshot => snapshot.entries.filter(e => /^(coach|nkperf):session:[^:]+:\d{4}-\d{2}-\d{2}$/.test(e.key)).length;
const summary = { workspace, source: pathname, capturedAt: before.createdAt, eligible: candidates.length, absent: candidates.filter(e => !current.has(e.key)).length, existingDifferences: conflicts.map(e => e.key), beforeSessions: countPlans(before) };
console.log(JSON.stringify({ phase: 'plan', ...summary }));
if (apply) {
  const incident = `operations/incidents/history-2026-09-09/${workspace}/${before.id}`;
  const beforeBytes = encodeBackup(before, secret);
  for (const [suffix, body] of [['before', beforeBytes], ['source', encrypted]]) {
    const blob = await put(`${incident}-${suffix}.backup`, body, { access: 'private', addRandomSuffix: false, allowOverwrite: false, token, contentType: 'application/octet-stream' });
    const check = await get(blob.pathname, { access: 'private', useCache: false, token });
    if (check?.statusCode !== 200) throw Error('Safety archive read-back failed');
    const parts = []; for await (const c of check.stream) parts.push(Buffer.from(c));
    const readBack = Buffer.concat(parts);
    if (!readBack.equals(body)) throw Error('Safety archive mismatch');
    decodeBackup(readBack, secret);
  }
  console.log(JSON.stringify({ phase: 'protected', incident }));
  const results = await pipe(candidates.map(e => missingHistoryCommand(e, workspace, source.createdAt)).filter(Boolean));
  if (results.some(r => r === -1)) throw Error('Type conflict: inspect before retry');
  const after = await capture();
  const afterMap = new Map(after.entries.map(e => [e.key, e]));
  const missing = candidates.filter(e => !afterMap.has(e.key));
  if (missing.length) throw Error(`Verification: ${missing.length} keys absent`);
  for (const entry of candidates.filter(e => /:(sessions|exhist|gym_tonnage_dates):/.test(e.key))) {
    const actual = new Map(canonicalRedisValue(entry.type, afterMap.get(entry.key).value));
    const previous = current.get(entry.key);
    const expected = new Map([...canonicalRedisValue(entry.type, entry.value), ...(previous ? canonicalRedisValue(previous.type, previous.value) : [])]);
    for (const [member, value] of expected) if (actual.get(member) !== value) throw Error('Historical member preservation check failed');
  }
  // Every original scalar/list must remain exactly intact; collection merges
  // are checked separately below and only add missing members/fields.
  const lost = before.entries.filter(e => !afterMap.has(e.key) || (!/:(sessions|exhist|gym_tonnage_dates):/.test(e.key) && !redisValuesMatch(e.type, e.value, afterMap.get(e.key).value)));
  if (lost.length) throw Error(`Concurrent changes or unexpected differences in ${lost.length} pre-existing records; inspect incident archive`);
  const verifiedMissing = candidates.filter(e => !current.has(e.key));
  if (verifiedMissing.some(e => !redisValuesMatch(e.type, e.value, afterMap.get(e.key).value))) throw Error('Restored value differs from archive');
  const report = { ...summary, incident, applied: true, afterSessions: countPlans(after), restoredKeys: verifiedMissing.length, preexistingPreserved: true };
  await put(`${incident}-after.backup`, encodeBackup(after, secret), { access: 'private', addRandomSuffix: false, allowOverwrite: false, token });
  fs.writeFileSync(`/private/tmp/nk-history-recovery-${workspace}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ phase: 'verified', ...report }));
}
