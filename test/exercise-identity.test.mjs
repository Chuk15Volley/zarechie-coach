import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalExerciseId, legacyExerciseId } from '../lib/exerciseIdentity.mjs';

test('canonical identity keeps equipment variants separate', () => {
  const db = canonicalExerciseId('Bulgarian Split Squat (DB)');
  const bw = canonicalExerciseId('Bulgarian Split Squat (BW)');
  assert.notEqual(db, bw);
  assert.match(db, /db/);
  assert.match(bw, /bw/);
  assert.equal(legacyExerciseId('Bulgarian Split Squat (DB)'), legacyExerciseId('Bulgarian Split Squat (BW)'));
});

test('canonical identity preserves Cyrillic instead of collapsing to an empty key', () => {
  assert.match(canonicalExerciseId('Изометрический сплит-присед с гантелями'), /изометрический/);
});
