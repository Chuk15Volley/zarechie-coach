// pages/api/players/progression.js
// POST { playerId, names: string[] }
// Returns per-exercise previous weight + RPE + suggested next weight.
// Data is written by save.js (on session save) and feedback.js (on player RPE submit).

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { exweightKey } from '../../../lib/workspacePrefix';

// Stable short key derived from exercise name.
export function normExName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')       // drop parentheticals: (DB), (Band)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

  const { playerId, names, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !Array.isArray(names) || !names.length) {
    return res.status(400).json({ error: 'playerId and names[] required' });
  }

  // Deduplicate names to avoid redundant Redis calls.
  const unique = [...new Set(names.filter(Boolean))];
  const keys = unique.map(n => normExName(n));

  // Batch-fetch all exercise weight records.
  const results = await redisPipeline(
    keys.map(k => ['HGETALL', exweightKey(workspace, playerId, k)])
  ).catch(() => []);

  const progression = {};
  unique.forEach((name, i) => {
    const raw = results[i];
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

    progression[name] = {
      kg,
      rpe: rpe || null,
      pain,
      block: record.block || null,
      blockRpe: record.blockRpe ? parseFloat(record.blockRpe) : null,
      source: record.source || 'planned',
      date: record.date || null,
      loadUnits: record.loadUnits === '2' || record.loadUnits === 2 ? 2 : 1,
      suggestedKg: suggestKg(kg, rpe, pain, name),
      decision: progressionDecision(kg, rpe, pain, name),
    };
  });

  return res.status(200).json({ progression });
}
