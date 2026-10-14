import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readinessIssues} from '../lib/coachOverview.mjs';
import {sessionFactAmount} from '../lib/coachPresentation.mjs';
import {incidentGroups,healthReasons,releasePassport} from '../lib/coachOperationsPresentation.mjs';
import {orderedFactQueue} from '../lib/coachFactQueue.mjs';
import {periodFacts,techniqueSignature} from '../lib/coachAuditPresentation.mjs';
import {buildAthleteWeekLoad} from '../lib/weekLoadManagement.mjs';
import {materialVersion,reviewKey,reviewView,APPEND_TECHNIQUE_REVIEW} from '../lib/techniqueReview.mjs';
test('NK optional periodic tests do not count as missing; explicit requirements and due dates win without changing readiness',()=>{
 const ready={id:'fixture',status:'red',dataProvenance:{missingSources:['neuro','lsi','survey']}};const before=JSON.stringify(ready);
 assert.deepEqual(readinessIssues(ready,{revalidating:true},'nkperf').map(issue=>issue.kind),['updating','missing']);
 assert.equal(readinessIssues({...ready,dataProvenance:{...ready.dataProvenance,requiredSources:['neuro']}},{},'nkperf').length,1);
 assert.equal(readinessIssues({...ready,dataProvenance:{missingSources:['survey'],sourceFreshness:{survey:{nextExpectedAt:'2099-01-01'}}}},{},'zarechie').length,0);
 assert.equal(JSON.stringify(ready),before);
});
test('shared fact display distinguishes unstarted, missing, partial and confirmed zero without changing value',()=>{
 assert.equal(sessionFactAmount(0,{source:'player_log'},{completed:false,completedSets:0}),'Факт ещё не записан');
 assert.equal(sessionFactAmount(0,{source:'player_log'},{completed:true}),'0 кг');
 assert.equal(sessionFactAmount(0,{source:'missing'},{completed:true}),'Нет факта');
 assert.equal(sessionFactAmount(0,{source:'player_log',partial:true},{completed:true}),'Нет факта');
 assert.equal(sessionFactAmount(100,{source:'player_log'},{completed:false,completedSets:1}),'100 кг');
});
test('incident archive follows explicit resolution only and keeps all history',()=>{
 const events=[{eventId:'a',kind:'integrity',channel:'in-app',status:'firing',occurredAt:'2026-10-01'},{eventId:'b',kind:'integrity',channel:'in-app',status:'resolved',occurredAt:'2026-10-02'},{eventId:'c',kind:'queue',status:'firing',occurredAt:'2026-10-03'}];
 const result=incidentGroups(events);assert.deepEqual(result.active.map(e=>e.eventId),['c']);assert.equal(result.archive.length,2);assert.equal(events.length,3);
 assert.deepEqual(healthReasons({services:{backup:false},checks:{historyIntegrity:true}}),['Нет свежей резервной копии']);
 assert.equal(releasePassport({SOURCE_REVISION:'ru-commit',VERCEL_GIT_COMMIT_SHA:'old',GYM_BUILD_AT:'2026-10-14T10:00:00Z',GYM_DEPLOYMENT_ENV:'ru-self-hosted'}).commit,'ru-commit');assert.equal(releasePassport({}).builtAt,null);
});
test('global factual queue sorts fresh dates across players and filters exact fields without mutations',()=>{
 const players=[{id:'a',sessions:[{date:'2026-10-01',canConfirm:true,rows:[{fields:[{field:'kg'}]}]}]},{id:'b',sessions:[{date:'2026-10-13',canConfirm:true,trainingType:'posterior_chain',rows:[{fields:[{field:'rpe'}]}]},{date:'2026-10-14',canConfirm:false,rows:[]}]}];const original=JSON.stringify(players);
 assert.deepEqual(orderedFactQueue(players).map(item=>item.session.date),['2026-10-13','2026-10-01','2026-10-14']);assert.equal(orderedFactQueue(players,'all','kg').length,1);assert.equal(JSON.stringify(players),original);
});
test('period comparison counts comparable facts and only known bilateral dose, not planned kg',()=>{
 const result=periodFacts([{date:'2026-10-01',kg:20,reps:5,rpe:7,loadUnits:2,sets:[{completed:true,kg:20,reps:5,perSide:true},{completed:true,kg:null,reps:5}]},{date:'2026-10-02',gap:'not performed'},{date:'2026-10-03',kg:0,reps:5,rpe:null,adapted:true,sets:[]}],{from:'2026-10-01',to:'2026-10-03'});
 assert.equal(result.complete,1);assert.equal(result.observations,2);assert.equal(result.total,3);assert.equal(result.dose,400);assert.equal(result.sets,2);assert.equal(result.adapted,1);
});
test('budget provenance reports four source weeks and exact mixed plan/fact inputs without changing median',()=>{
 const entries=[{date:'2026-10-01',record:{session:{blocks:[{exercises:[{name:'DB Bench Press',weightKg:20,targetSets:['5']}]}]}}},{date:'2026-10-08',record:{session:{blocks:[{exercises:[{name:'DB Bench Press',weightKg:20,targetSets:['5']}]}]}}}];
 const result=buildAthleteWeekLoad({weekStart:'2026-10-12',dates:['2026-10-12'],entries});assert.equal(result.budget.sourceWeeks.length,4);assert.equal(result.budget.referenceSets,1);assert.equal(result.budget.sourceWeeks.filter(w=>w.entries.length).length,2);assert.ok(result.budget.sourceWeeks.flatMap(w=>w.entries).every(e=>e.tonnageBasis==='plan'));
});
function compile(path,deps){const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');return new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));}
test('shared technique journal rejects stale material and concurrent revisions; writes only a separate journal',async()=>{
 let card={canonicalId:'fictional',title:'Goblet Squat',video:'https://example.org/video'},events=[],keys=[];
 const redis=async(command,key,...args)=>{keys.push(key);if(command==='lrange')return events.map(JSON.stringify);assert.equal(command,'eval');assert.equal(key,APPEND_TECHNIQUE_REVIEW);const [,journal,revision,raw]=args;assert.equal(journal,reviewKey(card.canonicalId));if(Number(revision)!==(events[0]?.revision || 0))return 0;events.unshift(JSON.parse(raw));return 1;};
 const handler=compile('pages/api/exercises/technique-review.js',{isAuthorized:()=>true,coachAuditActor:()=>({role:'coach',access:'shared_key',id:null}),redis,coachLibraryCards:async()=>[card],techniqueSignature,materialVersion,reviewKey,reviewView,APPEND_TECHNIQUE_REVIEW});
 const call=async(method,body={})=>{const res={status(code){this.code=code;return this;},json(value){this.body=value;return this;},setHeader(){}};await handler({method,query:{id:card.canonicalId,signature:techniqueSignature(card)},body},res);return res;};
 let view=(await call('GET')).body;const body={id:card.canonicalId,signature:techniqueSignature(card),type:'description',verified:true,version:view.version,revision:view.revision};
 assert.equal((await call('POST',body)).code,200);assert.equal((await call('POST',body)).code,409);view=(await call('GET')).body;assert.equal(view.checks.description.actor.id,null);assert.equal(view.checks.video,undefined);
 card={...card,video:'https://example.org/changed'};assert.equal((await call('POST',{...body,revision:1})).code,409);view=(await call('GET')).body;assert.equal(view.checks.description,undefined);assert.equal(view.events.length,1);
 assert.ok(keys.every(key=>key===APPEND_TECHNIQUE_REVIEW || key.startsWith('gym:technique-review:v2:')));
});
test('comparability requires identical known dose and excludes adaptations and absent RPE',async()=>{
 const {comparablePeriods}=await import('../lib/coachAuditPresentation.mjs');
 const point=date=>({date,kg:20,reps:5,rpe:7,loadUnits:2,sets:[{completed:true,kg:20,reps:5,perSide:false}]});
 const a={from:'2026-10-01',to:'2026-10-05'},b={from:'2026-10-06',to:'2026-10-10'};
 assert.deepEqual(comparablePeriods([point('2026-10-01'),point('2026-10-06'),{...point('2026-10-07'),adapted:true},{...point('2026-10-08'),rpe:null}],a,b),{first:1,second:1});
 assert.deepEqual(comparablePeriods([point('2026-10-01'),{...point('2026-10-06'),sets:[{completed:true,kg:24,reps:5}]}],a,b),{first:0,second:0});
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: Today finds an adjacent saved edition with read-only requests and reports lookup failure honestly`,async()=>{
 const {shiftCalendarDate}=await import('../lib/coachCalendar.mjs');let fail=false,reads=0;
 const handler=compile('pages/api/programs/team-status.js',{isAuthorized:()=>true,redisPipeline:async commands=>{assert.ok(commands.every(c=>['GET','HGETALL'].includes(c[0])));return commands.map(()=>null);},generatedDraftKey:()=>'',feedbackKey:()=>'',sessionKey:()=>'',liveCommandsKey:()=>'',restrictionsKey:()=>'',developmentPlanKey:()=>'',returnToPlayKey:()=>'',injuryLogKey:()=>'',adaptationOutcomeKey:()=>'',pfx:()=>'',evaluateReturnToPlay:()=>({active:false}),recommendNextLoad:()=>({}),loadGymFacts:async(ws,entries)=>{assert.equal(ws,workspace);reads++;return entries.map(entry=>entry.date==='2026-10-14'?null:{record:{session:{blocks:[]},trainingLabel:'Synthetic saved plan'}});},gymSessionDates:async(ws,id,from,to)=>{assert.equal(from,20260916);assert.equal(to,20261111);if(fail)throw Error('offline');return ['2026-10-13','2026-10-15'];},shiftCalendarDate,sessionTrainingLabel:record=>record.trainingLabel});
 const call=async()=>{const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'POST',body:{workspace,date:'2026-10-14',playerIds:['fictional'],includeNearest:true}},res);return res;};
 const result=await call();assert.equal(result.body.status.fictional.hasSession,false);assert.equal(result.body.status.fictional.nearestSession.date,'2026-10-13');assert.equal(reads,2);
 fail=true;const unavailable=await call();assert.equal(unavailable.code,200);assert.equal(unavailable.body.status.fictional.nearestUnavailable,true);assert.equal(unavailable.body.status.fictional.nearestSession,undefined);
});
test('load overview counts an RPE-only gap even when tonnage evidence is complete',async()=>{
 const {summarizeLoadOverview}=await import('../lib/coachOverview.mjs');
 const result=summarizeLoadOverview({dates:['2026-10-14'],players:[{byDay:{'2026-10-14':100},evidenceByDay:{'2026-10-14':{source:'player_log',partial:false}},factFieldsByDay:{'2026-10-14':{missing:{kg:0,reps:0,rpe:1}}}}]});
 assert.equal(result.gaps,1);assert.equal(result.actual,100);
});
