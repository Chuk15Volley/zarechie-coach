// Explicit, audited bootstrap. Never infer a baseline from a possibly damaged
// latest archive; prove every archived session is present before publishing.
import { get, put } from '@vercel/blob';
import { decodeBackup } from '../lib/backupCodec.mjs';
import { sessionInventory, compareSessionInventory } from '../lib/backupIntegrity.mjs';
import { redisPipeline } from '../lib/redis.js';
const [workspace, pathname] = process.argv.slice(2);
if (!['zarechie', 'nkperf'].includes(workspace) || !pathname?.startsWith(`operations/backups/${workspace}/`)) throw Error('Explicit audited archive required');
const token = process.env.BACKUP_READ_WRITE_TOKEN;
const result = await get(pathname, { access: 'private', useCache: false, token });
if (result?.statusCode !== 200) throw Error('Archive unavailable');
const chunks = []; for await (const c of result.stream) chunks.push(Buffer.from(c));
const snapshot = decodeBackup(Buffer.concat(chunks), process.env.BACKUP_ENCRYPTION_KEY);
if (snapshot.workspace !== workspace) throw Error('Workspace mismatch');
const inventory = sessionInventory(snapshot);
const prefix = workspace === 'zarechie' ? 'coach' : 'nkperf';
const ids = Object.keys(inventory.players);
const rows = await redisPipeline(ids.map(id => ['ZRANGE', `${prefix}:sessions:${id}`, 0, -1]));
const comparison = compareSessionInventory(inventory, { workspace, players: Object.fromEntries(ids.map((id, index) => [id, rows[index] || []])) });
if (!comparison.ok) throw Error(`${comparison.missingCount} archived dates missing; baseline not initialized`);
const keys = Object.entries(inventory.players).flatMap(([id, dates]) => dates.map(date => `${prefix}:session:${id}:${date}`));
for (let i = 0; i < keys.length; i += 100) {
  const exists = await redisPipeline(keys.slice(i, i + 100).map(key => ['EXISTS', key]));
  if (exists.some(value => Number(value) !== 1)) throw Error('Archived session records missing');
}
const path = `operations/integrity/${workspace}/session-baseline.json`;
await put(path, JSON.stringify(inventory), { access: 'private', token, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', cacheControlMaxAge: 60 });
console.log(JSON.stringify({ workspace, verifiedSessions: inventory.sessionCount, source: pathname, baseline: path }));
