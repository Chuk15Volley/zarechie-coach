import { actualTarget } from './playerGym.mjs';
import { loadUnitsForExercise } from './tonnage.js';
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

export function blockIsComplete(block, bi, done = {}, skipped = {}) {
  const exercises = Array.isArray(block?.exercises) ? block.exercises : [];
  const sets = exercises.flatMap((exercise, ei) =>
    (skipped[`${bi}-${ei}`] ? [] : (Array.isArray(exercise?.targetSets) ? exercise.targetSets : [])).map((_, si) => `${bi}-${ei}-${si}`)
  );
  return exercises.length > 0 && sets.every(key => Boolean(done[key]));
}

export function firstIncompleteBlock(session, done = {}, skipped = {}) {
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const bi = blocks.findIndex((block, index) => !blockIsComplete(block, index, done, skipped));
  return bi >= 0 ? { bi, block: blocks[bi] } : null;
}

export function nextIncompleteBlock(session, currentBi, done = {}, skipped = {}) {
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const after = blocks.findIndex((block, index) => index > currentBi && !blockIsComplete(block, index, done, skipped));
  if (after >= 0) return { bi: after, block: blocks[after] };
  const remaining = blocks.findIndex((block, index) => index !== currentBi && !blockIsComplete(block, index, done, skipped));
  return remaining >= 0 ? { bi: remaining, block: blocks[remaining] } : null;
}

export function firstIncompleteExercise(session, done = {}) {
  return workoutExercises(session).find(item => !exerciseIsComplete(item, done)) || null;
}

export function nextExercise(session, bi, ei) {
  const exercises = workoutExercises(session);
  const index = exercises.findIndex(item => item.bi === bi && item.ei === ei);
  return index >= 0 ? exercises[index + 1] || null : exercises[0] || null;
}

export function nextWorkoutSet(session, done = {}, skipped = {}) {
  for (const [bi, block] of (session?.blocks || []).entries()) {
    const exercises = block.exercises || [];
    const circuit = /→|->|пар[аыуе]|тройк|круг|между упражнениями/i.test(block.rest_note || '');
    const candidates = exercises.flatMap((exercise, ei) =>
      (exercise.targetSets || []).map((target, si) => ({ bi, ei, si, exercise, block, target, key: `${bi}-${ei}-${si}` })));
    if (circuit) candidates.sort((a, b) => a.si - b.si || a.ei - b.ei);
    const next = candidates.find(item => !done[item.key] && !skipped[`${bi}-${item.ei}`]);
    if (next) return next;
  }
  return null;
}

function durationSeconds(text) {
  const matches = [...String(text).matchAll(/(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?\s*(мин|сек)/gi)];
  return matches.map(m => Number((m[2] || m[1]).replace(',', '.')) * (m[3].toLowerCase() === 'мин' ? 60 : 1));
}

export function restSecondsFor(block = {}, exercise = {}, transition = null) {
  const direct = Number(exercise.restSeconds ?? exercise.rest_seconds ?? exercise.rest);
  if (Number.isFinite(direct) && direct > 0) return Math.min(300, Math.max(5, Math.round(direct)));
  const text = String(block.rest_note || '').toLowerCase();
  const clauses = text.split(/[,;]|\.(?:\s|$)/).map(part => part.trim());
  if (transition?.next) {
    const { bi, ei, next } = transition;
    const from = String(exercise.code || `${block.label || ''}${ei + 1}`).toLowerCase();
    const to = String(next.exercise.code || `${block.label || ''}${next.ei + 1}`).toLowerCase();
    const between = next.bi === bi && next.ei > ei;
    const explicit = clauses.find(clause => clause.replace(/\s/g, '').includes(`${from}→${to}`)
      || clause.replace(/\s/g, '').includes(`${from}->${to}`));
    const general = clauses.find(clause => between
      ? /между упражнениями|переход/.test(clause)
      : /после пары|после тройки|после круга|между кругами|между парами/.test(clause));
    const seconds = durationSeconds(explicit || general || '');
    if (seconds.length) return Math.min(300, Math.max(5, Math.round(Math.max(...seconds))));
  }
  const all = durationSeconds(text);
  return all.length ? Math.min(300, Math.max(5, Math.round(Math.max(...all)))) : 60;
}

export function restRemaining(deadline, now = Date.now()) {
  const end = new Date(deadline).getTime();
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
}

export const FINISH_REASONS = ['Не хватило времени', 'Нет оборудования', 'Дискомфорт', 'Решение тренера', 'Другая причина'];

export function actualRepsFromTarget(target) {
  const text = String(target || '').trim();
  if (/\d\s*(?:сек|sec|s(?:\b|\/)|с(?:$|\s|\/)|мин|минут|met|м(?:$|\s|\/))/i.test(text)) return 0;
  return repsFromTarget(text);
}

export function completedTonnage(session, done = {}, weights = {}, repetitions = {}) {
  let tonnage = 0;
  for (const { bi, ei, exercise } of workoutExercises(session)) {
    const units = loadUnitsForExercise(exercise);
    for (const [si, target] of (exercise.targetSets || []).entries()) {
      const key = `${bi}-${ei}-${si}`;
      if (!done[key]) continue;
      const enteredWeight = Number(String(weights[key] || '').replace(',', '.'));
      const weight = Number.isFinite(enteredWeight) && enteredWeight > 0 ? enteredWeight : 0;
      tonnage += weight * units * actualRepsFromTarget(actualTarget(target, repetitions[key]));
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

// Planning/analytics instructions are for the coach, not the athlete's saved plan.
// Keep ordinary execution and pain warnings intact.
export function athleteSessionWarning(value) {
  return String(value || '').replace(/([.!?])\s+/g, '$1\n').split(/\n+/).filter(part =>
    !/предварительн[а-яё]*\s+(?:план|программ)/i.test(part)
    && !(/readysix/i.test(part) && /подтверд|проверь|проверить|свеж|новых ограничен|скорректир/i.test(part))
  ).join('\n').trim();
}
