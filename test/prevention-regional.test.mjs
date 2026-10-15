import test from 'node:test';
import assert from 'node:assert/strict';
import neck from '../lib/prevention/neck-resilience.json' with { type: 'json' };
import hip from '../lib/prevention/hip-resilience.json' with { type: 'json' };
import ankle from '../lib/prevention/ankle-sprain-prehab.json' with { type: 'json' };
import { registeredCourse, preventionCourses } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets, progressCounts, nextRest, applyAssignmentCommand, refreshFutureSessions, safeVideo, assignmentSummary } from '../lib/prevention/model.mjs';
import { timedExercise } from '../lib/prevention/timing.mjs';
import { isCoachBannedExercise } from '../lib/exerciseRestrictions.js';
const ids=['neck-resilience','hip-resilience','ankle-sprain-prehab'];
const make=(id,patch={},catalogue)=>{const course=registeredCourse(id,catalogue);return createAssignment(course,{scope:'phase',phase:1,mainSets:course.setRanges.main[0],extraSets:{neck:2},stretch:false,stretchSets:2,reviewed:true,rests:course.rests,...patch},{id:'regional-test-assignment'});};
const command=(a,action,patch={})=>({requestId:crypto.randomUUID(),expectedRevision:a.revision,sessionIndex:a.cursor,action,...patch});
function finish(a){for(const row of orderedSets(a.sessions[a.cursor]))a=applyAssignmentCommand(a,command(a,'mark',{key:row.key,done:true})).assignment;return applyAssignmentCommand(a,command(a,'complete')).assignment;}
test('three new regions retain exactly 116 source sessions / 1104 exercise rows and all hyperlinks',()=>{
 assert.deepEqual(preventionCourses().filter(c=>ids.includes(c.id)).map(c=>[c.regionId,c.sessions,c.phases.length]),[['neck',36,4],['hip',48,4],['ankle',32,8]]);
 for(const [source,expected] of [[neck,288],[hip,528],[ankle,288]]){
  assert.equal(source.flatMap(s=>s.exercises).length,expected);
  for(const s of source){assert.equal(new Set(s.exercises.map(e=>e.code)).size,s.exercises.length);for(const e of s.exercises){assert.equal(safeVideo(e.video),e.video);assert.equal(isCoachBannedExercise(e.name),false);}}
 }
 assert.ok(preventionCourses().find(c=>c.id===ids[2]).author.includes('Романа Лаврова'));
 for(const [id,perPhase] of [[ids[0],9],[ids[1],12],[ids[2],4]]){const c=registeredCourse(id);for(const phase of preventionCourses().find(c=>c.id===id).phases){const sessions=c.sessions.filter(s=>s.phase===phase);assert.deepEqual(sessions.map(s=>s.phaseSession),Array.from({length:perPhase},(_,i)=>i+1));assert.ok(sessions.every(s=>s.phaseTotal===perPhase));}}
});
test('neck has independent 2–3 isometric sets, 2–4 other strength sets, fixed warmup and optional C',()=>{
 const a=make(ids[0],{mainSets:4,extraSets:{neck:3}});
 assert.deepEqual(a.sessions[0].exercises.map(e=>[e.code,e.setCount]),[['A1',2],['A2',2],['A3',2],['A4',2],['B1',3],['B2',4]]);
 assert.equal(progressCounts(a).total,15);assert.equal(make(ids[0],{stretch:true}).sessions[0].exercises.length,8);
 assert.throws(()=>make(ids[0],{extraSets:{neck:4}}),/2 до 3/);assert.throws(()=>make(ids[0],{extraSets:{}}),/шейных/);assert.throws(()=>make(ids[0],{mainSets:5}),/2 до 4/);
 assert.deepEqual(orderedSets(a.sessions[0]).slice(-7).map(r=>r.key),['B1:0','B2:0','B1:1','B2:1','B1:2','B2:2','B2:3']);
});
test('repeated hold ranges remain separate, with selectable 5–10 seconds per hold',()=>{
 assert.deepEqual(timedExercise(neck[0].exercises[4]),{min:2,max:2,sides:1,repeats:5});
 assert.deepEqual(timedExercise(neck[9].exercises[2]),{min:5,max:10,sides:1,repeats:5});
 assert.deepEqual(timedExercise(neck[27].exercises[2]),{min:5,max:10,sides:1,repeats:5});
 assert.deepEqual(timedExercise(neck[2].exercises[4]),{min:2,max:2,sides:2,repeats:5});
 assert.equal(timedExercise({reps:'8-12 (3 sec lower)'}),null);
});
test('Hip C is required strength, only D is optional, and its pauses differ from Knee C/D',()=>{
 const a=make(ids[1]);assert.deepEqual(a.sessions[0].exercises.map(e=>e.code),['A1','A2','A3','A4','B1','B2','C1','C2']);
 assert.ok(a.sessions[0].exercises.filter(e=>'BC'.includes(e.code[0])).every(e=>e.setCount===3));
 assert.equal(nextRest(a,'C1:0').seconds,60);assert.equal(nextRest(a,'C2:0').seconds,90);assert.equal(nextRest(a,'C2:2'),null);
 const b=make(ids[1],{stretch:true,stretchSets:3,mainSets:4});assert.deepEqual(b.sessions[0].exercises.slice(-3).map(e=>[e.code,e.setCount]),[['D1',3],['D2',3],['D3',3]]);assert.equal(nextRest(b,'D1:0').seconds,15);
 assert.equal(b.sessions[0].exercises.find(e=>e.code==='C1').rir,'1-3');
});
test('ankle supports all eight source-week stages with 4 sessions and exact changing fixed doses',()=>{
 const a=make(ids[2],{phase:8});assert.equal(a.sessions.length,4);assert.equal(a.sessions[0].sourcePage,30);assert.equal(a.sessions[0].sourceWeek,8);assert.equal(a.phaseTerm,'Этап');assert.equal(assignmentSummary(a).phaseTerm,'Этап');
 assert.deepEqual(make(ids[2]).sessions[0].exercises.map(e=>[e.code,e.setCount]),[['R1',1],['W1',2],['W2',2],['A1',2],['A2',2],['B1',2],['B2',2],['C1',2],['C2',2]]);
 assert.deepEqual(make(ids[2]).sessions[2].exercises.map(e=>e.setCount),[2,3,3,3,3,3,3,3,3]);
 assert.deepEqual(make(ids[2],{phase:4}).sessions[0].exercises.slice(5,7).map(e=>e.setCount),[1,1]);
 const names=a.sessions[0].exercises.map(e=>[e.code,e.originalCode]);assert.deepEqual(names.slice(0,5),[['R1',''],['W1','A1'],['W2','A2'],['A1','A1'],['A2','A2']]);
 assert.deepEqual(timedExercise(a.sessions[0].exercises[0]),{min:30,max:30,sides:2,repeats:1});assert.equal(a.sessions[0].exercises[0].originalDose,'1X 30/30 СЕКУНД');
 assert.deepEqual(timedExercise(make(ids[2],{phase:6}).sessions[0].exercises[0]),{min:60,max:60,sides:2,repeats:1});
 assert.deepEqual(orderedSets(make(ids[2]).sessions[0]).slice(0,7).map(r=>r.key),['R1:0','W1:0','W2:0','W1:1','W2:1','A1:0','A2:0']);
 assert.equal(nextRest(make(ids[2]),'W1:0').seconds,20);assert.equal(nextRest(make(ids[2]),'A1:0').seconds,45);
 assert.throws(()=>make(ids[2],{phase:9}),/фазу/);assert.throws(()=>make(ids[0],{phase:8}),/фазу/);assert.throws(()=>make(ids[2],{stretch:true}),/дополнительного/);
});
test('partial required groups never advance; actual completion closes phases 9/12/4 and entire courses',()=>{
 for(const [id,count] of [[ids[0],9],[ids[1],12],[ids[2],4]]){
  let a=make(id,{phase:id===ids[2]?8:1});
  a=applyAssignmentCommand(a,command(a,'mark',{key:orderedSets(a.sessions[0])[0].key,done:true}),{now:'2035-01-01T00:00:00Z'}).assignment;
  assert.equal(a.cursor,0);assert.throws(()=>applyAssignmentCommand(a,command(a,'complete')),/все подходы/);
  for(let i=0;i<count;i++)a=finish(a);assert.equal(a.status,'completed');assert.equal(a.cursor,count);assert.equal(a.history.length,count);
 }
 for(const id of ids){let a=make(id,{scope:'course'});const total=a.sessions.length;for(let i=0;i<total;i++)a=finish(a);assert.equal(a.cursor,total);assert.equal(a.status,'completed');}
});
test('mandatory Hip C and both ankle A groups have distinct progress, stale/replay safe',()=>{
 let a=make(ids[1]);for(const row of orderedSets(a.sessions[0]).filter(r=>r.block!=='C'))a=applyAssignmentCommand(a,command(a,'mark',{key:row.key,done:true})).assignment;assert.throws(()=>applyAssignmentCommand(a,command(a,'complete')),/все подходы/);
 let b=make(ids[2]);b=applyAssignmentCommand(b,command(b,'mark',{key:'W1:0',done:true})).assignment;assert.equal(b.progress['A1:0'],undefined);
 const stale=command(b,'mark',{key:'A1:0',done:true});b=finish(b);assert.throws(()=>applyAssignmentCommand(b,stale),/другом устройстве/);
 for(const row of orderedSets(b.sessions[b.cursor]))b=applyAssignmentCommand(b,command(b,'mark',{key:row.key,done:true})).assignment;
 const complete=command(b,'complete');b=applyAssignmentCommand(b,complete).assignment;assert.equal(applyAssignmentCommand(b,complete).replay,true);assert.equal(b.cursor,2);
});
test('refresh preserves partial/executed editions and program/phase options, including neck dose and stage8',()=>{
 for(const id of ids){let a=make(id,{phase:id===ids[2]?8:1});const e=a.sessions[0].exercises[0];a=applyAssignmentCommand(a,command(a,'mark',{key:e.code+':0',done:true})).assignment;
  const fresh=registeredCourse(id,{revision:1,exercises:{[e.sourceId]:{name:'Coach regional edit'}}});const next=refreshFutureSessions(a,fresh);
  assert.equal(next.sessions[0].exercises[0].name,e.name);assert.equal(next.sessions[1].exercises[0].name,'Coach regional edit');assert.deepEqual(next.options,a.options);assert.ok(next.phaseReviewNote);
  assert.throws(()=>refreshFutureSessions(a,registeredCourse(id===ids[0]?ids[1]:ids[0])),/другим/);
 }
});
