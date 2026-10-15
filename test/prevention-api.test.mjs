import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import source from '../lib/prevention/low-back-resilience.json' with { type: 'json' };
import { DEFAULT_RESTS } from '../lib/prevention/model.mjs';
import { hasRestriction, isCoachBannedExercise } from '../lib/exerciseRestrictions.js';
import { readySixGymState } from '../lib/readySixGym.mjs';
import { medicalHoldReason } from '../lib/medicalHold.mjs';

const db = new Map(), indices = new Map(), medical = new Map();
const redis = async (method, ...args) => {
  const [key] = args;
  if (method.toLowerCase() === 'get') return db.get(key) ?? null;
  if (method.toLowerCase() === 'zrevrange') return [...(indices.get(key) || new Map())].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  if (method.toLowerCase() === 'eval') {
    const [, count, ...rest] = args, keys = rest.slice(0, Number(count)), values = rest.slice(Number(count));
    if ((db.get(keys[0]) || '') !== values[0]) return 0;
    db.set(keys[0], values[1]);
    if (Number(count) === 3) { db.set(keys[1], values[2]); const map = indices.get(keys[2]) || new Map(); map.set(values[4], Number(values[3])); indices.set(keys[2], map); }
    return 1;
  }
  throw new Error('Unexpected Redis command ' + method);
};
const harness = {
  source, redis, redisPipeline: commands => Promise.all(commands.map(([method, ...args]) => redis(method, ...args))), pfx: w => w === 'nkperf' ? 'nkperf' : 'coach',
  workspaceRoster: async () => ({ players: [{ id: 'whoop_123', name: 'Synthetic A' }, { id: '456', name: 'Synthetic B' }] }),
  gymIdentityAliases: id => [...new Set([id, id.replace(/^whoop_/, ''), 'whoop_' + id.replace(/^whoop_/, '')])],
  getPlayerSnapshot: async id => medical.get(id) || { injuryLog: [], readySixDecision: { recommendation: 'full', restrictions: [], reasons: [] } },
  hasRestriction, isCoachBannedExercise, readySixGymState, medicalHoldReason,
  isAuthorized: req => req.headers?.['x-api-key'] === 'synthetic-coach', coachAuditActor: () => ({ role: 'coach', id: null }), enforceRateLimit: async () => true,
  resolveShareToken: async token => token === 'synthetic-nk-token' ? { workspace: 'nkperf', playerId: '123' } : token === 'synthetic-z-token' ? { workspace: 'zarechie', playerId: '123' } : token === 'synthetic-other-token' ? { workspace: 'nkperf', playerId: '456' } : null,
};
globalThis.__preventionApiHarness = harness;
async function loadStore() {
  let text = readFileSync(new URL('../lib/prevention/store.js', import.meta.url), 'utf8');
  text = text.replace(/import source from '[^']+';/, 'const {source}=globalThis.__preventionApiHarness;');
  text = text.replace(/import \{([^}]+)\} from '([^']+)';/g, (line, names, path) => path === './model.mjs' ? `import {${names}} from '${new URL('../lib/prevention/model.mjs', import.meta.url).href}';` : `const {${names}}=globalThis.__preventionApiHarness;`);
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
}
const store = await loadStore(); Object.assign(harness, store);
async function loadRoute(path) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/import \{([^}]+)\} from '[^']+';/g, (_, names) => `const {${names}}=globalThis.__preventionApiHarness;`);
  return (await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'))).default;
}
const coach = await loadRoute('../pages/api/prevention/assignments.js'), player = await loadRoute('../pages/api/player/prevention.js'), catalogue = await loadRoute('../pages/api/prevention/catalogue.js');
async function call(route, body, { method = 'POST', authorized = true } = {}) {
  const response = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await route({ method, headers: authorized ? { 'x-api-key': 'synthetic-coach' } : {}, ...(method === 'GET' ? { query: body } : { body }) }, response);
  return response;
}
const request = () => ({ workspace: 'nkperf', playerId: 'whoop_123', requestId: 'assign-' + crypto.randomUUID(), action: 'assign', expectedCatalogueRevision: 0, scope: 'phase', phase: 1, mainSets: 2, stretchSets: 2, stretch: false, rests: DEFAULT_RESTS, reviewed: true, note: '' });
const progress = (a, action, extra = {}) => ({ token: 'synthetic-nk-token', assignmentId: a.id, requestId: 'action-' + crypto.randomUUID(), expectedRevision: a.revision, sessionIndex: a.cursor, action, ...extra });

test('prevention coach endpoints require authentication and valid workspace membership', async () => {
  assert.equal((await call(coach, request(), { authorized: false })).code, 401);
  assert.equal((await call(catalogue, { workspace: 'nkperf' }, { method: 'GET', authorized: false })).code, 401);
  assert.equal((await call(coach, { ...request(), workspace: 'foreign' })).code, 400);
  assert.equal((await call(coach, { ...request(), playerId: 'foreign-player' })).code, 404);
  assert.equal(db.size, 0);
});
test('assignment replay is idempotent and numeric/WHOOP identities share progress', async () => {
  const body = request(), saved = await call(coach, body); assert.equal(saved.code, 200);
  const retry = await call(coach, body); assert.equal(retry.code, 200); assert.equal(retry.data.assignment.id, saved.data.assignment.id);
  const listed = await call(player, { token: 'synthetic-nk-token' }, { method: 'GET', authorized: false }); assert.equal(listed.data.assignments.length, 1);
  assert.equal((await call(coach, { ...body, phase: 2 })).code, 409);
});
test('share token scopes every read/write even when client spoofs space and player', async () => {
  const created = (await call(coach, request())).data.assignment;
  for (const token of ['synthetic-other-token', 'synthetic-z-token', 'revoked-token']) {
    assert.equal((await call(player, { token, assignmentId: created.id, workspace: 'nkperf', playerId: '123' }, { method: 'GET', authorized: false })).code, 404);
  }
  assert.equal((await call(player, { ...progress(created, 'archive') }, { authorized: false })).code, 400);
  assert.equal((await call(player, { ...progress(created, 'mark', { key: 'A1:0', done: true }), token: 'synthetic-other-token' }, { authorized: false })).code, 404);
});
test('two devices cannot overwrite progress; acknowledged retries are harmless', async () => {
  const a = (await call(coach, request())).data.assignment;
  const one = progress(a, 'mark', { key: 'A1:0', done: true }), two = progress(a, 'mark', { key: 'A2:0', done: true });
  const results = await Promise.all([call(player, one), call(player, two)]); assert.deepEqual(results.map(r => r.code).sort(), [200, 409]);
  const winner = results.find(r => r.code === 200), retried = await call(player, results[0].code === 200 ? one : two);
  assert.equal(retried.code, 200); assert.equal(retried.data.assignment.revision, winner.data.assignment.revision);
  assert.equal((await call(player, progress(winner.data.assignment, 'complete'))).code, 409);
});
test('physician holds and coach restrictions bind, automatic ReadySix red alone does not suppress a manually reviewed course', async () => {
  medical.set('whoop_123', { injuryLog: [], readySixDecision: { recommendation: 'load_stop', capPercent: 0, restrictions: [], reasons: ['Автоматический красный статус'] } });
  assert.equal((await call(coach, request())).code, 200);
  medical.set('whoop_123', { injuryLog: [{ status: 'active', date: '2026-01-01', note: 'запрет врача' }], readySixDecision: { recommendation: 'full' } });
  assert.equal((await call(coach, request())).code, 409); medical.clear();
  db.set('nkperf:restrictions:123', JSON.stringify(['WRIST'])); assert.equal((await call(coach, request())).code, 409); db.delete('nkperf:restrictions:123');
  db.set('nkperf:restrictions:whoop_123', JSON.stringify(['WRIST'])); assert.equal((await call(coach, request())).code, 409); db.delete('nkperf:restrictions:whoop_123');
});
test('manual source fixes are workspace-scoped and require the current catalogue edition', async () => {
  const id = source[47].exercises[2].sourceId;
  const fixed = await call(catalogue, { workspace: 'nkperf', expectedRevision: 0, sourceId: id, patch: { name: '90/90 Hip Rotation No Hands', video: 'https://youtu.be/Y-L0s5uSQ-E', note: 'Исправлено тренером.' } }); assert.equal(fixed.code, 200);
  const z = await call(catalogue, { workspace: 'zarechie' }, { method: 'GET' }); assert.equal(z.data.course.revision, 0);
  assert.equal(fixed.data.course.sessions[47].exercises[2].name, '90/90 Hip Rotation No Hands');
  assert.equal((await call(catalogue, { workspace: 'nkperf', expectedRevision: 0, sourceId: id, patch: { name: 'Stale edit' } })).code, 409);
  assert.equal((await call(catalogue, { workspace: 'nkperf', expectedRevision: 1, sourceId: id, patch: { video: 'javascript:alert(1)' } })).code, 400);
});
