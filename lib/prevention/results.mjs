import { timedExercise } from './timing.mjs';
import { validActualWeight, needsLoadEntry } from '../playerGym.mjs';

export const resultExerciseIdentity = exercise => ({ sourceId: exercise.sourceId || '', name: exercise.name, reps: exercise.reps, setCount: exercise.setCount });
export function sameResultExercise(exercise, expected) {
  return !!exercise && !!expected && Object.entries(resultExerciseIdentity(exercise)).every(([key, value]) => expected[key] === value);
}

export function resultFields(exercise) {
  const timed = timedExercise(exercise);
  return { timed: !!timed, repeated: (timed?.repeats || 1) > 1, bilateral: /each|ea\b/.test(exercise.reps), weightRequired: needsLoadEntry(exercise) };
}
export function resultWeightLabel(exercise) {
  return /dumbbell|\bdb\b|гантел/i.test(exercise.name) ? 'Вес одной гантели, кг' : /kettlebell|\bkb\b|гир/i.test(exercise.name) ? 'Вес одной гири, кг' : /barbell|штанг/i.test(exercise.name) ? 'Вес штанги, кг' : 'Дополнительный вес, кг';
}
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function normalizeSetResult(exercise, input) {
  const fields = resultFields(exercise), allowed = [fields.timed ? 'seconds' : 'reps', ...(fields.repeated ? ['holds'] : []), 'weightKg'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid('Некорректные фактические данные подхода.');
  const integer = (key, max, label) => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) invalid(`${label}: целое число от 0 до ${max}.`);
    return value;
  };
  const result = fields.timed ? { seconds: integer('seconds', 3600, 'Фактическое время') } : { reps: integer('reps', 200, 'Фактические повторы') };
  if (fields.repeated) result.holds = integer('holds', 100, 'Число удержаний');
  if (Object.hasOwn(input, 'weightKg')) {
    if (typeof input.weightKg !== 'number' || validActualWeight(input.weightKg) == null) invalid('Фактический вес: от 0 до 999,99 кг, не более двух знаков после запятой.');
    result.weightKg = input.weightKg;
  } else if (fields.weightRequired) invalid('Укажи фактический вес снаряда; 0 — без дополнительного веса.');
  return result;
}
export function resultLabel(exercise, result) {
  if (!result) return 'Фактические данные не записаны';
  const fields = resultFields(exercise);
  const dose = fields.timed ? `${result.holds != null ? `${result.holds} × ` : ''}${result.seconds} сек${fields.repeated ? ' на удержание' : ''}` : `${result.reps} повт.`;
  const weight = result.weightKg == null ? 'вес не записан' : result.weightKg === 0 ? 'без дополнительного веса' : `${String(result.weightKg).replace('.', ',')} кг${/гантели/.test(resultWeightLabel(exercise)) ? ' / гантель' : /гири/.test(resultWeightLabel(exercise)) ? ' / гирю' : ''}`;
  return `${dose}${fields.bilateral ? ' / сторону' : ''} · ${weight}`;
}
