import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import source from '../lib/prevention/low-back-resilience.json' with { type: 'json' };
import { preventionCourses } from '../lib/prevention/catalogue.mjs';
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
  source, preventionCourses, redis, redisPipeline: commands => Promise.all(commands.map(([method, ...args]) => redis(method, ...args))), pfx: w => w === 'nkperf' ? 'nkperf' : 'coach',
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
  text = text.replace(/import \{([^}]+)\} from '([^']+)';/g, (line, names, path) => ['./model.mjs', './catalogue.mjs'].includes(path) ? `import {${names}} from '${new URL('../lib/prevention/' + path.slice(2), import.meta.url).href}';` : `const {${names}}=globalThis.__preventionApiHarness;`);
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

test('regional catalogues isolate edits, reject cross-course sources and keep the legacy back key', async () => {
  const knee = await call(catalogue, { workspace: 'nkperf', courseId: 'knee-resilience' }, { method: 'GET' });
  assert.equal(knee.code, 200); assert.equal(knee.data.courses.length, 12); assert.equal(knee.data.course.revision, 0);
  assert.equal((await call(catalogue, { workspace: 'nkperf', courseId: 'missing' }, { method: 'GET' })).code, 404);
  const id = knee.data.course.sessions[0].exercises[0].sourceId;
  assert.equal((await call(catalogue, { workspace: 'nkperf', expectedRevision: 1, sourceId: id, patch: { name: 'Wrong course' } })).code, 404);
  const fixed = await call(catalogue, { workspace: 'nkperf', courseId: 'knee-resilience', expectedRevision: 0, sourceId: id, patch: { name: 'Corrected Downdog' } });
  assert.equal(fixed.code, 200);
  assert.ok(db.has('nkperf:prevention:catalogue:v1')); assert.ok(db.has('nkperf:prevention:catalogue:v1:knee-resilience'));
  assert.equal((await call(catalogue, { workspace: 'zarechie', courseId: 'knee-resilience' }, { method: 'GET' })).data.course.revision, 0);
  assert.equal((await call(catalogue, { workspace: 'nkperf' }, { method: 'GET' })).data.course.revision, 1);
});
test('knee assignments, refresh and replay remain scoped to the assigned program', async () => {
  const body = { ...request(), courseId: 'knee-resilience', mainSets: 3, mobility: true, mobilitySets: 3, expectedCatalogueRevision: 1 };
  const result = await call(coach, body); assert.equal(result.code, 200);
  const a = result.data.assignment; assert.equal(a.region, 'Колено'); assert.equal(a.sessions[0].exercises.length, 8);
  assert.equal((await call(coach, body)).code, 200);
  assert.equal((await call(coach, { ...body, courseId: 'low-back-resilience' })).code, 409);
  const refreshed = await call(coach, { workspace: body.workspace, playerId: body.playerId, assignmentId: a.id, action: 'refresh', expectedRevision: a.revision, courseId: 'low-back-resilience' });
  assert.equal(refreshed.code, 200); assert.equal(refreshed.data.assignment.courseId, 'knee-resilience');
  const legacy = await store.assignCourse(await store.preventionIdentity('zarechie', 'whoop_123'), { ...request(), expectedCatalogueRevision: 0 }, null);
  const key = `coach:prevention:player:123:assignment:${legacy.id}`, saved = JSON.parse(db.get(key));
  delete saved.region; delete saved.regionId; db.set(key, JSON.stringify(saved));
  assert.equal((await store.assignCourse(await store.preventionIdentity('zarechie', 'whoop_123'), { ...request(), requestId: legacy.id }, null)).id, legacy.id);
});

test('both shoulder programs have scoped edits, source-based doses, mandatory C/D and safe replay', async () => {
  const body = { ...request(), courseId: 'shoulder-impingement-basic', mainSets: 3, preparationSets: 2, phase: 2 };
  const a = await call(coach, body);assert.equal(a.code,200);assert.equal(a.data.assignment.sessions.length,14);assert.equal(a.data.assignment.region,'Плечо');
  assert.deepEqual(a.data.assignment.sessions[0].exercises.map(e=>e.setCount),[2,2,3,3]);
  assert.equal((await call(coach,body)).code,200);
  assert.equal((await call(coach,{...body,courseId:'shoulder-impingement-comprehensive'})).code,409);
  const id=a.data.assignment.sessions[0].exercises[0].sourceId;
  const fixed=await call(catalogue,{workspace:'nkperf',courseId:body.courseId,expectedRevision:0,sourceId:id,patch:{name:'Coach shoulder fix'}});assert.equal(fixed.code,200);
  const full=await call(catalogue,{workspace:'nkperf',courseId:'shoulder-impingement-comprehensive'},{method:'GET'});assert.equal(full.data.course.revision,0);assert.equal(full.data.course.sessions[12].exercises[0].name,'Quadruped Thoracic Rotation');
  assert.ok(db.has('nkperf:prevention:catalogue:v1:shoulder-impingement-basic'));
  const refreshed=await call(coach,{workspace:'nkperf',playerId:body.playerId,assignmentId:a.data.assignment.id,expectedRevision:a.data.assignment.revision,action:'refresh',courseId:'shoulder-impingement-comprehensive'});assert.equal(refreshed.code,200);assert.equal(refreshed.data.assignment.sessions[0].exercises[0].name,'Coach shoulder fix');
  const comp=await call(coach,{...request(),courseId:'shoulder-impingement-comprehensive',mainSets:3,preparationSets:2,scope:'course'});assert.equal(comp.code,200);assert.equal(comp.data.assignment.sessions.length,48);assert.ok(comp.data.assignment.sessions[0].exercises.some(e=>e.code==='C1'));assert.ok(comp.data.assignment.sessions[0].exercises.some(e=>e.code==='D1'));
});

test('elbow variants, fixed Daily Routine and 1–2 warmup doses roundtrip without changing other catalogues', async () => {
  const ids = ['basic-dumbbell','basic-band','comprehensive-dumbbell','comprehensive-band','daily'].map(s=>'tennis-elbow-'+s);
  for (const workspace of ['zarechie','nkperf']) for (const courseId of ids) {
    const r=await call(catalogue,{workspace,courseId},{method:'GET'});assert.equal(r.code,200);assert.equal(r.data.course.regionId,'elbow');assert.equal(r.data.course.revision,0);
  }
  const base={...request(),courseId:ids[2],mainSets:4,preparationSets:1};
  assert.equal((await call(coach,{...base,preparationSets:3})).code,400);
  const r=await call(coach,base);assert.equal(r.code,200);assert.deepEqual(r.data.assignment.sessions[0].exercises.map(e=>e.setCount),[1,1,4,4,4,4,4]);assert.equal(r.data.assignment.sessions.length,12);
  assert.equal((await call(coach,base)).data.assignment.id,r.data.assignment.id);
  assert.equal((await call(coach,{...base,courseId:ids[3]})).code,409);
  let a=r.data.assignment;
  assert.equal((await call(player,progress(a,'complete'))).code,409);
  for(const e of a.sessions[0].exercises)for(let set=0;set<e.setCount;set++)a=(await call(player,progress(a,'mark',{key:`${e.code}:${set}`,done:true}))).data.assignment;
  const body=progress(a,'complete'),done=await call(player,body);assert.equal(done.code,200);assert.equal(done.data.assignment.cursor,1);assert.equal((await call(player,body)).data.assignment.cursor,1);
  const daily=await call(coach,{...request(),courseId:ids[4],mainSets:1,scope:'course'});assert.equal(daily.code,200);assert.equal(daily.data.assignment.sessions.length,336);assert.deepEqual(daily.data.assignment.sessions[0].exercises.map(e=>e.setCount),[1,1]);
  const editId=r.data.assignment.sessions[0].exercises[0].sourceId;
  assert.equal((await call(catalogue,{workspace:'nkperf',courseId:ids[2],expectedRevision:0,sourceId:editId,patch:{name:'Coach elbow warmup'}})).code,200);
  assert.equal((await call(catalogue,{workspace:'zarechie',courseId:ids[2]},{method:'GET'})).data.course.revision,0);
  assert.equal((await call(catalogue,{workspace:'nkperf',courseId:ids[3]},{method:'GET'})).data.course.sessions[0].exercises[0].name,'Open Book');
  db.set('nkperf:restrictions:123',JSON.stringify(['SHOULDER']));assert.equal((await call(coach,{...request(),courseId:ids[3],mainSets:3,preparationSets:1})).code,409);db.delete('nkperf:restrictions:123');
  db.set('nkperf:restrictions:123',JSON.stringify(['WRIST']));assert.equal((await call(coach,{...request(),courseId:ids[3],mainSets:3,preparationSets:1})).code,409);db.delete('nkperf:restrictions:123');
});

test('new regional assignments keep mixed doses, eight stages, optional Hip D and scoped medical guards', async()=>{
 for(const workspace of ['zarechie','nkperf'])for(const courseId of ['neck-resilience','hip-resilience','ankle-sprain-prehab']){const r=await call(catalogue,{workspace,courseId},{method:'GET'});assert.equal(r.code,200);assert.equal(r.data.courses.length,12);}
 const neckBody={...request(),courseId:'neck-resilience',mainSets:4,extraSets:{neck:3}};
 assert.equal((await call(coach,{...neckBody,extraSets:{neck:4}})).code,400);
 const neckResult=await call(coach,neckBody);assert.equal(neckResult.code,200);assert.equal(neckResult.data.assignment.sessions.length,9);assert.deepEqual(neckResult.data.assignment.sessions[0].exercises.map(e=>e.setCount),[2,2,2,2,3,4]);assert.equal((await call(coach,neckBody)).data.assignment.id,neckResult.data.assignment.id);
 const h=await call(coach,{...request(),courseId:'hip-resilience',mainSets:3,stretch:false});assert.equal(h.code,200);assert.equal(h.data.assignment.sessions[0].exercises.length,8);assert.ok(h.data.assignment.sessions[0].exercises.some(e=>e.code==='C1'));assert.ok(!h.data.assignment.sessions[0].exercises.some(e=>e.code==='D1'));
 const body={...request(),courseId:'ankle-sprain-prehab',mainSets:1,phase:8},a=await call(coach,body);assert.equal(a.code,200);assert.equal(a.data.assignment.sessions.length,4);assert.equal(a.data.assignment.phaseTerm,'Этап');assert.equal((await call(coach,body)).data.assignment.id,a.data.assignment.id);
 assert.equal((await call(coach,{...body,phase:7})).code,409);assert.equal((await call(coach,{...body,requestId:crypto.randomUUID(),phase:9})).code,400);assert.equal((await call(coach,{...request(),courseId:'hip-resilience',mainSets:3,phase:8})).code,400);
 let current=a.data.assignment;current=(await call(player,progress(current,'mark',{key:'W1:0',done:true}))).data.assignment;assert.equal(current.progress['A1:0'],undefined);assert.equal((await call(player,progress(current,'complete'))).code,409);
 const sourceId=current.sessions[0].exercises[0].sourceId;assert.equal((await call(catalogue,{workspace:'nkperf',courseId:body.courseId,expectedRevision:0,sourceId,patch:{name:'Coach ankle source edit'}})).code,200);
 assert.equal((await call(catalogue,{workspace:'zarechie',courseId:body.courseId},{method:'GET'})).data.course.revision,0);
 assert.equal((await call(catalogue,{workspace:'nkperf',courseId:'neck-resilience',expectedRevision:0,sourceId,patch:{name:'Foreign source'}})).code,404);
 const refresh=await call(coach,{workspace:'nkperf',playerId:body.playerId,assignmentId:current.id,action:'refresh',expectedRevision:current.revision});assert.equal(refresh.code,200);assert.equal(refresh.data.assignment.sessions[0].exercises[0].name,current.sessions[0].exercises[0].name);assert.equal(refresh.data.assignment.sessions[1].exercises[0].name,'Coach ankle source edit');
 medical.set('whoop_123',{injuryLog:[{status:'active',date:'2026-01-01',note:'запрет врача'}],readySixDecision:{recommendation:'full'}});assert.equal((await call(coach,{...neckBody,requestId:crypto.randomUUID()})).code,409);medical.clear();
 db.set('nkperf:restrictions:123',JSON.stringify(['WRIST']));assert.equal((await call(coach,{...request(),courseId:'hip-resilience',mainSets:3})).code,409);assert.equal((await call(coach,{...request(),courseId:body.courseId,mainSets:1,phase:1,expectedCatalogueRevision:1})).code,409);db.delete('nkperf:restrictions:123');
});
