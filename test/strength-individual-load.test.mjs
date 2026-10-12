import test from 'node:test';
import assert from 'node:assert/strict';
import {strengthPriorities,strengthReadySixLoad,STRENGTH_INDIVIDUAL_VERSION} from '../lib/strengthIndividualization.mjs';
import {proposeStrengthLoad,normalizeExerciseEfforts} from '../lib/strengthProgression.mjs';
import {strengthLoadEvidence} from '../lib/strengthExecution.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {normalizeDevelopmentPlan} from '../lib/developmentPlan.mjs';
const date='2026-10-12';
const calendar={available:true,daysToGame:5,events:[]};
const report=(day,extra={})=>({date:day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}],...extra});
const base=()=>({player:{position:'Диагональная'},readySixMeta:{revision:'test-revision'},chronicSurveys:[...['01','03','05','07','11'].map(d=>report('2026-10-'+d))]});
const make=(extra={})=>buildStrengthDevelopmentDraft({snapshot:base(),recommendation:{calendar,state:{}},date,strengthMode:'maintenance',manualMethodSelection:true,...extra});
const all=r=>r.session.blocks.flatMap(b=>b.exercises);
const find=(r,code)=>all(r).find(ex=>ex.code===code);
const plan=priorities=>({cycleStart:'2026-10-01',goals:priorities.map((key,i)=>({id:String(i),title:key,strengthPriority:key}))});
const weightExercise={name:'Trap Bar Deadlift',targetSets:['4','4','4'],loadUnits:1};
const actual=(extra={})=>({date:'2026-10-10',sessionRpe:6,exercises:[{name:weightExercise.name,loadUnits:1,plannedSets:3,completed:true,actualRpe:6,setActuals:[1,2,3].map(set=>({set,completed:true,kg:100,reps:4,repsRecorded:true})),...extra}]});

test('deficits require structured coach confirmation and expire at review; no inference from title',()=>{
 assert.equal(strengthPriorities(null,date).status,'position_base');
 assert.deepEqual(strengthPriorities({cycleStart:'2026-10-01',goals:[{title:'Слабая задняя цепь'}]},date).priorities,[]);
 assert.deepEqual(strengthPriorities(plan(['calf','calf','core']),date).priorities,['calf','core']);
 assert.deepEqual(strengthPriorities(plan(['posterior','core','adductor']),date).priorities,['posterior','core']);
 assert.equal(strengthPriorities(plan(['posterior']),'2026-10-29').status,'review_due');
 assert.deepEqual(strengthPriorities({...plan(['posterior']),cycleStart:'2026-10-20'},date).priorities,[]);
 assert.deepEqual(strengthPriorities({...plan(['core']),reviewDecision:'complete'},date).priorities,[]);
 assert.equal(normalizeDevelopmentPlan(plan(['made_up'])).goals[0].strengthPriority,null);
});

for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: coach priorities direct existing slots without changing anchors or adding sets`,()=>{
 const basic=make({strengthMode});
 const individual=make({strengthMode,developmentPlan:plan(['adductor','calf'])});
 assert.equal(individual.quality.valid,true,JSON.stringify(individual.quality));
 for(const code of ['A1','B1','B2'])assert.equal(find(individual,code).name,find(basic,code).name);
 assert.equal(all(individual).length,8);
 assert.equal(all(individual).reduce((sum,ex)=>sum+ex.targetSets.length,0),all(basic).reduce((sum,ex)=>sum+ex.targetSets.length,0));
 assert.ok(all(individual).some(ex=>ex.individualPriority==='adductor'));
 assert.ok(all(individual).some(ex=>ex.individualPriority==='calf'&&/calf|soleus/i.test(ex.name)));
 assert.equal(individual.session.methodology.individualizationVersion,STRENGTH_INDIVIDUAL_VERSION);
 const sore=make({strengthMode,developmentPlan:plan(['calf']),snapshot:{...base(),latestMorning:{date,zoneDetails:{'Икроножная':{type:'pain',level10:4}}}}});
 assert.equal(sore.session.methodology.individualPriorities.tasks[0].status,'symptom_deferred');
 assert.equal(find(sore,'B1').targetRpeMax,8);
});

test('ReadySix court blocks exclude gym, do not double count totals, retain morning and evening separately',()=>{
 const snapshot=base();
 snapshot.chronicSurveys.at(-1).blocks.push({type:'gym',duration:60,srpe:10});
 snapshot.chronicSurveys.at(-1).totalLoad=900;
 snapshot.chronicPostMorningSurveys=[report('2026-10-11',{blocks:[{type:'volleyball',duration:30,srpe:5},{type:'gym',duration:60,srpe:10}]})];
 const load=strengthReadySixLoad(snapshot,date,calendar);
 assert.equal(load.recentCourtLoad,450);
 assert.equal(load.ownMeanCourtDay,300);
 assert.equal(load.reduceLower,false,'150% is not above threshold');
 snapshot.chronicSurveys.push(report('2026-10-11',{submittedAt:'later',blocks:[{type:'volleyball',duration:100,srpe:8}]}));
 const high=strengthReadySixLoad(snapshot,date,calendar);
 assert.equal(high.recentCourtLoad,950);
 assert.equal(high.reduceLower,true);assert.equal(high.reduceUpper,false);
});

test('real match participation differs from explicit zero and missing participation',()=>{
 const snapshot=base();
 snapshot.chronicSurveys[snapshot.chronicSurveys.length-1]=report('2026-10-11',{sessionType:'match',setsPlayed:0,blocks:[{type:'match',duration:0,srpe:0}]});
 const bench=strengthReadySixLoad(snapshot,date,{...calendar,daysSinceGame:1});
 assert.equal(bench.knownBench,true);assert.equal(bench.reduceLower,false);assert.equal(bench.playedSets,0);
 snapshot.chronicSurveys.at(-1).setsPlayed=4;snapshot.chronicSurveys.at(-1).blocks=[{type:'match',duration:90,srpe:8}];
 assert.equal(strengthReadySixLoad(snapshot,date,calendar).reduceLower,true);
 snapshot.chronicSurveys.pop();
 const missing=strengthReadySixLoad(snapshot,date,{...calendar,daysSinceGame:1});
 assert.ok(missing.missing.includes('match_participation'));assert.equal(missing.allowIncrease,false);
});

for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: lower load, upper load, travel and upcoming match adapt related dose without losing method`,()=>{
 const baseline=make({strengthMode});
 for(const [field,codes,healthy] of [['legFatigue',['A1','C1'],['B1','B2']],['shoulderLoad',['B1','B2'],['A1','C1']]]){
  const snapshot=base();snapshot.chronicSurveys.at(-1)[field]=4;
  const r=make({strengthMode,snapshot});assert.equal(r.quality.valid,true,JSON.stringify(r.quality));
  for(const code of codes)assert.ok(find(r,code).targetRpeMax<=7);
  for(const code of healthy)assert.equal(find(r,code).targetSets.length,find(baseline,code).targetSets.length);
 }
 for(const cal of [{...calendar,daysToGame:1},{...calendar,events:[{date,type:'travel',confirmed:true}]}]){
  const r=make({strengthMode,recommendation:{calendar:cal,state:{}}});
  assert.equal(r.quality.valid,true,JSON.stringify(r.quality));assert.equal(r.strengthMode,strengthMode);
  assert.equal(find(r,'A1').targetRpeMax,7);assert.equal(find(r,'B1').targetRpeMax,8);
  assert.equal(r.session.methodology.externalLoad.allowIncrease,false);
 }
});

test('future, missing, malformed and stale reports never provide a green progression context',()=>{
 const snapshot=base();snapshot.chronicSurveys=[report('2026-10-13')];
 const load=strengthReadySixLoad(snapshot,date,calendar);assert.equal(load.recentCourtLoad,null);assert.equal(load.allowIncrease,false);
 snapshot.chronicSurveys=[report('2026-10-11',{blocks:[{type:'volleyball',duration:60,srpe:20}]})];
 assert.equal(strengthReadySixLoad(snapshot,date,calendar).recentCourtLoad,null);
 const planning={...base(),readySixPlanning:{preliminary:true,assessmentDate:'2026-10-11'}};
 assert.equal(strengthReadySixLoad(planning,date,calendar).allowIncrease,false);
 const unresolved=strengthReadySixLoad(base(),date,{...calendar,conflicts:[{date}]});
 assert.equal(unresolved.allowIncrease,false);
});

test('progression uses exact exercise, implement count, all completed repetitions and exercise RPE',()=>{
 const evidence=strengthLoadEvidence(weightExercise,[actual()],date);
 const proposal=proposeStrengthLoad(weightExercise,evidence,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,targetRpeMax:8,allowIncrease:true});
 assert.equal(proposal.kg,102.5);assert.equal(proposal.action,'increase');
 const noRpe=strengthLoadEvidence(weightExercise,[actual({actualRpe:null})],date);
 assert.equal(proposeStrengthLoad(weightExercise,noRpe,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).kg,100);
 assert.equal(proposeStrengthLoad(weightExercise,noRpe,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).action,'hold');
 const partial=strengthLoadEvidence(weightExercise,[actual({completed:false})],date);
 assert.equal(proposeStrengthLoad(weightExercise,partial,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).action,'hold');
 const changed={...weightExercise,name:'DB Romanian Deadlift',loadUnits:2};
 assert.equal(strengthLoadEvidence(changed,[actual()],date),null);
 assert.equal(strengthLoadEvidence({...weightExercise,loadUnits:2},[actual()],date),null);
 const unverified=strengthLoadEvidence(weightExercise,[actual({setActuals:[{completed:true,kg:100,reps:4}]})],date);
 assert.notEqual(proposeStrengthLoad(weightExercise,unverified,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).action,'increase');
});

test('high effort, missed reps, reentry and pain prevent increases; DB steps never invent tiny increments',()=>{
 for(const extra of [{actualRpe:9},{setActuals:[{completed:true,kg:100,reps:3,repsRecorded:true}]}]){
  const evidence=strengthLoadEvidence(weightExercise,[actual(extra)],date);
  const p=proposeStrengthLoad(weightExercise,evidence,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true});assert.equal(p.action,'reduce');assert.equal(p.kg,95);
 }
 const painful=strengthLoadEvidence(weightExercise,[actual({pain:true})],date);
 assert.equal(proposeStrengthLoad(weightExercise,painful,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).kg,null);
 const stale=strengthLoadEvidence(weightExercise,[{...actual(),date:'2026-09-25'}],date);
 assert.equal(proposeStrengthLoad(weightExercise,stale,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).kg,90);
 const db={name:'DB Bench Press',loadUnits:2};
 const evidence={date:'2026-10-10',observedKg:20,allRepsMet:true,allSetsCompleted:true,repsVerified:true,rpeScope:'exercise',rpe:6};
 assert.equal(proposeStrengthLoad(db,evidence,{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).kg,20);
 assert.equal(proposeStrengthLoad(db,{...evidence,observedKg:40},{equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5],dumbbell:[20,22,40,42]},experience:'experienced',targetDate:date,allowIncrease:true}).kg,42);
});

test('new generation exposes an auditable weight proposal and fresh load can block the same increase',()=>{
 const initial=make();const first=find(initial,'A1');
 const history=[actual({name:first.name,loadUnits:first.loadUnits})];
 const r=make({actualHistory:history,equipment:{barbell:[90,95,100,102.5],trap_bar:[90,95,100,102.5]},developmentPlan:{strengthExperience:'experienced'}});assert.equal(r.quality.valid,true,JSON.stringify(r.quality));
 assert.equal(find(r,'A1').weightKg,102.5);
 assert.equal(find(r,'A1').loadEvidence.observedKg,100);
 const missing=make({snapshot:{player:{position:'Диагональная'}},actualHistory:history});
 assert.equal(find(missing,'A1').weightKg,100);assert.equal(find(missing,'A1').loadProgression.action,'hold');
});

test('exercise RPE validates named slots and never accepts stale/invalid measurements',()=>{
 const session=make().session;const exercise=session.blocks[0].exercises[0];
 assert.deepEqual(normalizeExerciseEfforts({'0-0':{name:exercise.name,rpe:6}},session),{'0-0':{name:exercise.name,rpe:6}});
 for(const value of [0,11,'6',6.5])assert.throws(()=>normalizeExerciseEfforts({'0-0':{name:exercise.name,rpe:value}},session));
 assert.throws(()=>normalizeExerciseEfforts({'0-0':{name:'Other lift',rpe:6}},session));
 assert.throws(()=>normalizeExerciseEfforts({'9-9':{name:'Missing',rpe:6}},session));
 assert.deepEqual(normalizeExerciseEfforts(null,session),{});
});

test('both chain cycles can rotate coach calf/adductor priorities through four dates',()=>{
 const history=[];
 for(let index=0;index<4;index++){
  const targetDate=`2026-10-${12+index*2}`;
  const r=make({date:targetDate,trainingType:index%2?'posterior_chain':'anterior_chain',developmentPlan:plan(['calf','adductor']),recentSessions:history});
  assert.equal(r.quality.valid,true,JSON.stringify(r.quality));
  assert.ok(all(r).some(ex=>ex.individualPriority==='calf'&&/calf|soleus/i.test(ex.name)));
  history.push(r);
 }
});
