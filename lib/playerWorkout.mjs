import { actualTarget, isCircuit } from './playerGym.mjs';
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

export function completedSetCount(session, done = {}) {
  return workoutExercises(session).reduce((sum, {bi, ei, exercise}) =>
    sum + (exercise.targetSets || []).filter((_, si) => Boolean(done[`${bi}-${ei}-${si}`])).length, 0);
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

export function nextWorkoutSet(session, done = {}, skipped = {}, onlyBlock = null) {
  for (const [bi, block] of (session?.blocks || []).entries()) {
    if (onlyBlock != null && bi !== onlyBlock) continue;
    const exercises = block.exercises || [];
    const circuit = isCircuit(block);
    const candidates = exercises.flatMap((exercise, ei) =>
      (exercise.targetSets || []).map((target, si) => ({ bi, ei, si, exercise, block, target, key: `${bi}-${ei}-${si}` })));
    if (circuit) candidates.sort((a, b) => a.si - b.si || a.ei - b.ei);
    const next = candidates.find(item => !done[item.key] && !skipped[`${bi}-${item.ei}`]);
    if (next) return next;
  }
  return null;
}

// Restore execution context independently of which block happens to be on screen.
export function restoredWorkoutBlock(session, done = {}, skipped = {}, savedBlock = null) {
  if (Number.isInteger(savedBlock) && savedBlock >= 0 && nextWorkoutSet(session, done, skipped, savedBlock)) return savedBlock;
  return firstIncompleteBlock(session, done, skipped)?.bi ?? -1;
}

function durationSeconds(text) {
  const matches = [...String(text).matchAll(/(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?\s*(мин|сек)/gi)];
  return matches.map(m => Number((m[2] || m[1]).replace(',', '.')) * (m[3].toLowerCase() === 'мин' ? 60 : 1));
}

function numericRest(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const seconds = Number(value);
  if (seconds === 0) return 0;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(300, Math.max(5, Math.round(seconds))) : null;
}

export function restTransitionKind(block = {}, transition = null) {
  if (!transition) return 'set';
  const {bi,ei,si,next} = transition;
  if (!next) return 'finished';
  if (next.bi !== bi) return 'block';
  if (isCircuit(block) && (si != null ? next.si > si : next.ei < ei)) return 'round';
  return next.ei !== ei ? 'exercise' : 'set';
}

// Scope the next set to the block the player is actually performing.
export function restAfterWorkoutSet(session, done = {}, skipped = {}, context = {}) {
  const nextBlock = nextIncompleteBlock(session, context.bi, done, skipped);
  const next = nextWorkoutSet(session, done, skipped, context.bi)
    || (nextBlock ? nextWorkoutSet(session, done, skipped, nextBlock.bi) : null);
  const transition = {...context,next};
  return {next,kind:restTransitionKind(context.block,transition),seconds:restSecondsFor(context.block,context.ex,transition)};
}

export function restSecondsFor(block = {}, exercise = {}, transition = null) {
  const direct = numericRest(exercise.restSeconds ?? exercise.rest_seconds ?? exercise.rest);
  // An exercise's restSeconds describes its sets, not a transition to another exercise.
  const kind = restTransitionKind(block, transition);
  if (transition && !transition.next) return 0;
  if (direct != null && kind === 'set') return direct;
  const text = String(block.rest_note || '').toLowerCase();
  // Only recovery instructions are timer inputs. Block/station/work durations
  // belong to session planning, even when they are larger than the rest dose.
  const clauses = text.split(/[,;]|\.(?:\s|$)|\s+и\s+(?=\d|после|между)/).map(part => part.trim());
  const recovery = clauses.filter(clause => !/бюджет|длительность|станци|разминк|удержани|рабоч(?:ее|ая|ий|ие)|время блока/.test(clause)
    && (/отдых|пауза|восстановлен|между (?:качественными )?(?:подходами|отрезками|попытками|сериями)|между упражнениями|переход|после пары|после тройки|после круга|между кругами|между парами|после блока|между блоками|→|->/.test(clause)
      || /^\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?\s*(?:мин|сек)\.?$/.test(clause)));
  if (transition?.next) {
    const { bi, ei, next } = transition;
    const from = String(exercise.code || `${block.label || ''}${ei + 1}`).toLowerCase();
    const to = String(next.exercise?.code || `${next.block?.label || block.label || ''}${next.ei + 1}`).toLowerCase();
    const differentExercise = next.bi !== bi || next.ei !== ei;
    const round = kind === 'round';
    const explicit = recovery.find(clause => clause.replace(/\s/g, '').includes(`${from}→${to}`)
      || clause.replace(/\s/g, '').includes(`${from}->${to}`));
    const explicitSeconds = durationSeconds(explicit || '');
    if (explicitSeconds.length) return numericRest(Math.max(...explicitSeconds));
    const structured = numericRest(kind === 'block' ? block.blockRestSeconds ?? exercise.transitionRestSeconds ?? block.transitionRestSeconds : round ? block.roundRestSeconds : differentExercise ? exercise.transitionRestSeconds ?? block.transitionRestSeconds : block.restSeconds);
    if (kind === 'block') {
      const blockSeconds = recovery.filter(clause => /после блока|между блоками/.test(clause)).flatMap(durationSeconds);
      if (blockSeconds.length) return numericRest(Math.max(...blockSeconds));
    }
    const general = recovery.filter(clause => round
      ? /после пары|после тройки|после круга|между кругами|между парами/.test(clause)
      : differentExercise ? /между упражнениями|переход/.test(clause) : /между (?:качественными )?(?:подходами|отрезками|попытками|сериями)/.test(clause));
    const seconds = general.flatMap(durationSeconds);
    if (seconds.length) return numericRest(Math.max(...seconds));
    if (structured != null) return structured;
    // Never borrow a round/block pause for an ordinary exercise transition.
    if (differentExercise && !round) return 60;
  }
  const structured = numericRest(block.restSeconds);
  if (structured != null) return structured;
  const all = recovery.filter(clause => !/→|->/.test(clause)
    && !(transition && kind === 'set' && /между упражнениями|переход|после блока|между блоками|после пары|после тройки|после круга|между кругами|между парами/.test(clause))).flatMap(durationSeconds);
  return all.length ? numericRest(Math.max(...all)) : 60;
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
