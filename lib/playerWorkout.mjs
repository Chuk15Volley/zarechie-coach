import { loadUnitsForExercise, weightKgFromExercise } from './tonnage.js';
import { repsFromTarget } from './sessionDose.mjs';

export function workoutExercises(session) {
  return (Array.isArray(session?.blocks) ? session.blocks : []).flatMap((block, bi) =>
    (Array.isArray(block?.exercises) ? block.exercises : []).map((exercise, ei) => ({
      bi,
      ei,
      block,
      exercise,
      key: `${bi}-${ei}`,
    }))
  );
}

export function exerciseIsComplete(item, done = {}) {
  const sets = Array.isArray(item?.exercise?.targetSets) ? item.exercise.targetSets : [];
  return sets.length > 0 && sets.every((_, si) => Boolean(done[`${item.bi}-${item.ei}-${si}`]));
}

export function firstIncompleteExercise(session, done = {}) {
  return workoutExercises(session).find(item => !exerciseIsComplete(item, done)) || null;
}

export function nextExercise(session, bi, ei) {
  const exercises = workoutExercises(session);
  const index = exercises.findIndex(item => item.bi === bi && item.ei === ei);
  return index >= 0 ? exercises[index + 1] || null : exercises[0] || null;
}

export function restSecondsFor(block = {}, exercise = {}) {
  const direct = Number(exercise.restSeconds ?? exercise.rest_seconds ?? exercise.rest);
  if (Number.isFinite(direct) && direct > 0) return Math.min(300, Math.max(15, Math.round(direct)));

  const text = String(block.rest_note || '').toLowerCase();
  const ranges = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—)\s*(\d+(?:[.,]\d+)?)\s*(мин|сек)/g)]
    .map(match => ((Number(match[1].replace(',', '.')) + Number(match[2].replace(',', '.'))) / 2) * (match[3] === 'мин' ? 60 : 1));
  const values = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(мин|сек)/g)]
    .map(match => Number(match[1].replace(',', '.')) * (match[2] === 'мин' ? 60 : 1));
  const all = [...ranges, ...values].filter(Number.isFinite);
  return all.length ? Math.min(300, Math.max(15, Math.round(Math.max(...all)))) : 60;
}

export function completedTonnage(session, done = {}, weights = {}) {
  let tonnage = 0;
  for (const { bi, ei, exercise } of workoutExercises(session)) {
    const units = loadUnitsForExercise(exercise);
    const plannedWeight = weightKgFromExercise(exercise);
    for (const [si, target] of (exercise.targetSets || []).entries()) {
      const key = `${bi}-${ei}-${si}`;
      if (!done[key]) continue;
      const enteredWeight = Number(String(weights[key] || '').replace(',', '.'));
      const weight = Number.isFinite(enteredWeight) && enteredWeight > 0 ? enteredWeight : plannedWeight;
      tonnage += weight * units * repsFromTarget(target);
    }
  }
  return Math.round(tonnage);
}

export function formatWorkoutDuration(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
  if (minutes > 0) return `${minutes} мин`;
  return `${remainder} сек`;
}
