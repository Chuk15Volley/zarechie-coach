// pages/api/players/progression.js
// POST { playerId, names: string[] }
// Returns per-exercise previous weight + RPE + suggested next weight.
// Data is written by save.js (on session save) and feedback.js (on player RPE submit).

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { exweightKey, pfx, sessionsKey } from '../../../lib/workspacePrefix';
import { canonicalExerciseId, exerciseId, legacyExerciseId } from '../../../lib/exerciseIdentity.mjs';
import { recommendLoad } from '../../../lib/loadProgression.mjs';

// Legacy key kept only for read compatibility with existing history.
export function legacyNormExName(name) {
  return legacyExerciseId(name);
}

// V2 deliberately preserves equipment and execution variants. Previously
// parentheticals were removed, merging (DB), (BW), band and other materially
// different progressions into one history.
export function normExName(name) {
  return canonicalExerciseId(name);
}

function isDumbbellExercise(name) {
  return /\bdb\b|dumbbell|гантел/i.test(name || '');
}

function incrementStepFor(name) {
  return isDumbbellExercise(name) ? 2 : 2.5;
}

function roundToStep(value, step = 2.5) {
  return Math.max(Math.round(value / step) * step, step);
}

function hasHashData(raw) {
  return Array.isArray(raw) ? raw.length > 0 : !!raw && typeof raw === 'object' && Object.keys(raw).length > 0;
}

// Suggest next weight based on previous actual weight + RPE + pain.
export function suggestKg(kg, rpe, pain = false, exerciseName = '') {
  const k = parseFloat(kg);
  if (!k || k <= 0) return null;
  const step = incrementStepFor(exerciseName);
  if (pain) return roundToStep(k * 0.9, step);
  const r = parseFloat(rpe);
  if (!r || isNaN(r)) return k; // no RPE data → keep same
  if (r <= 6) return roundToStep(Math.max(k + step, k * 1.05), step); // easy + no pain → +1 step / 5%
  if (r < 9) return k;                                          // on target → same
  if (r < 10) return roundToStep(k * 0.95, step);                // hard → -5%
  return roundToStep(k * 0.9, step);                             // maximal → -10%
}

function progressionDecision(kg, rpe, pain = false, exerciseName = '') {
  if (!kg) return 'Нет истории фактического веса — указать вручную по целевому RPE.';
  if (pain) return 'Была боль/дискомфорт — снизить нагрузку и рассмотреть замену в следующей тренировке.';
  const r = parseFloat(rpe);
  const stepText = isDumbbellExercise(exerciseName) ? ' (гантели: 2 кг)' : '';
  if (!r || isNaN(r)) return 'Есть вес из истории, RPE не указан — оставить вес и оценить RPE после блока.';
  if (r <= 6) return `RPE <= 6 и боли нет — можно прогрессировать на 1 шаг${stepText} или +5%.`;
  if (r < 9) return 'RPE в целевой зоне — оставить вес или минимальная прогрессия по технике.';
  return 'RPE >= 9 — снизить вес или заменить упражнение в следующей тренировке.';
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, names = [], exercises = [], workspace = 'zarechie' } = req.body || {};
  const requested = [
    ...(Array.isArray(exercises) ? exercises.map(ex => ({ id: exerciseId(ex), name: ex?.name || ex?.title || '' })) : []),
    ...(Array.isArray(names) ? names.map(name => ({ id: canonicalExerciseId(name), name })) : []),
  ].filter(item => item.name);
  if (!playerId || !requested.length) {
    return res.status(400).json({ error: 'playerId and names[] or exercises[] required' });
  }

  const unique = [...new Map(requested.map(item => [item.id, item])).values()];
  const keyPairs = unique.map(item => [item.id, legacyNormExName(item.name)]);

  // Batch-fetch all exercise weight records.
  const results = await redisPipeline(
    keyPairs.flatMap(([current, legacy]) => [
      ['HGETALL', exweightKey(workspace, playerId, current)],
      ['HGETALL', exweightKey(workspace, playerId, legacy)],
    ])
  ).catch(() => []);
  const recentDates = await redis('zrevrange', sessionsKey(workspace, playerId), '0', '9').catch(() => []);
  const actualRows = Array.isArray(recentDates) && recentDates.length
    ? await redisPipeline(recentDates.map(date => ['GET', `${pfx(workspace)}:session:actual:${playerId}:${date}`])).catch(() => [])
    : [];
  const exposureMap = new Map();
  actualRows.forEach((raw, rowIndex) => {
    let record = null;
    try { record = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch (_) {}
    for (const exercise of record?.exercises || []) {
      const id = exercise.exerciseId || canonicalExerciseId(exercise.name);
      if (!exposureMap.has(id)) exposureMap.set(id, []);
      if (Number(exercise.actualKg) > 0) exposureMap.get(id).push({
        date: recentDates[rowIndex],
        kg: Number(exercise.actualKg),
        rpe: Number(exercise.sessionRpe || record.sessionRpe) || null,
        completedSets: Number(exercise.completedSets) || 0,
        plannedSets: Number(exercise.plannedSets) || 0,
        pain: Boolean(exercise.pain),
      });
    }
  });

  const progression = {};
  const progressionById = {};
  unique.forEach((item, i) => {
    const { id, name } = item;
    const currentRaw = results[i * 2];
    const raw = hasHashData(currentRaw) ? currentRaw : results[i * 2 + 1];
    if (!raw) return;

    // Upstash returns HGETALL as flat array or object.
    let record = {};
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length - 1; j += 2) record[raw[j]] = raw[j + 1];
    } else if (typeof raw === 'object') {
      record = raw;
    }

    const kg = record.kg ? parseFloat(record.kg) : null;
    const rpe = record.rpe ? parseFloat(record.rpe) : null;
    const pain = record.pain === '1' || record.pain === true || record.pain === 'true';
    if (!kg) return;

    const smart = recommendLoad(exposureMap.get(id) || [], { name, currentKg: kg, pain });
    const value = {
      exerciseId: id,
      kg,
      rpe: rpe || null,
      pain,
      block: record.block || null,
      blockRpe: record.blockRpe ? parseFloat(record.blockRpe) : null,
      source: record.source || 'planned',
      date: record.date || null,
      loadUnits: record.loadUnits === '2' || record.loadUnits === 2 ? 2 : 1,
      completedSets: Number(record.completedSets) || null,
      plannedSets: Number(record.plannedSets) || null,
      suggestedKg: smart.suggestedKg ?? suggestKg(kg, rpe, pain, name),
      decision: smart.reasons?.length ? smart.reasons.join(' · ') : progressionDecision(kg, rpe, pain, name),
      confidence: smart.confidence,
      trend: smart.trend,
      recentExposures: smart.exposures || [],
      completionPercent: smart.completionPercent ?? null,
      averageRpe: smart.avgRpe ?? null,
    };
    progression[name] = value;
    progressionById[id] = value;
  });

  return res.status(200).json({ progression, progressionById });
}
