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
  // 12.5 kg × 2 DB × 6 reps + planned 10 kg × 2 DB × 4 reps.
  assert.equal(completedTonnage(session, done, weights), 230);
});

test('workout duration is formatted for compact completion summaries', () => {
  assert.equal(formatWorkoutDuration(47), '47 сек');
  assert.equal(formatWorkoutDuration(754), '12 мин');
  assert.equal(formatWorkoutDuration(7380), '2 ч 3 мин');
});
