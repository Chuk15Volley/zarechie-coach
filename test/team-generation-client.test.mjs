import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTeamPlayer,completedTeamResult,runTeamGeneration} from '../lib/teamGenerationClient.mjs';
const response=(data,status=200,retry=null)=>({ok:status<400,status,headers:{get:()=>retry},json:async()=>data});
const done=kind=>({status:'done',session:{kind,blocks:[]},autoSaved:false,saveWarning:'Черновик готов для проверки и сохранения тренером.'});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: 13 October strength team drafts succeed through submit/poll with original context`,async()=>{
 const calls=[],updates=[],request={workspace,date:'2026-10-13',focus:'inseason_strength',trainingType:'posterior_chain',strengthMode:'development',autoSave:true};
 await runTeamGeneration(Array.from({length:10},(_,i)=>({id:String(i)})),{request,apiKey:'synthetic',onUpdate:(id,patch)=>updates.push({id,...patch}),generate:(body,options)=>generateTeamPlayer(body,{...options,wait:async()=>{},fetchImpl:async(url,init)=>{calls.push({url,body:init.body&&JSON.parse(init.body)});return response(init.method?{batchId:'job-'+body.playerId}:done('strength_training_draft'));}})});
 assert.equal(calls.filter(call=>call.body).length,10);assert.ok(calls.filter(call=>call.body).every(call=>call.body.workspace===workspace && call.body.date==='2026-10-13' && call.body.strengthMode==='development' && call.body.autoSave));
 assert.equal(updates.filter(row=>row.status==='done' && row.draft).length,10);assert.equal(updates.filter(row=>row.status==='error').length,0);
});
test('all coach review drafts count as prepared; ordinary failed autosave remains an error',()=>{
 for(const kind of ['strength_training_draft','prehab_training_draft','restricted_training_draft','restricted_day_plan'])assert.equal(completedTeamResult(done(kind)).autoSaved,false);
 assert.throws(()=>completedTeamResult(done('ordinary')),/Черновик готов/);assert.throws(()=>completedTeamResult({status:'done'}),/готовую программу/);
 assert.ok(completedTeamResult({...done('ordinary'),autoSaved:true}));
});
test('transient polling failures respect Retry-After and never submit a second job',async()=>{
 let submissions=0,polls=0;const waits=[];
 const result=await generateTeamPlayer({},{apiKey:'synthetic',wait:async ms=>waits.push(ms),fetchImpl:async(url,init)=>{if(init.method){submissions++;return response({batchId:'known'});}polls++;if(polls===1)return response({error:'temporarily unavailable'},503,'3');if(polls===2)throw new TypeError('network');return response(done('strength_training_draft'));}});
 assert.equal(submissions,1);assert.equal(result.status,'done');assert.deepEqual(waits,[3000,4000]);
});
test('resuming a known job polls it directly and does not generate again',async()=>{
 let submit=0;await generateTeamPlayer({},{apiKey:'synthetic',resumeBatchId:'known',fetchImpl:async(url,init)=>{if(init.method)submit++;assert.match(url,/batchId=known/);return response(done('strength_training_draft'));}});assert.equal(submit,0);
});
test('terminal failures are visible and do not retry while an ambiguous submission is never replayed',async()=>{
 for(const status of [401,404,422]){let calls=0;await assert.rejects(generateTeamPlayer({},{resumeBatchId:'known',fetchImpl:async()=>{calls++;return response({error:'specific failure'},status);}}),/specific failure/);assert.equal(calls,1);}
 let calls=0;await assert.rejects(generateTeamPlayer({},{fetchImpl:async()=>{calls++;throw Error('network');}}),/network/);assert.equal(calls,1);
});
test('one failed player does not stop the pool; concurrency and frozen date are bounded',async()=>{
 const request={workspace:'nkperf',date:'2026-10-13'},updates=[];let active=0,max=0;
 await runTeamGeneration(Array.from({length:10},(_,id)=>({id})),{request,onUpdate:(id,patch)=>updates.push({id,...patch}),generate:async body=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,1));assert.equal(body.date,'2026-10-13');request.date='2026-10-14';active--;if(body.playerId===4)throw Error('one failure');return done('strength_training_draft');}});
 assert.equal(max,3);assert.equal(updates.filter(row=>row.status==='done').length,9);assert.equal(updates.filter(row=>row.status==='error').length,1);
});
test('cancelling a run prevents stale updates and new player submissions',async()=>{
 const controller=new AbortController(),updates=[];let calls=0;
 await runTeamGeneration(Array.from({length:10},(_,id)=>({id})),{request:{date:'2026-10-13'},signal:controller.signal,onUpdate:(id,patch)=>updates.push(patch),generate:async()=>{calls++;controller.abort();return done('strength_training_draft');}});
 assert.equal(calls,1);assert.equal(updates.filter(row=>row.status==='done' || row.status==='error').length,0);
});
test('exhausted temporary polling errors can resume but terminal generation failures require a new submission',async()=>{
 const updates=[];let calls=0;
 await runTeamGeneration([{id:'one'}],{request:{},onUpdate:(id,patch)=>updates.push(patch),generate:(request,options)=>generateTeamPlayer(request,{...options,wait:async()=>{},fetchImpl:async(url,init)=>{calls++;return init.method?response({batchId:'existing'}):response({error:'offline'},503);}})});
 assert.equal(calls,5);assert.equal(updates.at(-1).retryBatchId,'existing');
 const failed=[];await runTeamGeneration([{id:'one'}],{request:{},onUpdate:(id,patch)=>failed.push(patch),generate:(request,options)=>generateTeamPlayer(request,{...options,fetchImpl:async(url,init)=>response(init.method?{batchId:'failed'}:{status:'failed',error:'quality failed'})})});assert.equal(failed.at(-1).retryBatchId,null);
});
