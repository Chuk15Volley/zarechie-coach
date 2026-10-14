import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHighlights} from '../lib/coachPresentation.mjs';
import {executionLabel,sourceComparisonRows,periodFacts,techniqueSignature,variantTechnique} from '../lib/coachAuditPresentation.mjs';
import {coachSourceState} from '../lib/coachSourceState.mjs';
import {strengthCardProposals,strengthProgressionKey} from '../lib/strengthCardProgression.mjs';
import {historyPerformanceSeries,performancePoints} from '../lib/strengthPerformance.mjs';
import {generatedDraftRecord} from '../lib/generatedDraft.mjs';
test('compact complaints retain every verbatim zone without inferring permission',()=>{
 const reasons=['Боль колено 3/10 Боль плечо 2/10 WHOOP 80%','Исключить прыжки','Боль колено 3/10'];
 assert.deepEqual(sourceHighlights(reasons),['Боль колено 3/10','Боль плечо 2/10','Исключить прыжки']);
});
test('execution states distinguish unknown, not started, partial and completed without tonnage inference',()=>{
 assert.equal(executionLabel(null),'Выполнение неизвестно');assert.equal(executionLabel({completedSets:0}),'Не начато');assert.equal(executionLabel({completedSets:1,totalSets:5}),'Частично · 1/5 подходов');assert.equal(executionLabel({completed:true}),'Завершено');
});
test('source comparison refuses legacy prose and locates changes only in comparable sections',()=>{
 const snapshot={readySixMeta:{revision:'a'},readySixDecision:{level:'green'},targetDate:'2026-10-14',surveys:[{date:'2026-10-13',knee:2}],latestSurvey:{date:'2026-10-13',knee:2}};
 const baseline=coachSourceState(snapshot,[]),current=coachSourceState({...snapshot,latestSurvey:{date:'2026-10-13',knee:4}},[]);
 assert.equal(sourceComparisonRows(null,current).every(row=>row.status==='Нет сопоставимого снимка'),true);
 assert.deepEqual(sourceComparisonRows(baseline,current).filter(row=>row.status==='Изменился раздел').map(row=>row.key),['questionnaires']);
 assert.deepEqual(coachSourceState({...snapshot,surveys:[...snapshot.surveys,{date:'2026-10-01',knee:8}]},[]),baseline);
 assert.notDeepEqual(coachSourceState(snapshot,['SHOULDER']),baseline);
 const draft=generatedDraftRecord({session:{kind:'strength_training_draft'},sourceState:baseline,completedAt:'2026-10-14T10:00:00Z'},{focus:'inseason_strength'});
 assert.deepEqual(draft.sourceState,baseline);assert.equal(draft.sourceCapturedAt,'2026-10-14T10:00:00Z');
});
test('technique verification is invalidated by a video or description change and never edits a program',()=>{
 const card={canonicalId:'x',title:'Single-Leg DB Romanian Deadlift',description:'generic',video:'a'},before=structuredClone(card);
 assert.match(variantTechnique(card),/одной опорной ноге/);assert.notEqual(techniqueSignature(card),techniqueSignature({...card,video:'b'}));assert.notEqual(techniqueSignature(card),techniqueSignature({...card,description:'new'}));assert.deepEqual(card,before);
});
test('weight provenance reports only the exact matched exercise and implement count',()=>{
 const ex={code:'B1',name:'DB Bench Press',targetSets:['5'],loadUnits:2,targetRpeMax:8};
 const preview={blocks:[{exercises:[{...ex,weightKg:20,loadEvidence:{date:'2026-10-12',observedKg:20,rpe:7,rpeScope:'exercise',loadUnits:2,loggedSets:[{kg:20,reps:5}]}}]}]};
 const p=strengthCardProposals([ex],preview,'scope')[strengthProgressionKey(ex)];
 assert.deepEqual(p.evidenceSets,[{kg:20,reps:5}]);assert.equal(p.evidenceName,ex.name);assert.equal(p.rpe,7);
 const other=strengthCardProposals([{...ex,name:'One-Arm DB Bench Press'}],preview,'scope');assert.equal(Object.values(other)[0].kg,null);
});
test('two periods preserve missing data and isolate exact variation, implement count and rep units',()=>{
 const session=(date,name,loadUnits,target,rpe)=>({date,focus:'inseason_strength',factReview:{completed:true,rows:[{code:'B1',name,loadUnits,rpe,sets:[{target,kg:20,reps:5}]}]}});
 const series=historyPerformanceSeries([session('2026-10-01','DB Bench Press',2,'5',7),session('2026-10-02','DB Bench Press',1,'5',7),session('2026-10-03','DB Bench Press',2,'5/side',7),session('2026-10-04','DB Bench Press',2,'5',null)]);
 assert.equal(series.length,3);const exact=series.find(row=>row.loadUnits===2 && !row.perSide),points=performancePoints(exact);
 const summary=periodFacts(points,{from:'2026-10-01',to:'2026-10-04'});
 assert.equal(summary.observations,2);assert.equal(summary.kg,2);assert.equal(summary.rpe,1);assert.equal(summary.latest.rpe,null);
});

test('a partial daily status cannot become a successful zero counter snapshot',async()=>{
 const {requestDailyOverview}=await import('../lib/coachOverviewRequest.mjs');const original=global.fetch;
 global.fetch=async url=>({ok:true,json:async()=>String(url).startsWith('/api/team/readiness')?{players:[{id:'1'},{id:'2'}]}:{status:{'1':{hasSession:true}}}});
 try{await assert.rejects(requestDailyOverview({workspace:'nkperf',date:'2026-10-14',apiKey:'fixture',playerIds:['1','2']}),/не полностью/);}finally{global.fetch=original;}
});
for(const role of ['backup','recovery-drill'])test(role+': workspaces run serially and one failure does not skip the other',async()=>{
 const {readFileSync}=await import('node:fs');const fn=role==='backup'?'createEncryptedBackup':'runRecoveryDrill';
 const source=readFileSync(new URL('../pages/api/cron/'+role+'.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 let running=0;const seen=[];const deps={cronAuthorizationStatus:()=>({ok:true}),recordPlatformEvent:async()=>{},[fn]:async workspace=>{assert.equal(running,0);running++;seen.push(workspace);await Promise.resolve();running--;if(workspace==='zarechie')throw Error('synthetic failure');return {workspace,keyCount:1,sampledKeyCount:1,verifiedTypes:[]};},console:{error:()=>{}}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'GET'},res);assert.deepEqual(seen,['zarechie','nkperf']);assert.equal(res.code,500);assert.equal(res.body.ok,false);
});

test('overview restoration waits for the returned screen snapshot, never its soon-to-be-removed table',async()=>{
 const {overviewRestoreReady}=await import('../lib/coachAuditPresentation.mjs');const target={requestedAt:Date.parse('2026-10-14T10:00:00Z')};
 assert.equal(overviewRestoreReady(target,null),false);assert.equal(overviewRestoreReady(target,'2026-10-14T09:59:59Z'),false);assert.equal(overviewRestoreReady(target,'2026-10-14T10:00:01Z'),true);
});
