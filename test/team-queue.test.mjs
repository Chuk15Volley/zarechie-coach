import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as pure from '../lib/teamQueue.mjs';
import * as drafts from '../lib/generatedDraft.mjs';
import {generateTeamPlayer} from '../lib/teamGenerationClient.mjs';
function compile(path,deps,returned){
 const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const imports=[...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/gm)].flatMap(match=>match[1].replace(/[{}]/g,'').split(',').map(x=>x.trim()).filter(Boolean));
 const args=Object.fromEntries(imports.map(name=>[name,()=>{throw Error('Unexpected '+name);} ]));Object.assign(args,deps);
 const body=source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/export default /g,'').replace(/^export /gm,'');
 return new Function(...Object.keys(args),body+';return '+returned+';')(...Object.values(args));
}
function memory(){const values=new Map(),hashes=new Map(),lists=new Map(),ttl=new Map();
 const redis=async(method,key,...args)=>{method=method.toLowerCase();if(method==='get')return values.get(key) || null;if(method==='set'){if(args.includes('NX') && values.has(key))return null;values.set(key,args[0]);if(args.includes('EX'))ttl.set(key,Number(args[args.indexOf('EX')+1]));return 'OK';}if(method==='del')return Number(values.delete(key));if(method==='hget')return hashes.get(key)?.get(args[0]) || null;if(method==='hset'){if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(args[0],args[1]);return 1;}if(method==='expire'){ttl.set(key,Number(args[0]));return 1;}if(method==='lpush'){if(!lists.has(key))lists.set(key,[]);lists.get(key).unshift(args[0]);return lists.get(key).length;}if(method==='ltrim'){lists.set(key,(lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1));return 'OK';}if(method==='lrange')return (lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1);throw Error('Unhandled '+method);};
 const redisPipeline=async commands=>Promise.all(commands.map(async([cmd,...args])=>{if(cmd!=='EVAL')return redis(cmd,...args);const [script,n,key,...argv]=args;if(script.includes('HGET')){const current=await redis('hget',key,argv[0]) || argv[1];if(current!==argv[1])return 0;await redis('hset',key,argv[0],argv[2]);return 1;}if(await redis('get',key)===argv[0])return redis('del',key);return 0;}));return {redis,redisPipeline,values,hashes,ttl};
}
function fixture(){const store=memory(),deps={...store,...pure,...drafts,crypto,isAuthorized:req=>req.authorized!==false,enforceRateLimit:async()=>true};
 Object.assign(deps,compile('lib/teamQueueStore.js',deps,'({loadTeamQueue,createTeamQueue,teamQueueView,retryTeamPlayer,markTeamPlayerReviewed,teamQueueProgram})'));
 Object.assign(deps,compile('lib/generationMonitoring.js',deps,'({recordGenerationEvent,generationMonitor,observeGenerationResponse})'));
 let builds=0,build=async request=>({readyResult:{date:request.date,focus:'inseason_strength',trainingType:request.trainingType,strengthMode:request.strengthMode,autoSaved:false,quality:{valid:true},session:{kind:'strength_training_draft',blocks:[{exercises:[{code:'A1',name:'Goblet Squat',targetSets:['4','4'],weightKg:20}]}]}}});
 const submit=compile('pages/api/programs/generate-async.js',{...deps,buildGenerationInputs:async request=>{builds++;return build(request);}},'handler');
 const poll=compile('pages/api/programs/generate-status.js',deps,'handler');
 const queueApi=compile('pages/api/programs/team-queue.js',deps,'handler'),monitorApi=compile('pages/api/programs/generation-monitor.js',deps,'handler');
 const call=async(handler,body,query,authorized=true)=>{const res={code:200,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};await handler({method:body?'POST':'GET',body,query,authorized},res);return res;};
 return {...store,...deps,submit,poll,queueApi,monitorApi,call,builds:()=>builds,setBuild:value=>{build=value;}};
}
const request=workspace=>({workspace,date:'2026-10-13',focus:'inseason_strength',trainingType:'posterior_chain',strengthMode:'development',notes:'Private coach context',autoSave:true});
for(const workspace of ['zarechie','nkperf'])test(workspace+': actual queue/API/client survive lost submit response and reuse one result after reload',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const f=fixture(),created=await f.call(f.queueApi,{action:'create',request:request(workspace),players:[{id:'athlete',name:'Synthetic'}]});assert.equal(created.code,200);const queue=created.body.queue,row=queue.rows[0];
 const body={workspace,playerId:'athlete',teamQueueId:queue.id,date:'2099-01-01',focus:'forged'};
 const submitted=await f.call(f.submit,body);assert.equal(submitted.code,200);assert.equal(submitted.body.batchId,row.batchId);assert.equal(f.builds(),1);
 const restored=await f.call(f.queueApi,null,{workspace,date:queue.date});assert.equal(restored.body.queue.rows[0].status,'done');assert.equal(restored.body.queue.rows[0].draft,true);assert.equal(restored.body.queue.request.notes,'Private coach context');
 const result=await generateTeamPlayer(body,{apiKey:'synthetic',wait:async()=>{},fetchImpl:async(url,options)=>{const res=options.method?await f.call(f.submit,JSON.parse(options.body)):await f.call(f.poll,null,Object.fromEntries(new URL(url,'http://local').searchParams));return {ok:res.code<400,status:res.code,json:async()=>res.body};}});
 assert.equal((await f.call(f.poll,null,{workspace,batchId:row.batchId})).headers['Cache-Control'],'no-store');
 assert.equal(f.builds(),1);assert.equal(result.date,'2026-10-13');assert.equal(result.coachReview,true);assert.equal(result.autoSaved,false);assert.equal(f.ttl.get('coach:batch:'+row.batchId),pure.TEAM_QUEUE_TTL);
 assert.equal((await f.call(f.queueApi,null,{workspace:workspace==='nkperf'?'zarechie':'nkperf',queueId:queue.id})).code,404);
 assert.equal((await f.call(f.poll,null,{workspace:workspace==='nkperf'?'zarechie':'nkperf',batchId:row.batchId})).code,404);
 await f.markTeamPlayerReviewed(await f.loadTeamQueue(workspace,queue.id),'athlete',row.batchId,true);let view=await f.teamQueueView(await f.loadTeamQueue(workspace,queue.id));assert.equal(view.rows[0].reviewed,true);assert.equal(view.rows[0].saved,false);
 const prefix=workspace==='nkperf'?'nkperf':'coach';f.values.set(`${prefix}:session:athlete:${queue.date}`,JSON.stringify({savedAt:new Date().toISOString(),session:result.session}));view=await f.teamQueueView(await f.loadTeamQueue(workspace,queue.id));assert.equal(view.rows[0].saved,true);
 const opened=await f.call(f.queueApi,null,{workspace,queueId:queue.id,playerId:'athlete'});assert.equal(opened.body.record.session.teamGeneration.batchId,row.batchId);
 f.values.set(drafts.generatedDraftKey(workspace,'athlete',queue.date),JSON.stringify({session:{blocks:[]}}));assert.equal((await f.call(f.queueApi,null,{workspace,queueId:queue.id,playerId:'athlete'})).body.record.session.teamGeneration.batchId,row.batchId,'opening must use the queue job, not the most recent unrelated draft');
 const monitor=await f.generationMonitor(workspace);assert.equal(monitor.counts.SUBMITTED,1);assert.equal(monitor.counts.PREPARED,1);assert.ok(!JSON.stringify(monitor).includes('Private coach context'));assert.ok(!JSON.stringify(monitor).includes('Goblet Squat'));
});
test('two concurrent submissions reserve one job; interrupted preparation is pending then recoverable',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]}),body={workspace:'nkperf',playerId:'one',teamQueueId:q.id};let release,entered;const ready=new Promise(resolve=>{entered=resolve;});
 f.setBuild(async()=>{entered();await new Promise(resolve=>{release=resolve;});return {readyResult:{date:q.date,autoSaved:false,session:{kind:'strength_training_draft',blocks:[]}}};});
 const first=f.call(f.submit,body);await ready;const second=await f.call(f.submit,body);assert.equal(second.code,202);const pending=await f.call(f.poll,null,{batchId:q.players[0].batchId,workspace:'nkperf'});assert.equal(pending.body.processing_status,'preparing');release();await first;assert.equal(f.builds(),1);
 const key='coach:batch:'+q.players[0].batchId,job=JSON.parse(f.values.get(key));f.values.set(key,JSON.stringify({...job,status:'preparing',leaseUntil:0}));assert.equal((await f.call(f.poll,null,{batchId:q.players[0].batchId})).code,410);assert.equal((await f.teamQueueView(q)).rows[0].status,'queued');
 f.setBuild(async()=>({readyResult:{date:q.date,autoSaved:false,session:{kind:'strength_training_draft',blocks:[]}}}));
 const recovered=await generateTeamPlayer(body,{apiKey:'synthetic',resumeBatchId:q.players[0].batchId,wait:async()=>{},fetchImpl:async(url,options)=>{const response=options.method?await f.call(f.submit,JSON.parse(options.body)):await f.call(f.poll,null,Object.fromEntries(new URL(url,'http://local').searchParams));return {ok:response.code<400,status:response.code,json:async()=>response.body};}});assert.equal(recovered.status,'done');assert.equal(f.builds(),2);
});
test('failed player retries use a new scoped identity without regenerating successful neighbours; reviews cannot cross jobs',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('zarechie'),players:[{id:'one'},{id:'two'}]});const row=q.players[0];f.values.set('coach:batch:'+row.batchId,JSON.stringify({teamQueueId:q.id,workspace:q.workspace,playerId:row.playerId,status:'failed',error:'Quality rejected'}));
 const next=await f.retryTeamPlayer(q,row.playerId,row.batchId);assert.notEqual(next.players[0].batchId,row.batchId);assert.equal(next.players[1].batchId,q.players[1].batchId);
 await assert.rejects(f.retryTeamPlayer(q,row.playerId,row.batchId),/Другой экран/);await assert.rejects(f.markTeamPlayerReviewed(next,row.playerId,row.batchId,true),/актуальный/);
 await assert.rejects(f.createTeamQueue({request:request('zarechie'),players:[{id:'one'}]}),/незавершённая/);
});
test('queue and monitor enforce authentication, scoped requests, bounded input and metadata-only telemetry',async()=>{
 const f=fixture();assert.equal((await f.call(f.queueApi,null,{workspace:'nkperf',date:'2026-10-13'},false)).code,401);assert.equal((await f.call(f.monitorApi,null,{workspace:'nkperf'},false)).code,401);
 assert.equal((await f.call(f.queueApi,{action:'create',request:{workspace:'nkperf',date:'2026-02-30'},players:[{id:'one'}]})).code,400);
 assert.throws(()=>pure.queueRequest({workspace:'other',date:'2026-10-13'}));assert.throws(()=>pure.queuePlayers([{id:'same'},{id:'same'}]));assert.equal(pure.queueRequest(request('nkperf')).autoSave,false);
 assert.equal((await f.call(f.monitorApi,{workspace:'nkperf',queueId:crypto.randomUUID(),batchId:'not-scoped',code:'NETWORK_INTERRUPTED',message:'private'})).code,400);
 await f.recordGenerationEvent({workspace:'nkperf',code:'SERVICE_UNAVAILABLE',phase:'submit',batchId:'synthetic',message:'secret symptoms'});await f.recordGenerationEvent({workspace:'nkperf',code:'SERVICE_UNAVAILABLE',phase:'submit',batchId:'synthetic'});const m=await f.generationMonitor('nkperf');assert.equal(m.counts.SERVICE_UNAVAILABLE,1);assert.equal(m.needsAttention,true);assert.ok(!JSON.stringify(m).includes('secret'));assert.deepEqual((await f.generationMonitor('zarechie')).counts,{});
});

test('concurrent queue creation admits only one manifest for the same space and date',async()=>{
 const f=fixture(),body={request:request('nkperf'),players:[{id:'one'}]};
 const results=await Promise.allSettled([f.createTeamQueue(body),f.createTeamQueue(body)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
});
