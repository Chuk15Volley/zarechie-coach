import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredCourse } from '../lib/prevention/catalogue.mjs';
import { createAssignment, applyAssignmentCommand, orderedSets, progressCounts, refreshFutureSessions } from '../lib/prevention/model.mjs';
import { normalizeSetResult, resultFields, resultLabel, resultWeightLabel, resultExerciseIdentity } from '../lib/prevention/results.mjs';
const make = () => createAssignment(registeredCourse(), { scope:'phase',phase:1,mainSets:2,stretch:false,stretchSets:2,reviewed:true }, {id:'results-fixture'});
const cmd = (a,action,extra={}) => ({action,requestId:crypto.randomUUID(),expectedRevision:a.revision,sessionIndex:a.cursor,...(action==='result'?{expectedExercise:resultExerciseIdentity(orderedSets(a.sessions[extra.sessionIndex ?? a.cursor]).find(row=>row.key===extra.key)?.exercise || {name:'missing',reps:''})}:{}),...extra});
const apply = (a,action,extra={}) => applyAssignmentCommand(a,cmd(a,action,extra)).assignment;

test('facts distinguish reps/time/repeated holds, explicit zero and absent load',()=>{
 const reps={name:'Open Book',reps:'8-10 each'},timed={name:'Neck Side Bend Iso',reps:'5x2 sec each'};
 assert.deepEqual(normalizeSetResult(reps,{reps:7}),{reps:7});assert.deepEqual(normalizeSetResult(reps,{reps:0,weightKg:0}),{reps:0,weightKg:0});
 assert.deepEqual(normalizeSetResult(timed,{seconds:3,holds:4}),{seconds:3,holds:4});
 assert.match(resultLabel(timed,{seconds:3,holds:4}),/4 × 3 сек на удержание \/ сторону · вес не записан/);
 assert.match(resultLabel(reps,{reps:0,weightKg:0}),/0 повт.*без дополнительного веса/);
 assert.equal(resultLabel(reps,null),'Фактические данные не записаны');assert.equal(resultFields(timed).repeated,true);
 assert.equal(resultWeightLabel({name:'Dumbbell Wrist Curl'}),'Вес одной гантели, кг');
});
test('actual validation rejects malformed, incompatible or invented fields and requires explicit free-weight kg',()=>{
 const reps={name:'Dumbbell Wrist Curl',reps:'8-12 (3 sec lower)'},timed={name:'Hold',reps:'30 sec'};
 for(const result of [null,[],{reps:10},{reps:10,weightKg:-1},{reps:10,weightKg:1000},{reps:10,weightKg:1.001},{reps:'10',weightKg:1},{reps:201,weightKg:1},{reps:1.1,weightKg:1},{reps:NaN,weightKg:1},{reps:10,weightKg:1,seconds:3},{reps:10,weightKg:1,updatedAt:'spoof'}])assert.throws(()=>normalizeSetResult(reps,result));
 for(const result of [{seconds:3601},{seconds:Infinity},{seconds:3,holds:2},{reps:30}])assert.throws(()=>normalizeSetResult(timed,result));
 assert.deepEqual(normalizeSetResult(reps,{reps:10,weightKg:2.75}),{reps:10,weightKg:2.75});
});
test('saving a fact atomically marks exactly one prescribed set and replay protects its payload',()=>{
 const a=make(),request=cmd(a,'result',{key:'A2:0',result:{reps:9,weightKg:0}}),before=structuredClone(a);
 const saved=applyAssignmentCommand(a,request,{now:'2026-10-16T01:00:00Z'}).assignment;
 assert.deepEqual(a,before);assert.equal(saved.progress['A2:0'],true);assert.equal(progressCounts(saved).done,1);assert.equal(saved.cursor,0);
 assert.deepEqual(saved.results['A2:0'],{reps:9,weightKg:0,updatedAt:'2026-10-16T01:00:00Z'});
 assert.equal(applyAssignmentCommand(saved,request).replay,true);
 assert.throws(()=>applyAssignmentCommand(saved,{...request,result:{reps:10,weightKg:0}}),/другой операции/);
 assert.throws(()=>applyAssignmentCommand(saved,cmd(a,'result',{key:'A2:0',result:{reps:8}})),/другом устройстве/);
 assert.throws(()=>apply(saved,'result',{key:'A2:99',result:{reps:8}}),/Подход не найден/);
});
test('editing and undo preserve the prescribed dose, and refresh retains the partial fact edition',()=>{
 let a=apply(make(),'result',{key:'A2:0',result:{reps:9,weightKg:0}});
 const dose=structuredClone(a.sessions[0]);a=apply(a,'result',{key:'A2:0',result:{reps:8,weightKg:2.5}});
 assert.equal(progressCounts(a).done,1);assert.deepEqual(a.sessions[0],dose);
 const refreshed=refreshFutureSessions(a,registeredCourse());assert.deepEqual(refreshed.results,a.results);assert.deepEqual(refreshed.sessions[0],dose);
 a=apply(a,'mark',{key:'A2:0',done:false});assert.equal(a.results['A2:0'],undefined);assert.equal(progressCounts(a).done,0);
});
test('completion archives facts without inventing legacy values, and historical correction never advances the cursor',()=>{
 let a=make();delete a.results;
 for(const row of orderedSets(a.sessions[0]))a=apply(a,'mark',{key:row.key,done:true});
 a=apply(a,'result',{key:'A2:0',result:{reps:8}});a=apply(a,'complete');
 assert.equal(a.cursor,1);assert.deepEqual(a.results,{});assert.equal(Object.keys(a.history[0].results).length,1);
 const at=a.history[0].completedAt,session=structuredClone(a.sessions[0]);
 a=apply(a,'result',{sessionIndex:0,key:'A2:0',result:{reps:7,weightKg:0}});
 assert.equal(a.cursor,1);assert.equal(a.history.length,1);assert.equal(a.history[0].completedAt,at);assert.deepEqual(a.sessions[0],session);assert.equal(a.history[0].results['A2:0'].reps,7);assert.equal(progressCounts(a).done,0);
 assert.throws(()=>apply(a,'result',{sessionIndex:2,key:'A2:0',result:{reps:9}}),/Подход не найден/);
 a.history[0].progress['A2:1']=false;assert.throws(()=>apply(a,'result',{sessionIndex:0,key:'A2:1',result:{reps:9}}),/закрыто/);
});
test('a completed or archived assignment permits fact correction only for existing historical executions',()=>{
 let a=make();for(const row of orderedSets(a.sessions[0]))a=apply(a,'mark',{key:row.key,done:true});a=apply(a,'complete');a.status='completed';
 a=apply(a,'result',{sessionIndex:0,key:'A1:0',result:{seconds:29,weightKg:0}});assert.equal(a.status,'completed');assert.equal(a.cursor,1);
 assert.throws(()=>apply(a,'result',{sessionIndex:1,key:'A1:0',result:{seconds:30}}),/Подход не найден/);
 a.status='archived';assert.equal(apply(a,'result',{sessionIndex:0,key:'A1:0',result:{seconds:28}}).status,'archived');
});

test('a result cannot cross a refreshed exercise identity even with a fresh assignment revision',()=>{let a=make();const request=cmd(a,'result',{key:'A2:0',result:{reps:9}});a.sessions[0].exercises[1].name='Different variation';assert.throws(()=>applyAssignmentCommand(a,request),/Состав упражнения изменился/);assert.deepEqual(a.progress,{});});
