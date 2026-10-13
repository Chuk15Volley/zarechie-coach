import test from 'node:test';
import assert from 'node:assert/strict';
import {readinessIssues,loadEvidenceLabel,summarizeLoadOverview,draftForPlayer} from '../lib/coachOverview.mjs';
import {requestDailyOverview} from '../lib/coachOverviewRequest.mjs';
import {buildAthleteWeekLoad} from '../lib/weekLoadManagement.mjs';
test('overview retains explicit stale sources and does not invent clinical states',()=>{
 const ready={id:'1',status:'green',dataProvenance:{staleSources:['survey'],missingSources:['survey','neuro'],sourceFreshness:{survey:{date:'2026-10-10'}}}},before=JSON.stringify(ready);
 const issues=readinessIssues(ready,{cache:'stale'});
 assert.equal(issues.length,3);assert.match(issues[1].text,/2026-10-10/);assert.equal(issues.filter(x=>x.text.includes('Опрос')).length,1);assert.equal(JSON.stringify(ready),before);
 assert.equal(readinessIssues(null,null)[0].kind,'missing');assert.equal(readinessIssues({id:'1'}) .length,0);
});
test('load overview separates missing facts, absent programs, verified zero and planned load',()=>{
 const data={dates:['a','b','c','d'],players:[{byDay:{a:100,b:0,c:0,d:0},plannedByDay:{a:200,b:400,c:0,d:100},evidenceByDay:{a:{source:'player_log',partial:true,missingSets:2},b:{source:'missing',partial:true},c:{source:'no_session'},d:{source:'coach_verified',partial:false}}}]};
 assert.deepEqual(summarizeLoadOverview(data),{actual:100,planned:700,gaps:2,verified:1,players:1});assert.equal(loadEvidenceLabel({source:'no_session'}),null);assert.equal(loadEvidenceLabel({source:'player_log',supplementStatus:'stale'}).kind,'stale');assert.match(loadEvidenceLabel(data.players[0].evidenceByDay.a).text,/2/);
});
test('draft shortcuts require exact workspace/date/player and never open published or unfinished row',()=>{
 const row={playerId:'1',workspace:'nkperf',date:'2026-10-13',status:'done',draft:true,saved:false};
 assert.equal(draftForPlayer([row],1,'nkperf','2026-10-13'),row);
 for(const change of [{workspace:'zarechie'},{date:'2026-10-12'},{status:'queued'},{saved:true},{draft:false}])assert.equal(draftForPlayer([{...row,...change}],1,'nkperf','2026-10-13'),null);
});
test('daily overview checks readiness before status in both workspaces; no write routes',async()=>{
 const original=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>String(url).startsWith('/api/team/readiness')?{players:[{id:'1'}],cache:'stale'}:{status:{'1':{hasSession:true}}}};};
 try{for(const workspace of ['zarechie','nkperf']){const result=await requestDailyOverview({workspace,date:'2026-10-13',apiKey:'fixture',playerIds:['1']});assert.equal(result.readiness.cache,'stale');const last=calls.at(-1);assert.equal(last.url,'/api/programs/team-status');assert.equal(JSON.parse(last.options.body).workspace,workspace);}assert.equal(calls.length,4);}finally{global.fetch=original;}
});
test('readiness HTTP failure stops overview without replacing data with empty success',async()=>{
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;return {ok:false,status:503,json:async()=>({error:'ReadySix unavailable'})};};
 try{await assert.rejects(requestDailyOverview({workspace:'nkperf',date:'2026-10-13',apiKey:'fixture',playerIds:['1']}),/ReadySix unavailable/);assert.equal(calls,1);}finally{global.fetch=original;}
});
test('weekly evidence exposes partial and coach-verified facts without changing calculated totals',()=>{
 const evidence={source:'coach_verified',partial:true,missingSets:1},session={blocks:[{exercises:[{name:'DB Row',targetSets:['5'],weightKg:10}]}]},entry={date:'2026-10-12',record:{session},actual:{savedAt:'2026-10-12T12:00:00Z',actualTonnage:20,loadEvidence:evidence}};
 const result=buildAthleteWeekLoad({player:{id:'1'},weekStart:'2026-10-12',dates:['2026-10-12','2026-10-13'],entries:[entry]});assert.deepEqual(result.days[0].loadEvidence,evidence);assert.equal(result.days[0].actualTonnage,20);assert.equal(result.days[1].hasSession,false);
});
