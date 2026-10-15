import { timedExercise } from './timing.mjs';

export const prescriptionText = value => String(value ?? '').replaceAll('sec lower', 'сек на опускание').replaceAll('sec', 'сек').replaceAll('min', 'мин').replace(/each|ea\b/g, 'на сторону').replaceAll('-', '–');
export const durationText = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
export function exerciseView(exercise, progress = {}, currentKey = '') {
  const keys = Array.from({ length: exercise.setCount }, (_, round) => `${exercise.code}:${round}`);
  const done = keys.filter(key => !!progress[key]).length;
  return { done, total: keys.length, complete: keys.length > 0 && done === keys.length, current: keys.includes(currentKey), bilateral: timedExercise(exercise)?.sides === 2 || /each|ea\b/.test(exercise.reps) };
}
export const exerciseElementId = (prefix, code) => `${prefix}-exercise-${code}`;
export const blockElementId = (prefix, code) => `${prefix}-block-${code}`;
