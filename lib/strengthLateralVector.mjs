// Frontal-plane movement is distinct from anti-lateral-flexion trunk holds.
export function isLateralStrengthMovement(exercise) {
  return /lateral lunge|lateral step.?up|lateral squat|(?:side.?lying|standing band|supine).*hip (?:abduction|adduction)|side.?lying adductor raise/i.test(exercise?.name || '');
}
export function hasLateralMovementFromC(session) {
  return (session?.blocks || []).some(block => /^[CDE]/.test(block.label || block.code || '') &&
    (block.exercises || []).some(isLateralStrengthMovement));
}
