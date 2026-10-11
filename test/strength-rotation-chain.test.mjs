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
for(const trainingType of ['full_body','anterior_chain','posterior_chain'])test(`${trainingType}: deterministic emphasis passes dose and rotates across the previous same method older than seven days`,()=>{
 const first=build({trainingType});
 assert.equal(first.trainingType,trainingType);
 assert.equal(first.session.methodology.trainingType,trainingType);
 assert.equal(exercises(first).length,8);
 assert.equal(exercises(first).reduce((n,e)=>n+e.targetSets.length,0),17);
 assert.equal(first.quality.valid,true);
 assert.ok(first.session.methodology.timing.estimatedMainMinutes>=40&&first.session.methodology.timing.estimatedMainMinutes<=50);
 if(trainingType==='anterior_chain')assert.match(exercises(first)[0].name,/Squat/);
 if(trainingType==='posterior_chain')assert.match(exercises(first)[0].name,/Deadlift|Hip Thrust/);
 const second=build({trainingType,recentSessions:[{date:'2026-10-01',focus:'inseason_strength',session:first.session}]});
 const keys=new Set(exercises(first).map(e=>varietyExerciseKey(e.name)));
 assert.ok(exercises(second).every(e=>!keys.has(varietyExerciseKey(e.name))));
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
 assert.equal(exercises(result).reduce((n,e)=>n+e.targetSets.length,0),17);
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
