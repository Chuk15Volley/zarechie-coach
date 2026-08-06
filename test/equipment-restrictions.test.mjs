import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isSledExercise,
  sanitizeUnavailableEquipmentExercises,
} from '../lib/equipmentRestrictions.mjs';
import { validateSession } from '../lib/sessionValidator.js';

test('all sled and prowler naming variants are unavailable', () => {
  for (const name of [
    'Heavy Sled Push',
    'Backward Sled Drag',
    'Prowler March',
    'Толкание саней',
    'Тяга санок назад',
  ]) assert.equal(isSledExercise(name), true, name);
  assert.equal(isSledExercise('Band-Resisted March'), false);
});

test('generated sled exercises and alternatives are deterministically replaced', () => {
  const result = sanitizeUnavailableEquipmentExercises({
    blocks: [{
      label: 'D',
      exercises: [{
        code: 'D1',
        name: 'Sled Push',
        targetSets: ['15 м', '15 м'],
        weightKg: 80,
        alternatives: ['Prowler Push', 'Band-Resisted March'],
        cue: 'Толкай сани',
      }],
    }],
  });
  const exercise = result.blocks[0].exercises[0];
  assert.equal(exercise.name, 'Band-Resisted March');
  assert.equal(exercise.weightKg, null);
  assert.deepEqual(exercise.alternatives, ['Band-Resisted March']);
  assert.doesNotMatch(exercise.cue, /sled|prowler|сан/i);
});

test('validator flags a sled if an unsanitized external session reaches it', () => {
  const validation = validateSession({
    blocks: [{ label: 'D', exercises: [{ code: 'D1', name: 'Prowler Push' }] }],
  });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /Запрещённое упражнение/);
});

test('generation prompt explicitly states that the club has no sled', () => {
  const source = readFileSync(new URL('../pages/api/programs/generate.js', import.meta.url), 'utf8');
  assert.match(source, /САНЕЙ \/ SLED \/ PROWLER НЕТ/);
  assert.doesNotMatch(source, /landmine\/sled/);
  assert.doesNotMatch(source, /Landmine \| Sled \|/);
});
