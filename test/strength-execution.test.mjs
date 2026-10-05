import test from 'node:test';
import assert from 'node:assert/strict';
import { strengthLoadEvidence, normalizeStrengthExecution, estimateStrengthMinutes } from '../lib/strengthExecution.mjs';
import { buildInSeasonStrengthContext, inSeasonStrengthDoseProfile, auditInSeasonStrengthSession, formatInSeasonStrengthForPrompt } from '../lib/inSeasonStrength.mjs';
import { buildExerciseVarietyContext, auditExerciseVariety } from '../lib/exerciseVariety.mjs';
import { nextWorkoutSet, restSecondsFor } from '../lib/playerWorkout.mjs';
import { analyzeSessionDose } from '../lib/sessionDose.mjs';
const date='2026-10-09';
const ex=(code,name,sets=2,target='5')=>({code,name,targetSets:Array(sets).fill(target),weightNote:'100 кг; 85% 1RM',loadUnits:/DB Bench/.test(name)?2:1});
const session={blocks:[
 {label:'A',exercises:[ex('A1','Trap Bar Deadlift',2,'3')]},
 {label:'B',exercises:[ex('B1','DB Bench Press'),ex('B2','Chest-Supported DB Row')]},
 {label:'C',exercises:[ex('C1','Reverse Lunge',2,'5/side'),ex('C2','Machine Hamstring Curl',2,'6')]},
 {label:'D',exercises:[ex('D1','Dead Bug Core',1,'6/side'),ex('D2','Cable External Rotation',2,'8/side'),ex('D3','Soleus Calf Raise',2,'10')]},
]};
const records=[{date:'2026-09-25',sessionRpe:7,exercises:[{name:'Trap Bar Deadlift',loadUnits:1,setActuals:[{completed:true,kg:70,reps:3},{completed:true,kg:75,reps:3},{completed:false,kg:100,reps:3}]}]}];
const context=(daysToGame=4,extra={})=>buildInSeasonStrengthContext({focus:'inseason_strength',calendar:{daysToGame},targetDate:date,actualHistory:records,...extra});
test('load uses only completed same-exercise comparable-rep sets; session RPE remains session-level',()=>{
 const evidence=strengthLoadEvidence(session.blocks[0].exercises[0],records,date);assert.equal(evidence.kg,70);assert.equal(evidence.rpeScope,'session');
 assert.equal(strengthLoadEvidence(ex('A1','Hip Thrust'),records,date),null);
 assert.equal(strengthLoadEvidence(ex('A1','Trap Bar Deadlift',2,'12'),records,date).kg,null);
 assert.equal(strengthLoadEvidence(ex('A1','Trap Bar Deadlift'),records,'2026-09-24'),null);
 assert.equal(strengthLoadEvidence(ex('A1','Trap Bar Deadlift'),records,'2026-12-01'),null);
 for(const change of [{sessionRpe:null},{sessionRpe:9},{painAreas:['knee']}])assert.equal(strengthLoadEvidence(session.blocks[0].exercises[0],[{...records[0],...change}],date).kg,null);
 const wrongUnits=[{...records[0],exercises:[{...records[0].exercises[0],loadUnits:2}]}];assert.equal(strengthLoadEvidence(session.blocks[0].exercises[0],wrongUnits,date),null);
 assert.equal(strengthLoadEvidence(session.blocks[0].exercises[0],[{...records[0],exercises:[{name:'Trap Bar Deadlift',actualKg:100,plannedKg:100}]}],date),null);
});
test('MD-4 normal vs MD-3, close exposure and unknown calendar use conservative dose',()=>{
 assert.equal(context().doseStatus,'green');assert.equal(context(3).doseStatus,'yellow');
 assert.equal(context(null).doseStatus,'yellow');assert.equal(context(4,{anchorContext:{closeExposure:true}}).doseStatus,'yellow');
 assert.equal(context(4,{recoveryStatus:'red'}).mode,'red_adaptation');
 assert.deepEqual(inSeasonStrengthDoseProfile(context()).minutes,{min:40,max:50});
 assert.ok(inSeasonStrengthDoseProfile(context(3)).totalSets.max<inSeasonStrengthDoseProfile(context()).totalSets.max);
});
test('execution owns rests, removes invented kg/percentages, preserves unloaded adaptations and computes actual timeline',()=>{
 const result=normalizeStrengthExecution(session,'inseason_strength',context());
 assert.equal(result.blocks[0].exercises[0].weightKg,70);
 assert.equal(result.blocks[1].exercises[0].weightKg,null);
 assert.doesNotMatch(result.blocks[1].exercises[0].weightNote,/100 кг|1RM|85%/);
 assert.equal(result.methodology.weeklySessions,1);assert.equal(result.methodology.eveningCourt,true);
 assert.equal(result.methodology.timing.warmupIncluded,false);assert.equal(result.methodology.timing.rampUpIncluded,true);
 assert.ok(estimateStrengthMinutes(result)>=40&&estimateStrengthMinutes(result)<=50);
 assert.equal(analyzeSessionDose(result).estimatedMinutes,estimateStrengthMinutes(result));
 const done={};let last=null;const pauses=[];
 while(true){const next=nextWorkoutSet(result,done);if(!next)break;if(last)pauses.push(restSecondsFor(last.block,last.exercise,{bi:last.bi,ei:last.ei,next}));done[next.key]=true;last=next;}
 assert.deepEqual([...new Set(pauses)].sort((a,b)=>a-b),[60,120,150,180]);
 const adapted=structuredClone(session);adapted.blocks[0].exercises[0].weightNote='Без отягощения';assert.equal(normalizeStrengthExecution(adapted,'inseason_strength',context()).blocks[0].exercises[0].weightKg,null);
 assert.equal(normalizeStrengthExecution(session,'inseason_prophylaxis',context()),session);
 const prescription=inSeasonStrengthDoseProfile(context());assert.equal(auditInSeasonStrengthSession(result,prescription).valid,true);
 result.blocks[0].exercises[0].weightKg=99;assert.equal(auditInSeasonStrengthSession(result,prescription).safe,false);
});
test('rotation rejects any exercise used during preceding week including earlier non-strength sessions',()=>{
 const records=Array.from({length:5},(_,i)=>({date:`2026-10-0${i+3}`,focus:i===0?'inseason_prophylaxis':'inseason_power',session:{blocks:[{exercises:[{name:i===0?'Trap Bar Deadlift':`Accessory ${i}`}]}]}}));
 const variety=buildExerciseVarietyContext(records,{targetDate:date,focus:'inseason_strength'});
 assert.equal(auditExerciseVariety(session,variety).ok,false);
 assert.match(formatInSeasonStrengthForPrompt(context()),/Все упражнения менять/);
});

test('generation audit rejects wrong repetitions, same lower pattern and translated names',()=>{
 const base=normalizeStrengthExecution(session,'inseason_strength',context());const prescription=inSeasonStrengthDoseProfile(context());
 for(const mutate of [s=>s.blocks[0].exercises[0].targetSets=['12','12'],s=>s.blocks[2].exercises[0].name='Single-Leg RDL',s=>s.blocks[1].exercises[0].name='Жим гантелей']){
  const bad=structuredClone(base);mutate(bad);assert.equal(auditInSeasonStrengthSession(bad,prescription).safe,false);
 }
});

test('same-week completed strength needs coach review; planned or previous-week work does not',()=>{
 const actual={...records[0],date:'2026-10-07',focus:'inseason_strength'};
 const ctx=context(4,{actualHistory:[actual]});assert.deepEqual(ctx.completedThisWeek,['2026-10-07']);
 assert.equal(auditInSeasonStrengthSession(normalizeStrengthExecution(session,'inseason_strength',ctx),inSeasonStrengthDoseProfile(ctx)).safe,false);
 assert.deepEqual(context(4,{actualHistory:[{...actual,date:'2026-10-05',exercises:[]}]}).completedThisWeek,[]);
 assert.deepEqual(context(4,{actualHistory:[{...actual,date:'2026-10-03'}]}).completedThisWeek,[]);
});

test('scapular T Raise is valid prehab; controlled descriptions do not demand explosive tension',async()=>{
 const {exerciseDescription,normalizeSessionTempoDescriptions}=await import('../lib/tempoDescription.mjs');
 const probe=structuredClone(session);probe.blocks[3].exercises[1].name='Prone T Raise';probe.blocks[3].exercises[0]=ex('D1','Half-Kneeling Pallof Press ISO',1,'20 sec/side');
 const normalized=normalizeSessionTempoDescriptions(normalizeStrengthExecution(probe,'inseason_strength',context()));
 assert.equal(auditInSeasonStrengthSession(normalized,inSeasonStrengthDoseProfile(context())).valid,true);
 for(const e of normalized.blocks[3].exercises)assert.doesNotMatch(exerciseDescription(e),/максимально резко/);
 assert.match(exerciseDescription(normalized.blocks[3].exercises[0]),/20 sec\/side/);
 const bad=structuredClone(normalized);bad.blocks[1].exercises[0].name='TRX Push-Up';assert.equal(auditInSeasonStrengthSession(bad,inSeasonStrengthDoseProfile(context())).safe,false);
});

 test('full green session below 40 minutes requires correction; reduced dose may remain shorter',()=>{
 const short=structuredClone(session);
 short.blocks[2].exercises.forEach(e=>e.targetSets=e.targetSets.slice(0,1));
 short.blocks[3].exercises.forEach(e=>e.targetSets=e.targetSets.slice(0,1));
 const green=normalizeStrengthExecution(short,'inseason_strength',context());
 assert.ok(estimateStrengthMinutes(green)<40);
 assert.equal(auditInSeasonStrengthSession(green,inSeasonStrengthDoseProfile(context())).checks.execution,false);
 const yellow=normalizeStrengthExecution(short,'inseason_strength',context(3));
 assert.equal(auditInSeasonStrengthSession(yellow,inSeasonStrengthDoseProfile(context(3))).checks.execution,true);
});

test('scapular face pull is valid individual shoulder prehab',()=>{
 const plan=structuredClone(session);plan.blocks[3].exercises[2].name='Face Pull (Band)';
 const result=normalizeStrengthExecution(plan,'inseason_strength',context());
 assert.equal(auditInSeasonStrengthSession(result,inSeasonStrengthDoseProfile(context())).checks.posteriorCore,true);
});
