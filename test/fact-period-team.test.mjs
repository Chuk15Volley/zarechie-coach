import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {factPeriod,validFactPeriod,factTasks} from '../lib/factPeriod.mjs';
import {calendarToday} from '../lib/coachCalendar.mjs';
import {selectGymEdition} from '../lib/gymEdition.mjs';
import {playerHistoryFacts,historyNeedsFacts} from '../lib/playerHistoryFacts.mjs';
import {strengthSessionCompletion} from '../lib/strengthCompletion.mjs';
import {strengthMissingEditor,normalizeActualPatches,resolveStrengthSupplement,actualFingerprint} from '../lib/strengthActualSupplement.mjs';
import {historyPerformanceSeries,performancePoints} from '../lib/strengthPerformance.mjs';
import {queueResponseGate} from '../lib/teamQueueClient.mjs';
const compile=(path,deps,returned='handler')=>new Function(...Object.keys(deps),fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/^export \{[^\n]+\n/gm,'').replace(/export default /g,'').replace(/^export /gm,'')+';return '+returned)(...Object.values(deps));
const call=async(handler,query,method='GET',auth=true)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({query,body:query,method,auth},res);return res;};
function fixture(){const date='2026-10-12',record={date,focus:'inseason_strength',savedAt:date+'T08:00:00Z',session:{blocks:[{label:'C',exercises:[{code:'C2',name:'One-Arm DB Row',weightKg:99,loadUnits:1,targetSets:['5/side']}]}]}},log={savedAt:date+'T09:00:00Z',completedAt:date+'T09:00:00Z',done:{'0-0-0':true},weights:{},repetitions:{}};return {record,log};}
test('period uses Moscow day across UTC midnight, validates leap days/order and bounds to 366 dates',()=>{
 assert.equal(calendarToday(new Date('2026-10-13T22:00:00Z')),'2026-10-14');assert.deepEqual(factPeriod(28,'2026-10-14'),{from:'2026-09-17',to:'2026-10-14'});
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-10-15','2026-10-14'],['2025-01-01','2026-10-14'],[[],'2026-10-14']])assert.equal(validFactPeriod(from,to),false);
 assert.equal(validFactPeriod('2024-02-29','2024-02-29'),true);
});
test('additional exact exercise accepts missing-only supplement, plots per-side real reps and links exact missing field',()=>{
 const {record,log}=fixture(),editor=strengthMissingEditor(record,null,log,null),tasks=factTasks({rows:editor.rows});assert.equal(tasks[0].code,'C2');assert.equal(tasks[0].fields.length,3);
 const patches=normalizeActualPatches(editor,[{exercise:'0-0',set:0,field:'kg',value:22},{exercise:'0-0',set:0,field:'reps',value:6},{exercise:'0-0',field:'rpe',value:7}]);assert.ok(patches);
 const supplement={version:2,baseFingerprint:actualFingerprint(record,null,log),patches},review=playerHistoryFacts(record,null,log,supplement),point=performancePoints(historyPerformanceSeries([{date:record.date,focus:record.focus,factReview:review}])[0])[0];assert.deepEqual([point.kg,point.reps,point.rpe],[22,6,7]);assert.equal(point.missingFields.length,0);assert.equal(resolveStrengthSupplement(record,null,log,supplement).actual.exercises[0].setActuals[0].reps,12);
 const missing=performancePoints(historyPerformanceSeries([{date:record.date,focus:record.focus,factReview:playerHistoryFacts(record,null,log,null)}])[0])[0];assert.deepEqual(missing.missingFields.map(p=>[p.exercise,p.set,p.field]),[['0-0',0,'kg'],['0-0',0,'reps'],['0-0',null,'rpe']]);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': mirrored edition selects legacy completion, respects newer undo/different edition and never mutates source',()=>{
 const {record,log}=fixture(),raw=JSON.stringify(log),a={record,sourcePlayerId:'12'},b={record:structuredClone(record),sourcePlayerId:'whoop_12',rawLog:log};
 let chosen=selectGymEdition([a,b]);assert.equal(chosen.sourcePlayerId,'whoop_12');assert.equal(strengthSessionCompletion(chosen.record,null,chosen.rawLog).completed,true);assert.equal(JSON.stringify(log),raw);
 chosen=selectGymEdition([{...a,rawLog:{...log,savedAt:'2026-10-12T10:00:00Z',done:{},completedAt:null}},b]);assert.equal(chosen.sourcePlayerId,'12');assert.equal(strengthSessionCompletion(chosen.record,null,chosen.rawLog).completed,false);
 const different={...a,record:{...record,savedAt:'2026-10-12T11:00:00Z'}};assert.equal(selectGymEdition([different,b]).sourcePlayerId,'12');
 const collision={...a,record:{...record,session:{blocks:[]}}};assert.equal(selectGymEdition([collision,b]).sourcePlayerId,'12');
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': team fact overview uses authoritative roster, separates awaiting completion and reports only exact missing fields',async()=>{
 const {record,log}=fixture();let loaded=0;
 const deps={isAuthorized:req=>req.auth,workspaceRoster:async ws=>{assert.equal(ws,workspace);return {players:[{id:'12',name:'Fictional One'},{id:'13',name:'Fictional Two'}],source:'readysix'};},gymSessionDates:async(ws,id)=>{assert.equal(ws,workspace);return [record.date];},loadGymFacts:async(ws,entries)=>{loaded++;return entries.map(e=>({record,rawActual:null,rawLog:e.playerId==='12'?log:null,supplement:null}));},playerHistoryFacts,historyNeedsFacts,validFactPeriod,factTasks,calendarToday:()=> '2026-10-14'};
 const handler=compile('pages/api/players/team-fact-gaps.js',deps),query={workspace,from:'2026-10-01',to:'2026-10-14'};
 assert.equal((await call(handler,query,'GET',false)).code,401);assert.equal(loaded,0);assert.equal((await call(handler,{...query,to:'2099-01-01'})).code,400);assert.equal((await call(handler,query,'POST')).code,405);
 const response=await call(handler,query);assert.equal(response.code,200);assert.equal(response.body.players.length,2);assert.equal(response.body.players[0].missingFields,3);assert.equal(response.body.players[1].awaiting,1);assert.equal(response.body.players[1].sessions.length,0);assert.equal(response.body.players[0].sessions[0].rows[0].fields[0].exercise,'0-0');
 const fail=compile('pages/api/players/team-fact-gaps.js',{...deps,workspaceRoster:async()=>{throw Error('offline');}});assert.equal((await call(fail,query)).code,503);
});
test('queue recovery offers previous date explicitly without changing opening date or loading it as current',async()=>{
 const effects=[],changes=[],calls=[];let restoredDate=false;
 const hook=compile('hooks/useTeamGenerationQueue.js',{useState:value=>[value,next=>changes.push(next)],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),queueResponseGate,teamQueueCall:async(_key,url)=>{calls.push(url);return {queue:url.includes('queueId=')?{id:'old',workspace:'nkperf',date:'2026-10-13',revision:1,rows:[]}:null};},localStorage:{getItem:()=>JSON.stringify({id:'old',date:'2026-10-13'}),setItem(){}},window:{location:{search:''},addEventListener(){},removeEventListener(){}},document:{hidden:false},setTimeout:()=>1,clearTimeout(){}},'useTeamGenerationQueue');
 hook({workspace:'nkperf',date:'2026-10-14',apiKey:'fake',onRestoreDate:()=>{restoredDate=true;}});const cleanup=effects[0]();await new Promise(setImmediate);cleanup();assert.equal(restoredDate,false);assert.ok(calls.some(url=>url.includes('date=2026-10-14')));assert.ok(changes.some(value=>value?.id==='old' && value.date==='2026-10-13'));
});
test('coach cannot overwrite an already confirmed player workout through repeat completion',async()=>{
 const {record,log}=fixture(),handler=compile('pages/api/programs/save-actual.js',{isAuthorized:()=>true,loadGymFacts:async()=>[{record,rawLog:log,rawActual:null}],strengthSessionCompletion});
 assert.equal((await call(handler,{workspace:'nkperf',playerId:'12',date:record.date},'POST')).code,409);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': execution endpoint exposes verified legacy completion without writing or inventing facts',async()=>{
 const {record,log}=fixture();let reads=0;
 const handler=compile('pages/api/players/execution.js',{isAuthorized:req=>req.auth,validCoachDate:value=>/^2026-10-12$/.test(value),strengthSessionCompletion,loadGymFacts:async(ws,entries)=>{reads++;assert.equal(ws,workspace);assert.deepEqual(entries,[{playerId:'12',date:record.date}]);return [{record,rawLog:log,rawActual:null,sourcePlayerId:'whoop_12'}];}}),query={workspace,playerId:'12',date:record.date};
 assert.equal((await call(handler,query,'GET',false)).code,401);assert.equal(reads,0);assert.equal((await call(handler,query,'POST')).code,405);
 const result=await call(handler,query);assert.equal(result.code,200);assert.equal(result.body.execution.completed,true);assert.equal(result.body.execution.totalSets,1);assert.equal(result.body.execution.savedAt,record.savedAt);assert.equal(result.body.execution.source,'player_log');
});
test('history rejects an incomplete period rather than silently dropping an indexed workout',async()=>{
 const handler=compile('pages/api/players/sessions.js',{isAuthorized:()=>true,validFactPeriod,validCoachDate:()=>true,gymSessionDates:async()=>['2026-10-12'],loadGymFacts:async()=>[null]}),result=await call(handler,{workspace:'nkperf',playerId:'12',from:'2026-10-01',to:'2026-10-14'});assert.equal(result.code,503);assert.match(result.body.error,/История не подтверждена/);
});
