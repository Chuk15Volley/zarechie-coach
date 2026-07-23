// Working load is always recorded as the mass of one DB/KB. `loadUnits`
// describes how many identical implements are used and affects only tonnage.

export function parseWeightKg(value) {
  const number = typeof value === 'number'
    ? value
    : parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function weightKgFromExercise(exercise = {}) {
  const direct = parseWeightKg(exercise.weightKg);
  if (direct) return direct;
  const note = String(exercise.weightNote || '');
  const match = note.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b/i) || note.trim().match(/^(\d+(?:[.,]\d+)?)$/);
  return match ? parseWeightKg(match[1]) : 0;
}

// Legacy records do not contain loadUnits. Unknown DB/KB variations remain one
// implement so historical tonnage is never overstated by a guessed pair.
export function inferLoadUnits(name = '') {
  const value = String(name).toLowerCase();
  const usesDbOrKb = isPairableFreeWeightExercise(value);
  if (!usesDbOrKb) return 1;
  if (/\b(single|one[ -]?arm|single[ -]?leg|sl)\b|одн[ао]й?|гоблет|goblet|suitcase|half[ -]?kneeling|landmine|\brow\b|тяга.*одн|турецк|turkish|get[ -]?up|two[ -]?hand.*(?:kb|kettlebell)|двумя руками/i.test(value)) return 1;
  if (/\b(double|pair|two[ -]?(?:db|kb|dumbbell|kettlebell))\b|две гантел|две гир/i.test(value)) return 2;
  if (/\b(?:db|dumbbell)\s+(?:bench|incline|floor)\s+press\b|(?:db|dumbbell).*(?:rdl|romanian deadlift|deadlift)\b|(?:db|dumbbell).*farmer/i.test(value)) return 2;
  return 1;
}

export function isPairableFreeWeightExercise(name = '') {
  return /\b(?:db|kb)\b|dumbbell|kettlebell|гантел|гир/i.test(String(name));
}

export function loadUnitsForExercise(exercise = {}) {
  const units = Number(exercise.loadUnits);
  return units === 2 ? 2 : units === 1 ? 1 : inferLoadUnits(exercise.name);
}

export function exerciseTonnage(exercise = {}, totalReps = 0, weightKg = null) {
  const kg = weightKg == null ? weightKgFromExercise(exercise) : parseWeightKg(weightKg);
  return kg * loadUnitsForExercise(exercise) * Math.max(0, Number(totalReps) || 0);
}
