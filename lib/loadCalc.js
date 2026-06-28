// lib/loadCalc.js
// Suggest working weight for an exercise from a player's 1RM values + training phase.

const LIFT_PATTERNS = {
  squat: ['присед', 'приседа', 'гоблет', 'goblet', 'trap bar squat', 'box squat', 'болгарский'],
  rdl: ['румынская', 'rdl', 'rдл', 'тяга на одной', 'single leg deadlift', 'sl rdl'],
  deadlift: ['тяга с трэп', 'trap bar deadlift', 'deadlift', 'ягодичный мост', 'hip thrust', 'шарнир бедра'],
  bench: ['жим гантел', 'db press', 'bench press', 'db chest', 'жим на скамье'],
  ohp: ['landmine press', 'landmine', 'ландмайн', 'жим над', 'overhead press', 'ohp', 'жим паллофа'],
  pullup: ['подтягив', 'pull-up', 'pullup', 'inverted row', 'горизонтальная тяга', 'trx row', 'cable row'],
};

// Percentages by focus phase, keyed by week number.
const PHASE_PCT = {
  camp_ecc: { 1: [0.75, 0.78], 2: [0.80, 0.83], 3: [0.83, 0.87] },
  camp_iso: { 4: [0.60, 0.70], 5: [0.60, 0.70] },
  camp_explosive: { 6: [0.50, 0.60] },
};

// Map a focus code/string to its phase bucket.
function phaseFromFocus(focus) {
  const f = String(focus || '').toLowerCase();
  if (f.includes('ecc') || f.includes('эксц')) return 'camp_ecc';
  if (f.includes('iso') || f.includes('изо')) return 'camp_iso';
  if (f.includes('explos') || f.includes('взрыв')) return 'camp_explosive';
  return null;
}

function fieldFor(name) {
  const lower = String(name || '').toLowerCase();
  for (const [field, patterns] of Object.entries(LIFT_PATTERNS)) {
    if (patterns.some(p => lower.includes(p))) return field;
  }
  return null;
}

// calcWeight(exerciseName, focus, week, oneRMs)
//   → { kg, pctLow, pctHigh, field } | null
export function calcWeight(exerciseName, focus, week, oneRMs) {
  if (!exerciseName || !oneRMs) return null;

  const field = fieldFor(exerciseName);
  if (!field) return null;

  const base = parseFloat(oneRMs[field]);
  if (!base || Number.isNaN(base) || base <= 0) return null;

  const phase = phaseFromFocus(focus);
  if (!phase) return null;

  const table = PHASE_PCT[phase];
  const wk = parseInt(week, 10);
  const range = table?.[wk];
  if (!range) return null;

  const [pctLow, pctHigh] = range;
  const kg = Math.round((base * ((pctLow + pctHigh) / 2)) / 2.5) * 2.5;

  return {
    kg,
    pctLow: Math.round(pctLow * 100),
    pctHigh: Math.round(pctHigh * 100),
    field,
  };
}
