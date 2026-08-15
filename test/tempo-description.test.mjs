import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciseDescription,
  normalizeSessionTempoDescriptions,
  tempoDescription,
} from '../lib/tempoDescription.mjs';

test('technical tempo is translated into clear lowering, pause and explosive ascent', () => {
  assert.equal(
    tempoDescription('0-3сек-X-0', 'Bulgarian Split Squat'),
    'Темп: опускайся вниз под контролем; задержись внизу на 3 секунды; поднимайся вверх максимально резко.',
  );
  assert.equal(
    tempoDescription('5-0-X-0', 'Goblet Squat'),
    'Темп: опускайся вниз 5 секунд; без паузы внизу; поднимайся вверх максимально резко.',
  );
});

test('working phase language follows the exercise instead of forcing an upward cue', () => {
  assert.match(tempoDescription('3-0-X-0', 'One-Arm DB Row'), /тяни максимально резко/);
  assert.match(tempoDescription('X-0-X-0', 'Countermovement Jump'), /выпрыгивай вверх максимально резко/);
  assert.match(tempoDescription('реактивный', 'MB Chest Pass'), /бросай мяч максимально резко/);
  assert.match(tempoDescription('изометрический', 'Pallof Press ISO'), /напряжение создавай максимально резко/);
  assert.equal(
    tempoDescription('0-5сек-X-0', 'Pallof Press ISO'),
    'Темп: займи рабочее положение под контролем; напряжение создавай максимально резко; удерживай положение 5 секунд.',
  );
  assert.match(tempoDescription('контролируемый', 'Band External Rotation'), /рабочую ротацию максимально активно, без рывка/);
  assert.doesNotMatch(tempoDescription('контролируемый', 'Hip 90\/90 Mobility'), /поднимайся вверх/);
});

test('legacy encoded cue is replaced while the technical coaching point is preserved', () => {
  assert.equal(
    exerciseDescription({
      name: 'Bulgarian Split Squat',
      tempo: '0-3сек-X-0',
      cue: 'Темп: 0-3сек-X-0. Переднее колено над вторым пальцем.',
    }),
    'Темп: опускайся вниз под контролем; задержись внизу на 3 секунды; поднимайся вверх максимально резко. Переднее колено над вторым пальцем.',
  );
});

test('session normalization applies the same wording to every exercise', () => {
  const session = normalizeSessionTempoDescriptions({
    blocks: [{ exercises: [
      { name: 'Trap Bar Deadlift', tempo: '3-1-X-0', cue: 'Спина нейтральна.' },
      { name: 'DB Bench Press', tempo: '3-0-X-0', cue: 'Лопатки стабильны.' },
    ] }],
  });
  assert.match(session.blocks[0].exercises[0].cue, /задержись внизу на 1 секунду/);
  assert.match(session.blocks[0].exercises[0].cue, /поднимайся вверх максимально резко/);
  assert.match(session.blocks[0].exercises[1].cue, /выжимай максимально резко/);
  assert.deepEqual(normalizeSessionTempoDescriptions(session), session);
});
