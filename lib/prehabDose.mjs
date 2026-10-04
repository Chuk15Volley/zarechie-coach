// Repetitions for dynamic movement; time only for balance/holds.
export function prehabPrescription(exercise, factor = 1, symptomAdapted = false) {
  const name = String(exercise.name || '');
  const perSide = /\/ст\.|\/side/i.test(exercise.reps || '');
  const scale = Math.min(1, Math.max(0.6, Number(factor) || 0.75));
  if (/Balance|Tandem Stance/i.test(name)) {
    const seconds = Math.max(20, Math.round(30 * scale / 5) * 5);
    return { target: `${seconds} sec/side`, secondsPerSet: seconds * 2 };
  }
  if (/Ball Squeeze/i.test(name)) {
    const repetitions = Math.max(4, Math.round(6 * scale));
    return { target: `${repetitions} × 5 sec`, secondsPerSet: repetitions * 5 };
  }
  const baseline = /Ankle Pumps/i.test(name) ? 12 : /Ankle Circles/i.test(name) ? 8 : parseInt(exercise.reps, 10) || 8;
  const repetitions = Math.max(6, Math.min(symptomAdapted ? 8 : 12, Math.round(baseline * scale / 2) * 2));
  return { target: `${repetitions}${perSide ? '/side' : ''}`, secondsPerSet: repetitions * 3 * (perSide ? 2 : 1) };
}
