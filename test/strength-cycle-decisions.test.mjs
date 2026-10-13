import {coachAuditCommands,EXECUTE_AUDIT_COMMANDS} from '../lib/coachAudit.mjs';
import {buildExerciseVarietyContext} from '../lib/exerciseVariety.mjs';
import {assessSessionQuality} from '../lib/sessionValidator.js';
import {previousCycleId} from '../lib/strengthCycleDecisions.mjs';
import {recordCoachReplacements} from '../lib/strengthCycle.mjs';
import {coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DECISION_VERSION,validateCycleDecision,applyCycleDecision,SAVE_DECISION_SCRIPT} from '../lib/strengthCycleDecisions.mjs';
import {buildStrengthCycle,strengthExercises} from '../lib/strengthCycle.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {buildStrengthCycleReview} from '../lib/strengthCycleReview.mjs';
import {shiftIsoDate} from '../lib/developmentPlan.mjs';
const snapshot={player:{position:'Диагональная'},chronicSurveys:['01','03','05','07','11'].map(day=>({date:'2026-10-'+day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}]}))};
const make=extra=>buildStrengthDevelopmentDraft({snapshot,recommendation:{calendar:{available:true,daysToGame:5,events:[]},state:{}},manualMethodSelection:true,strengthMode:'maintenance',date:'2026-10-12',...extra});
const exercise=(result,code)=>strengthExercises(result.session).find(ex=>ex.code===code);
function fixture(strengthMode='maintenance',trainingType='full_body') {
 const initial=make({strengthMode,trainingType,date:'2026-10-01'});
 const records=[1,2,3,4].map(day=>{
  const date='2026-10-0'+day;
  const actual={source:'player_feedback',savedAt:date+'T12:00:00Z',sessionRpe:7,exercises:initial.session.blocks.flatMap(block=>block.exercises.map(ex=>({name:ex.name,block:block.label,loadUnits:ex.loadUnits,completed:true,plannedSets:ex.targetSets.length,actualRpe:5,setActuals:ex.targetSets.map(target=>({target,completed:true,repsRecorded:true,reps:parseInt(target)*(/side/.test(target)?2:1),kg:ex.code==='A1'?100:20}))})))};
  return {...initial,date,savedAt:date+'T10:00:00Z',strengthCompletion:{completed:true,source:'player_feedback'},strengthExecutionFacts:{actual}};
 });
 const cycle=buildStrengthCycleReview(records,{asOf:'2026-10-12'}).cycles[0];
 const entries=validateCycleDecision(cycle,cycle.exercises.map(row=>({key:row.key,exercise:'keep',progression:'hold',note:'Сохранить технику'})));
 return {initial,records,cycle,decision:{version:DECISION_VERSION,cycleId:cycle.id,entries,revision:'revision1'}};
}
for(const strengthMode of ['maintenance','development']) for(const trainingType of ['full_body','anterior_chain','posterior_chain'])test(`${strengthMode}/${trainingType}: next cycle keeps approved anchors and suppresses increases only in selected slots`,()=>{
 const {initial,records,decision}=fixture(strengthMode,trainingType);
 const next=make({strengthMode,trainingType,recentSessions:records,cycleDecision:decision,actualHistory:[{...records[3].strengthExecutionFacts.actual,date:'2026-10-11'}],equipment:{trap_bar:[100,105],dumbbell:[20,21]}});
 assert.equal(next.quality.valid,true,JSON.stringify(next.quality.checks.filter(c=>!c.ok)));
 assert.equal(next.session.methodology.coachCycleDecision.cycleId,'2026-10-01');
 if(trainingType==='full_body') {
  const auto=make({strengthMode,trainingType,recentSessions:records,cycleDecision:{...decision,entries:decision.entries.map(e=>({...e,progression:'auto'}))},actualHistory:[{...records[3].strengthExecutionFacts.actual,date:'2026-10-11'}],equipment:{trap_bar:[100,105],dumbbell:[20,21]}});
  assert.equal(exercise(auto,'B1').loadProgression.action,'increase');
 }

 for(const code of ['A1','B1','B2']){assert.equal(exercise(next,code).name,exercise(initial,code).name);assert.ok(!['increase','increase_reps'].includes(exercise(next,code).loadProgression?.action));}
 const noDecision=make({strengthMode,trainingType,recentSessions:records});
 assert.notEqual(exercise(noDecision,'A1').name,exercise(initial,'A1').name);
 const continued=make({strengthMode,trainingType,date:'2026-10-14',recentSessions:[...records,next],cycleDecision:decision});
 assert.equal(exercise(continued,'B1').name,exercise(next,'B1').name);
 const rotated=make({strengthMode,trainingType,recentSessions:records,cycleDecision:{...decision,entries:decision.entries.map(e=>({...e,exercise:'rotate'}))}});
 for(const code of ['A1','B1','B2'])assert.notEqual(exercise(rotated,code).name,exercise(initial,code).name);
});
test('decisions expire after the immediate next cycle, require four facts and cannot leak into another chain',()=>{
 const {records,decision}=fixture();
 const cycle=buildStrengthCycle(records,{targetDate:'2026-10-12'});
 assert.ok(applyCycleDecision(cycle,records,decision).coachDecision);
 assert.equal(applyCycleDecision(cycle,records.slice(0,3),decision).coachDecision,undefined);
 assert.equal(applyCycleDecision(cycle,records,{...decision,cycleId:'2026-09-01'}).coachDecision,undefined);
 const other=applyCycleDecision({...cycle,trainingType:'posterior_chain'},records,decision);assert.deepEqual(other.anchors,{});assert.equal(other.coachDecision.entries.length,0);
 const later=make({recentSessions:records,cycleDecision:decision});
 const laterRecords=[13,14,15,16].map(day=>({...later,date:'2026-10-'+day,strengthCompletion:{completed:true,source:'player_feedback'}}));
 const third=buildStrengthCycle([...records,...laterRecords],{targetDate:'2026-10-20'});
 assert.equal(applyCycleDecision(third,[...records,...laterRecords],decision).coachDecision,undefined);
});
test('keep never overrides symptoms or learned exclusions; healthy upper body retains dose',()=>{
 const {records,decision}=fixture();
 const next=make({recentSessions:records,cycleDecision:decision,snapshot:{...snapshot,latestMorning:{date:'2026-10-12',zoneDetails:{'Икроножная левая':{type:'pain',level10:4}}}}});
 assert.ok(exercise(next,'A1').symptomAdapted);assert.equal(exercise(next,'A1').weightKg,null);
 assert.equal(exercise(next,'B1').targetRpeMax,8);assert.equal(exercise(next,'B1').targetSets.length,2);
 const excluded=structuredClone(records);excluded[3].session.coachReplacements=[{from:decision.entries.find(e=>e.code==='B1').name,to:'DB Incline Bench Press',reason:'technique',date:'2026-10-04'}];
 const result=make({recentSessions:excluded,cycleDecision:decision});assert.notEqual(exercise(result,'B1').name,decision.entries.find(e=>e.code==='B1').name);
});
test('validation rejects partial cycles, foreign rows, duplicates and unrestricted actions',()=>{
 const {cycle,decision}=fixture();const input=decision.entries.map(e=>({key:e.key,exercise:e.exercise,progression:e.progression,note:e.note}));
 assert.ok(validateCycleDecision(cycle,input));
 assert.deepEqual(validateCycleDecision(cycle,[]),[]);
 for(const entries of [[...input,input[0]],[{...input[0],key:'foreign'}],[{...input[0],progression:'force_increase'}],[{...input[0],exercise:'unknown'}],[{...input[0],note:'x'.repeat(301)}]])assert.equal(validateCycleDecision(cycle,entries),null);
 assert.equal(validateCycleDecision({...cycle,status:'in_progress'},input),null);
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: API persists, reloads and rejects stale edits and unauthorised writes`,async()=>{
 const {records,cycle,decision}=fixture();const storage=new Map(),keys=[];
 const redis=async(command,...args)=>{
  const key=command==='eval'?args[2]:args[0];keys.push(key);
  if(command==='get')return storage.get(key)||null;
  assert.equal(args[0],SAVE_DECISION_SCRIPT);if((storage.get(key)||'')!==args[3])return 0;storage.set(key,args[4]);return 1;
 };
 const source=readFileSync(new URL('../pages/api/players/strength-cycle-review.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','').replace(/^export /gm,'');
 const deps={coachAuditCommands,coachAuditActor:()=>({role:"coach",access:"shared_key",id:null}),randomUUID,redis,pfx:ws=>ws==='nkperf'?'nkperf':'coach',DECISION_VERSION,validateCycleDecision,SAVE_DECISION_SCRIPT,isAuthorized:req=>req.auth!==false,getRecentSessionRecords:async()=>records,buildStrengthCycleReview,shiftIsoDate};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 const body={workspace,playerId:'synthetic-player',cycleId:cycle.id,entries:decision.entries.map(e=>({key:e.key,exercise:e.exercise,progression:e.progression,note:e.note,volume:'reduce_one',volumeReason:'Плановое снижение'}))};
 let res=response();await handler({method:'POST',body},res);assert.equal(res.code,200);const saved=res.data.decision;assert.equal(saved.entries[0].volume,'reduce_one');assert.equal(saved.entries[0].volumeReason,'Плановое снижение');
 res=response();await handler({method:'POST',body:{...body,expectedRevision:saved.revision,entries:[{...body.entries[0],volumeReason:''}]}},res);assert.equal(res.code,400);
 res=response();await handler({method:'POST',body},res);assert.equal(res.code,409);
 res=response();await handler({method:'GET',query:{workspace,playerId:body.playerId}},res);assert.deepEqual(res.data.cycles[0].decision,saved);
 res=response();await handler({method:'POST',body:{...body,expectedRevision:saved.revision}},res);assert.equal(res.code,200);assert.notEqual(res.data.decision.revision,saved.revision);
 res=response();await handler({method:'POST',auth:false,body},res);assert.equal(res.code,401);
 res=response();await handler({method:'POST',body:{...body,workspace:'invalid'}},res);assert.equal(res.code,400);
 assert.ok(keys.every(key=>key.startsWith(workspace==='nkperf'?'nkperf:':'coach:')));
});

test('volume reduction requires a bounded reason and legacy decisions default to ordinary dose',()=>{
 const {cycle,decision}=fixture();const input=decision.entries[0];
 assert.equal(validateCycleDecision(cycle,[input])[0].volume,'normal');
 for(const patch of [{volume:'other'},{volume:'reduce_one'},{volume:'reduce_one',volumeReason:'  '},{volume:'reduce_one',volumeReason:'x'.repeat(301)}])assert.equal(validateCycleDecision(cycle,[{...input,...patch}]),null);
 const saved=validateCycleDecision(cycle,[{...input,volume:'reduce_one',volumeReason:'  Контроль утомления  '}])[0];assert.equal(saved.volumeReason,'Контроль утомления');
 assert.equal(validateCycleDecision(cycle,[{...saved,volume:'normal'}])[0].volumeReason,'');
});
for(const strengthMode of ['maintenance','development'])for(const trainingType of ['full_body','anterior_chain','posterior_chain'])test(`${strengthMode}/${trainingType}: reduced movement preserves all other doses and effort`,()=>{
 const {records,decision}=fixture(strengthMode,trainingType);
 const entries=decision.entries.map(entry=>({...entry,progression:'auto'}));
 const args={strengthMode,trainingType,recentSessions:records,actualHistory:[{...records[3].strengthExecutionFacts.actual,date:'2026-10-11'}],equipment:{trap_bar:[100,105],dumbbell:[20,21]}};
 const baseline=make({...args,cycleDecision:{...decision,entries}});
 for(const selected of ['A1','B1','B2']){
  const result=make({...args,cycleDecision:{...decision,entries:entries.map(entry=>entry.code===selected?{...entry,volume:'reduce_one',volumeReason:'Утомление движения'}:entry)}});
  assert.equal(result.quality.valid,true,JSON.stringify(result.quality.checks.filter(c=>!c.ok)));
  for(const ex of strengthExercises(result.session)){
   const before=exercise(baseline,ex.code);
   assert.equal(ex.targetRpeMax,before.targetRpeMax);
   if(ex.code===selected){assert.equal(ex.targetSets.length,Math.min(before.targetSets.length,selected==='A1'?2:1));assert.ok(!['increase','increase_reps'].includes(ex.loadProgression?.action));assert.equal(ex.coachVolumeDose.reason,'Утомление движения');}
   else {assert.deepEqual(ex.targetSets,before.targetSets);assert.equal(ex.weightKg,before.weightKg);}
  }
 }
});
test('local symptoms take precedence over volume decision without reducing healthy upper body',()=>{
 const {records,decision}=fixture();const result=make({recentSessions:records,cycleDecision:{...decision,entries:decision.entries.map(entry=>entry.code==='A1'?{...entry,volume:'reduce_one',volumeReason:'Утомление'}:entry)},snapshot:{...snapshot,latestMorning:{date:'2026-10-12',zoneDetails:{'Икроножная левая':{type:'pain',level10:4}}}}});
 assert.equal(exercise(result,'A1').coachVolumeDose.status,'symptom_deferred');assert.equal(exercise(result,'A1').weightKg,null);assert.equal(exercise(result,'B1').targetSets.length,2);assert.equal(exercise(result,'B1').targetRpeMax,8);
});

test('ReadySix lower volume is not reduced a second time and healthy slots retain their dose',()=>{
 const {records,decision}=fixture();const args={recentSessions:records,recommendation:{calendar:{available:true,daysToGame:1,events:[]},state:{}}};
 const ordinary=make({...args,cycleDecision:decision});
 const reduced=make({...args,cycleDecision:{...decision,entries:decision.entries.map(entry=>entry.code==='A1'?{...entry,volume:'reduce_one',volumeReason:'Утомление'}:entry)}});
 assert.equal(exercise(ordinary,'A1').targetSets.length,2);assert.equal(exercise(reduced,'A1').targetSets.length,2);assert.equal(exercise(reduced,'A1').coachVolumeDose.status,'already_reduced');
 for(const ex of strengthExercises(reduced.session))assert.deepEqual(ex.targetSets,exercise(ordinary,ex.code).targetSets);
 assert.equal(reduced.quality.valid,true);
});

for(const workspace of ['zarechie','nkperf'])test(`${workspace}: first next-cycle reduced-volume plan saves with server-confirmed keep decisions, never a forged client exception`,async()=>{
 const {records,decision}=fixture();const selected={...decision,entries:decision.entries.map(entry=>entry.code==='B2'?{...entry,volume:'reduce_one',volumeReason:'Утомление тяги'}:entry)};
 const result=make({recentSessions:records,cycleDecision:selected});
 const source=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','').replace(/^export /gm,'');
 let serverDecision=selected,written=[];
 const identity=x=>x,prefix=workspace==='nkperf'?'nkperf':'coach';
 const deps={coachAuditCommands,EXECUTE_AUDIT_COMMANDS,coachAuditActor:()=>({role:"coach",access:"shared_key",id:null}),applyCycleDecision,previousCycleId,pfx:()=>prefix,buildExerciseVarietyContext,assessSessionQuality,recordCoachReplacements,coachBannedSessionExercises,
  validCopyRepeatException:()=>false,sessionPlayerAliases:id=>[id],getPlayerTimeZone:async()=>'Europe/Moscow',isAuthorized:()=>true,
  redis:async(command,key)=>{assert.ok(key.startsWith(prefix+':'));return key.includes(':cycle-decision:')?JSON.stringify(serverDecision):null;},sessionKey:(ws,id,date)=>`${prefix}:session:${id}:${date}`,sessionsKey:()=>prefix+':sessions:synthetic',
  getRecentSessionRecords:async(id,depth,ws)=>{assert.equal(ws,workspace);return records;},reconcileReplacementDescriptions:identity,approveProgramSession:identity,normalizeSessionTempoDescriptions:identity,ensureSessionExerciseIds:identity,sanitizeUnavailableEquipmentExercises:identity,
  weightKgFromExercise:()=>0,loadUnitsForExercise:()=>1,approvedProgramLabel:identity,advisorySessionQuality:identity,buildDosePrescription:()=>({}),redisPipeline:async commands=>{written=commands;}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const response=()=>({status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 const body={workspace,playerId:'synthetic',date:'2026-10-12',focus:result.focus,trainingType:'full_body',session:result.session,quality:result.quality};
 let res=response();await handler({method:'POST',body},res);assert.equal(res.code,200,JSON.stringify(res.data));assert.equal(res.data.quality.variety.needsCorrection,false);assert.ok(written.length);
 written=[];serverDecision={...selected,entries:[]};res=response();await handler({method:'POST',body},res);assert.equal(res.code,409);assert.equal(written.length,0);
});
