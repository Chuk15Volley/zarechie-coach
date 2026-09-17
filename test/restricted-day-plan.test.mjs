import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restrictedDayPlan } from '../lib/restrictedDayPlan.mjs';
import { recommendGymSession } from '../lib/readySixGym.mjs';

test('load stop produces a completed day plan without exercise or invented clearance', () => {
  const snapshot = { player: { id: 'synthetic' }, readySixDecision: {
    recommendation: 'load_stop', capPercent: 0, hardStopSignal: true,
    reasons: ['Ограничение источника'], restrictions: ['Исключить осевую нагрузку'],
  } };
  const recommendation = recommendGymSession({ snapshot, targetDate: '2026-09-17' });
  const result = restrictedDayPlan({ snapshot, recommendation, date: '2026-09-17' });
  assert.equal(result.session.kind, 'restricted_day_plan');
  assert.deepEqual(result.session.blocks, []);
  assert.match(result.session.warnings, /Исключить осевую нагрузку/);
  assert.equal(result.autoSaved, false);
  assert.equal(result.quality.medicalReviewRequired, true);
  assert.match(result.session.assessment, /обновить решение в ReadySix/);
});

test('day without gym follows schedule instead of prescribing recovery exercises', () => {
  const result = restrictedDayPlan({ snapshot: {player: {id:'synthetic'}}, date:'2026-09-17',
    recommendation: { key:'no_gym', state:{label:'Выходной'}, reasons:['Подтверждён выходной'] } });
  assert.deepEqual(result.session.blocks, []);
  assert.match(result.session.assessment, /подтверждённому расписанию/);
});

function handler(file, deps) {
  const source = readFileSync(new URL(`../pages/api/programs/${file}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export const config', 'const config').replace('export default async function', 'async function');
  return new Function(...Object.keys(deps), `${source}; return handler;`)(...Object.values(deps));
}

test('queued restriction completes without model calls or workout writes, including refresh', async t => {
  const original = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'synthetic';
  t.after(() => { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original; });
  const result = restrictedDayPlan({ snapshot:{player:{id:'synthetic'}}, date:'2026-09-17',
    recommendation:{key:'review',state:{label:'Стоп',hardStop:true},reasons:[]} });
  let stored;
  const deps = { isAuthorized:()=>true, enforceRateLimit:async()=>true,
    crypto:{randomUUID:()=> '11111111-1111-1111-1111-111111111111'},
    buildGenerationInputs:async()=>({readyResult:result}),
    redis:async(cmd,key,value)=> { assert.match(key,/^coach:batch:/); if(cmd==='set') stored=JSON.parse(value); else return stored; },
  };
  const response=()=>({status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  let res=response();
  await handler('generate-async.js',deps)({method:'POST',body:{playerId:'synthetic',workspace:'nkperf'}},res);
  assert.equal(res.code,200); assert.equal(stored.status,'done'); assert.equal(stored.autoSaved,false);
  const batchId=res.body.batchId;
  for (const refresh of [false,true]) {
    if(refresh) stored={playerId:'synthetic',workspace:'nkperf',status:'pending',generationRequest:{}};
    res=response(); await handler('generate-status.js',deps)({method:'GET',query:{batchId}},res);
    assert.equal(res.code,200); assert.equal(res.body.status,'done');
    assert.deepEqual(res.body.session.blocks,[]); assert.equal(res.body.autoSaved,false);
  }
});
