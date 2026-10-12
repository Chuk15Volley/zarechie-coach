import test from 'node:test';
import assert from 'node:assert/strict';
import {isCoachBannedExercise,hasRestriction,coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
const banned=['Supine Glute Set','Supine Glute Squeeze','Glute Set (Supine)','Supine Diaphragmatic Breathing','Diaphragmatic Breathing (Supine)','Side-Lying Short-Lever Adductor Raise','Side Lying Short Lever Adductor Raise','Short-Lever Adductor Raise'];
test('three additional coach prohibitions cover names and alternatives without banning distinct movements',()=>{
 for(const name of banned){assert.ok(isCoachBannedExercise(name),name);assert.ok(hasRestriction(name,[]),name);assert.deepEqual(coachBannedSessionExercises({blocks:[{exercises:[{name:'Goblet Squat',alternatives:[{name}]}]}]}),[name]);}
 for(const name of ['Barbell Hip Thrust','Supine Bent-Knee March','Side-Lying Hip Adduction','Prone Glute Set','Side-Lying Clamshell Unloaded'])assert.equal(isCoachBannedExercise(name),false,name);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': bans do not break regional strength drafts or reduce permitted upper-body work',()=>{
 const date='2026-10-13',snapshot={player:{id:'synthetic',position:'Диагональная'},readySixMeta:{},readySixDecision:{capPercent:100},latestMorning:{date,zoneDetails:{'Икроножная левая':{type:'pain',level10:4}}}};
 for(const strengthMode of ['maintenance','development'])for(const trainingType of ['anterior_chain','posterior_chain','full_body']){
  const result=buildStrengthDevelopmentDraft({snapshot,recommendation:{state:{level:'green',capPercent:100,targets:[]},calendar:{}},sourceState:{level:'green',capPercent:100,targets:[]},date,trainingType,strengthMode,manualMethodSelection:true});
  const healthy=buildStrengthDevelopmentDraft({snapshot:{player:snapshot.player},recommendation:{state:{level:'green',capPercent:100,targets:[]},calendar:{}},date,trainingType,strengthMode,manualMethodSelection:true});
  const exercises=result.session.blocks.flatMap(block=>block.exercises),baseline=healthy.session.blocks.flatMap(block=>block.exercises);
  assert.ok(exercises.some(ex=>ex.symptomAdapted));assert.ok(exercises.filter(ex=>ex.symptomAdapted).every(ex=>ex.weightKg==null && ex.targetRpeMax<=4));
  for(const code of ['B1','B2']){assert.equal(exercises.find(ex=>ex.code===code).targetSets.length,baseline.find(ex=>ex.code===code).targetSets.length);assert.equal(exercises.find(ex=>ex.code===code).targetRpeMax,baseline.find(ex=>ex.code===code).targetRpeMax);}
  assert.equal(result.quality.valid,true);assert.equal(coachBannedSessionExercises(result.session).length,0);assert.ok(result.session.blocks.flatMap(block=>block.exercises).some(ex=>ex.code==='B1' && ex.targetSets.length>=1));
 }
});

test('manual replacement library excludes coach bans from both bank and custom cards',async()=>{
 const fs=await import('node:fs');const source=fs.readFileSync(new URL('../pages/api/exercises/library.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/export default /g,'').replace(/^export /gm,'');
 const handler=new Function('isAuthorized','EXERCISE_BANK','getAllCards','normalize','isCoachBannedExercise',source+';return handler;')(()=>true,[...banned,'Goblet Squat'].map(n=>({n,u:'https://example.org/video'})),async()=>[...banned,'Supine Bent-Knee March'].map(title=>({title,canonicalId:title,video:'https://example.org/video'})),name=>({canonicalId:name}),isCoachBannedExercise);
 const res={status(code){this.code=code;return this;},json(body){this.body=body;}};await handler({method:'GET'},res);assert.equal(res.code,200);assert.deepEqual(res.body.cards.map(card=>card.title).sort(),['Goblet Squat','Supine Bent-Knee March']);
});
