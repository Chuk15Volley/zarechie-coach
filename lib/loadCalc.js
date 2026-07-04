// lib/loadCalc.js
// Suggest working weight for an exercise from a player's 1RM values + training phase.

const LIFT_PATTERNS = {
  squat: ['присед', 'гоблет', 'goblet', 'trap bar squat', 'box squat', 'болгарский', 'split squat', 'step-down', 'step down', 'rfe split', 'rfess'],
  rdl: ['румынская', 'rdl', 'тяга на одной', 'single leg deadlift', 'sl rdl', 'single-leg rdl', 'sl hip hinge', 'hip hinge'],
  deadlift: ['тяга с трэп', 'trap bar deadlift', 'deadlift', 'ягодичный мост', 'hip thrust', 'шарнир бедра', 'copenhagen hip'],
  bench: ['жим гантел', 'db press', 'bench press', 'db chest', 'жим на скамье', 'incline press', 'floor press', 'жим на полу', 'db incline', 'landmine chest'],
  ohp: ['landmine press', 'ландмайн', 'жим над', 'overhead press', 'ohp', 'half kneeling press', 'tall kneeling press', 'pallof press', 'жим паллофа'],
  pullup: ['подтягив', 'pull-up', 'pullup', 'inverted row', 'горизонтальная тяга', 'trx row', 'cable row', 'lat pull', 'ring row', 'chin-up', 'banded pull'],
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

// calcWeight(exerciseName, focus, week, oneRMs, position)
//   → { kg, pctLow, pctHigh, field, maxSets? } | null
//
//   position (optional): 'OPP' | 'OH' | 'MB' | 'Setter' | 'Libero'
//   Positional modifiers apply only to the `bench` movement:
//     OPP    → +5% к весу
//     Setter → −15% к весу, максимум 3 сета (maxSets: 3)
//     Libero → null (Либеро делают 2×10 Incline Push-Up вместо жима)
export function calcWeight(exerciseName, focus, week, oneRMs, position) {
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
  let kg = (base * ((pctLow + pctHigh) / 2));

  const result = {
    pctLow: Math.round(pctLow * 100),
    pctHigh: Math.round(pctHigh * 100),
    field,
  };

  if (field === 'bench' && position) {
    const pos = String(position).toLowerCase();
    if (pos === 'libero') return null;
    if (pos === 'opp') kg *= 1.05;
    if (pos === 'setter') { kg *= 0.85; result.maxSets = 3; }
  }

  result.kg = Math.round(kg / 2.5) * 2.5;
  return result;
}
