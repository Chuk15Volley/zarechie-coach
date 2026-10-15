import test from 'node:test';import assert from 'node:assert/strict';
import {requestCoachProgression} from '../lib/coachProgressionRequest.mjs';
import {reviewPreview} from '../lib/teamQueue.mjs';
const input={workspace:'zarechie',playerId:'fixture',date:'2026-10-13',focus:'inseason_strength',exercises:[{code:'A1',name:'Goblet Squat',targetSets:['4','4'],weightKg:20}]};
const ok=data=>({ok:true,json:async()=>data});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: a progression recheck is read-only and preserves the editor prescription`,async()=>{
 const sent={...input,workspace},before=JSON.stringify(sent),calls=[];
 const response=await requestCoachProgression({input:sent,apiKey:'fixture-only',fetcher:async(path,opts)=>{calls.push({path,body:JSON.parse(opts.body),signal:opts.signal});return ok(path.endsWith('/progression')?{engine:'strength-generator-v2',progressionBySlot:{A1:{suggestedKg:22.5,targetSets:['4','4']}}}:{histories:{'Goblet Squat':[{kg:20}]}});}});
 assert.equal(JSON.stringify(sent),before);assert.deepEqual(calls.map(c=>c.path).sort(),['/api/players/ex-history','/api/players/progression']);assert.ok(calls.every(c=>c.body.workspace===workspace));assert.equal(response.progression.A1.suggestedKg,22.5);assert.equal(response.history['Goblet Squat'][0].kg,20);
});
test('failed and incompatible responses cannot return an applicable stale hint; a retry can recover',async()=>{
 let unavailable=true;
 const fetcher=async path=>path.endsWith('/ex-history')?ok({}):unavailable?{ok:false,json:async()=>({error:'ReadySix временно недоступен'})}:ok({engine:'strength-generator-v2',progressionBySlot:{A1:{suggestedKg:20}}});
 await assert.rejects(requestCoachProgression({input,fetcher}),/ReadySix/);unavailable=false;assert.equal((await requestCoachProgression({input,fetcher})).progression.A1.suggestedKg,20);
 await assert.rejects(requestCoachProgression({input,fetcher:async()=>ok({progression:{A1:{suggestedKg:999}}})}),/Единый силовой подбор/);
});
test('request timeout ends loading and aborts the outstanding fetches',async()=>{
 const signals=[];const fetcher=(_path,{signal})=>{signals.push(signal);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
 await assert.rejects(requestCoachProgression({input,fetcher,timeoutMs:10}),/Проверка заняла/);assert.equal(signals.length,1);assert.ok(signals.every(s=>s.aborted));
});
test('changing workspace/date aborts both old requests; optional history errors do not invent progression',async()=>{
 const controller=new AbortController();let ready;const started=new Promise(resolve=>ready=resolve);
 const fetcher=(_path,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});ready();});
 const request=requestCoachProgression({input,signal:controller.signal,fetcher});await started;controller.abort();await assert.rejects(request,{name:'AbortError'});
 const response=await requestCoachProgression({input,fetcher:async path=>{if(path.endsWith('/ex-history'))throw Error('optional history');return ok({engine:'strength-generator-v2',progressionBySlot:{}});}});assert.deepEqual(response,{progression:{},history:{}});
});
test('team preview preserves planned RPE and implement units, without replacing them by session RPE or actuals',()=>{
 const record={session:{rpe:4,blocks:[{exercises:[{code:'B1',name:'DB Bench Press',targetSets:['5','5'],weightKg:22.5,loadUnits:2,targetRpeMax:8,actualRpe:6}]}]},quality:{valid:true}};
 const [row]=reviewPreview(record).exercises;assert.equal(row.weightKg,22.5);assert.equal(row.loadUnits,2);assert.equal(row.targetRpeMax,8);assert.deepEqual(row.sets,['5','5']);delete record.session.blocks[0].exercises[0].targetRpeMax;assert.equal(reviewPreview(record).exercises[0].targetRpeMax,null);
});
