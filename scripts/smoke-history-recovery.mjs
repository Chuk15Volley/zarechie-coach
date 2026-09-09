import assert from 'node:assert/strict';
import { get } from '@vercel/blob';
const workspace = 'zarechie';
const base = 'https://zarechie-coach-pied.vercel.app';
const response = await get(`operations/integrity/${workspace}/session-baseline.json`, { access: 'private', useCache: false, token: process.env.BACKUP_READ_WRITE_TOKEN });
const chunks = []; for await (const c of response.stream) chunks.push(Buffer.from(c));
const inventory = JSON.parse(Buffer.concat(chunks).toString());
const headers = { Authorization: `Bearer ${process.env.TRAINER_API_KEY}` };
let checked = 0;
for (const [id, dates] of Object.entries(inventory.players)) {
  const history = await fetch(`${base}/api/players/sessions?workspace=${workspace}&playerId=${encodeURIComponent(id)}&limit=40`, { headers, signal: AbortSignal.timeout(20000) });
  assert.equal(history.status, 200);
  const body = await history.json();
  assert.ok(body.sessions.some(s => s.date >= '2026-08-01'));
  const latest = dates.at(-1);
  const saved = await fetch(`${base}/api/programs/get?workspace=${workspace}&playerId=${encodeURIComponent(id)}&date=${latest}`, { headers, signal: AbortSignal.timeout(20000) });
  assert.equal(saved.status, 200);
  assert.ok((await saved.json()).record?.session?.blocks?.length);
  checked++;
}
console.log(JSON.stringify({ pass: true, workspace, playersChecked: checked, baselinePlans: inventory.sessionCount, historyAndSavedWorkoutApi: 'PASS' }));
