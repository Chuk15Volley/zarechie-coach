import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStrengthCycle,recordCoachReplacements,strengthExercises} from '../lib/strengthCycle.mjs';
import {buildStrengthDevelopmentDraft,strengthReplacementCandidate} from '../lib/strengthDevelopmentDraft.mjs';
import {buildExerciseVarietyContext,auditExerciseVariety,varietyExerciseKey,formatExerciseVarietyForPrompt} from '../lib/exerciseVariety.mjs';
import {replaceExerciseDescription} from '../lib/exerciseReplacement.mjs';
import {programCopySession} from '../lib/programCopy.mjs';
import {buildCoachAdaptation} from '../lib/coachAdaptation.mjs';
const day=n=>`2026-10-${String(12+n).padStart(2,'0')}`;
const make=(options={})=>buildStrengthDevelopmentDraft({snapshot:{player:{position:'Диагональная'}},recommendation:{calendar:{daysToGame:5},state:{}},date:day(0),manualMethodSelection:true,strengthMode:'maintenance',...options});
const ex=(r,code)=>strengthExercises(r.session).find(e=>e.code===code);

for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: four saved dates retain anchors, regenerate idempotently, then start next cycle`,()=>{
 const history=[];let first;
 for(let i=0;i<5;i++){
  const r=make({strengthMode,date:day(i*2),recentSessions:history});
  assert.equal(r.quality.valid,true,JSON.stringify(r.quality.checks.filter(c=>!c.ok)));
  assert.equal(r.session.methodology.strengthCycle.position,i%4+1);
  if(i===0) first=r;
  if(i>0 && i<4) for(const code of ['A1','B1','B2'])assert.equal(ex(r,code).name,ex(first,code).name);
  const regenerated=make({strengthMode,date:day(i*2),recentSessions:[...history,r]});
  assert.deepEqual(regenerated.session.methodology.strengthCycle,r.session.methodology.strengthCycle);
  history.push(r);
 }
 assert.notEqual(ex(history[4],'A1').name,ex(first,'A1').name);
 const shifted=structuredClone(first.session);shifted.blocks[2].exercises[0]={...ex(first,'A1'),code:'C1'};
 const variety=buildExerciseVarietyContext([first],{targetDate:day(1),focus:'inseason_strength',trainingType:'full_body'});
 assert.equal(auditExerciseVariety(shifted,variety).ok,false,'anchor exception belongs to exact slot');
});

for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: adjacent opposite chains keep their main emphasis and reduce overlapping work`,()=>{
 const front=make({strengthMode,trainingType:'anterior_chain'});
 const back=make({strengthMode,date:day(1),trainingType:'posterior_chain',recentSessions:[front]});
 assert.equal(front.quality.valid,true);assert.equal(back.quality.valid,true);
 assert.equal(ex(front,'A1').targetRpeMax,8);assert.equal(ex(front,'B1').targetRpeMax,8);assert.equal(ex(front,'B2').targetRpeMax,6);
 assert.equal(ex(back,'B2').targetRpeMax,8);assert.equal(ex(back,'B1').targetRpeMax,6);
 assert.equal(ex(back,'A1').targetSets.length,2);assert.equal(ex(back,'A1').targetRpeMax,7);
 assert.equal(back.session.methodology.adjacentSession,front.date);
 const same=make({strengthMode,date:day(1),trainingType:'anterior_chain',recentSessions:[front]});
 assert.equal(ex(same,'A1').targetRpeMax,6);assert.equal(ex(same,'B1').targetRpeMax,6);
 const again=make({strengthMode,date:day(3),trainingType:'anterior_chain',recentSessions:[front,back]});
 assert.equal(ex(again,'A1').name,ex(front,'A1').name);
 assert.notEqual(ex(again,'C1').name,ex(front,'C1').name,'accessory changes on next exposure of this chain');
 assert.equal(ex(again,'A1').targetRpeMax,8,'no blanket weekly cap');
});

for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: calf symptoms unload related tasks while healthy upper body keeps its dose`,()=>{
 const date=day(0);
 const healthy=make({strengthMode});
 const adapted=make({strengthMode,snapshot:{player:{position:'Диагональная'},latestMorning:{date,zoneDetails:{'Икроножная левая':{type:'pain',level10:4}}}},sourceState:{level:'red',capPercent:0,hardStop:true},coachRecovery:'red'});
 assert.equal(adapted.quality.valid,true);assert.equal(adapted.quality.medicalReviewRequired,true);
 for(const code of ['B1','B2']){
  assert.equal(ex(adapted,code).targetRpeMax,8);
  assert.equal(ex(adapted,code).targetSets.length,ex(healthy,code).targetSets.length);
 }
 assert.match(ex(adapted,'B2').name,/Chest-Supported/);
 assert.ok(strengthExercises(adapted.session).filter(e=>e.symptomAdapted).every(e=>e.weightKg===null&&e.targetRpeMax<=4));
 assert.ok(strengthExercises(adapted.session).every(e=>!/Calf Raise|Hamstring Curl|Lunge|Split Squat/.test(e.name)));
 const hold=buildCoachAdaptation({snapshot:{injuryLog:[{date,status:'active',note:'Запрет врача'}]},recommendation:{state:{},reasons:[]},date,focus:'inseason_strength',manualMethodSelection:true});
 assert.equal(hold.session.blocks.length,0);
});

test('saved coach replacements retain reasons, change future selection and can be explicitly restored',()=>{
 const first=make();const original=ex(first,'B1');
 const patched=replaceExerciseDescription(original,{name:'DB Incline Bench Press'});
 assert.equal(patched.weightKg,null);assert.equal(patched.loadEvidence,null);
 let changed=structuredClone(first.session);
 changed.blocks[1].exercises[0]={...patched,replacementReason:'preference',replacementNote:'Удобнее контролировать плечи'};
 changed=recordCoachReplacements(changed,first.session,first.date);
 assert.equal(changed.coachReplacements[0].reason,'preference');assert.equal(changed.coachReplacements[0].note,'Удобнее контролировать плечи');
 assert.equal(recordCoachReplacements(changed,changed,first.date).coachReplacements.length,1,'resave does not duplicate events');
 const next=make({date:day(7),recentSessions:[{...first,session:changed}]});
 assert.equal(ex(next,'B1').name,'DB Incline Bench Press');
 assert.ok(next.session.methodology.strengthCycle.position===2);
 const transient=structuredClone(changed);transient.coachReplacements[0].reason='one_off';
 assert.deepEqual(buildStrengthCycle([{...first,session:transient}],{targetDate:day(7)}).avoid,[]);
 changed.coachReplacements.push({from:'DB Incline Bench Press',to:original.name,reason:'restore',date:first.date});
 const restored=buildStrengthCycle([{...first,session:changed}],{targetDate:day(7)});
 assert.equal(restored.avoid.length,0);
 const copy=programCopySession(changed);
 assert.equal(copy.coachReplacements,undefined);assert.equal(copy.methodology,undefined);assert.ok(strengthExercises(copy).every(e=>!e.replacementReason));
});

test('reviewed single-exercise replacement preserves regional effort and refuses transferring kg',()=>{
 const r=make();const exercise={...ex(r,'B1'),weightKg:24};
 const varietyContext=buildExerciseVarietyContext([],{targetDate:r.date,focus:r.focus});
 const candidate=strengthReplacementCandidate({exercise,session:r.session,varietyContext,symptoms:{zones:['shoulder']}});
 assert.ok(candidate);assert.equal(candidate.symptomAdapted,true);assert.equal(candidate.weightKg,null);assert.equal(candidate.targetRpeMax,4);assert.equal(candidate.replacementFrom,exercise.name);
 const normal=strengthReplacementCandidate({exercise,session:r.session,varietyContext});
 assert.ok(normal);assert.equal(normal.targetRpeMax,8);assert.equal(normal.weightKg,null);assert.deepEqual(normal.targetSets,exercise.targetSets);
});

for(const workspace of ['zarechie','nkperf'])test(`${workspace}: save persists replacement learning with the workout and refuses cross-workspace leakage`,async()=>{
 const source=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const first=make();let next=structuredClone(first.session);
 next.blocks[1].exercises[0]={...replaceExerciseDescription(ex(first,'B1'),{name:'DB Incline Bench Press'}),replacementReason:'technique',replacementNote:'Сохраняем устойчивую позицию'};
 const identity=v=>v;let written=[];
 const deps={recordCoachReplacements,validCopyRepeatException:()=>false,sessionPlayerAliases:id=>[id],getPlayerTimeZone:async()=>'Europe/Moscow',isAuthorized:()=>true,coachBannedSessionExercises:()=>[],
  redis:async(_cmd,key)=>{assert.match(key,new RegExp('^'+workspace+':'));return JSON.stringify(first);},sessionKey:(ws,id,date)=>`${ws}:session:${id}:${date}`,sessionsKey:(ws,id)=>`${ws}:sessions:${id}`,
  getRecentSessionRecords:async(_id,_depth,ws)=>{assert.equal(ws,workspace);return [];},reconcileReplacementDescriptions:identity,approveProgramSession:identity,normalizeSessionTempoDescriptions:identity,ensureSessionExerciseIds:identity,sanitizeUnavailableEquipmentExercises:identity,
  weightKgFromExercise:()=>0,loadUnitsForExercise:()=>1,approvedProgramLabel:identity,advisorySessionQuality:identity,assessSessionQuality:()=>({blocking:false,variety:{needsCorrection:false}}),buildExerciseVarietyContext:()=>({}),buildDosePrescription:()=>({}),redisPipeline:async cmds=>{written=cmds;}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'POST',body:{playerId:'synthetic',workspace,date:first.date,focus:first.focus,session:next}},res);
 assert.equal(res.code,200);assert.ok(written.every(command=>String(command[1]).startsWith(workspace+':')));
 const saved=JSON.parse(written.find(command=>command[0]==='SET')[2]);
 assert.equal(saved.session.coachReplacements.at(-1).reason,'technique');
 assert.equal(saved.session.coachReplacements.at(-1).from,ex(first,'B1').name);
});

for(const workspace of ['zarechie','nkperf'])test(`${workspace}: new strength replacement stays server-side, checks fresh symptoms and waits for coach save`,async()=>{
 const source=readFileSync(new URL('../pages/api/programs/regenerate-exercise.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const first=make();let writes=0,external=0;
 const identity=v=>v;
 const deps={recordCoachReplacements,strengthReplacementCandidate,prehabSymptoms:()=>({zones:['shoulder']}),medicalHoldReason:()=>'',
  getPlayerSnapshot:async(_id,_days,_date,_history,ws)=>{assert.equal(ws,workspace);return {readySixMeta:{},player:{}};},recommendGymSession:()=>({state:{}}),restrictionsKey:(ws,id)=>`${ws}:restrictions:${id}`,
  isAuthorized:()=>true,enforceRateLimit:async()=>true,redis:async cmd=>{if(cmd!=='get') writes++;return null;},sessionKey:(ws,id,date)=>`${ws}:${id}:${date}`,getRecentSessionRecords:async()=>[],
  buildExerciseVarietyContext,auditExerciseVariety,varietyExerciseKey,formatExerciseVarietyForPrompt,
  coachBannedSessionExercises:()=>[],isCoachBannedExercise:()=>false,isSledExercise:()=>false,normalizeSessionTempoDescriptions:identity,
  gymProviderFetch:async()=>{external++;throw new Error('External call forbidden');}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'POST',body:{playerId:'synthetic',date:first.date,workspace,focus:first.focus,session:first.session,blockIndex:1,exerciseIndex:0}},res);
 assert.equal(res.code,200,JSON.stringify(res.body));assert.equal(res.body.exercise.symptomAdapted,true);assert.equal(res.body.exercise.targetRpeMax,4);
 assert.equal(writes,0);assert.equal(external,0);
});
