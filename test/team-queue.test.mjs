import * as audit from '../lib/coachAudit.mjs';
import * as publicationPolicy from '../lib/teamPublicationPolicy.mjs';
import * as fingerprint from '../lib/readySixPublication.mjs';
import {runQueueTick} from '../lib/teamQueueWorker.mjs';
import {readySixPublicationCheck} from '../lib/readySixPublication.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as policy from '../lib/teamQueuePolicy.mjs';
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
function memory(){const values=new Map(),hashes=new Map(),lists=new Map(),ttl=new Map(),sorted=new Map();
 const redis=async(method,key,...args)=>{method=method.toLowerCase();if(method==='zadd'){if(!sorted.has(key))sorted.set(key,new Map());sorted.get(key).set(args[1],Number(args[0]));return 1;}if(method==='zremrangebyrank')return 0;if(method==='zrevrange')return [...(sorted.get(key)||new Map()).keys()].reverse().slice(Number(args[0]),Number(args[1])+1);if(method==='zrange')return [...(sorted.get(key)||new Map()).keys()].slice(Number(args[0]),Number(args[1])+1);if(method==='zrem')return Number(sorted.get(key)?.delete(args[0]));if(method==='eval')return (await redisPipeline([['EVAL',key,...args]]))[0];if(method==='get')return values.get(key) || null;if(method==='set'){if(args.includes('NX') && values.has(key))return null;values.set(key,args[0]);if(args.includes('EX'))ttl.set(key,Number(args[args.indexOf('EX')+1]));return 'OK';}if(method==='del')return Number(values.delete(key));if(method==='hget')return hashes.get(key)?.get(args[0]) || null;if(method==='hdel')return Number(hashes.get(key)?.delete(args[0]));if(method==='hset'){if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(args[0],args[1]);return 1;}if(method==='expire'){ttl.set(key,Number(args[0]));return 1;}if(method==='lpush'){if(!lists.has(key))lists.set(key,[]);lists.get(key).unshift(args[0]);return lists.get(key).length;}if(method==='ltrim'){lists.set(key,(lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1));return 'OK';}if(method==='lrange')return (lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1);throw Error('Unhandled '+method);};
 const redisPipeline=async commands=>Promise.all(commands.map(async([cmd,...args])=>{if(cmd!=='EVAL')return redis(cmd,...args);if(args[0]===audit.EXECUTE_AUDIT_COMMANDS){for(const command of JSON.parse(args[2]))await redis(...command);return 1;}const [script,n,key,...argv]=args;if(Number(n)===2 && script.includes('ZADD')){const [index,value,ttl,score,id]=argv;await redis('set',key,value,'EX',ttl);await redis('zadd',index,score,id);return 1;}if(Number(n)===3){const [latest,draft,player,batch,queue,value]=argv;const current=await redis('hget',key,player);if(current && current!==batch || await redis('get',latest)!==queue)return 0;await redis('set',draft,value);return 1;}if(script.includes('PEXPIRE'))return (await redis('get',key))===argv[0]?1:0;if(script.includes("=='cancelled'")){if(await redis('get',key)==='cancelled')return 0;await redis('set',key,argv[0]);return 1;}if(script.includes('HGET')){const current=await redis('hget',key,argv[0]) || argv[1];if(current!==argv[1])return 0;await redis('hset',key,argv[0],argv[2]);return 1;}if(await redis('get',key)===argv[0])return redis('del',key);return 0;}));return {redis,redisPipeline,values,hashes,ttl,sorted};
}
function fixture(){const store=memory(),deps={...store,...audit,coachAuditActor:()=>({role:"coach",access:"shared_key",id:null}),...pure,...drafts,...policy,...publicationPolicy,...fingerprint,crypto,getPlayerSnapshot:async()=>({readySixMeta:{},readySixDecision:{recommendation:'full'}}),isAuthorized:req=>req.authorized!==false,enforceRateLimit:async()=>true};
 Object.assign(deps,compile('lib/teamQueueStore.js',deps,'({loadTeamQueue,createTeamQueue,teamQueueView,retryTeamPlayer,markTeamPlayerReviewed,teamQueueProgram,controlTeamQueue,mutateTeamQueue,writeCurrentTeamDraft})'));
 Object.assign(deps,compile('lib/teamPublicationChecks.js',deps,'({checkTeamPublication})'));
 Object.assign(deps,compile('lib/teamQueuePublication.js',{...deps,saveProgram:async()=>{throw Error('No actual save in default fixture');}},'({publishTeamQueue})'));
 Object.assign(deps,compile('lib/teamPublicationRun.js',deps,'({startPublicationRun,stepPublicationRun})'));
 Object.assign(deps,compile('lib/generationMonitoring.js',deps,'({recordGenerationEvent,generationMonitor,observeGenerationResponse})'));
 let builds=0,build=async request=>({readySixState:fingerprint.readySixPublicationState({readySixMeta:{},readySixDecision:{recommendation:'full'}},[]),readySixCheck:fingerprint.readySixPublicationCheck({readySixMeta:{},readySixDecision:{recommendation:'full'}},[]),readyResult:{date:request.date,focus:'inseason_strength',trainingType:request.trainingType,strengthMode:request.strengthMode,autoSaved:false,quality:{valid:true},session:{kind:'strength_training_draft',blocks:[{exercises:[{code:'A1',name:'Goblet Squat',targetSets:['4','4'],weightKg:20}]}]}}});
 const submit=compile('pages/api/programs/generate-async.js',{...deps,buildGenerationInputs:async request=>{builds++;return build(request);}},'handler');
 const poll=compile('pages/api/programs/generate-status.js',deps,'handler');
 const queueApi=compile('pages/api/programs/team-queue.js',deps,'handler'),monitorApi=compile('pages/api/programs/generation-monitor.js',deps,'handler');
 const call=async(handler,body,query,authorized=true)=>{if(body?.queueId && body.action && body.expectedRevision===undefined)body={...body,expectedRevision:(await deps.loadTeamQueue(body.workspace,body.queueId))?.revision};const res={code:200,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};await handler({method:body?'POST':'GET',body,query,authorized},res);return res;};
 return {...store,...deps,submit,poll,queueApi,monitorApi,call,builds:()=>builds,setBuild:value=>{build=value;}};
}
const request=workspace=>({workspace,date:'2026-10-13',focus:'inseason_strength',trainingType:'posterior_chain',strengthMode:'development',notes:'Private coach context',autoSave:true});
for(const workspace of ['zarechie','nkperf'])test(workspace+': actual queue/API/client survive lost submit response and reuse one result after reload',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const f=fixture(),created=await f.call(f.queueApi,{action:'create',request:request(workspace),players:[{id:'athlete',name:'Synthetic'}]});assert.equal(created.code,200);const queue=created.body.queue,row=queue.rows[0];
 const body={workspace,playerId:'athlete',teamQueueId:queue.id,date:'2099-01-01',focus:'forged'};
 const submitted=await f.call(f.submit,body);assert.equal(submitted.code,200);assert.equal(submitted.body.batchId,row.batchId);assert.equal(f.builds(),1);assert.equal((await f.generationMonitor(workspace)).counts.PREPARED,1,'ready submit must be monitored before any poll');
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

for(const workspace of ['zarechie','nkperf'])test(workspace+': background worker survives reload/restart, respects pause/cancel and isolates workspaces',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'},{id:'two'}]});
 let calls=0;
 const tick=()=>runQueueTick({redis:f.redis,request:async(path,body)=>{calls++;const res=body?await f.call(f.submit,body):await f.call(f.poll,null,Object.fromEntries(new URL(path,'http://local').searchParams));return {status:res.code,data:res.body};}});
 await f.controlTeamQueue(q,'pause');await tick();assert.equal(calls,0);assert.equal((await f.call(f.submit,{workspace,teamQueueId:q.id,playerId:'one'})).body.code,'QUEUE_STOPPED');
 await f.controlTeamQueue(q,'resume');await tick();assert.equal(f.builds(),2);assert.ok((await f.teamQueueView(await f.loadTeamQueue(workspace,q.id))).rows.every(row=>row.status==='done'));
 await tick();assert.equal(f.builds(),2,'a restarted worker must not regenerate ready jobs');assert.equal((await f.redis('zrange',pure.queuePrefix(workspace)+':team-queue-active',0,31)).length,0);
 const next=await f.createTeamQueue({request:{...request(workspace),date:'2026-10-14'},players:[{id:'three'}]});
 await f.controlTeamQueue(next,'cancel');await tick();assert.equal(f.builds(),2);assert.equal((await f.teamQueueView(await f.loadTeamQueue(workspace,next.id))).rows[0].status,'cancelled');await assert.rejects(f.controlTeamQueue(next,'resume'),/отменена/);await assert.rejects(f.retryTeamPlayer(await f.loadTeamQueue(workspace,next.id),'three',next.players[0].batchId),/Отменённую/);
 assert.equal(await f.loadTeamQueue(workspace==='nkperf'?'zarechie':'nkperf',q.id),null);
});
test('worker honours a shared lease and deferred provider quota without losing durable jobs',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]});let calls=0;
 await f.redis('set','coach:team-worker:lease','another');await runQueueTick({redis:f.redis,request:async()=>{calls++;}});assert.equal(calls,0);await f.redis('del','coach:team-worker:lease');
 const options={redis:f.redis,now:100,request:async()=>{calls++;return {status:429,retryAfter:60,data:{}};}};
 await runQueueTick(options);assert.equal(calls,1);await runQueueTick({...options,now:200});assert.equal(calls,1);await runQueueTick({...options,now:60200});assert.equal(calls,2);assert.equal((await f.teamQueueView(q)).rows[0].status,'queued');
});
test('monitor retains failure history and separates resolved jobs, retry lineage and active failures',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'},{id:'two'}]});const [one,two]=q.players;
 for(const row of q.players){await f.redis('set','coach:batch:'+row.batchId,JSON.stringify({workspace:'nkperf',teamQueueId:q.id,playerId:row.playerId,status:'failed'}));await f.recordGenerationEvent({workspace:'nkperf',code:'GENERATION_FAILED',batchId:row.batchId});}
 let m=await f.generationMonitor('nkperf');assert.equal(m.incidents.activeCount,2);
 const retried=await f.retryTeamPlayer(q,one.playerId,one.batchId),next=retried.players[0];await f.redis('set','coach:batch:'+next.batchId,JSON.stringify({workspace:'nkperf',status:'done'}));
 m=await f.generationMonitor('nkperf');assert.equal(m.incidents.activeCount,1);assert.equal(m.incidents.resolvedCount,1);assert.equal(m.counts.GENERATION_FAILED,2);assert.equal(m.needsAttention,true);
 await f.redis('set','coach:batch:'+two.batchId,JSON.stringify({workspace:'nkperf',status:'done'}));m=await f.generationMonitor('nkperf');assert.equal(m.incidents.activeCount,0);assert.equal(m.incidents.resolvedCount,2);assert.equal(m.needsAttention,false);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': publication checks ReadySix, only reviewed current jobs, medical review and individual-save conflicts',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'},{id:'two'},{id:'unreviewed'}]});
 const snapshot={targetDate:q.date,readySixMeta:{generatedAt:'first'},readySixDecision:{recommendation:'full'},injuryLog:[]};let changed=false,saved=[];
 for(const row of q.players){await f.redis('set','coach:batch:'+row.batchId,JSON.stringify({workspace,playerId:row.playerId,teamQueueId:q.id,status:'done',readySixCheck:readySixPublicationCheck(snapshot,[]),quality:{valid:true},session:{kind:'strength_training_draft',blocks:[],teamGeneration:{queueId:q.id,batchId:row.batchId}}}));if(row.playerId!=='unreviewed')await f.markTeamPlayerReviewed(await f.loadTeamQueue(workspace,q.id),row.playerId,row.batchId,true);}
 const checkTeamPublication=compile('lib/teamPublicationChecks.js',{...f,...fingerprint,getPlayerSnapshot:async()=>({...snapshot,...(changed?{injuryLog:[{zone:'calf'}]}:{})})},'checkTeamPublication');
 const publish=compile('lib/teamQueuePublication.js',{...f,crypto,checkTeamPublication,saveProgram:async(req,res,guard)=>{assert.ok(guard.batchId);saved.push(req.body.playerId);return res.status(req.body.playerId==='two'?409:200).json({error:'Changed saved edition'});}},'publishTeamQueue');
 let result=await publish(await f.loadTeamQueue(workspace,q.id),{authorized:true});assert.deepEqual(saved,['one','two']);assert.equal(result[0].status,'published');assert.equal(result[1].status,'blocked');
 saved=[];changed=true;result=await publish(await f.loadTeamQueue(workspace,q.id),{authorized:true});assert.equal(saved.length,0);assert.ok(result.every(row=>row.status==='blocked'));assert.ok((await f.teamQueueView(await f.loadTeamQueue(workspace,q.id))).rows.every(row=>!row.reviewed));
 const one=q.players[0],job=JSON.parse(await f.redis('get','coach:batch:'+one.batchId));await f.redis('set','coach:batch:'+one.batchId,JSON.stringify({...job,quality:{medicalReviewRequired:true}}));await f.markTeamPlayerReviewed(q,'one',one.batchId,true);changed=false;result=await publish(await f.loadTeamQueue(workspace,q.id),{authorized:true});assert.equal(saved.length,0);assert.match(result[0].message,/индивидуальная/);
});
test('ReadySix publication digest ignores response timestamps but detects regional, calendar and coach restriction changes',()=>{
 const snapshot={readySixMeta:{generatedAt:'first'},readySixDecision:{recommendation:'full',generatedAt:'first'},readySixCalendar:{events:[]},morning:[{date:'2026-10-12',pain:0}]};const before=readySixPublicationCheck(snapshot,[]);
 assert.equal(before,readySixPublicationCheck({...snapshot,readySixMeta:{generatedAt:'second'},readySixDecision:{generatedAt:'second',recommendation:'full'}},[]));
 assert.notEqual(before,readySixPublicationCheck({...snapshot,morning:[{date:'2026-10-12',pain:3}]},[]));assert.notEqual(before,readySixPublicationCheck({...snapshot,readySixCalendar:{events:[{type:'flight'}]}},[]));assert.notEqual(before,readySixPublicationCheck(snapshot,['No loaded calf']));assert.equal(readySixPublicationCheck({},[]),null);
});

for(const workspace of ['zarechie','nkperf'])test(workspace+': stale tabs fail closed; refreshing one ready draft preserves neighbours and saved programs',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'},{id:'two'}]});
 for(const row of q.players)await f.redis('set','coach:batch:'+row.batchId,JSON.stringify({workspace,playerId:row.playerId,teamQueueId:q.id,status:'done',completedAt:q.createdAt,session:{blocks:[],teamGeneration:{batchId:row.batchId}}}));
 const first=q.players[0],neighbour=await f.redis('get','coach:batch:'+q.players[1].batchId);
 await f.markTeamPlayerReviewed(q,first.playerId,first.batchId,true);
 const action={workspace,queueId:q.id,playerId:first.playerId,batchId:first.batchId,expectedRevision:0};
 const updated=await f.call(f.queueApi,{...action,action:'refresh-player'});assert.equal(updated.code,200);assert.equal(updated.body.queue.revision,1);
 assert.notEqual(updated.body.queue.rows[0].batchId,first.batchId);assert.equal(updated.body.queue.rows[0].reviewed,false);assert.equal(await f.redis('get','coach:batch:'+q.players[1].batchId),neighbour);
 const stale=await f.call(f.queueApi,{...action,action:'pause'});assert.equal(stale.code,409);assert.equal(stale.body.queue.revision,1);assert.equal(stale.body.queue.state,'running');
 const prefix=pure.queuePrefix(workspace),two=q.players[1];await f.redis('set',`${prefix}:session:two:${q.date}`,JSON.stringify({savedAt:new Date().toISOString(),session:{teamGeneration:{batchId:two.batchId}}}));
 const rejected=await f.call(f.queueApi,{...action,action:'refresh-player',playerId:'two',batchId:two.batchId,expectedRevision:1});assert.equal(rejected.code,409);assert.match(rejected.body.error,/уже сохранена/);
 const draftKey=drafts.generatedDraftKey(workspace,'one',q.date);await f.redis('set',draftKey,'current');
 await f.writeCurrentTeamDraft({workspace,playerId:'one',teamQueueId:q.id,date:q.date},first.batchId,draftKey,{obsolete:true});assert.equal(await f.redis('get',draftKey),'current');
 await f.writeCurrentTeamDraft({workspace,playerId:'one',teamQueueId:q.id,date:q.date},updated.body.queue.rows[0].batchId,draftKey,{fresh:true});assert.deepEqual(JSON.parse(await f.redis('get',draftKey)),{fresh:true});
});
test('concurrent mutations admit one version; missing version and partial failures invalidate stale actions',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]});let entered,release;const ready=new Promise(r=>{entered=r;});
 const first=f.mutateTeamQueue(q,0,async()=>{entered();await new Promise(r=>{release=r;});});await ready;
 await assert.rejects(f.mutateTeamQueue(q,0,async()=>{}),{status:409});release();await first;
 await assert.rejects(f.mutateTeamQueue(q,undefined,async()=>{}),{status:409});
 await assert.rejects(f.mutateTeamQueue(q,1,async()=>{throw Error('network failure after write');}),/network failure/);
 assert.equal((await f.loadTeamQueue(q.workspace,q.id)).revision,2);await assert.rejects(f.mutateTeamQueue(q,1,async()=>{}),{status:409});
});
test('worker stops after five temporary failures, retries only the selected player with a fresh budget',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]});let calls=0,now=Date.now();
 for(let i=0;i<6;i++){await runQueueTick({redis:f.redis,now:now+i*121000,request:async()=>{calls++;return {status:503,data:{}};}});}
 assert.equal(calls,5);let view=await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id));assert.equal(view.rows[0].runtime.stop,'RETRY_LIMIT');assert.equal(view.rows[0].status,'error');
 let monitor=await f.generationMonitor(q.workspace);assert.equal(monitor.runtime.stopped,1);assert.ok(monitor.needsAttention);
 const next=await f.retryTeamPlayer(await f.loadTeamQueue(q.workspace,q.id),'one',q.players[0].batchId);assert.notEqual(next.players[0].batchId,q.players[0].batchId);assert.equal((await f.teamQueueView(next)).rows[0].status,'queued');
 await f.redis('set','coach:batch:'+next.players[0].batchId,JSON.stringify({workspace:q.workspace,status:'done'}));monitor=await f.generationMonitor(q.workspace);assert.equal(monitor.runtime.stopped,0);assert.equal(monitor.incidents.activeCount,0);
});
test('active elapsed time excludes pause; processing/waiting limits and stall detection are bounded',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('zarechie'),players:[{id:'one'}]}),base=Date.now(),key=pure.teamQueueKey(q.workspace,q.id);
 await f.redis('set',key+':clock',JSON.stringify({activeMs:120000,at:base-3600000}));await f.redis('set',key+':state','paused');
 const clock=JSON.parse(await f.redis('get',key+':clock'));assert.equal(policy.queueActiveMs(q,clock,'paused',base),120000);
 await f.controlTeamQueue(await f.loadTeamQueue(q.workspace,q.id),'resume');const resumed=JSON.parse(await f.redis('get',key+':clock'));assert.equal(resumed.activeMs,120000);
 assert.equal(policy.taskTiming({startedActiveMs:0,lastProgressActiveMs:0},180000).stalled,true);assert.equal(policy.taskTiming({startedActiveMs:0},900000).stop,'WAIT_LIMIT');assert.equal(policy.taskTiming({seenActiveMs:0},1800000).stop,'QUEUE_WAIT_LIMIT');
 await f.redis('set',policy.taskRuntimeKey(q.players[0].batchId),JSON.stringify({startedActiveMs:0,lastProgressActiveMs:0,attempts:10}));await f.redis('set',key+':clock',JSON.stringify({activeMs:900000,at:Date.now()}));let calls=0;
 await runQueueTick({redis:f.redis,request:async()=>{calls++;}});assert.equal(calls,0);assert.equal((await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id))).rows[0].runtime.stop,'WAIT_LIMIT');
 const next=await f.retryTeamPlayer(await f.loadTeamQueue(q.workspace,q.id),'one',q.players[0].batchId);assert.notEqual(next.players[0].batchId,q.players[0].batchId);
});
test('monitor detects a stuck queue and worker outage even with no historical errors; progress clears stall incident',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]}),key=pure.teamQueueKey(q.workspace,q.id),batch=q.players[0].batchId;
 let m=await f.generationMonitor(q.workspace);assert.equal(m.incidents.activeCount,0);assert.equal(m.runtime.pending,1);assert.equal(m.needsAttention,true);
 await f.redis('set','coach:team-worker:heartbeat',String(Date.now()));await f.redis('set',key+':clock',JSON.stringify({activeMs:200000,at:Date.now()}));await f.redis('set',policy.taskRuntimeKey(batch),JSON.stringify({startedActiveMs:0,lastProgressActiveMs:0,attempts:3}));
 m=await f.generationMonitor(q.workspace);assert.equal(m.worker.available,true);assert.equal(m.runtime.stalled,1);assert.equal(m.needsAttention,true);
 await policy.workerEvent(f.redis,{workspace:q.workspace,batchId:batch,code:'TASK_STALLED',now:Date.now()-1000});
 await f.redis('set',policy.taskRuntimeKey(batch),JSON.stringify({startedActiveMs:0,lastProgressActiveMs:200000,lastProgressAt:Date.now(),attempts:4}));m=await f.generationMonitor(q.workspace);assert.equal(m.runtime.stalled,0);assert.equal(m.incidents.activeCount,0);assert.equal(m.needsAttention,false);
 await f.redis('set','coach:team-worker:tick-failure',String(Date.now()));m=await f.generationMonitor(q.workspace);assert.equal(m.worker.failed,true);assert.equal(m.worker.available,false);assert.equal(m.needsAttention,true);
});
test('a stale completed queue cannot create a replacement after another tab changed its version',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]});await f.redis('set','coach:batch:'+q.players[0].batchId,JSON.stringify({workspace:q.workspace,teamQueueId:q.id,playerId:'one',status:'done'}));
 await f.mutateTeamQueue(q,0,async()=>{});
 await assert.rejects(f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}],expectedLatestId:q.id,expectedRevision:0}),{status:409});
 assert.equal(await f.redis('get',pure.teamQueueLatestKey(q.workspace,q.date)),q.id);
});
test('bounded waiting jobs without a submission can be restarted; request quota terminates successful-but-stuck polling',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]}),key=pure.teamQueueKey(q.workspace,q.id),batch=q.players[0].batchId;
 await f.redis('set',key+':clock',JSON.stringify({activeMs:1800000,at:Date.now()}));await f.redis('set',policy.taskRuntimeKey(batch),JSON.stringify({seenActiveMs:0,attempts:0}));
 let calls=0;await runQueueTick({redis:f.redis,request:async()=>{calls++;}});assert.equal(calls,0);assert.equal((await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id))).rows[0].runtime.stop,'QUEUE_WAIT_LIMIT');
 const next=await f.retryTeamPlayer(await f.loadTeamQueue(q.workspace,q.id),'one',batch);assert.notEqual(next.players[0].batchId,batch);
 const current=next.players[0].batchId;await f.redis('set',policy.taskRuntimeKey(current),JSON.stringify({seenActiveMs:1800000,startedActiveMs:1800000,attempts:80}));
 await runQueueTick({redis:f.redis,request:async()=>{calls++;}});assert.equal(calls,0);assert.equal((await f.teamQueueView(next)).rows[0].runtime.stop,'REQUEST_LIMIT');
});

function readyJobs(f,q,snapshot){return Promise.all(q.players.map(row=>f.redis('set','coach:batch:'+row.batchId,JSON.stringify({workspace:q.workspace,playerId:row.playerId,teamQueueId:q.id,status:'done',completedAt:q.createdAt,readySixState:fingerprint.readySixPublicationState(snapshot,[]),readySixCheck:fingerprint.readySixPublicationCheck(snapshot,[]),quality:{valid:true},session:{blocks:[],teamGeneration:{queueId:q.id,batchId:row.batchId}}}))));}
function publicationEngine(f,getPlayerSnapshot,saveProgram){
 const checkTeamPublication=compile('lib/teamPublicationChecks.js',{...f,...fingerprint,getPlayerSnapshot},'checkTeamPublication');
 const publishTeamQueue=compile('lib/teamQueuePublication.js',{...f,checkTeamPublication,saveProgram},'publishTeamQueue');
 return {...compile('lib/teamPublicationRun.js',{...f,checkTeamPublication,publishTeamQueue},'({startPublicationRun,stepPublicationRun})'),publishTeamQueue};
}
for(const workspace of ['zarechie','nkperf'])test(workspace+': durable publication resumes after ambiguous save, retains checkpoints and never repeats a committed program',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'},{id:'two'}]}),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);
 for(const row of q.players)await f.markTeamPlayerReviewed(q,row.playerId,row.batchId,true);
 let saves=0,ambiguous=true;
 const engine=publicationEngine(f,async()=>snapshot,async(req,res,guard)=>{
  saves++;const record={...req.body,savedAt:new Date(Date.now()+100).toISOString(),publicationReceipt:guard.receipt};await f.redis('set',pure.queuePrefix(workspace)+':session:'+req.body.playerId+':'+q.date,JSON.stringify(record));
  if(ambiguous){ambiguous=false;throw Object.assign(new Error('Connection dropped after commit'),{status:503});}
  return res.status(200).json({status:'ok'});
 });
 await assert.rejects(engine.startPublicationRun(q,'publish'),/Сначала проверьте/);
 const check=await engine.startPublicationRun(q,'check');await assert.rejects(engine.startPublicationRun(q,'check'),{status:409});
 await engine.stepPublicationRun(q,{},check.id);let view=await f.teamQueueView(await f.loadTeamQueue(workspace,q.id));assert.equal(view.publicationRun.processed,1);assert.equal(view.publicationRun.status,'running');assert.equal(view.rows[0].readySixCheck.status,'unchanged');
 await engine.stepPublicationRun(q,{},check.id);view=await f.teamQueueView(await f.loadTeamQueue(workspace,q.id));assert.equal(view.publicationRun.status,'completed');assert.equal(view.publicationRun.counts.checked,2);assert.equal(saves,0);
 const run=await engine.startPublicationRun(q,'publish');await engine.stepPublicationRun(q,{},run.id);assert.equal(saves,1);
 view=await f.teamQueueView(await f.loadTeamQueue(workspace,q.id));assert.equal(view.rows[0].saved,true);assert.equal(view.rows[0].publication.status,'published','atomic receipt outranks an ambiguous error response');assert.equal(view.rows[1].saved,false);
 let state=JSON.parse(await f.redis('get',publicationPolicy.publicationRunKey(workspace,q.id)));state.items[0].nextAttemptAt=0;await f.redis('set',publicationPolicy.publicationRunKey(workspace,q.id),JSON.stringify(state));
 await engine.stepPublicationRun(q,{},run.id);assert.equal(saves,2,'recover first row and save only the remaining neighbour');
 await engine.stepPublicationRun(q,{},run.id);view=await f.teamQueueView(await f.loadTeamQueue(workspace,q.id));assert.equal(saves,2);assert.equal(view.publicationRun.counts.published,2);assert.equal(view.publicationRun.status,'completed');
 await engine.stepPublicationRun(q,{},run.id);assert.equal(saves,2);await assert.rejects(engine.startPublicationRun(q,'publish'),/Отметьте/);
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': ReadySix changes after preflight block the save, explain changed sections and clear review',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'}]}),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);await f.markTeamPlayerReviewed(q,'one',q.players[0].batchId,true);let changed=false,saves=0;
 const engine=publicationEngine(f,async()=>changed?{...snapshot,injuryLog:[{private:'do not copy symptoms'}]}:snapshot,async()=>{saves++;});
 const check=await engine.startPublicationRun(q,'check');await engine.stepPublicationRun(q,{},check.id);const run=await engine.startPublicationRun(q,'publish');changed=true;await engine.stepPublicationRun(q,{},run.id);
 const view=await f.teamQueueView(await f.loadTeamQueue(workspace,q.id));assert.equal(saves,0);assert.equal(view.rows[0].reviewed,false);assert.equal(view.rows[0].readySixCheck.status,'changed');assert.equal(view.rows[0].readySixCheck.changes[0].key,'medical');assert.equal(view.publicationRun.counts.blocked,1);assert.ok(!JSON.stringify(view).includes('do not copy symptoms'));
});
test('publication worker dispatches persisted runs in both spaces, and temporary row failures stop after three attempts',async()=>{
 const f=fixture(),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}},queues=[];let calls=0;
 const engine=publicationEngine(f,async()=>snapshot,async()=>{calls++;throw Object.assign(new Error('outage'),{status:503});});
 for(const workspace of ['zarechie','nkperf']){const q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'}]});await readyJobs(f,q,snapshot);await f.markTeamPlayerReviewed(q,'one',q.players[0].batchId,true);const check=await engine.startPublicationRun(q,'check');await engine.stepPublicationRun(q,{},check.id);queues.push({q,run:await engine.startPublicationRun(q,'publish')});}
 const seen=[];await publicationPolicy.runPublicationTick({redis:f.redis,request:async(path,body)=>{seen.push(body.workspace);await engine.stepPublicationRun(await f.loadTeamQueue(body.workspace,body.queueId),{},body.runId);}});assert.deepEqual(seen.sort(),['nkperf','zarechie']);assert.equal(calls,2);
 for(const {q,run} of queues){for(let i=0;i<2;i++){const state=JSON.parse(await f.redis('get',publicationPolicy.publicationRunKey(q.workspace,q.id)));state.items[0].nextAttemptAt=0;await f.redis('set',publicationPolicy.publicationRunKey(q.workspace,q.id),JSON.stringify(state));await engine.stepPublicationRun(q,{},run.id);}const view=await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id));assert.equal(view.publicationRun.status,'completed');assert.equal(view.publicationRun.counts.error,1);assert.equal(view.publicationRun.items[0].attempts,3);assert.equal((await f.generationMonitor(q.workspace)).publication.failed,1);}
 assert.equal(calls,6);
});
test('section fingerprints ignore transport timestamps, detect court history and never copy source health data',()=>{
 const snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'},chronicSurveys:[{secret:'clinical',date:'2026-10-10',duration:10}]};const first=fingerprint.readySixPublicationState(snapshot,[]);
 assert.ok(!JSON.stringify(first).includes('clinical'));assert.equal(fingerprint.readySixPublicationChanges(first,fingerprint.readySixPublicationState({...snapshot,readySixMeta:{generatedAt:'new'}},[])).status,'unchanged');
 const change=fingerprint.readySixPublicationChanges(first,fingerprint.readySixPublicationState({...snapshot,chronicSurveys:[{duration:20}]},[]));assert.equal(change.status,'changed');assert.equal(change.changes[0].key,'calendar');
 assert.equal(fingerprint.readySixPublicationChanges(null,first,first.digest).status,'unchanged');assert.equal(fingerprint.readySixPublicationChanges(null,first).status,'unknown');
 assert.equal(publicationPolicy.freshPublicationCheck({batchId:'one',status:'unchanged',checkedAt:new Date(Date.now()-300001).toISOString()},'one'),false);
});
test('background publication endpoint enforces auth, workspace and captured run identity',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'}]}),handler=compile('pages/api/programs/team-publication.js',f,'handler');
 assert.equal((await f.call(handler,{workspace:'nkperf',queueId:q.id,runId:crypto.randomUUID()},undefined,false)).code,401);
 assert.equal((await f.call(handler,{workspace:'zarechie',queueId:q.id,runId:crypto.randomUUID()})).code,404);
 assert.equal((await f.call(handler,{workspace:'nkperf',queueId:q.id,runId:'forged'})).code,400);
 const snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);const run=await f.startPublicationRun(q,'check');await f.call(handler,{workspace:'nkperf',queueId:q.id,runId:crypto.randomUUID()});assert.equal((await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id))).publicationRun.processed,0);
 const result=await f.call(handler,{workspace:'nkperf',queueId:q.id,runId:run.id});assert.equal(result.code,200);assert.equal(result.body.queue.publicationRun.counts.checked,1);
});
test('publication deadline retains committed receipts while stopping only unfinished rows',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request('nkperf'),players:[{id:'one'},{id:'two'}]}),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);for(const row of q.players)await f.markTeamPlayerReviewed(q,row.playerId,row.batchId,true);
 const engine=publicationEngine(f,async()=>snapshot,async()=>{throw Error('must not resave');});const check=await engine.startPublicationRun(q,'check');await engine.stepPublicationRun(q,{},check.id);await engine.stepPublicationRun(q,{},check.id);const run=await engine.startPublicationRun(q,'publish'),row=q.players[0];
 await f.redis('set','nkperf:session:one:'+q.date,JSON.stringify({savedAt:new Date(Date.now()+100).toISOString(),session:{teamGeneration:{batchId:row.batchId}},publicationReceipt:{status:'published',batchId:row.batchId,runId:run.id,message:'committed'}}));
 run.createdAt=new Date(Date.now()-1800001).toISOString();await f.redis('set',publicationPolicy.publicationRunKey(q.workspace,q.id),JSON.stringify(run));await engine.stepPublicationRun(q,{},run.id);const view=await f.teamQueueView(await f.loadTeamQueue(q.workspace,q.id));assert.equal(view.publicationRun.counts.published,1);assert.equal(view.publicationRun.counts.error,1);assert.equal(view.rows[0].saved,true);
});

for(const workspace of ['zarechie','nkperf'])test(workspace+': review actor/audit commit together, publication captures human initiator instead of worker identity',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'}]}),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);
 const actor={role:'coach',access:'session',id:'session123'},row=q.players[0],key=pure.teamQueueKey(workspace,q.id);
 await f.markTeamPlayerReviewed(q,row.playerId,row.batchId,true,actor);const reviewer=JSON.parse(await f.redis('hget',key+':reviews:actors','one'));assert.deepEqual(reviewer.actor,actor);assert.equal(reviewer.batchId,row.batchId);assert.equal((await f.redis('zrevrange',audit.coachAuditKey(workspace),0,49)).length,1);
 let captured;const engine=publicationEngine(f,async()=>snapshot,async(req,res,guard)=>{captured=guard;return res.status(200).json({status:'ok'});});const check=await engine.startPublicationRun(q,'check',actor);await engine.stepPublicationRun(q,{},check.id);const run=await engine.startPublicationRun(q,'publish',actor);await engine.stepPublicationRun(q,{worker:true},run.id);assert.deepEqual(captured.receipt.actor,actor);assert.deepEqual(captured.auditEvent.actor,actor);assert.deepEqual(captured.auditEvent.reviewer.actor,actor);assert.ok(captured.auditEvent.readySixCheckedAt);
});

for(const workspace of ['zarechie','nkperf'])test(workspace+': coach-confirmed facts after draft generation clear review and block stale publication',async()=>{
 const f=fixture(),q=await f.createTeamQueue({request:request(workspace),players:[{id:'one'}]}),snapshot={readySixMeta:{},readySixDecision:{recommendation:'full'}};await readyJobs(f,q,snapshot);await f.markTeamPlayerReviewed(q,'one',q.players[0].batchId,true);
 const jobKey='coach:batch:'+q.players[0].batchId,job=JSON.parse(await f.redis('get',jobKey));await f.redis('set',jobKey,JSON.stringify({...job,strengthFactsStartedAt:'2026-10-12T10:00:00Z'}));await f.redis('set',pure.queuePrefix(workspace)+':strength:actual-updated:one',JSON.stringify({revision:'coach-filled',savedAt:'2026-10-13T10:00:00Z'}));
 const check=await f.checkTeamPublication(q,q.players[0]);assert.equal(check.status,'changed');assert.ok(check.changes.includes('Фактические результаты силовой'));assert.match(check.message,/Обновите черновик/);assert.equal((await f.teamQueueView(q)).rows[0].reviewed,false);
});
