// Keep the existing strength-method repetition ceilings, including per-side work.
export function strengthRepCeiling(code) {
  return /^A/.test(code || '') ? 5 : /^(?:B[12]|C1)$/.test(code || '') ? 6 : 12;
}
export function parseStrengthRepTarget(target) {
  const match = /^(\d+)(\/side)?$/.exec(String(target || ''));
  return match ? {reps:Number(match[1]),perSide:!!match[2]} : null;
}
export function strengthRepEvidence(exercise, fact, sets, kg) {
  const current = parseStrengthRepTarget(exercise.targetSets?.[0]);
  const targets = sets.map(set=>parseStrengthRepTarget(set.target));
  if (!current || !targets.length || targets.some(t=>!t || t.perSide!==current.perSide || t.reps!==targets[0].reps)) return null;
  const plannedReps = targets[0].reps;
  const factor = current.perSide ? 2 : 1;
  return {plannedReps,perSide:current.perSide,consistentLoad:sets.every(s=>Math.abs(Number(s.kg)-kg)<1e-8),
    allPlannedRepsMet:sets.every(s=>s.repsRecorded===true && Number(s.reps)>=plannedReps*factor && Number(s.reps)<=plannedReps*factor+2),
    plannedSets:Number(fact.plannedSets) || sets.length};
}
export function retainedStrengthReps(exercise, evidence) {
  const current = parseStrengthRepTarget(exercise.targetSets?.[0]);
  const history = evidence?.repEvidence;
  if ((exercise.targetSets || []).some(target=>String(target)!==String(exercise.targetSets[0])) || !current || !history?.consistentLoad || !history.allPlannedRepsMet || history.perSide!==current.perSide || history.plannedReps < current.reps || history.plannedReps > strengthRepCeiling(exercise.code)) return null;
  return history.plannedReps;
}
