import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSessionDate, previousPerformances, holdPrescription, normalizeSkips, skippedSetCount } from '../lib/playerExperience.mjs';
import { mergeWorkoutProgress, summarizePlayerWorkout } from '../lib/workoutProgress.mjs';
import { nextWorkoutSet, firstIncompleteBlock, blockIsComplete } from '../lib/playerWorkout.mjs';

const session = { blocks: [{ label: 'A', rest_note: '15 сек между упражнениями, 2 мин после пары', exercises: [
  { name: 'Row', targetSets: ['5', '5'] }, { name: 'Plank', targetSets: ['30 сек', '30 сек'] },
] }] };

test('date selection prefers today, nearest future, then most recent past', () => {
  assert.equal(selectSessionDate(['2026-09-15', '2026-09-20', '2026-09-18'], '2026-09-17'), '2026-09-18');
  assert.equal(selectSessionDate(['2026-09-17', '2026-09-20'], '2026-09-17'), '2026-09-17');
  assert.equal(selectSessionDate(['2026-09-12', '2026-09-15'], '2026-09-17'), '2026-09-15');
  assert.equal(selectSessionDate(['2026-09-20'], '2026-09-17', '2026-09-17'), null);
  assert.equal(selectSessionDate(['2026-09-18', '2026-09-20'], '2026-09-17', '2026-09-20'), '2026-09-20');
});

test('skip closes only unfinished sets and advances without marking them done', () => {
  const done = { '0-0-0': true }, skipped = { '0-0': 'Нет оборудования' };
  assert.equal(skippedSetCount(session, done, skipped), 1);
  assert.equal(nextWorkoutSet(session, done, skipped).key, '0-1-0');
  const finalDone = { ...done, '0-1-0': true, '0-1-1': true };
  assert.equal(nextWorkoutSet(session, finalDone, skipped), null);
  assert.equal(blockIsComplete(session.blocks[0], 0, finalDone, skipped), true);
  assert.equal(firstIncompleteBlock(session, finalDone, skipped), null);
  const summary = summarizePlayerWorkout(session, { done: finalDone, skipped, completedAt: '2026-09-17T10:00:00Z' });
  assert.equal(summary.completedSets, 3); assert.equal(summary.skippedSets, 1);
  assert.equal(summary.completed, false); assert.equal(summary.endedEarly, true);
  assert.equal(summary.skippedExercises[0].name, 'Row');
  assert.equal(nextWorkoutSet(session, finalDone, { '0-0': null }).key, '0-0-1');
});

test('skip undo has its own clock and cannot be undone by a stale device', () => {
  const current = { skipped: { '0-0': null }, skipUpdatedAt: { '0-0': '2026-09-17T10:10:00Z' } };
  const merged = mergeWorkoutProgress(current, { skipped: { '0-0': 'Дискомфорт' }, skipUpdatedAt: { '0-0': '2026-09-17T10:05:00Z' } });
  assert.equal(merged.skipped['0-0'], null);
  assert.deepEqual(normalizeSkips({ bad: 'Нет оборудования', '0-1': 'invalid', '0-0': 'Решение тренера' }), { '0-0': 'Решение тренера' });
});

test('hold timer accepts exact prescribed seconds and distinguishes two sides', () => {
  assert.deepEqual(holdPrescription('30 сек'), { seconds: 30, sides: 1 });
  assert.deepEqual(holdPrescription('20 sec/side'), { seconds: 20, sides: 2 });
  assert.deepEqual(holdPrescription('20 сек на сторону'), { seconds: 20, sides: 2 });
  assert.equal(holdPrescription('20–30 сек'), null); assert.equal(holdPrescription('5/side'), null);
  assert.equal(holdPrescription('30 сек', { name: 'Jump Rope' }), null);
  assert.deepEqual(holdPrescription('30 сек', { name: 'Spanish Squat ISO' }), { seconds: 30, sides: 1 });
});

test('previous result uses actual completed weights and excludes future and planned-only sessions', () => {
  const records = [
    { date: '2026-09-18', session, log: { done: { '0-0-0': true }, weights: { '0-0-0': 99 } } },
    { date: '2026-09-16', session, log: { done: {}, weights: {} } },
    { date: '2026-09-15', session, log: { done: { '0-0-0': true }, weights: { '0-0-0': '12,5' } }, feedback: { rpe: 7 } },
  ];
  const result = previousPerformances(records, '2026-09-17');
  assert.equal(result.row.date, '2026-09-15'); assert.equal(result.row.sets[0].kg, 12.5);
  assert.equal(result.row.rpe, 7); assert.equal(result.plank, undefined);
});

test('previous result survives operational log expiry via actual-session history', () => {
  const result = previousPerformances([{ date: '2026-08-01', session, actual: { exercises: [{ name: 'Row', block: 'A', setActuals: [{ completed: true, target: '5', kg: 14 }] }] } }], '2026-09-17');
  assert.equal(result.row.sets[0].kg, 14);
});
