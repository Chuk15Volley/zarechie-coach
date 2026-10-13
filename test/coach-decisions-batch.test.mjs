import {coachAuditPage} from '../lib/coachAuditQuery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {saveDecisionBatch,SAVE_DECISION_BATCH_SCRIPT} from '../lib/strengthDecisionBatch.mjs';
import {DECISION_VERSION} from '../lib/strengthCycleDecisions.mjs';
import {coachAuditKey,coachAuditCommands,EXECUTE_AUDIT_COMMANDS} from '../lib/coachAudit.mjs';
import {coachAuditActor,createSessionToken} from '../lib/auth.js';
import {queuePrefix,validWorkspace,parseQueueJSON} from '../lib/teamQueue.mjs';
import {shiftIsoDate} from '../lib/developmentPlan.mjs';
const chain='anterior_chain',cycleId='2026-10-01';
function cycle(){return {id:cycleId,status:'completed',exercises:['anterior_chain','posterior_chain'].flatMap(trainingType=>['A1','B1','B2'].map(code=>({key:trainingType+code,trainingType,code,name:code+' exercise',loadUnits:1}))) };}
function fixture(workspace){
 const values=new Map(),events=[],prefix=queuePrefix(workspace);let lostReply=false,casConflict=false,reads=0;
 const redis=async(command,...args)=>{if(command==='get')return values.get(args[0]) || null;assert.equal(command,'eval');assert.equal(args[0],SAVE_DECISION_BATCH_SCRIPT);const n=args[1],keys=args.slice(2,2+n),rows=JSON.parse(args[2+n]),cmds=JSON.parse(args[3+n]);if(casConflict || rows.some((row,i)=>(values.get(keys[i]) || '')!==row.old))return 0;rows.forEach((row,i)=>values.set(keys[i],row.value));events.push(...cmds.filter(cmd=>cmd[0]==='ZADD').map(cmd=>({key:cmd[1],value:JSON.parse(cmd[3])})));if(lostReply){lostReply=false;throw Error('ambiguous commit');}return 1;};
 const input={workspace,trainingType:chain,requestId:randomUUID(),actor:{role:'coach',access:'session',id:'test-session'},items:['one','two'].map(playerId=>({playerId,cycleId,expectedRevision:null,entries:cycle().exercises.filter(row=>row.trainingType===chain).map(row=>({key:row.key,exercise:'keep',progression:'hold',volume:row.code==='A1'?'reduce_one':'normal',volumeReason:row.code==='A1'?'Утомление движения':'',note:playerId+' индивидуальная причина'}))})),loadReview:async()=>{reads++;return {cycles:[cycle()]};},redis};
 return {input,values,events,prefix,redis,reads:()=>reads,setLost:()=>{lostReply=true;},setConflict:()=>{casConflict=true;}};
}
for(const workspace of ['zarechie','nkperf'])test(workspace+': atomic group preserves other chain, individual reasons, one audit event per player and stale tabs never overwrite',async()=>{
 const f=fixture(workspace),previous={version:DECISION_VERSION,cycleId,revision:'prior',entries:cycle().exercises.filter(row=>row.trainingType==='posterior_chain').map(row=>({...row,exercise:'rotate',progression:'auto',volume:'normal',volumeReason:'',note:'Задняя цепь'}))};
 f.values.set(f.prefix+':strength:cycle-decision:one:'+cycleId,JSON.stringify(previous));f.input.items[0].expectedRevision='prior';
 const result=await saveDecisionBatch(f.input);assert.equal(result.decisions.length,2);assert.equal(f.events.length,2);assert.ok([...f.values.keys()].every(key=>key.startsWith(f.prefix+':')));assert.ok(f.events.every(event=>event.key===coachAuditKey(workspace)));
 const one=result.decisions[0].decision;assert.equal(one.entries.length,6);assert.deepEqual(one.entries.filter(entry=>entry.trainingType==='posterior_chain'),previous.entries);assert.ok(one.entries.filter(entry=>entry.trainingType===chain).every(entry=>entry.note.startsWith('one ')));
 assert.equal(f.events[0].value.previousRevision,'prior');assert.deepEqual(f.events[0].value.before,previous.entries);assert.deepEqual(f.events[0].value.after,one.entries);assert.equal(f.events[0].value.actor.id,'test-session');
 const replay=await saveDecisionBatch(f.input);assert.equal(replay.replayed,true);assert.equal(f.events.length,2);
 await assert.rejects(saveDecisionBatch({...f.input,requestId:randomUUID()}),{status:409});assert.equal(f.events.length,2);
 await assert.rejects(saveDecisionBatch({...f.input,items:f.input.items.slice(0,1)}),{status:409});
 const changed=structuredClone(f.input.items);changed[0].entries[0].note='Другой запрос';await assert.rejects(saveDecisionBatch({...f.input,items:changed}),{status:409});assert.equal(f.events.length,2);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': ambiguous committed batch replays without extra revisions or audit, CAS conflict and unavailable history commit nothing',async()=>{
 const f=fixture(workspace);f.setLost();await assert.rejects(saveDecisionBatch(f.input),/ambiguous/);const revisions=[...f.values.values()];assert.equal((await saveDecisionBatch(f.input)).replayed,true);assert.deepEqual([...f.values.values()],revisions);assert.equal(f.events.length,2);
 const conflict=fixture(workspace);conflict.setConflict();await assert.rejects(saveDecisionBatch(conflict.input),{status:409});assert.equal(conflict.values.size,0);assert.equal(conflict.events.length,0);
 const outage=fixture(workspace);await assert.rejects(saveDecisionBatch({...outage.input,loadReview:async()=>{throw Error('offline');}}),/offline/);assert.equal(outage.values.size,0);
});
test('batch rejects partial cycles, missing per-player reasons, duplicate players, foreign chain and missing movement before writing',async()=>{
 for(const modify of [f=>({...f.input,loadReview:async()=>({cycles:[{...cycle(),status:'in_progress'}]})}),f=>({...f.input,items:[f.input.items[0],f.input.items[0]]}),f=>({...f.input,items:[{...f.input.items[0],entries:f.input.items[0].entries.slice(0,1)}]}),f=>({...f.input,items:[{...f.input.items[0],entries:[{...f.input.items[0].entries[0],note:''},...f.input.items[0].entries.slice(1)]}]}),f=>({...f.input,items:[{...f.input.items[0],entries:[{...f.input.items[0].entries[0],key:'posterior_chainA1'},...f.input.items[0].entries.slice(1)]}]})]){
 const f=fixture('zarechie');await assert.rejects(saveDecisionBatch(modify(f)));assert.equal(f.values.size,0);assert.equal(f.events.length,0);
 }
});
test('audit actor labels signed sessions without exposing nonce, credentials or pretending a personal account',()=>{
 const old=process.env.TRAINER_API_KEY;process.env.TRAINER_API_KEY='synthetic-audit-credential';try{
 const token=createSessionToken(),actor=coachAuditActor({headers:{cookie:'kps_session='+token}});assert.equal(actor.access,'session');assert.match(actor.id,/^[a-f0-9]{12}$/);assert.equal(JSON.stringify(actor).includes(token),false);assert.deepEqual(coachAuditActor({headers:{'x-api-key':process.env.TRAINER_API_KEY}}),{role:'coach',access:'shared_key',id:null});assert.deepEqual(coachAuditActor({headers:{cookie:'kps_session=forged'}}),{role:'coach',access:'shared_key',id:null});
 }finally{if(old===undefined)delete process.env.TRAINER_API_KEY;else process.env.TRAINER_API_KEY=old;}
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': batch endpoint authenticates before history, uses strict scoped facts and rejects invalid calendar dates',async()=>{
 const source=fs.readFileSync(new URL('../pages/api/players/strength-cycle-decisions-batch.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','').replace(/^export /gm,'');let reads=0;
 const f=fixture(workspace),deps={isAuthorized:req=>req.auth!==false,coachAuditActor:()=>f.input.actor,enforceRateLimit:async()=>true,redis:f.redis,getRecentSessionRecords:async(id,depth,ws,before,options)=>{reads++;assert.equal(ws,workspace);assert.equal(options.strict,true);assert.equal(options.includeStrengthExecution,true);return [];},buildStrengthCycleReview:()=>({cycles:[cycle()]}),shiftIsoDate,saveDecisionBatch};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));const call=async(body,auth=true,method='POST')=>{const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method,body,auth},res);return res;};
 const body={workspace,date:'2026-10-13',trainingType:chain,requestId:f.input.requestId,items:f.input.items};assert.equal((await call(body,false)).code,401);assert.equal(reads,0);assert.equal((await call(body,true,'GET')).code,405);assert.equal((await call({...body,date:'2026-02-30'})).code,400);assert.equal((await call({...body,workspace:'foreign'})).code,400);assert.equal(reads,0);assert.equal((await call(body)).code,200);assert.equal(reads,2);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': audit endpoint returns only scoped latest metadata and rejects unauthorised reads',async()=>{
 const source=fs.readFileSync(new URL('../pages/api/players/coach-audit.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');let reads=0;
 const deps={coachAuditPage,isAuthorized:req=>req.auth!==false,redis:async(command,key,start,end)=>{reads++;assert.equal(command,'zrevrange');assert.equal(key,coachAuditKey(workspace));assert.equal(start,0);assert.equal(end,99);return [JSON.stringify({id:randomUUID(),at:'2026-10-13T08:00:00Z',type:'cycle_decision'})];},enforceRateLimit:async()=>true,validWorkspace,parseQueueJSON,coachAuditKey};const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'GET',auth:false,query:{workspace}},res);assert.equal(res.code,401);assert.equal(reads,0);await handler({method:'GET',query:{workspace:'invalid'}},res);assert.equal(res.code,400);await handler({method:'GET',query:{workspace}},res);assert.equal(res.code,200);assert.equal(res.body.retained,2000);
});
