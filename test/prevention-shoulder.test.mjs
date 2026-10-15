import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../lib/prevention/shoulder-impingement.json' with { type: 'json' };
import { registeredCourse, preventionCourses } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets, nextRest, progressCounts, applyAssignmentCommand, refreshFutureSessions } from '../lib/prevention/model.mjs';
const basic = registeredCourse('shoulder-impingement-basic'), comprehensive = registeredCourse('shoulder-impingement-comprehensive');
const options = { scope: 'phase', phase: 1, mainSets: 3, preparationSets: 2, stretchSets: 2, stretch: false, reviewed: true };
const create = (course = basic, patch) => createAssignment(course, { ...options, rests: course.rests, ...patch }, { id: 'shoulder-test-assignment' });
const command = (a, action, patch = {}) => ({ requestId: crypto.randomUUID(), expectedRevision: a.revision, sessionIndex: a.cursor, action, ...patch });
test('one shoulder region offers both original programs and all 16 source templates', () => {
  assert.deepEqual(preventionCourses().filter(c => c.regionId === 'shoulder').map(c => c.sessions), [56, 48]);
  assert.equal(source.basic.length, 4); assert.equal(source.comprehensive.length, 12);
  assert.equal(source.basic.flatMap(s => s.exercises).length, 15); assert.equal(source.comprehensive.flatMap(s => s.exercises).length, 69);
  assert.ok([...source.basic, ...source.comprehensive].every(s => s.exercises.every(e => e.video.startsWith('https://www.youtube.com/') && e.originalNote && e.note)));
  for (const phase of [1, 2, 3, 4]) {
    const b = basic.sessions.filter(s => s.phase === phase), c = comprehensive.sessions.filter(s => s.phase === phase);
    assert.equal(b.length, 14); assert.equal(c.length, 12);
    assert.deepEqual(b.map(s => s.phaseSession), Array.from({length:14}, (_,i)=>i+1));
    assert.deepEqual(c.map(s => s.phaseSession), Array.from({length:12}, (_,i)=>i+1));
    assert.ok(b.every(s => s.phaseTotal === 14)); assert.ok(c.every(s => s.phaseTotal === 12));
    assert.deepEqual(c.map(s => s.sourceDay), [1,2,3,1,2,3,1,2,3,1,2,3]);
  }
  assert.equal(comprehensive.sessions[36].phaseLabel, 'D');
  assert.equal(basic.sessions[28].sourceTableLabel, 'Phase 2');
  assert.equal(comprehensive.sessions[37].sourceTableLabel, 'Phase 2');
});
test('every prescribed C/D exercise remains mandatory; sets use source range rather than block letter', () => {
  const a = create(basic, { phase: 2 });
  assert.deepEqual(a.sessions[0].exercises.map(e => [e.code, e.setCount]), [['A1',2],['B1',2],['C1',3],['D1',3]]);
  assert.equal(progressCounts(a).total, 10);
  assert.throws(() => create(basic, { stretch: true }), /обязательные/);
  assert.throws(() => create(basic, { mobility: true }), /обязательные/);
  assert.throws(() => create(basic, { preparationSets: 4 }), /2 до 3/);
  assert.equal(create(comprehensive, { phase: 4, preparationSets: 3, mainSets: 4 }).sessions[0].exercises.length, 8);
  assert.equal(create(comprehensive, { phase: 4 }).options.phaseLabel, 'D');
});
test('source rests and paired/solo order distinguish one minute, two minutes and missing values', () => {
  const a = create(comprehensive, { phase: 4 });
  assert.deepEqual(orderedSets(a.sessions[0]).slice(0,6).map(r=>r.key), ['A1:0','A2:0','A1:1','A2:1','B1:0','B2:0']);
  assert.equal(nextRest(a, 'A1:0').seconds, 30);
  assert.equal(nextRest(a, 'B1:0').seconds, 120);
  assert.equal(nextRest(a, 'C1:0').seconds, 120);
  assert.equal(nextRest(a, 'C2:0').seconds, 60);
  assert.equal(nextRest(a, 'D2:0').seconds, 90);
  assert.equal(nextRest(a, 'D2:2'), null);
  const b = create(basic, { phase: 2 });
  assert.deepEqual(orderedSets(b.sessions[0]).slice(0,4).map(r=>r.key), ['A1:0','A1:1','B1:0','B1:1']);
  assert.equal(nextRest(b, 'B1:0').seconds, 90); assert.equal(nextRest(b, 'C1:0').seconds, 120);
  assert.equal(nextRest(create(basic, { rests: { ...basic.rests, A: 0 } }), 'A1:0').seconds, 0);
});
test('a basic phase requires fourteen actual completions, retains incomplete C/D and ends once', () => {
  let a = create(basic, { phase: 2 });
  for (let i=0;i<14;i++) {
    for(const row of orderedSets(a.sessions[a.cursor]).filter(r=>r.block!=='D')) a=applyAssignmentCommand(a,command(a,'mark',{key:row.key,done:true})).assignment;
    assert.throws(()=>applyAssignmentCommand(a,command(a,'complete')),/все подходы/);
    for(const row of orderedSets(a.sessions[a.cursor]).filter(r=>r.block==='D')) a=applyAssignmentCommand(a,command(a,'mark',{key:row.key,done:true})).assignment;
    const body=command(a,'complete');a=applyAssignmentCommand(a,body).assignment;
    assert.equal(applyAssignmentCommand(a,body).replay,true);
  }
  assert.equal(a.cursor,14);assert.equal(a.status,'completed');assert.equal(a.history.length,14);
});
test('program-specific refresh preserves executed editions and cannot swap Basic and Comprehensive', () => {
  let a=create(basic,{phase:2});a=applyAssignmentCommand(a,command(a,'mark',{key:'A1:0',done:true})).assignment;
  const id=a.sessions[0].exercises[0].sourceId;
  const next=refreshFutureSessions(a,registeredCourse(basic.id,{revision:1,exercises:{[id]:{name:'Coach shoulder correction'}}}));
  assert.equal(next.sessions[0].exercises[0].name,a.sessions[0].exercises[0].name);assert.equal(next.sessions[1].exercises[0].name,'Coach shoulder correction');
  assert.throws(()=>refreshFutureSessions(a,comprehensive),/другим/);
  assert.equal(a.sessions[0].exercises[1].originalNote,'Go as far as comfortable. Weight optional.');
  assert.equal(create().sessions[0].exercises[1].rpe,'7');
  assert.ok(a.phaseReviewNote);assert.ok(comprehensive.warning.includes('всей верхней части тела'));
});
