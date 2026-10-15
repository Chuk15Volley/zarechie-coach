import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredCourse, preventionCourses } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets, nextRest, applyAssignmentCommand, refreshFutureSessions, progressCounts } from '../lib/prevention/model.mjs';
import { timedExercise } from '../lib/prevention/timing.mjs';
const course = registeredCourse('knee-resilience');
const options = { scope: 'phase', phase: 1, mainSets: 3, stretch: false, stretchSets: 2, mobility: false, mobilitySets: 2, reviewed: true, rests: course.rests };
const create = patch => createAssignment(course, { ...options, ...patch }, { id: 'knee-fixture-assignment' });
const command = (a, action, patch = {}) => ({ requestId: crypto.randomUUID(), expectedRevision: a.revision, sessionIndex: a.cursor, action, ...patch });
test('region registry preserves back defaults and imports all knee source rows and video links', () => {
  assert.deepEqual(preventionCourses().filter(c => ['low-back', 'knee'].includes(c.regionId)).map(c => [c.regionId, c.sessions]), [['low-back', 48], ['knee', 48]]);
  assert.equal(registeredCourse().rests.D, undefined);
  assert.throws(() => registeredCourse('unknown'), /не найдена/);
  assert.equal(course.sessions.length, 48);
  assert.equal(course.sessions.flatMap(s => s.exercises).length, 480);
  for (const phase of [1, 2, 3, 4]) {
    const sessions = course.sessions.filter(s => s.phase === phase);
    assert.equal(sessions.length, 12);
    for (const [i, s] of sessions.entries()) {
      assert.equal(s.phaseSession, i + 1);
      assert.deepEqual(s.exercises.map(e => e.code), ['A1', 'A2', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'D1', 'D2']);
      assert.ok(s.exercises.every(e => e.video.startsWith('https://') && e.note && e.originalNote));
      assert.ok(s.exercises.filter(e => e.code[0] === 'B').every(e => e.sets === '3-4'));
      assert.equal(s.exercises[2].name, sessions[i % 2].exercises[2].name);
    }
  }
  assert.equal(course.sessions[0].exercises[8].reps, '10x5 sec');
  assert.equal(course.sessions[12].exercises[3].reps, '15-45 sec');
  assert.equal(course.sessions[37].exercises[5].reps, '10-15');
});
test('knee main range, independent optional blocks and circuit counts match PDF', () => {
  assert.throws(() => create({ mainSets: 2 }), /3 до 4/);
  for (const [stretch, mobility, total] of [[false, false, 16], [true, false, 20], [false, true, 20], [true, true, 24]]) {
    const a = create({ stretch, mobility });
    assert.equal(progressCounts(a).total, total);
    assert.equal(a.sessions[0].exercises.some(e => e.code === 'C1'), stretch);
    assert.equal(a.sessions[0].exercises.some(e => e.code === 'D1'), mobility);
  }
  const a = create({ mobility: true, mobilitySets: 3 });
  assert.deepEqual(orderedSets(a.sessions[0]).slice(-6).map(row => row.key), ['D1:0', 'D2:0', 'D1:1', 'D2:1', 'D1:2', 'D2:2']);
  assert.equal(nextRest(a, 'B4:2').seconds, 60);
  assert.equal(nextRest(a, 'D1:0').seconds, 20);
  assert.equal(nextRest(a, 'D2:0').seconds, 30);
  assert.equal(nextRest(a, 'D2:2'), null);
});
test('optional mobility must be completed before progression; refresh cannot substitute another course', () => {
  let a = create({ mobility: true });
  for (const row of orderedSets(a.sessions[0]).filter(r => r.block !== 'D')) a = applyAssignmentCommand(a, command(a, 'mark', { key: row.key, done: true })).assignment;
  assert.throws(() => applyAssignmentCommand(a, command(a, 'complete')), /все подходы/);
  assert.throws(() => refreshFutureSessions(a, registeredCourse()), /другим/);
  const id = a.sessions[0].exercises[0].sourceId;
  const refreshed = refreshFutureSessions(a, registeredCourse('knee-resilience', { revision: 1, exercises: { [id]: { name: 'Coach correction' } } }));
  assert.equal(refreshed.sessions[0].exercises[0].name, 'Downdog');
  assert.equal(refreshed.sessions[1].exercises[0].name, 'Coach correction');
  for (const row of orderedSets(a.sessions[0]).filter(r => r.block === 'D')) a = applyAssignmentCommand(a, command(a, 'mark', { key: row.key, done: true })).assignment;
  a = applyAssignmentCommand(a, command(a, 'complete')).assignment;
  assert.equal(a.cursor, 1); assert.equal(a.history.length, 1);
});
test('timing parser keeps ten five-second holds separate from ordinary and bilateral work', () => {
  assert.deepEqual(timedExercise({ reps: '10x5 sec' }), { min: 5, max: 5, repeats: 10, sides: 1 });
  assert.deepEqual(timedExercise({ reps: '15-45 sec each' }), { min: 15, max: 45, repeats: 1, sides: 2 });
  assert.equal(timedExercise({ reps: '10-15 each' }), null);
});
