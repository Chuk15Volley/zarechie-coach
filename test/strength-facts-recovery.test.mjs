import {validFactPeriod} from '../lib/factPeriod.mjs';
import {strengthSessionCompletion} from '../lib/strengthCompletion.mjs';
import {selectGymEdition} from '../lib/gymEdition.mjs';
import {playerHistoryFacts} from '../lib/playerHistoryFacts.mjs';
import {validCoachDate} from '../lib/coachAuditQuery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import * as supplements from '../lib/strengthActualSupplement.mjs';
import {gymLoadFacts} from '../lib/strengthLoadFacts.mjs';
import {generationScope,successfulGenerationRetry} from '../lib/generationRecovery.mjs';
import {queuePrefix} from '../lib/teamQueue.mjs';
import {coachAuditCommands} from '../lib/coachAudit.mjs';
import {sessionPlanFact} from '../lib/floorOperations.mjs';
import {buildAthleteWeekLoad} from '../lib/weekLoadManagement.mjs';
const date='2026-10-12';
function fixture(){
 const record={date,savedAt:date+'T08:00:00Z',focus:'inseason_strength',session:{blocks:[{label:'B',exercises:[{code:'B1',name:'One-Arm DB Bench Press',loadUnits:1,weightKg:99,targetSets:['5/side','5/side']}]}]}};
 const actual={source:'player_feedback',savedAt:date+'T10:00:00Z',actualTonnage:99999,exercises:[{name:'One-Arm DB Bench Press',block:'B',loadUnits:1,plannedSets:2,completed:true,actualRpe:null,setActuals:[{target:'5/side',completed:true,kg:20,reps:10,repsRecorded:true},{target:'5/side',completed:true,kg:0,reps:10,repsRecorded:false}]}]};
 const patches=[{exercise:'0-0',set:1,field:'kg',value:20},{exercise:'0-0',set:1,field:'reps',value:5},{exercise:'0-0',set:null,field:'rpe',value:5}];
 const supplement={version:2,revision:randomUUID(),baseFingerprint:supplements.actualFingerprint(record,actual,null),sources:supplements.actualSources(record,actual,null),exerciseSignatures:supplements.actualExerciseSignatures(record),savedAt:'2026-10-13T10:00:00Z',patches};return {record,actual,patches,supplement};
}
function compile(path,deps,name){const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','').replace(/^export /gm,'');return new Function(...Object.keys(deps),source+';return '+name)(...Object.values(deps));}
test('stale reasons identify changed program, feedback and log separately; unchanged program keeps exact eligible fields',()=>{
 const {record,actual,supplement}=fixture(),changed={...actual,savedAt:date+'T11:00:00Z'};
 const editor=supplements.strengthMissingEditor(record,changed,null,supplement);assert.deepEqual(editor.staleReasons.map(x=>x.code),['feedback']);assert.ok(editor.reconfirmation.patches.every(x=>x.eligible));
 assert.deepEqual(supplements.supplementStaleReasons({...record,notes:'edition'},actual,null,supplement).map(x=>x.code),['program']);
 const log={savedAt:date+'T11:00:00Z',completedAt:date+'T10:50:00Z',done:{'0-0-0':true,'0-0-1':true},weights:{'0-0-0':20},repetitions:{'0-0-0':5}};
 assert.deepEqual(supplements.supplementStaleReasons(record,actual,log,supplement).map(x=>x.code),['log']);
 const undone={...log,completedAt:null,done:{'0-0-0':true}};const locked=supplements.strengthMissingEditor(record,actual,undone,supplement);assert.equal(locked.canConfirm,false);assert.deepEqual(locked.staleReasons.map(x=>x.code),['log','completion']);
});
test('changed exercise, implements and targets never offer old values for automatic reuse; new source fields cannot be overwritten',()=>{
 const {record,actual,supplement}=fixture();
 for(const change of [{name:'DB Bench Press'},{loadUnits:2},{targetSets:['6/side','6/side']}]){const next=structuredClone(record);Object.assign(next.session.blocks[0].exercises[0],change);const log={savedAt:date+'T11:00:00Z',completedAt:date+'T10:50:00Z',done:{'0-0-0':true,'0-0-1':true}};const editor=supplements.strengthMissingEditor(next,null,log,supplement);assert.ok(editor.reconfirmation.patches.every(x=>!x.eligible));}
 const filled=structuredClone(actual);Object.assign(filled.exercises[0].setActuals[1],{kg:22,reps:10,repsRecorded:true});const editor=supplements.strengthMissingEditor(record,filled,null,supplement);assert.equal(editor.reconfirmation.patches.find(x=>x.field==='kg').eligible,false);
 const legacy={...supplement,version:1,sources:undefined,exerciseSignatures:undefined};const old=supplements.strengthMissingEditor(record,{...actual,savedAt:date+'T11:00:00Z'},null,legacy);assert.equal(old.staleReasons[0].code,'legacy_sources');assert.ok(old.reconfirmation.patches.every(x=>!x.eligible));
});
test('all factual load consumers use known kg/reps, per-side and implement counts; stale supplement and undo never survive through cached tonnage',()=>{
 const {record,actual,supplement}=fixture();const before=gymLoadFacts(record,actual,null,null);assert.equal(before.actual.actualTonnage,200);assert.equal(before.actual.loadEvidence.partial,true);
 const confirmed=gymLoadFacts(record,actual,null,supplement);assert.equal(confirmed.actual.actualTonnage,400);assert.equal(confirmed.actual.loadEvidence.partial,false);assert.equal(sessionPlanFact(record.session,confirmed.actual,confirmed.log).actualTonnage,400);assert.equal(sessionPlanFact(record.session,confirmed.actual,confirmed.log).completedSets,2);
 const week=buildAthleteWeekLoad({player:{id:'test'},weekStart:date,dates:[date],entries:[{date,record,...confirmed}]});assert.equal(week.totals.actualTonnage,400);
 const log={savedAt:date+'T11:00:00Z',done:{'0-0-0':true,'0-0-1':false,'deleted-ghost-key':true},weights:{'0-0-0':21,'0-0-1':999},repetitions:{'0-0-0':4,'0-0-1':999}};
 const undone=gymLoadFacts(record,actual,log,supplement);assert.equal(undone.actual.actualTonnage,168);assert.equal(undone.supplementStatus,'stale');assert.equal(sessionPlanFact(record.session,undone.actual,undone.log).completedSets,1);
 const pair=structuredClone(record);pair.session.blocks[0].exercises[0].loadUnits=2;const pairActual=structuredClone(actual);pairActual.exercises[0].loadUnits=2;assert.equal(gymLoadFacts(pair,pairActual,null,null).actual.actualTonnage,400);
 assert.equal(gymLoadFacts({...record,savedAt:date+'T12:00:00Z'},actual,null,supplement).actual,null);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': explicit reconfirmation only persists chosen patches, supports dropping obsolete additions, replays once and rejects source races',async()=>{
 const {record,actual,patches,supplement}=fixture(),prefix=queuePrefix(workspace),id='999',values=new Map([[prefix+':session:'+id+':'+date,JSON.stringify(record)],[prefix+':session:actual:'+id+':'+date,JSON.stringify({...actual,savedAt:date+'T11:00:00Z'})],[supplements.supplementKey(prefix,id,date),JSON.stringify(supplement)]]),audits=[];let race=false;
 const redis=async(_cmd,key)=>values.get(key) || null,redisPipeline=async commands=>{const [_cmd,_script,n,...args]=commands[0];if(race)values.set(args[1],JSON.stringify({...actual,savedAt:date+'T12:00:00Z'}));if(args.slice(0,n).some((key,i)=>(values.get(key)||'')!==args[n+i]))return [0];for(const [cmd,key,...rest] of JSON.parse(args[2*n])){if(cmd==='SET')values.set(key,rest[0]);if(cmd==='ZADD')audits.push(JSON.parse(rest[1]));}return [1];};
 const service=compile('lib/strengthActualStore.js',{selectGymEdition,randomUUID,createHash,redis,redisPipeline,queuePrefix,coachAuditCommands,...supplements},'({loadStrengthActual,saveStrengthActual})');
 let context=await service.loadStrengthActual(workspace,id,date),body={workspace,playerId:id,date,fingerprint:context.fingerprint,requestId:randomUUID(),patches:[patches[0]],reason:'Проверил тренировочный лист',reconfirmRevision:supplement.revision,acknowledgeStale:true};
 await assert.rejects(service.saveStrengthActual(context,{...body,acknowledgeStale:false},{}),{status:409});
 await service.saveStrengthActual(context,body,{});context=await service.loadStrengthActual(workspace,id,date);assert.equal(context.supplement.patches.length,1);assert.equal(context.supplement.reconfirmedFrom,supplement.revision);assert.equal(context.editor.rows[0].missingRpe,true);assert.equal(audits.length,1);assert.equal((await service.saveStrengthActual(context,body,{})).replayed,true);
 values.set(context.keys[1],JSON.stringify({...actual,savedAt:date+'T12:00:00Z'}));context=await service.loadStrengthActual(workspace,id,date);body={...body,fingerprint:context.fingerprint,requestId:randomUUID(),reconfirmRevision:context.supplement.revision,patches:[]};await service.saveStrengthActual(context,body,{});assert.equal(JSON.parse(values.get(context.keys[3])).patches.length,0);
 values.set(context.keys[1],JSON.stringify({...actual,savedAt:date+'T11:30:00Z'}));context=await service.loadStrengthActual(workspace,id,date);race=true;await assert.rejects(service.saveStrengthActual(context,{...body,fingerprint:context.fingerprint,requestId:randomUUID(),reconfirmRevision:context.supplement.revision},{}),{status:409});assert.equal(audits.length,2);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': factual store joins newest alias once and ignores another spaces data',async()=>{
 const {record,actual,supplement}=fixture(),prefix=queuePrefix(workspace),values=new Map();
 for(const [type,value] of [['session',record],['session:actual',actual],['strength:actual-supplement',supplement]])values.set(`${prefix}:${type}:whoop_12:${date}`,JSON.stringify(value));
 values.set(`${prefix}:session:12:${date}`,JSON.stringify({...record,savedAt:date+'T07:00:00Z'}));
 const service=compile('lib/gymLoadStore.js',{selectGymEdition,redisPipeline:async commands=>commands.map(([,key])=>{assert.ok(key.startsWith(prefix+':'));return values.get(key) || null;}),pfx:queuePrefix,gymLoadFacts},'loadGymFacts');const [fact]=await service(workspace,[{playerId:'12',date}]);assert.equal(fact.sourcePlayerId,'whoop_12');assert.equal(fact.actual.actualTonnage,400);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': supplement uses legacy execution and rejects a newer numeric-alias undo during save',async()=>{
 const {record,actual,patches}=fixture(),prefix=queuePrefix(workspace),id='12',values=new Map();
 for(const owner of [id,'whoop_'+id])values.set(`${prefix}:session:${owner}:${date}`,JSON.stringify(record));
 values.set(`${prefix}:session:actual:whoop_${id}:${date}`,JSON.stringify(actual));let writes=0;
 const redis=async(_cmd,key)=>values.get(key) || null,redisPipeline=async commands=>{const [,_script,n,...args]=commands[0];values.set(`${prefix}:log:${id}:${date}`,JSON.stringify({savedAt:date+'T12:00:00Z',done:{},completedAt:null}));if(args.slice(0,n).some((key,i)=>(values.get(key)||'')!==args[n+i]))return [0];writes++;return [1];};
 const service=compile('lib/strengthActualStore.js',{selectGymEdition,randomUUID,createHash,redis,redisPipeline,queuePrefix,coachAuditCommands,...supplements},'({loadStrengthActual,saveStrengthActual})'),context=await service.loadStrengthActual(workspace,id,date);
 assert.equal(context.sourcePlayerId,'whoop_'+id);assert.equal(context.editor.canConfirm,true);assert.ok(context.keys.includes(`${prefix}:log:${id}:${date}`));
 await assert.rejects(service.saveStrengthActual(context,{workspace,playerId:id,date,fingerprint:context.fingerprint,requestId:randomUUID(),patches,reason:'Проверил лист'},{id:'coach'}),{status:409});assert.equal(writes,0);
 await assert.rejects(service.loadStrengthActual(workspace,id,date),{status:409});
});
test('successful retry matches exact input family and later success only; other athletes, spaces, days, chains, modes and changed instructions never clear incidents',()=>{
 const request={workspace:'zarechie',playerId:'12',date,focus:'inseason_strength',trainingType:'anterior_chain',strengthMode:'development',notes:'coach instruction'},scopeKey=generationScope(request),failure={code:'PREPARATION_FAILED',scopeKey,batchId:'failed',at:'2026-10-13T10:00:00Z'};
 const success={code:'PREPARED',scopeKey,batchId:'new-success',at:'2026-10-13T11:00:00Z'};assert.equal(successfulGenerationRetry(failure,[success]).batchId,'new-success');
 for(const change of [{workspace:'nkperf'},{playerId:'13'},{date:'2026-10-11'},{trainingType:'posterior_chain'},{strengthMode:'maintenance'},{notes:'different'}])assert.equal(successfulGenerationRetry(failure,[{...success,scopeKey:generationScope({...request,...change})}]),null);
 assert.equal(successfulGenerationRetry(failure,[{...success,at:'2026-10-13T09:00:00Z'}]),null);assert.equal(successfulGenerationRetry(failure,[{...success,code:'QUALITY_REVIEW'}]),null);assert.equal(successfulGenerationRetry({...failure,scopeKey:null},[success]),null);
 assert.equal(scopeKey,generationScope(Object.fromEntries(Object.entries(request).reverse())));assert.equal(scopeKey.includes('coach instruction'),false);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': team, player history, weekly overview and EWMA chart return the same supplemented factual tonnage, separate from plan',async()=>{
 const {record,actual,supplement}=fixture(),fact={record,rawActual:actual,rawLog:null,supplement,...gymLoadFacts(record,actual,null,supplement)},id='synthetic';
 const deps={validFactPeriod,strengthSessionCompletion,playerHistoryFacts,validCoachDate,workspaceRoster:async()=>({players:[{id,name:'Synthetic'}],source:'readysix'}),isAuthorized:()=>true,redis:async(cmd)=>cmd.toLowerCase().includes('zrange')?[date]:JSON.stringify([{id,name:'Synthetic'}]),redisPipeline:async commands=>commands.map(()=>null),loadGymFacts:async(ws,entries)=>{assert.equal(ws,workspace);return entries.map(entry=>entry.date===date?fact:null);},gymSessionDates:async()=>[date],sessionsKey:()=>'',sessionKey:()=>'',gymTonnageDatesKey:()=>'',gymTonnageKey:()=>'',rosterKey:()=>'',pfx:queuePrefix,adaptationBatchLatestKey:()=>'',returnToPlayKey:()=>'',getPlayerSnapshot:async()=>({}),performanceKpis:()=>({}),sessionTrainingLabel:()=>'',exerciseTonnage:(ex,reps,kg)=>kg*reps,weightKgFromExercise:ex=>ex.weightKg || 0,sessionPlanFact,buildAthleteWeekLoad,summarizeTeamWeek:values=>({actualTonnage:values.reduce((sum,item)=>sum+item.totals.actualTonnage,0)})};
 const call=async(path,query)=>{const handler=compile(path,deps,'handler'),res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',query},res);assert.equal(res.code,200);return res.body;};
 const history=await call('pages/api/players/sessions.js',{workspace,playerId:id});assert.equal(history.sessions[0].tonnage,400);assert.notEqual(history.sessions[0].plannedTonnage,400);
 const team=await call('pages/api/players/team-tonnage.js',{workspace,days:'7'});assert.equal(team.players[0].byDay[date],400);assert.equal(team.loadBasis,'actual');
 const week=await call('pages/api/schedule/week.js',{workspace,start:'2026-10-12'});assert.equal(week.summary.actualTonnage,400);
 const trends=await call('pages/api/players/trends.js',{workspace,playerId:id,days:'28'});assert.equal(trends.gymAcwrHistory.find(point=>point.date===date).tonnage,400);assert.equal(trends.gymLoadEvidence[date].source,'coach_verified');
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': monitor retains failed attempts, resolves only a subsequent verified success and reports its evidence',async()=>{
 const events=[],values=new Map(),scopeKey=generationScope({workspace,playerId:'12',date}),deps={successfulGenerationRetry,crypto:await import('node:crypto'),redis:async(cmd,key,...args)=>{if(cmd==='lrange')return events.map(JSON.stringify);if(cmd==='set'){if(values.has(key))return null;values.set(key,args[0]);return 'OK';}return values.get(key) || null;},redisPipeline:async commands=>{for(const [cmd,_key,value] of commands)if(cmd==='LPUSH')events.unshift(JSON.parse(value));return [];},queuePrefix,validWorkspace:()=>true,parseQueueJSON:value=>value?typeof value==='string'?JSON.parse(value):value:null,taskRuntimeKey:id=>'runtime:'+id,queueRuntimeSummary:async()=>({}),publicationRuntimeSummary:async()=>({})};
 const monitor=compile('lib/generationMonitoring.js',deps,'({recordGenerationEvent,generationMonitor})');
 await monitor.recordGenerationEvent({workspace,code:'PREPARATION_FAILED',batchId:'failed',scopeKey});let result=await monitor.generationMonitor(workspace);assert.equal(result.incidents.activeCount,1);
 await monitor.recordGenerationEvent({workspace,code:'QUALITY_REVIEW',batchId:'review',scopeKey});assert.equal((await monitor.generationMonitor(workspace)).incidents.activeCount,1);
 await monitor.recordGenerationEvent({workspace,code:'PREPARED',batchId:'success',scopeKey});result=await monitor.generationMonitor(workspace);assert.equal(result.incidents.activeCount,0);assert.equal(result.incidents.resolvedCount,1);assert.equal(result.incidents.resolved[0].resolution.batchId,'success');assert.equal(result.incidents.resolved[0].resolution.reason,'successful_retry');assert.equal(result.counts.PREPARATION_FAILED,1);
 await monitor.recordGenerationEvent({workspace,code:'PREPARATION_FAILED',batchId:'legacy-unlinked'});await monitor.recordGenerationEvent({workspace,code:'RECOVERED',batchId:'legacy-unlinked',phase:'client'});assert.equal((await monitor.generationMonitor(workspace)).incidents.activeCount,1);
});
