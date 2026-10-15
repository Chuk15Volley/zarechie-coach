import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../lib/prevention/plantar-fasciitis.json' with { type: 'json' };
import { registeredCourse, preventionCourses } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets, nextRest, applyAssignmentCommand, refreshFutureSessions, safeVideo } from '../lib/prevention/model.mjs';
import { timedExercise } from '../lib/prevention/timing.mjs';
import { isCoachBannedExercise } from '../lib/exerciseRestrictions.js';
const ids=['plantar-fasciitis-basic','plantar-fasciitis-comprehensive','plantar-fasciitis-daily'];
const make=(id=ids[0],patch={},catalogue)=>{const c=registeredCourse(id,catalogue);return createAssignment(c,{scope:c.courseOnly?'course':'phase',phase:1,mainSets:1,stretch:false,stretchSets:2,rangeChoice:'min',reviewed:true,rests:c.rests,...patch},{id:'foot-test-assignment'});};
const command=(a,action,extra={})=>({requestId:crypto.randomUUID(),expectedRevision:a.revision,sessionIndex:a.cursor,action,...extra});
function finish(a){for(const r of orderedSets(a.sessions[a.cursor]))a=applyAssignmentCommand(a,command(a,'mark',{key:r.key,done:true})).assignment;return applyAssignmentCommand(a,command(a,'complete')).assignment;}
test('foot offers Basic42, Comprehensive36 and one independent Daily252; source has41 templates/210 rows',()=>{
 assert.deepEqual(preventionCourses().filter(c=>c.regionId==='foot').map(c=>[c.sessions,c.phases.length]),[[42,4],[36,4],[252,0]]);
 assert.deepEqual(Object.values(source).map(ss=>[ss.length,ss.flatMap(s=>s.exercises).length]),[[1,2],[4,4],[36,204]]);
 for(const ss of Object.values(source))for(const s of ss){assert.equal(new Set(s.exercises.map(e=>e.code)).size,s.exercises.length);for(const e of s.exercises){assert.equal(safeVideo(e.video),e.video);assert.ok(e.originalNote);assert.equal(isCoachBannedExercise(e.name),false);}}
 assert.deepEqual([1,2,3,4].map(p=>make(ids[0],{phase:p}).sessions.length),[11,10,11,10]);
 for(const phase of [1,2,3,4]){const a=make(ids[1],{phase});assert.equal(a.sessions.length,9);assert.deepEqual(a.sessions.map(s=>s.sourceDay),[1,2,3,1,2,3,1,2,3]);assert.deepEqual(a.sessions.map(s=>s.exercises.length),[8,1,8,8,1,8,8,1,8]);}
});
test('every source interval resolves independently to its own endpoint, fixed2/3/5 preserved',()=>{
 for(const id of ids.slice(0,2))for(const choice of ['min','max']){
  const a=make(id,{scope:'course',rangeChoice:choice});for(const s of a.sessions)for(const e of s.exercises){const [min,max=min]=e.sets.split('-').map(Number);assert.equal(e.setCount,choice==='min'?min:max);}
 }
 assert.deepEqual(make(ids[1]).sessions[0].exercises.map(e=>e.setCount),[2,2,2,3,2,2,1,1]);
 assert.deepEqual(make(ids[1],{rangeChoice:'max'}).sessions[0].exercises.map(e=>e.setCount),[2,2,2,3,3,3,2,2]);
 assert.deepEqual(make(ids[1],{phase:4}).sessions[0].exercises.map(e=>e.setCount),[2,2,2,3,5,5,3,3]);
 assert.throws(()=>make(ids[0],{rangeChoice:'other'}),/границу/);assert.throws(()=>make(ids[1],{stretch:true}),/обязательные/);
});
test('source pauses, paired grouping and mandatory C are retained; heel tempo is not a work timer',()=>{
 const a=make(ids[1]);assert.deepEqual(orderedSets(a.sessions[0]).slice(0,6).map(r=>r.key),['W1:0','W2:0','W3:0','W1:1','W2:1','W3:1']);
 assert.equal(nextRest(a,'W1:0').seconds,30);assert.equal(nextRest(a,'A1:0').seconds,90);assert.equal(nextRest(a,'B2:0').seconds,60);assert.equal(nextRest(a,'C2:0'),null);
 const b=make(ids[0]);assert.equal(nextRest(b,'A1:0').seconds,120);assert.equal(nextRest(b,'A1:2'),null);
 for(const ss of Object.values(source))for(const s of ss)for(const e of s.exercises)if(e.tempo==='3132'){assert.equal(timedExercise(e),null);assert.equal(e.rir,'0-2');assert.ok(e.note.includes('подъём 3 секунды'));}
 assert.equal(make(ids[1]).sessions[0].exercises.find(e=>e.code==='C1').setCount,1);
});
test('existing ban adapts exactly three forbidden rows with original record, source link and approved movement preserved',()=>{
 const a=make(ids[1],{scope:'course'}),rows=a.sessions.flatMap(s=>s.exercises).filter(e=>e.sourceAdaptation);assert.equal(rows.length,3);
 for(const e of rows){assert.equal(e.name,'Bridge Walkout');assert.equal(e.originalName,'Bridge Walkout');assert.equal(e.sourceAdaptation.original.name,'Prone Hamstring Curl');assert.equal(isCoachBannedExercise(e.sourceAdaptation.original.name),true);assert.equal(e.sets,'1-2');assert.equal(e.reps,'6-12');assert.equal(e.restSeconds,60);assert.equal(e.rir,'3');assert.ok(e.sourceAdaptation.original.video);assert.equal(e.video,source.comprehensive[9].exercises[6].video);}
 assert.ok(registeredCourse(ids[1]).importNotes.some(n=>n.includes('запрету тренера')));
});
test('Daily keeps ten independent stretches before one minute of active movement, no fictional phases/calendar',()=>{
 const a=make(ids[2]);assert.equal(a.sessions.length,252);assert.equal(a.courseOnly,true);
 assert.deepEqual(orderedSets(a.sessions[0]).map(r=>r.key),[...Array.from({length:10},(_,i)=>'A1:'+i),'B1:0']);
 assert.deepEqual(timedExercise(a.sessions[0].exercises[0]),{min:10,max:10,sides:1,repeats:1});assert.deepEqual(timedExercise(a.sessions[0].exercises[1]),{min:60,max:60,sides:1,repeats:1});
 assert.equal(a.sessions[0].exercises[1].reps,'1 min');assert.equal(nextRest(a,'A1:8').seconds,5);assert.equal(nextRest(a,'B1:0'),null);assert.throws(()=>make(ids[2],{scope:'phase'}),/целиком/);
 assert.equal(JSON.stringify(a).length<600000,true);
});
test('whole courses complete by actual confirmation only, partial C and stretch series never advance',()=>{
 for(const id of ids){let a=make(id,{scope:'course'});const total=a.sessions.length;
  a=applyAssignmentCommand(a,command(a,'mark',{key:orderedSets(a.sessions[0])[0].key,done:true}),{now:'2036-01-01T00:00:00Z'}).assignment;assert.equal(a.cursor,0);assert.throws(()=>applyAssignmentCommand(a,command(a,'complete')),/все подходы/);
  for(let i=0;i<total;i++)a=finish(a);assert.equal(a.status,'completed');assert.equal(a.history.length,total);
 }
});
test('edits keep partial and completed source editions, identities, range choice and replay semantics',()=>{
 let a=make(ids[1],{rangeChoice:'max'});a=applyAssignmentCommand(a,command(a,'mark',{key:'W1:0',done:true})).assignment;
 const sourceId=a.sessions[0].exercises[0].sourceId;const next=refreshFutureSessions(a,registeredCourse(ids[1],{revision:1,exercises:{[sourceId]:{name:'Coach foot edit'}}}));assert.equal(next.sessions[0].exercises[0].name,a.sessions[0].exercises[0].name);assert.equal(next.sessions[2].exercises[0].name,'Coach foot edit');assert.equal(next.options.rangeChoice,'max');assert.throws(()=>refreshFutureSessions(a,registeredCourse(ids[0])),/другим/);
 for(const r of orderedSets(a.sessions[a.cursor]))a=applyAssignmentCommand(a,command(a,'mark',{key:r.key,done:true})).assignment;const done=command(a,'complete');a=applyAssignmentCommand(a,done).assignment;assert.equal(applyAssignmentCommand(a,done).replay,true);assert.equal(a.cursor,1);
});
