import {resolveStrengthSupplement} from '../lib/strengthActualSupplement.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStrengthCycleReview} from '../lib/strengthCycleReview.mjs';
import {strengthLoadEvidence} from '../lib/strengthExecution.mjs';
import {proposeStrengthLoad} from '../lib/strengthProgression.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {STRENGTH_CYCLE_VERSION} from '../lib/strengthCycle.mjs';
import {shiftIsoDate} from '../lib/developmentPlan.mjs';
const date='2026-10-12';
const options={targetDate:date,allowIncrease:true,experience:'experienced',equipment:{dumbbell:[20,22],trap_bar:[100,110]}};
const ex={code:'B1',name:'DB Bench Press',targetSets:['5','5'],loadUnits:2};
function fact(exercise=ex,{target='5',reps=5,kg=20,actualRpe=6,...extra}={}){
 return {date:'2026-10-10',source:'player_feedback',sessionRpe:8,exercises:[{name:exercise.name,block:'B',plannedSets:2,completed:true,loadUnits:exercise.loadUnits,actualRpe,setActuals:[1,2].map(set=>({set,target,kg,reps,repsRecorded:true,completed:true})),...extra}]};
}
test('coarse equipment step proposes one repetition at fixed kg with the original method ceiling',()=>{
 const evidence=strengthLoadEvidence(ex,[fact()],date);
 const p=proposeStrengthLoad(ex,evidence,options);assert.equal(p.action,'increase_reps');assert.equal(p.kg,20);assert.equal(p.targetReps,6);assert.equal(p.repCeiling,6);
 const topped=strengthLoadEvidence(ex,[fact(ex,{target:'6',reps:6})],date);
 const hold=proposeStrengthLoad(ex,topped,options);assert.equal(hold.action,'hold');assert.equal(hold.targetReps,6);assert.equal(hold.kg,20);
 const smaller=proposeStrengthLoad(ex,topped,{...options,equipment:{dumbbell:[20,21]}});assert.equal(smaller.action,'increase');assert.equal(smaller.kg,21);assert.equal(smaller.targetReps,undefined);
 const noIncrease=proposeStrengthLoad(ex,topped,{...options,allowIncrease:false});assert.equal(noIncrease.action,'hold');assert.equal(noIncrease.targetReps,6);
});
test('rep progression rejects session RPE, incomplete/unverified history, inconsistent weights, symptoms and gaps',()=>{
 for(const data of [fact(ex,{actualRpe:null}),fact(ex,{completed:false}),fact(ex,{setActuals:[{target:'5',kg:20,reps:5,completed:true,repsRecorded:false},{target:'5',kg:20,reps:5,completed:true,repsRecorded:false}]}),fact(ex,{setActuals:[{target:'5',kg:20,reps:5,completed:true,repsRecorded:true},{target:'5',kg:22,reps:5,completed:true,repsRecorded:true}]})]){
  assert.notEqual(proposeStrengthLoad(ex,strengthLoadEvidence(ex,[data],date),options).action,'increase_reps');
 }
 const evidence=strengthLoadEvidence(ex,[fact()],date);
 for(const overrides of [{allowIncrease:false},{experience:'unknown'},{reduced:true},{targetDate:'2026-10-25'},{equipment:{}}])assert.notEqual(proposeStrengthLoad(ex,evidence,{...options,...overrides}).action,'increase_reps');
 assert.equal(proposeStrengthLoad({...ex,symptomAdapted:true},evidence,options).kg,null);
 assert.notEqual(proposeStrengthLoad(ex,{...evidence,pain:true},options).action,'increase_reps');
});
test('unilateral repetitions remain per side; exact exercise and implement count are binding',()=>{
 const unilateral={code:'C1',name:'One-Arm DB Row',targetSets:['5/side','5/side'],loadUnits:1};
 const evidence=strengthLoadEvidence(unilateral,[fact(unilateral,{target:'5/side',reps:10})],date);
 const p=proposeStrengthLoad(unilateral,evidence,options);assert.equal(p.targetReps,6);assert.equal(p.perSide,true);
 assert.equal(strengthLoadEvidence({...unilateral,loadUnits:2},[fact(unilateral,{target:'5/side',reps:10})],date),null);
 assert.equal(strengthLoadEvidence({...unilateral,name:'Chest-Supported DB Row'},[fact(unilateral)],date),null);
});
const reports=()=>({player:{position:'Диагональная'},chronicSurveys:['01','03','05','07','11'].map(day=>({date:'2026-10-'+day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}]}))});
const make=extra=>buildStrengthDevelopmentDraft({date,snapshot:reports(),recommendation:{calendar:{available:true,daysToGame:5,events:[]},state:{}},manualMethodSelection:true,strengthMode:'maintenance',...extra});
for(const strengthMode of ['maintenance','development'])test(`${strengthMode}: actual targets become the next prescription without adding sets or effort`,()=>{
 const first=make({strengthMode});
 const mains=first.session.blocks.flatMap(b=>b.exercises).filter(e=>['A1','B1','B2'].includes(e.code));
 const actual={date:'2026-10-10',sessionRpe:7,exercises:mains.map(e=>({name:e.name,loadUnits:e.loadUnits,plannedSets:e.targetSets.length,completed:true,actualRpe:6,setActuals:e.targetSets.map(target=>({target,reps:Number(target),kg:e.code==='A1'?100:20,completed:true,repsRecorded:true}))}))};
 const progressed=make({strengthMode,actualHistory:[actual],equipment:options.equipment});
 assert.equal(progressed.quality.valid,true,JSON.stringify(progressed.quality.checks.filter(c=>!c.ok)));
 const all=progressed.session.blocks.flatMap(b=>b.exercises);
 for(const e of all.filter(e=>['A1','B1','B2'].includes(e.code))){assert.equal(e.loadProgression.action,'increase_reps');assert.equal(Number(e.targetSets[0]),e.code==='A1'?5:6);assert.equal(e.targetSets.length,mains.find(x=>x.code===e.code).targetSets.length);assert.equal(e.targetRpeMax,8);}
 const secondActual={...actual,exercises:actual.exercises.map(e=>({...e,setActuals:e.setActuals.map(s=>({...s,target:String(Number(s.target)+1),reps:s.reps+1}))}))};
 const hold=make({strengthMode,actualHistory:[secondActual],equipment:options.equipment});
 assert.equal(hold.quality.valid,true);for(const e of hold.session.blocks.flatMap(b=>b.exercises).filter(e=>['A1','B1','B2'].includes(e.code)))assert.equal(e.loadProgression.action,'hold');
});
function record(day,{complete=true,logOnly=false,kg=20,recorded=true,exerciseRpe=6,cycleId='2026-10-01',...patch}={}){
 const target='5/side';const planned={code:'B1',name:'One-Arm DB Bench Press',loadUnits:1,targetSets:[target,target]};
 const date='2026-10-'+String(day).padStart(2,'0');
 const actual={source:'player_feedback',savedAt:date+'T10:00:00Z',sessionRpe:8,exercises:[{name:planned.name,block:'B',loadUnits:1,plannedSets:2,completed:complete,actualRpe:exerciseRpe,setActuals:[1,2].map(i=>({target,kg,reps:10,repsRecorded:recorded,completed:complete || i===1}))}]};
 const log=logOnly?{savedAt:date+'T10:01:00Z',completedAt:complete?date+'T10:00:00Z':null,done:{'0-0-0':true,'0-0-1':complete},weights:recorded?{'0-0-0':'20,5','0-0-1':'20,5'}:{},repetitions:recorded?{'0-0-0':'5','0-0-1':'5'}:{}}:null;
 return {date,savedAt:date+'T08:00:00Z',focus:'inseason_strength',strengthCompletion:{completed:true,source:'player_feedback'},session:{methodology:{strengthCycle:{version:STRENGTH_CYCLE_VERSION,id:cycleId},externalLoad:{source:'ReadySix',reasons:[{code:'travel',text:'Подтверждённая поездка'}],missing:[]}},blocks:[{label:'B',exercises:[planned]}]},strengthExecutionFacts:{actual:logOnly?null:actual,log},...patch};
}
test('review requires four actual completions, deduplicates dates, excludes partial and future records',()=>{
 const records=[record(1),record(2),record(3),record(4,{complete:false}),record(5),record(13),record(2)];
 const review=buildStrengthCycleReview(records,{asOf:date});const cycle=review.cycles[0];
 assert.equal(cycle.status,'completed');assert.equal(cycle.completedCount,4);assert.deepEqual(cycle.completionDates,['2026-10-01','2026-10-02','2026-10-03','2026-10-05']);
 assert.equal(cycle.otherPlans.length,1);assert.equal(cycle.exercises[0].observations.length,4);assert.equal(cycle.exercises[0].observations[0].sets[0].reps,5);
 assert.equal(cycle.exercises[0].observations[0].exerciseRpe,6);assert.equal(cycle.exercises[0].observations[0].sessionRpe,8);assert.equal(cycle.context[0].source,'ReadySix');
 const partial=buildStrengthCycleReview([record(1),record(2,{complete:false})],{asOf:date});assert.equal(partial.cycles[0].completedCount,1);
 const forged=record(1);forged.strengthExecutionFacts={};assert.equal(buildStrengthCycleReview([forged],{asOf:date}).cycles[0].completedCount,0);
});
test('review never substitutes planned kg/reps or session RPE; live decimal weights preserve units',()=>{
 const review=buildStrengthCycleReview([record(1,{logOnly:true}),record(2,{logOnly:true,recorded:false}),record(3,{recorded:false,exerciseRpe:null})],{asOf:date});
 const row=review.cycles[0].exercises[0];assert.equal(row.loadUnits,1);assert.equal(row.observations[0].sets[0].kg,20.5);assert.equal(row.observations[0].sets[0].reps,5);
 assert.equal(row.observations[1].sets[0].kg,null);assert.equal(row.observations[1].sets[0].reps,null);assert.equal(row.observations[2].exerciseRpe,null);assert.equal(row.observations[2].sessionRpe,8);
 assert.ok(review.cycles[0].suggestions.some(text=>/Не все/.test(text)));
 const stale=record(1);stale.savedAt='2026-10-01T11:00:00Z';assert.equal(buildStrengthCycleReview([stale],{asOf:date}).cycles[0].completedCount,0);
});
test('review keeps exact variants, implement count and chain separate, retains replacement reasons once',()=>{
 const a=record(1),b=record(2),c=record(3),d=record(4);
 b.session.blocks[0].exercises[0].name='DB Bench Press';b.strengthExecutionFacts.actual.exercises[0].name='DB Bench Press';
 c.trainingType='posterior_chain';d.session.blocks[0].exercises[0].loadUnits=2;d.strengthExecutionFacts.actual.exercises[0].loadUnits=2;
 const event={date:a.date,code:'B1',from:'Old lift',to:'One-Arm DB Bench Press',reason:'tolerance',note:'Контроль'};
 a.session.coachReplacements=[event];b.session.coachReplacements=[event];
 const cycle=buildStrengthCycleReview([a,b,c,d],{asOf:date}).cycles[0];assert.equal(cycle.exercises.length,4);assert.equal(cycle.replacements.length,1);assert.equal(cycle.replacements[0].reason,'tolerance');
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: review endpoint authenticates, scopes history and fails closed`,async()=>{
 const source=readFileSync(new URL('../pages/api/players/strength-cycle-review.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const calls=[];const deps={redis:async()=>null,pfx:ws=>ws==='nkperf'?'nkperf':'coach',isAuthorized:()=>true,shiftIsoDate,buildStrengthCycleReview,getRecentSessionRecords:async(...args)=>{calls.push(args);return [record(1)];}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler({method:'GET',query:{workspace,playerId:'123',asOf:date}},response);assert.equal(response.code,200);assert.equal(calls[0][2],workspace);assert.equal(calls[0][4].includeStrengthExecution,true);assert.equal(response.headers['Cache-Control'],'no-store');
 const denied=new Function(...Object.keys(deps),source+';return handler;')(...Object.values({...deps,isAuthorized:()=>false}));await denied({method:'GET',query:{workspace,playerId:'123'}},response);assert.equal(response.code,401);assert.equal(calls.length,1);
 const unavailable=new Function(...Object.keys(deps),source+';return handler;')(...Object.values({...deps,getRecentSessionRecords:async()=>{throw new Error('offline');}}));await unavailable({method:'GET',query:{workspace,playerId:'123'}},response);assert.equal(response.code,503);
 await handler({method:'GET',query:{workspace,playerId:'123',asOf:'2026-02-31'}},response);assert.equal(response.code,400);
});
test('inventory settings are available on the home screen without selecting a player; experience is shared',()=>{
 const source=readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
 assert.match(source,/keyConnected && \['today','workouts'\]\.includes\(mainSection\)/);
 assert.equal((source.match(/<StrengthEquipmentPanel key=/g)||[]).length,1);
 assert.ok(!source.includes('STRENGTH_EXPERIENCE_OPTIONS'));assert.ok(readFileSync(new URL('../components/StrengthEquipmentPanel.js',import.meta.url),'utf8').includes('Заполните один раз для всех игроков этого пространства'));
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: review joins only server execution facts and includes today's completion`,async()=>{
 const source=readFileSync(new URL('../lib/sessionHistory.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
 const item=record(12),prefix=workspace==='nkperf'?'nkperf':'coach';
 const actual=item.strengthExecutionFacts.actual;
 const stored={...item,strengthExecutionFacts:{actual:{source:'forged'},log:null}};
 const {strengthSessionCompletion}=await import('../lib/strengthCompletion.mjs');
 const deps={resolveStrengthSupplement,redis:async(_command,key)=>{assert.ok(key.startsWith(prefix+':'));return [date];},redisPipeline:async commands=>commands.map(([,key])=>key.includes(':session:actual:')?JSON.stringify(actual):key.includes(':log:') || key.includes(':actual-supplement:')?null:JSON.stringify(stored)),pfx:()=>prefix,sessionKey:()=>'',strengthSessionCompletion};
 const history=new Function(...Object.keys(deps),source+';return getRecentSessionRecords;')(...Object.values(deps));
 const rows=await history('player',42,workspace,shiftIsoDate(date,1),{strict:true,includeCycleHistory:true,includeStrengthExecution:true});
 assert.equal(rows[0].strengthExecutionFacts.actual.source,'player_feedback');assert.equal(buildStrengthCycleReview(rows,{asOf:date}).cycles[0].completedCount,1);
});
