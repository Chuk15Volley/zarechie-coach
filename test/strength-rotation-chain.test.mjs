import {hasLateralMovementFromC,isLateralStrengthMovement} from '../lib/strengthLateralVector.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {buildInSeasonStrengthContext,inSeasonStrengthDoseProfile,auditInSeasonStrengthSession,formatInSeasonStrengthForPrompt} from '../lib/inSeasonStrength.mjs';
import {strengthLoadEvidence} from '../lib/strengthExecution.mjs';
import {varietyExerciseKey} from '../lib/exerciseVariety.mjs';
const date='2026-10-12';
const snapshot={player:{position:'Диагональная'}};
const recommendation={calendar:{daysToGame:5},state:{}};
const build=options=>buildStrengthDevelopmentDraft({snapshot,recommendation,date,manualMethodSelection:true,...options});
const exercises=result=>result.session.blocks.flatMap(b=>b.exercises);
for(const trainingType of ['full_body','anterior_chain','posterior_chain'])test(`${trainingType}: deterministic emphasis passes dose and preserves main lifts across the cycle`,()=>{
 const first=build({trainingType});
 assert.equal(first.trainingType,trainingType);
 assert.equal(first.session.methodology.trainingType,trainingType);
 assert.equal(exercises(first).length,8);
 assert.equal(exercises(first).reduce((n,e)=>n+e.targetSets.length,0),trainingType==='full_body'?17:15);
 assert.equal(first.quality.valid,true);
 assert.ok(first.session.methodology.timing.estimatedMainMinutes<=50);
 if(trainingType==='anterior_chain')assert.match(exercises(first)[0].name,/Squat/);
 if(trainingType==='posterior_chain')assert.match(exercises(first)[0].name,/Deadlift|Hip Thrust/);
 const second=build({trainingType,recentSessions:[{date:'2026-10-01',focus:'inseason_strength',session:first.session}]});
 const keys=new Set(exercises(first).map(e=>varietyExerciseKey(e.name)));
 assert.ok(exercises(second).filter(e=>!['A1','B1','B2'].includes(e.code)).every(e=>!keys.has(varietyExerciseKey(e.name))));
 assert.deepEqual(exercises(second).filter(e=>['A1','B1','B2'].includes(e.code)).map(e=>e.name),exercises(first).filter(e=>['A1','B1','B2'].includes(e.code)).map(e=>e.name));
 assert.equal(second.quality.variety.ok,true);
});
for(const requestedMode of ['maintenance','development'])for(const trainingType of ['anterior_chain','posterior_chain'])test(`${requestedMode}/${trainingType}: audit catches wrong first movement and prompt specifies the focus`,()=>{
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',targetDate:date,calendar:recommendation.calendar,requestedMode,trainingType});
 assert.match(formatInSeasonStrengthForPrompt(context),trainingType==='anterior_chain'?/ПЕРЕДНЯЯ ЦЕПЬ/:/ЗАДНЯЯ ЦЕПЬ/);
 const wrong=build({trainingType:trainingType==='anterior_chain'?'posterior_chain':'anterior_chain'}).session;
 assert.equal(auditInSeasonStrengthSession(wrong,inSeasonStrengthDoseProfile(context)).checks.chainFocus,false);
});
test('strength save and generation share history depth and exhausted selection returns an actionable error',()=>{
 const save=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8');
 assert.match(save,/focus === 'inseason_strength' \? 42 : 12/);
 assert.match(save,/focus === 'inseason_strength' && saveQuality.variety\?\.needsCorrection/);
 assert.match(save,/res.status\(409\)/);
 const route=readFileSync(new URL('../pages/api/programs/generate.js',import.meta.url),'utf8');
 assert.match(route,/trainingType: trainingType \|\| 'full_body'/);
 assert.match(route,/Повторы автоматически не разрешаются/);
});
test('aliases cannot fake novelty for row support and dead bug suffix',()=>{
 assert.equal(varietyExerciseKey('One-Arm DB Row'),varietyExerciseKey('One-Arm DB Row (Bench Supported)'));
 assert.equal(varietyExerciseKey('Dead Bug'),varietyExerciseKey('Dead Bug Core'));
});

test('conservative novelty aliases never transfer kilograms between ambiguous row variants',()=>{
 const history=[{date:'2026-10-01',sessionRpe:7,exercises:[{name:'One-Arm DB Row',loadUnits:1,setActuals:[{completed:true,kg:20,reps:5}]}]}];
 assert.equal(strengthLoadEvidence({name:'One-Arm DB Row (Bench Supported)',loadUnits:1,targetSets:['5']},history,date),null);
});

for(const trainingType of ['full_body','anterior_chain','posterior_chain'])test(`${trainingType}: lateral movement starts at C or later without increasing dose`,()=>{
 const result=build({trainingType});
 assert.equal(hasLateralMovementFromC(result.session),true);
 assert.ok(result.session.blocks.slice(0,2).flatMap(b=>b.exercises).every(e=>!isLateralStrengthMovement(e)));
 assert.equal(exercises(result).length,8);
 assert.equal(exercises(result).reduce((n,e)=>n+e.targetSets.length,0),trainingType==='full_body'?17:15);
 assert.equal(result.quality.valid,true);
});
test('a side plank is trunk stability rather than a lateral movement replacement',()=>{
 assert.equal(hasLateralMovementFromC({blocks:[{label:'D',exercises:[{name:'Side Plank'},{name:'Pallof Press'},{name:'Suitcase Carry'}]}]}),false);
});
for(const area of ['Голень левая','Колено','Пах'])test(`${area}: no loaded lateral lunge is prescribed from symptom questionnaire`,()=>{
 const result=build({snapshot:{...snapshot,latestMorning:{date,zoneDetails:{[area]:{type:'pain',level10:3}}}}});
 assert.ok(exercises(result).every(e=>!/Lateral Lunge|Lateral Step-Up/.test(e.name)));
 assert.equal(result.quality.medicalReviewRequired,true);
 assert.ok(exercises(result).filter(e=>e.symptomAdapted).every(e=>e.weightKg===null));
 assert.ok(exercises(result).filter(e=>e.symptomAdapted&&/Hip Abduction/.test(e.name)).every(e=>e.targetSets.every(target=>target.endsWith('/side'))));
});
test('ANKLE prohibition cannot be bypassed by lateral-vector requirement',()=>{
 const result=build({playerRestrictions:['ANKLE']});
 assert.ok(exercises(result).every(e=>!/lateral/i.test(e.name)));
});

test('background, exercise replacement and copying cannot silently introduce historical repeats',()=>{
 const status=readFileSync(new URL('../pages/api/programs/generate-status.js',import.meta.url),'utf8');
 assert.match(status,/\(qualityContext.focus \|\| focus\) === 'inseason_strength' \? 42 : 12/);
 const replacement=readFileSync(new URL('../pages/api/programs/regenerate-exercise.js',import.meta.url),'utf8');
 assert.match(replacement,/excludedKeys.has\(varietyExerciseKey\(candidateName\)\)/);
 const copy=readFileSync(new URL('../pages/api/programs/copy.js',import.meta.url),'utf8');
 assert.match(copy,/getRecentSessionRecords\(String\(toPlayerId\)/);
 assert.match(copy,/copyQuality.variety\?\.needsCorrection/);
});

import {isCoachBannedExercise,coachBannedSessionExercises,hasRestriction} from '../lib/exerciseRestrictions.js';
import {assessSessionQuality} from '../lib/sessionValidator.js';
test('coach bans apply without player restrictions and cannot be overridden by strength mode',()=>{
 for(const name of ['Barbell Bench Press','Bench Press (Barbell)','Жим штанги лёжа','Seated Cable Row','Cable Row','Тяга горизонтального блока']){
  assert.equal(isCoachBannedExercise(name),true,name);
  assert.equal(hasRestriction(name,[]),true,name);
  const session=structuredClone(build({}).session);session.blocks[1].exercises[0].name=name;
  assert.equal(assessSessionQuality(session,{focus:'inseason_strength'}).valid,false,name);
 }
 for(const name of ['DB Bench Press','Inverted Row','Chest-Supported DB Row'])assert.equal(isCoachBannedExercise(name),false,name);
 assert.deepEqual(coachBannedSessionExercises({blocks:[{exercises:[{name:'Push-Up',alternatives:[{name:'Seated Cable Row'}]}]}]}),['Seated Cable Row']);
 assert.ok(exercises(build({})).every(ex=>!isCoachBannedExercise(ex.name)));
 for(const path of ['save.js','copy.js'])assert.match(readFileSync(new URL('../pages/api/programs/'+path,import.meta.url),'utf8'),/coachBannedSessionExercises/);
});
