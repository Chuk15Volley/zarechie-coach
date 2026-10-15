import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import source from '../lib/prevention/low-back-resilience.json' with { type: 'json' };
import { buildCourse, createAssignment, applyAssignmentCommand, orderedSets, nextRest, progressCounts, refreshFutureSessions, safeVideo, normalizeRests, DEFAULT_RESTS } from '../lib/prevention/model.mjs';

const options = { scope: 'course', stretch: false, mainSets: 2, stretchSets: 2, reviewed: true, rests: DEFAULT_RESTS, note: '' };
const create = input => createAssignment(buildCourse(source), { ...options, ...input }, { id: 'fixture-assignment', now: '2026-10-15T10:00:00Z' });
const command = (assignment, action, patch = {}) => ({ requestId: 'req-' + crypto.randomUUID(), expectedRevision: assignment.revision, sessionIndex: assignment.cursor, action, ...patch });
const markAll = assignment => { for (const row of orderedSets(assignment.sessions[assignment.cursor])) assignment = applyAssignmentCommand(assignment, command(assignment, 'mark', { key: row.key, done: true })).assignment; return assignment; };

test('PDF import contains all 48 sessions, exact doses and final-page issues', () => {
  const course = buildCourse(source);
  assert.equal(course.sessions.length, 48); assert.ok(course.sessions.every(s => s.exercises.length === 8));
  assert.equal(course.sessions[0].exercises[0].reps, '30-60 sec'); assert.equal(course.sessions[0].exercises[4].sets, '2-4');
  assert.deepEqual(course.sessions.filter(s => s.phase === 1).map(s => s.exercises[4].name), ['Single Leg Bridge Iso', 'Split Squat', 'Single Leg Bridge Iso', 'Split Squat', 'Single Leg Bridge Iso', 'Split Squat', 'Single Leg Bridge Iso', 'Split Squat', 'Single Leg Bridge Iso', 'Split Squat', 'Single Leg Bridge Iso', 'Split Squat']);
  for (const phase of [1, 2, 3, 4]) assert.equal(course.sessions.filter(s => s.phase === phase).length, 12);
  assert.equal(course.sessions[47].exercises.filter(e => !e.video).length, 7);
  assert.equal(course.sessions[47].exercises.filter(e => !e.note).length, 7);
  assert.equal(course.sessions[47].exercises[2].name, 'Shin Box Rotation No Hands');
});
test('course and phase assignments start at the first session without dates or schedule', () => {
  const full = create(), phase = create({ scope: 'phase', phase: 3 });
  assert.equal(full.sessions.length, 48); assert.equal(phase.sessions.length, 12); assert.equal(phase.sessions[0].phase, 3); assert.equal(phase.cursor, 0);
  assert.equal(full.sessions[0].exercises.length, 6); assert.equal(create({ stretch: true, mainSets: 4, stretchSets: 3 }).sessions[0].exercises[6].setCount, 3);
  assert.ok(!Object.hasOwn(phase.options, 'date')); assert.ok(!Object.hasOwn(phase.options, 'days'));
});
test('execution follows circuit rounds, with explicit transitions and no final rest', () => {
  const a = create(); const keys = orderedSets(a.sessions[0]).map(e => e.key);
  assert.deepEqual(keys.slice(0, 8), ['A1:0', 'A2:0', 'A3:0', 'A4:0', 'A1:1', 'A2:1', 'A3:1', 'A4:1']);
  assert.equal(nextRest(a, 'A1:0').seconds, 20); assert.equal(nextRest(a, 'A4:0').seconds, 30);
  assert.equal(nextRest(a, 'A4:1').seconds, 60); assert.equal(nextRest(a, 'B1:0').seconds, 60); assert.equal(nextRest(a, 'B2:0').seconds, 90); assert.equal(nextRest(a, 'B2:1'), null);
  const zero = create({ rests: Object.fromEntries(Object.keys(DEFAULT_RESTS).map(k => [k, 0])) }); assert.equal(nextRest(zero, 'A4:1').seconds, 0);
});
test('partial, undone and invented set keys never advance a session', () => {
  let a = create(); assert.throws(() => applyAssignmentCommand(a, command(a, 'complete')), /все подходы/);
  assert.throws(() => applyAssignmentCommand(a, command(a, 'mark', { key: 'B1:99', done: true })), /подход/);
  a = markAll(a); a = applyAssignmentCommand(a, command(a, 'mark', { key: 'A1:0', done: false })).assignment;
  assert.equal(progressCounts(a).done, progressCounts(a).total - 1); assert.throws(() => applyAssignmentCommand(a, command(a, 'complete')), /все подходы/); assert.equal(a.cursor, 0);
});
test('completion advances exactly once, including lost-response retries after later writes', () => {
  let a = markAll(create()); const complete = command(a, 'complete'); a = applyAssignmentCommand(a, complete, { now: '2026-10-20T10:00:00Z' }).assignment;
  assert.equal(a.cursor, 1); assert.deepEqual(a.progress, {}); assert.equal(a.history[0].completedAt, '2026-10-20T10:00:00Z');
  a = applyAssignmentCommand(a, command(a, 'mark', { key: 'A1:0', done: true })).assignment;
  const retry = applyAssignmentCommand(a, complete); assert.equal(retry.replay, true); assert.equal(retry.assignment.cursor, 1); assert.equal(retry.assignment.progress['A1:0'], true);
  assert.throws(() => applyAssignmentCommand(a, { ...complete, action: 'mark', key: 'A2:0', done: true }), /другой операции/);
});
test('stale devices and the previous session cannot change current progress', () => {
  const a = create(), stale = command(a, 'mark', { key: 'A2:0', done: true });
  const next = applyAssignmentCommand(a, command(a, 'mark', { key: 'A1:0', done: true })).assignment;
  assert.throws(() => applyAssignmentCommand(next, stale), /другом устройстве/);
  assert.throws(() => applyAssignmentCommand(next, { ...command(next, 'mark', { key: 'A1:0', done: true }), sessionIndex: 1 }), /не активно/);
});
test('a phase completes after twelve actual sessions and cannot advance again', () => {
  let a = create({ scope: 'phase', phase: 4 });
  for (let i = 0; i < 12; i++) { a = markAll(a); a = applyAssignmentCommand(a, command(a, 'complete')).assignment; }
  assert.equal(a.status, 'completed'); assert.equal(a.cursor, 12); assert.equal(a.history.length, 12);
  assert.throws(() => applyAssignmentCommand(a, command(a, 'complete')), /закрыто/);
});
test('manual library fixes apply explicitly to future sessions without rewriting history or partial work', () => {
  let a = markAll(create()); a = applyAssignmentCommand(a, command(a, 'complete')).assignment;
  a = applyAssignmentCommand(a, command(a, 'mark', { key: 'A1:0', done: true })).assignment;
  const id = a.sessions[0].exercises[0].sourceId;
  const fixed = buildCourse(source, { revision: 4, exercises: { [id]: { name: 'Corrected Cat Cow', video: 'https://youtu.be/example1234' } } });
  const refreshed = refreshFutureSessions(a, fixed);
  assert.equal(refreshed.sessions[0].exercises[0].name, 'Global Cat Cow'); assert.equal(refreshed.sessions[1].exercises[0].name, 'Global Cat Cow'); assert.equal(refreshed.sessions[2].exercises[0].name, 'Corrected Cat Cow');
  assert.deepEqual(refreshed.progress, a.progress); assert.deepEqual(refreshed.history, a.history);
});
test('invalid doses, unsafe video URLs and unknown spaces are rejected', () => {
  assert.throws(() => create({ mainSets: 0 }), /2 до 4/); assert.throws(() => create({ reviewed: false }), /Проверьте/); assert.throws(() => create({ scope: 'phase', phase: 5 }), /фазу/);
  for (const url of ['javascript:alert(1)', 'http://youtube.com/a', 'https://youtube.com.evil.test/a', 'https://secret@youtube.com/a', 'https://127.0.0.1/a']) assert.throws(() => safeVideo(url));
  assert.equal(safeVideo('https://youtu.be/FLQDiUccsko'), 'https://youtu.be/FLQDiUccsko'); assert.equal(safeVideo(''), '');
  assert.throws(() => normalizeRests({ ...DEFAULT_RESTS, block: -1 })); assert.throws(() => normalizeRests({ ...DEFAULT_RESTS, B: '60' }));
});

test('new progress keys remain inside workspace backups and UI is reachable without gym sessions', async () => {
  const { shouldIncludeBackupKey } = await import('../lib/backupCodec.mjs');
  assert.ok(shouldIncludeBackupKey('nkperf', 'nkperf:prevention:player:fixture:assignment:fixture-id'));
  assert.ok(!shouldIncludeBackupKey('zarechie', 'nkperf:prevention:player:fixture:assignment:fixture-id'));
  const player = fs.readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
  assert.match(player, /activeTab === 'prevention' && <PlayerPrevention token=\{token\}/);
  assert.doesNotMatch(player, /!notFound && sessionDates.length > 0 &&/);
});
