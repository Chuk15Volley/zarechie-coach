import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../lib/prevention/tennis-elbow.json' with { type: 'json' };
import { preventionCourses, registeredCourse } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets, nextRest, progressCounts, applyAssignmentCommand, refreshFutureSessions, safeVideo } from '../lib/prevention/model.mjs';
import { timedExercise } from '../lib/prevention/timing.mjs';
const ids = ['basic-dumbbell', 'basic-band', 'comprehensive-dumbbell', 'comprehensive-band', 'daily'].map(s => `tennis-elbow-${s}`);
const make = (id = ids[0], patch = {}, catalogue) => {
  const c = registeredCourse(id, catalogue);
  return createAssignment(c, { scope: 'phase', phase: 1, mainSets: id.endsWith('daily') ? 1 : 3, preparationSets: 1, stretch: false, stretchSets: 2, reviewed: true, rests: c.rests, ...patch }, { id: 'elbow-test-assignment' });
};
const command = (a, action, patch = {}) => ({ requestId: crypto.randomUUID(), expectedRevision: a.revision, sessionIndex: a.cursor, action, ...patch });
function finish(a) {
  for (const row of orderedSets(a.sessions[a.cursor])) a = applyAssignmentCommand(a, command(a, 'mark', { key: row.key, done: true })).assignment;
  return applyAssignmentCommand(a, command(a, 'complete')).assignment;
}
test('elbow has four equipment-specific strength programs and an independent short routine', () => {
  assert.deepEqual(preventionCourses().filter(c => c.regionId === 'elbow').map(c => [c.id, c.sessions]), ids.map((id, i) => [id, i === 4 ? 336 : 48]));
  assert.deepEqual(Object.values(source).map(v => [v.length, v.reduce((n,s) => n+s.exercises.length,0)]), [[4,8],[12,24],[12,24],[12,80],[12,80]]);
  for (const templates of Object.values(source)) for (const s of templates) {
    assert.equal(new Set(s.exercises.map(e=>e.code)).size,s.exercises.length);
    for (const e of s.exercises) { assert.equal(safeVideo(e.video),e.video); assert.ok(e.originalNote); assert.ok(e.note); }
  }
  for (const id of ids.slice(0,4)) {
    const c=registeredCourse(id);
    for (let phase=1;phase<=4;phase++) {
      const sessions=c.sessions.filter(s=>s.phase===phase);
      assert.deepEqual(sessions.map(s=>s.sourceDay),[1,2,3,1,2,3,1,2,3,1,2,3]);
      assert.deepEqual(sessions.map(s=>s.phaseSession),Array.from({length:12},(_,i)=>i+1));
      assert.ok(sessions.every(s=>s.phaseTotal===12));
    }
  }
});
test('Basic requires both local and shoulder exercises; Comprehensive keeps warmup and C/D', () => {
  assert.deepEqual(make().sessions[0].exercises.map(e=>[e.code,e.name,e.setCount]),[['A1','Dumbbell Wrist Extension (Isometric)',3],['B1','Prone T',3]]);
  assert.equal(make(ids[1]).sessions[0].exercises[0].name,'Band Wrist Extension (Isometric)');
  const a=make(ids[2],{mainSets:4,preparationSets:2});
  assert.deepEqual(a.sessions[0].exercises.map(e=>[e.code,e.setCount]),[['W1',2],['W2',2],['A1',4],['A2',4],['B1',4],['C1',4],['D1',4]]);
  assert.equal(a.sessions[0].exercises[5].name,'Supinated Bicep Curls');
  assert.ok(a.sessions[0].exercises.slice(0,2).every(e=>e.originalCode==='W/U'));
  assert.equal(make(ids[3],{phase:4}).sessions[1].exercises[3].name,'Band External Rotation (90°)');
  assert.throws(()=>make(ids[2],{preparationSets:3}),/1 до 2/);
  assert.throws(()=>make(ids[0],{mainSets:2}),/3 до 4/);
  assert.throws(()=>make(ids[4],{mainSets:2}),/1 до 1/);
  for (const id of ids) assert.throws(()=>make(id,{stretch:true}),/обязательные/);
});
test('source grouping and rests keep solo work, paired A, warmup and final-set behavior', () => {
  const a=make(); assert.deepEqual(orderedSets(a.sessions[0]).map(r=>r.key),['A1:0','A1:1','A1:2','B1:0','B1:1','B1:2']);
  assert.equal(nextRest(a,'A1:2').seconds,120); assert.equal(nextRest(a,'B1:2'),null);
  const c=make(ids[2],{preparationSets:2});
  assert.deepEqual(orderedSets(c.sessions[0]).slice(0,10).map(r=>r.key),['W1:0','W2:0','W1:1','W2:1','A1:0','A2:0','A1:1','A2:1','A1:2','A2:2']);
  assert.equal(nextRest(c,'W2:1').seconds,30); assert.equal(nextRest(c,'A1:0').seconds,120); assert.equal(nextRest(c,'D1:2'),null);
  assert.equal(nextRest(make(ids[2],{rests:{...registeredCourse(ids[2]).rests,A:0}}),'W1:0').seconds,0);
});
test('eccentric tempo never starts a three-second work timer; isometric RPE remains distinct', () => {
  for (const id of ids.slice(0,4)) {
    const p1=make(id).sessions.flatMap(s=>s.exercises).find(e=>e.name.includes('Wrist')&&e.name.includes('Isometric'));
    assert.equal(p1.rpe,'7-9'); assert.equal(p1.rir,'-'); assert.deepEqual(timedExercise(p1),{min:30,max:45,sides:1,repeats:1});
    const eccentric=make(id,{phase:2}).sessions.flatMap(s=>s.exercises).filter(e=>e.name.includes('Eccentric'));
    assert.ok(eccentric.length); assert.ok(eccentric.every(e=>e.reps==='8-12 (3 sec lower)'&&e.tempo==='3 sec lower'&&timedExercise(e)===null&&e.rir==='1-3'));
  }
  // Preserve a source asymmetry rather than inferring a side instruction.
  assert.equal(make(ids[3],{phase:3}).sessions[1].exercises[3].reps,'8-12');
  assert.equal(make(ids[3],{phase:4}).sessions[1].exercises[3].reps,'12-15 ea');
});
test('actual completions advance one strength phase at twelve, never on elapsed dates or partial sets', () => {
  let a=make(ids[2],{scope:'course'});
  a=applyAssignmentCommand(a,command(a,'mark',{key:'W1:0',done:true}),{now:'2030-01-01T00:00:00Z'}).assignment;
  assert.equal(a.cursor,0); assert.throws(()=>applyAssignmentCommand(a,command(a,'complete')),/все подходы/);
  const stale=command(a,'mark',{key:'W2:0',done:true});a=finish(a);assert.throws(()=>applyAssignmentCommand(a,stale),/другом устройстве/);
  for(let i=1;i<12;i++)a=finish(a);
  assert.equal(a.cursor,12);assert.equal(a.sessions[a.cursor].phase,2);assert.equal(a.sessions[a.cursor].phaseSession,1);assert.equal(a.history.length,12);
  for(let i=12;i<48;i++)a=finish(a);
  assert.equal(a.status,'completed');assert.equal(a.cursor,48);
});
test('Daily Routine is fixed at two sets total and completes independently after 84 actual sessions', () => {
  let daily=make(ids[4],{phase:3}),strength=make();
  assert.equal(daily.sessions.length,84);assert.equal(progressCounts(daily).total,2);assert.equal(daily.sessions[0].exercises[0].name,'Seated Thoracic Rotation Arms Outstretched');
  assert.ok(daily.sessions.every(s=>s.phaseTotal===84&&s.exercises.every(e=>e.setCount===1)));
  for(let i=0;i<84;i++)daily=finish(daily);
  assert.equal(daily.status,'completed');assert.equal(strength.cursor,0);assert.equal(strength.history.length,0);
  assert.equal(JSON.stringify(make(ids[4],{scope:'course'})).length<600000,true);
});
test('edits and refresh keep executed editions, exact program identity and phase safety guidance', () => {
  let a=make();a=applyAssignmentCommand(a,command(a,'mark',{key:'A1:0',done:true})).assignment;
  const id=a.sessions[0].exercises[0].sourceId;
  const next=refreshFutureSessions(a,registeredCourse(ids[0],{revision:1,exercises:{[id]:{name:'Coach elbow correction'}}}));
  assert.equal(next.sessions[0].exercises[0].name,a.sessions[0].exercises[0].name);assert.equal(next.sessions[3].exercises[0].name,'Coach elbow correction');
  assert.throws(()=>refreshFutureSessions(a,registeredCourse(ids[1])),/другим/);
  assert.ok(a.phaseReviewNote);assert.ok(a.warning.includes('Daily Routine'));assert.ok(a.guidance.some(g=>g.text.includes('медицинские противопоказания')));
  assert.equal(registeredCourse(ids[2]).sessions[0].exercises[6].name,'Dumbbell Wrist Extension (Isometric)');
});
