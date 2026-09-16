import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockIsComplete,
  completedTonnage,
  firstIncompleteBlock,
  firstIncompleteExercise,
  formatWorkoutDuration,
  nextIncompleteBlock,
  nextExercise,
  restSecondsFor,
  nextWorkoutSet,
  restRemaining,
} from '../lib/playerWorkout.mjs';

const session = {
  blocks: [
    {
      id: 'A',
      rest_note: '30 сек между упражнениями, 60 сек между кругами',
      exercises: [
        { name: 'Double DB RDL', loadUnits: 2, weightKg: 10, targetSets: ['3/side', '4'] },
        { name: 'Pallof Press', targetSets: ['6/side'] },
      ],
    },
    { id: 'B', exercises: [{ name: 'Dead Bug', targetSets: ['8'] }] },
  ],
};

test('focus mode finds the first incomplete exercise and advances in program order', () => {
  const done = { '0-0-0': true, '0-0-1': true };
  assert.deepEqual(firstIncompleteExercise(session, done)?.key, '0-1');
  assert.deepEqual(nextExercise(session, 0, 1)?.key, '1-0');
  assert.equal(nextExercise(session, 1, 0), null);
});

test('block focus stays open until every exercise set is complete, then advances', () => {
  const partlyDone = { '0-0-0': true, '0-0-1': true, '0-1-0': false };
  assert.equal(blockIsComplete(session.blocks[0], 0, partlyDone), false);
  assert.equal(firstIncompleteBlock(session, partlyDone)?.bi, 0);

  const blockADone = { ...partlyDone, '0-1-0': true };
  assert.equal(blockIsComplete(session.blocks[0], 0, blockADone), true);
  assert.equal(nextIncompleteBlock(session, 0, blockADone)?.bi, 1);

  const allDone = { ...blockADone, '1-0-0': true };
  assert.equal(firstIncompleteBlock(session, allDone), null);
  assert.equal(nextIncompleteBlock(session, 1, allDone), null);
});

test('rest timer uses the longest block recovery and respects direct exercise values', () => {
  assert.equal(restSecondsFor(session.blocks[0]), 60);
  assert.equal(restSecondsFor({}, { restSeconds: 42 }), 42);
  assert.equal(restSecondsFor({}, { restSeconds: 999 }), 300);
  assert.equal(restSecondsFor({}, {}), 60);
});

test('completed tonnage counts only finished sets, per-side reps and implement units', () => {
  const done = { '0-0-0': true, '0-0-1': true, '0-1-0': false };
  const weights = { '0-0-0': '12,5' };
  // Only explicitly confirmed actual weights count: 12.5 kg × 2 DB × 6 reps.
  assert.equal(completedTonnage(session, done, weights), 150);
});

test('workout duration is formatted for compact completion summaries', () => {
  assert.equal(formatWorkoutDuration(47), '47 сек');
  assert.equal(formatWorkoutDuration(754), '12 мин');
  assert.equal(formatWorkoutDuration(7380), '2 ч 3 мин');
});

test('athlete notes omit planning analytics but retain exercise safety instructions', async () => {
  const { athleteSessionWarning } = await import('../lib/playerWorkout.mjs');
  assert.equal(athleteSessionWarning('Предварительный план: подтвердить свежие данные в ReadySix. При новых ограничениях ReadySix снизить объём; жим:тяга 15:18.'), '');
  assert.equal(athleteSessionWarning('Предварительный план: проверить ReadySix.\nПри боли в плече остановить жим.'), 'При боли в плече остановить жим.');
  assert.equal(athleteSessionWarning('Предварительный план: проверить ReadySix. При боли прекрати подход.'), 'При боли прекрати подход.');
  assert.equal(athleteSessionWarning('ReadySix: прыжки запрещены.'), 'ReadySix: прыжки запрещены.');
  assert.equal(athleteSessionWarning('При боли прекрати подход и сообщи тренеру.'), 'При боли прекрати подход и сообщи тренеру.');
});


test('circuits choose set order and transition-specific rests', () => {
  const workout = { blocks: [{ label: 'A', rest_note: '10–15 сек A1→A2, 2–3 мин после пары.', exercises: [
    { code: 'A1', targetSets: ['5', '5'] }, { code: 'A2', targetSets: ['3', '3'] },
  ] }] };
  const block = workout.blocks[0];
  const done = { '0-0-0': true };
  let next = nextWorkoutSet(workout, done);
  assert.equal(next.key, '0-1-0');
  assert.equal(restSecondsFor(block, block.exercises[0], { bi: 0, ei: 0, next }), 15);
  done['0-1-0'] = true;
  next = nextWorkoutSet(workout, done);
  assert.equal(next.key, '0-0-1');
  assert.equal(restSecondsFor(block, block.exercises[1], { bi: 0, ei: 1, next }), 180);
});

test('triplets preserve each explicit transition and tolerate uneven sets', () => {
  const workout = { blocks: [{ label: 'B', rest_note: '10–15 сек B1→B2, 90 сек B2→B3, 2 мин после тройки.', exercises: [
    { code: 'B1', targetSets: ['5'] }, { code: 'B2', targetSets: ['3', '3'] }, { code: 'B3', targetSets: ['8', '8'] },
  ] }] };
  const done = { '0-0-0': true, '0-1-0': true };
  const next = nextWorkoutSet(workout, done);
  assert.equal(next.key, '0-2-0');
  assert.equal(restSecondsFor(workout.blocks[0], workout.blocks[0].exercises[1], { bi: 0, ei: 1, next }), 90);
  done['0-2-0'] = true;
  assert.equal(nextWorkoutSet(workout, done).key, '0-1-1');
});

test('deadline clock catches up after background suspension and reload', () => {
  assert.equal(restRemaining('2026-09-17T10:03:00Z', Date.parse('2026-09-17T10:01:31Z')), 89);
  assert.equal(restRemaining('2026-09-17T10:03:00Z', Date.parse('2026-09-17T10:04:00Z')), 0);
  assert.equal(restRemaining('invalid'), 0);
});

test('actual tonnage never treats timed holds as repetitions', () => {
  const workout = { blocks: [{ exercises: [{ weightKg: 20, targetSets: ['30 сек', '5/side'] }] }] };
  assert.equal(completedTonnage(workout, { '0-0-0': true, '0-0-1': true }, { '0-0-0': 20, '0-0-1': 20 }), 200);
  assert.equal(completedTonnage(workout, { '0-0-1': true }, {}), 0);
});
