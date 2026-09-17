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


function regionalFixture() {
  const snapshot = { player: { id:'synthetic' }, readySixDecision: { recommendation:'load_stop',
    capPercent:0, hardStopSignal:true, reasons:['Запрещена осевая нагрузка'], targets:[
      {target:'strength_upper',capPercent:0,healthCapPercent:100,healthRecommendation:'full',hardStopSignal:false,planApplicability:'not_planned'},
      {target:'strength_lower',capPercent:0,healthCapPercent:0,healthRecommendation:'load_stop',hardStopSignal:true},
    ] } };
  return {snapshot,recommendation:recommendGymSession({snapshot,targetDate:'2026-09-17'}),date:'2026-09-17'};
}

test('regional upper permission generates eight real draft sets despite a rest-day zero cap', () => {
  const input=regionalFixture(); const original=structuredClone(input);
  const result=restrictedDayPlan({...input,playerRestrictions:['AXIAL','JUMP']});
  assert.equal(result.session.kind,'restricted_training_draft');
  const exercises=result.session.blocks.flatMap(b=>b.exercises);
  assert.equal(exercises.length,4); assert.equal(exercises.reduce((n,e)=>n+e.targetSets.length,0),8);
  assert.ok(exercises.every(e=>e.weightKg===undefined && /Supported/.test(e.name)));
  assert.ok(exercises.every(e=>e.alternatives.length===0));
  assert.equal(result.autoSaved,false); assert.equal(result.quality.medicalReviewRequired,true);
  assert.equal(result.quality.readySixState.hardStop,true);
  assert.deepEqual(input,original,'do not rewrite source health or calendar decisions');
});

for(const change of ['missing','blocked','partial','unknown','duplicate','shoulder','wrist']) {
 test(`no upper draft without clear compatible permission: ${change}`,()=>{
  const input=regionalFixture();
  const upper=input.recommendation.state.targets[0];
  if(change==='missing') input.recommendation.state.targets=[];
  if(change==='blocked') upper.hardStopSignal=true;
  if(change==='partial') upper.healthCapPercent=20;
  if(change==='unknown') delete upper.healthCapPercent;
  if(change==='duplicate') input.recommendation.state.targets.push({...upper});
  const restrictions=change==='shoulder'?['SHOULDER']:change==='wrist'?['WRIST']:[];
  assert.equal(restrictedDayPlan({...input,playerRestrictions:restrictions}).session.kind,'restricted_day_plan');
 });
}
